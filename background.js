import { displayNotification } from "./utils/utils.js";
import { clearAllCache } from "./utils/cache.js";
import {
  getProjects,
  createGitLabIssue,
  getCurrentUser,
} from "./gitlab/gitlab.js";

let projectsGlobal = [];
let emailGlobal = null;
let popupWindowId = null;
let popupReady = false;

/**
 * Finds the plain text part of a raw message.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Object|null} The text part object or null if not found.
 */
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

  const headerRegex =
    /^(>+\s*)?Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb ([\s\S]+?):\s*$/m;

  const allHeaders = [...body.matchAll(new RegExp(headerRegex.source, "gm"))];

  if (allHeaders.length > 0) {
    const firstHeaderMatch = allHeaders[0];
    const mainMessageContent = body.substring(0, firstHeaderMatch.index).trim();
    if (mainMessageContent) {
      messages.push({
        from: null,
        date: null,
        time: null,
        message: extractRelevantBody(mainMessageContent),
      });
    }
  } else {
    messages.push({
      from: null,
      date: null,
      time: null,
      message: extractRelevantBody(body),
    });
    return messages;
  }

  for (let i = 0; i < allHeaders.length; i++) {
    const currentHeaderMatch = allHeaders[i];
    const nextHeaderMatch = allHeaders[i + 1];

    const messageStart =
      currentHeaderMatch.index + currentHeaderMatch[0].length;
    const messageEnd = nextHeaderMatch ? nextHeaderMatch.index : body.length;

    let messageContent = body.substring(messageStart, messageEnd).trim();

    const quotePrefix = currentHeaderMatch[1] || "";
    const date = currentHeaderMatch[2];
    const time = currentHeaderMatch[3];
    const from = currentHeaderMatch[4].replace(/\s+/g, " ").trim();

    const escapedQuotePrefix = quotePrefix.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const lineQuoteStripper = new RegExp(`^${escapedQuotePrefix}(.*)$`, "gm");
    messageContent = messageContent.replace(lineQuoteStripper, "$1").trim();

    messages.push({
      from: from,
      date: date,
      time: time,
      message: extractRelevantBody(messageContent),
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

  body = body
    .split("\n")
    .map((line) => line.replace(/^>+\s*/, ""))
    .join("\n");

  let cleanedText = body.split(/\n--\s*\n|__+\n/)[0];

  cleanedText = cleanedText
    .split("\n")
    .filter((line) => {
      return !/^\s*([*-_=+#~]{3,}\s*)+$/g.test(line.trim());
    })
    .join("\n");

  cleanedText = cleanedText.replace(
    /^([ \t]*[*_=\-#~]{4,}.*\n)([\s\S]*?)(^\1|\n[ \t]*[*_=\-#~]{4,}.*\n)/gm,
    ""
  );

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
    "https://www.visionconnect.de",
    "Xing:",
    "LinkedIn:",
    'TYPO3 v13 "The Ocean\'s Calling"',
    "Ein erster Blick.",
    "________________________________________________",
    "*************************************************************************************",
  ];

  for (const kw of disclaimerKeywords) {
    const idx = cleanedText.indexOf(kw);
    if (idx !== -1) {
      cleanedText = cleanedText.substring(0, idx).trim();
    }
  }

  cleanedText = cleanedText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();

  cleanedText = cleanedText.replace(/^[*>]+\s*/, "");

  return cleanedText || "(Kein Nachrichtentext)";
}

/**
 * Retrieves the currently active email message content and extracts conversation history.
 * @returns {Promise<Object|null>} An object containing subject, author, date, and conversationHistory, or null if no message is found.
 */
async function getEmailContent() {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const message = await browser.messageDisplay.getDisplayedMessage(
    activeTab.id
  );
  if (!message) {
    displayNotification("GitLab Ticket Addon", "Keine E-Mail ausgewählt.");
    return null;
  }

  const rawMessage = await browser.messages.getFull(message.id);
  const textPart = findTextPart(rawMessage.parts);
  const emailBody = textPart ? textPart.body : "";

  const conversationHistory = extractConversationHistory(emailBody);

  return {
    subject: message.subject,
    author: message.author,
    date: message.date,
    conversationHistory,
  };
}

async function handleBrowserActionClick() {
  try {
    const emailData = await getEmailContent();
    if (!emailData) return;
    emailGlobal = emailData;

    // Popup öffnen
    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL(`projects/ticket_creator.html`),
      type: "popup",
      width: 500,
      height: 700,
    });

    popupWindowId = popupWindow.id;

    // Projekte laden
    getProjects((projects) => {
      projectsGlobal = projects;
      if (popupReady) {
        sendProjectDataToPopup();
      } else {
        // Popup ist noch nicht bereit, warten auf Nachricht
        browser.runtime.onMessage.addListener((msg) => {
          if (msg.type === "popup-ready") {
            popupReady = true;
            sendProjectDataToPopup();
          }
        });
      }
    });
  } catch (err) {
    console.error("Error in addon:", err);
    displayNotification(
      "GitLab Ticket Addon",
      "Ein Fehler ist aufgetreten. Details siehe Konsole."
    );
  }
}

async function sendProjectDataToPopup() {
  if (!popupWindowId) return;
  const tabs = await browser.tabs.query({ windowId: popupWindowId });

  if (tabs.length === 0) {
    console.warn("Popup window tab not found.");
    return;
  }

  try {
    await browser.tabs.sendMessage(tabs[0].id, {
      type: "project-list",
      projects: projectsGlobal,
      email: emailGlobal,
    });
  } catch (err) {
    console.warn("Could not send message to popup:", err);
  }
}

async function handleRuntimeMessages(msg, sender) {
  const msgType = msg.type;
  if (!msgType) return;

  switch (msgType) {
    case "popup-ready": {
      popupReady = true;
      sendProjectDataToPopup();
      break;
    }

    case "project-selected": {
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

      try {
        const assignee = await getCurrentUser();
        await createGitLabIssue(projectId, assignee.id, title, description);
      } catch (error) {
        console.error("Fehler beim Erstellen des GitLab-Issues:", error);
        displayNotification(
          "GitLab Ticket Addon",
          "Fehler beim Erstellen des Tickets: " + error.message
        );
      }
      break;
    }

    case "clear-cache": {
      try {
        clearAllCache();
        displayNotification(
          "GitLab Ticket Addon",
          "Cache erfolgreich geleert."
        );
      } catch (error) {
        console.error("Fehler beim Leeren des Caches:", error);
        displayNotification(
          "GitLab Ticket Addon",
          "Fehler beim Leeren des Caches: " + error.message
        );
      }
      break;
    }

    default:
      console.warn("Unbekannter Nachrichtentyp:", msgType);
  }
}

// Add event listeners
browser.browserAction.onClicked.addListener(handleBrowserActionClick);
browser.runtime.onMessage.addListener(handleRuntimeMessages);
