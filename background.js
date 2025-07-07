let projectsGlobal = [];
let emailGlobal = null;
let popupWindowId = null;

browser.browserAction.onClicked.addListener(async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const message = await browser.messageDisplay.getDisplayedMessage(
      activeTab.id
    );
    if (!message) {
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.png"),
        title: "GitLab Ticket Addon",
        message: "Keine E-Mail ausgewählt.",
      });
      return;
    }

    const rawMessage = await browser.messages.getFull(message.id);
    // Find the plain text part of the email
    const textPart = findTextPart(rawMessage.parts);
    const emailBody = textPart ? textPart.body : ""; // Ensure it's a string, even if empty

    const conversationHistory = extractConversationHistory(emailBody); // Pass the extracted string body
    console.log("Extrahierte E-Mail-Konversation:", conversationHistory);

    const settings = await browser.storage.local.get([
      "gitlabUrl",
      "gitlabToken",
    ]);
    if (!settings.gitlabUrl || !settings.gitlabToken) {
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.png"),
        title: "GitLab Ticket Addon",
        message:
          "GitLab-Einstellungen fehlen. Bitte in den Addon-Einstellungen konfigurieren.",
      });
      browser.runtime.openOptionsPage();
      return;
    }

    const response = await fetch(
      `${settings.gitlabUrl}/api/v4/projects?membership=true&simple=true`,
      { headers: { "PRIVATE-TOKEN": settings.gitlabToken } }
    );

    if (!response.ok) {
      throw new Error("Fehler beim Laden der Projekte: " + response.statusText);
    }

    projectsGlobal = await response.json();
    emailGlobal = {
      subject: message.subject,
      author: message.author,
      date: message.date,
      conversationHistory,
    };

    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL(`projects/project_selector.html`),
      type: "popup",
      width: 500,
      height: 700,
    });

    popupWindowId = popupWindow.id;
  } catch (err) {
    console.error("Fehler im Addon:", err);
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon.png"),
      title: "GitLab Ticket Addon",
      message: "Ein Fehler ist aufgetreten. Details siehe Konsole.",
    });
  }
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "popup-ready") {
    if (!popupWindowId) return;
    const tabs = await browser.tabs.query({ windowId: popupWindowId });
    if (tabs.length === 0) return;

    await browser.tabs.sendMessage(tabs[0].id, {
      type: "project-list",
      projects: projectsGlobal,
      email: emailGlobal,
    });
  }

  if (msg.type === "project-selected") {
    try {
      const settings = await browser.storage.local.get([
        "gitlabUrl",
        "gitlabToken",
      ]);
      if (!settings.gitlabUrl || !settings.gitlabToken) {
        throw new Error("GitLab-Einstellungen fehlen.");
      }

      const projectId = msg.projectId;
      const title = msg.title?.trim() || `Email: ${emailGlobal.subject}`;

      const conversation = emailGlobal.conversationHistory
        .map((entry) => {
          const header = entry.from
            ? `**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}`
            : "";
          return `${header}\n\n${entry.message}`;
        })
        .join("\n\n---\n\n");

      const description = msg.description?.trim() || conversation;

      const res = await fetch(
        `${settings.gitlabUrl}/api/v4/projects/${projectId}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "PRIVATE-TOKEN": settings.gitlabToken,
          },
          body: JSON.stringify({ title, description }),
        }
      );

      if (res.ok) {
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon.png"),
          title: "GitLab Ticket Addon",
          message: "Ticket erfolgreich erstellt.",
        });
      } else {
        const err = await res.text();
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon.png"),
          title: "GitLab Ticket Addon",
          message: "Fehler beim Erstellen des Tickets:\n" + err,
        });
      }
    } catch (error) {
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.png"),
        title: "GitLab Ticket Addon",
        message: "Fehler: " + error.message,
      });
    }

    if (popupWindowId) {
      browser.windows.remove(popupWindowId);
      popupWindowId = null;
    }
  }
});

function findTextPart(parts) {
  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) {
      return part;
    }
    if (part.parts) {
      const nested = findTextPart(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Extracts individual messages from an email conversation thread.
 * It assumes messages are separated by the "Am DD.MM.YYYY um HH:MM schrieb [Sender]:" pattern.
 *
 * @param {string} body The full plain text body of the email.
 * @returns {Array<Object>} An array of message objects, each with 'from', 'date', 'time', and 'message'.
 */
function extractConversationHistory(body) {
  if (!body) {
    return [];
  }

  const messages = [];

  // Regex to find the "Am DD.MM.YYYY um HH:MM schrieb [Sender]:" pattern.
  // We make sure to capture the parts we need: date, time, and sender.
  // The 'g' flag is crucial for exec() to find all matches.
  // We also use a non-greedy match ([\s\S]+?) for the sender to prevent it from consuming too much.
  const headerRegex =
    /^(>+\s*)?Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb ([\s\S]+?):\s*$/m;

  let remainingBody = body;
  let match;
  let lastIndex = 0; // To track where the last match ended

  // Loop through the body, finding all header patterns
  // We use matchAll for a more straightforward iteration over all matches.
  // Note: matchAll returns an iterator, so we convert it to an array.
  const allHeaders = [...body.matchAll(new RegExp(headerRegex.source, "gm"))];

  // --- Process the most recent message (the one at the very top, before any quoted parts) ---
  // If there are any headers found, the content before the first header is the most recent message.
  if (allHeaders.length > 0) {
    const firstHeaderMatch = allHeaders[0];
    const mainMessageContent = body.substring(0, firstHeaderMatch.index).trim();
    if (mainMessageContent) {
      messages.push({
        from: null, // The sender of the current email, not a quoted reply
        date: null,
        time: null,
        message: extractRelevantBody(mainMessageContent),
      });
    }
    lastIndex = firstHeaderMatch.index; // Set lastIndex to the start of the first header
  } else {
    // If no "Am..." headers are found, the entire body is one single message.
    messages.push({
      from: null,
      date: null,
      time: null,
      message: extractRelevantBody(body),
    });
    return messages; // Return early
  }

  // --- Process the quoted messages using the detected headers ---
  for (let i = 0; i < allHeaders.length; i++) {
    const currentHeaderMatch = allHeaders[i];
    const nextHeaderMatch = allHeaders[i + 1];

    // The content of the current quoted message starts right after its header
    // and ends either at the beginning of the next header or the end of the email.
    const messageStart =
      currentHeaderMatch.index + currentHeaderMatch[0].length;
    const messageEnd = nextHeaderMatch ? nextHeaderMatch.index : body.length;

    let messageContent = body.substring(messageStart, messageEnd).trim();

    // Extract details from the current header match
    const quotePrefix = currentHeaderMatch[1] || ""; // Group 1: "> " or ">> "
    const date = currentHeaderMatch[2]; // Group 2: date
    const time = currentHeaderMatch[3]; // Group 3: time
    const from = currentHeaderMatch[4].replace(/\s+/g, " ").trim(); // Group 4: sender name

    // Now, clean the extracted message content by removing its specific quoting prefix.
    // Escape special regex characters in the quote prefix to use it safely in RegExp.
    const escapedQuotePrefix = quotePrefix.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    // Regex to remove the exact quote prefix from the start of each line
    const lineQuoteStripper = new RegExp(`^${escapedQuotePrefix}(.*)$`, "gm");
    messageContent = messageContent.replace(lineQuoteStripper, "$1").trim();

    messages.push({
      from: from,
      date: date,
      time: time,
      message: extractRelevantBody(messageContent), // Further clean up signatures/disclaimers
    });
  }

  return messages;
}

/**
 * Cleans up a message body by removing common email signatures, disclaimers,
 * and any remaining quoting characters.
 *
 * @param {string} body The raw message body.
 * @returns {string} The cleaned message body.
 */
function extractRelevantBody(body) {
  if (!body) return "(Kein Nachrichtentext)";

  // 1. Remove any leading '>' characters from each line. This is a robust final cleanup.
  body = body
    .split("\n")
    .map((line) => line.replace(/^>+\s*/, "")) // Remove one or more '>' followed by optional space
    .join("\n");

  // 2. Remove standard email signature separators (like "-- \n" or "____\n").
  // Only take the content before the first such separator.
  let cleanedText = body.split(/\n--\s*\n|__+\n/)[0];

  // --- NEW: More robust removal of decorative/separator lines ---
  // This looks for lines composed primarily of special characters and spaces,
  // often used as visual separators or part of stylized signatures.
  cleanedText = cleanedText
    .split("\n")
    .filter((line) => {
      // If the line consists only of 3 or more repeating special chars/spaces, filter it out.
      // This is designed to catch: "***** * ** * **** * ***", "---", "====" etc.
      // But allows lines with actual text and a few special chars.
      return !/^\s*([*-_=+#~]{3,}\s*)+$/g.test(line.trim());
    })
    .join("\n");

  // 3. (Original step 3, now combined with new filter above, so this specific regex is less critical but can stay)
  // Remove repeating banner lines (e.g., '***** ****', '========') if they are not already caught.
  // This looks for lines with 4 or more repeated special characters or spaces.
  cleanedText = cleanedText.replace(
    /^([ \t]*[*_=\-#~]{4,}.*\n)([\s\S]*?)(^\1|\n[ \t]*[*_=\-#~]{4,}.*\n)/gm,
    ""
  );

  // 4. Remove common disclaimers, contact info, and signatures using keywords.
  const disclaimerKeywords = [
    "Datenschutz:",
    "Weitere Informationen zum Thema PGP-Verschlüsselung:",
    "VisionConnect GmbH",
    "Senden Sie uns Ihre Daten verschlüsselt.",
    "Sie erhalten unsere persönlichen öffentlichen Schlüssel unter",
    "https://keys.openpgp.org",
    "PGP-Verschlüsselung:",
    "Geschäftsführer:",
    "Sitz der Gesellschaft:",
    "Ust-IdNr.",
    "Gerichtsstand:",
    "Freundliche Grüße",
    "bleiben Sie gesund!",
    "Dipl. Ing. (FH)",
    "Web-Applikationen",
    "Marketing",
    "Hohenzollernstr.",
    "D-30161 Hannover",
    "fon:",
    "fax:",
    "soeth@visionconnect.de",
    "https://www.visionconnect.de",
    "Xing:",
    "LinkedIn:",
    'TYPO3 v13 "The Ocean\'s Calling"',
    "Ein erster Blick.",
    "________________________________________________", // Specific separator line
    "*************************************************************************************", // Specific banner line
  ];

  for (const kw of disclaimerKeywords) {
    const idx = cleanedText.indexOf(kw);
    if (idx !== -1) {
      // Cut off the text from the start of the keyword
      cleanedText = cleanedText.substring(0, idx).trim();
    }
  }

  // 5. Final whitespace and line cleanup.
  cleanedText = cleanedText
    .split("\n")
    .map((line) => line.trimEnd()) // Trim trailing whitespace from each line
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")) // Remove consecutive blank lines
    .join("\n")
    .trim(); // Trim overall leading/trailing whitespace

  // Remove any remaining * or > characters at the absolute start of the cleaned text.
  // This is a last resort to catch anything that slipped past the line-by-line filters.
  cleanedText = cleanedText.replace(/^[*>]+\s*/, "");

  return cleanedText || "(Kein Nachrichtentext)";
}
