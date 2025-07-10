/**
 * Retrieves the currently active email message content and extracts conversation history.
 * @returns {Promise<Object|null>} An object containing subject, author, date, and conversationHistory, or null if no message is found.
 */
export async function getEmailContent(message) {
  if (!message) {
    return null;
  }

  const rawMessage = await browser.messages.getFull(message.id);
  const textPart = findTextPart(rawMessage.parts);
  const emailBody = textPart ? textPart.body : "";
  const conversationHistory = extractConversationHistory(emailBody);
  const attachments = findAttachmentParts(rawMessage.parts);
  return {
    id: message.id,
    subject: message.subject,
    author: message.author,
    date: message.date,
    attachments: attachments,
    conversationHistory,
  };
}

/**
 * Finds the plain text part of a raw message.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Object|null} The text part object or null if not found.
 */
function findTextPart(parts) {
  if (!parts || !Array.isArray(parts)) {
    return null;
  }
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

const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
/**
 * Finds all attachment parts in the raw message parts.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Array} An array of attachment parts.
 * */
function findAttachmentParts(parts) {
  const attachments = [];
  for (const part of parts) {
    if (
      part.contentType &&
      ALLOWED_ATTACHMENT_TYPES.includes(part.contentType) &&
      part.name // treat named image/pdf as an attachment regardless of disposition
    ) {
      attachments.push({
        name: part.name || "Attachment",
        contentType: part.contentType,
        size: part.size,
        partName: part.partName
      });
    }
    if (part.parts) {
      attachments.push(...findAttachmentParts(part.parts));
    }
  }
  return attachments;
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

  // Regex to identify message headers (e.g., "Am DD.MM.YYYY um HH:MM schrieb Sender Name:")
  const headerRegex =
    /^(>+\s*)?Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb ([\s\S]+?):\s*$/m;

  // Find all header occurrences.
  const allHeaders = [...body.matchAll(new RegExp(headerRegex.source, "gm"))];

  if (allHeaders.length > 0) {
    const firstHeaderMatch = allHeaders[0];
    // Extract content before the first header, treated as the initial message.
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
    // If no headers, the entire body is one message.
    messages.push({
      from: null,
      date: null,
      time: null,
      message: extractRelevantBody(body),
    });
    return messages;
  }

  // Iterate through headers to extract individual messages.
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

    // Remove quote prefixes from message content.
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
 * Extracts the relevant body text from an email-like string by cleaning up quotes,
 * removing signatures, disclaimers, and excessive blank lines.
 *
 * @param {string} body - The input string, potentially containing quotes, signatures, and disclaimers.
 * @returns {string} The cleaned and relevant message body, or "(Kein Nachrichtentext)" if no relevant text is found.
 */
function extractRelevantBody(body) {
  if (!body) return "(Kein Nachrichtentext)";

  // Remove leading ">" characters often used for quoting in email replies.
  body = body
    .split("\n")
    .map((line) => line.replace(/^>+\s*/, ""))
    .join("\n");

  // Remove content after common signature delimiters like "--" or "__+".
  let cleanedText = body.split(/\n--\s*\n|__+\n/)[0];

  // Filter out lines that consist solely of repetitive characters (e.g., "---", "==="), often used as separators.
  cleanedText = cleanedText
    .split("\n")
    .filter((line) => {
      return !/^\s*([*-_=+#~]{3,}\s*)+$/g.test(line.trim());
    })
    .join("\n");

  // Remove blocks of text that are enclosed by lines of repeating special characters,
  // which might indicate embedded content or banners.
  cleanedText = cleanedText.replace(
    /^([ \t]*[*_=\-#~]{4,}.*\n)([\s\S]*?)(^\1|\n[ \t]*[*_=\-#~]{4,}.*\n)/gm,
    ""
  );

  // Define a list of keywords commonly found in email disclaimers or signatures.
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

  // Iterate through disclaimer keywords and truncate the text at the first occurrence of any keyword.
  for (const kw of disclaimerKeywords) {
    const idx = cleanedText.indexOf(kw);
    if (idx !== -1) {
      cleanedText = cleanedText.substring(0, idx).trim();
    }
  }

  // Trim trailing whitespace from each line, and remove excessive blank lines
  // (ensuring no more than one consecutive blank line).
  cleanedText = cleanedText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();

  // Remove any remaining leading quote characters or asterisks from the beginning of the cleaned text.
  cleanedText = cleanedText.replace(/^[*>]+\s*/, "");

  // Return the cleaned text, or the default message if the text is empty after cleaning.
  return cleanedText || "(Kein Nachrichtentext)";
}
