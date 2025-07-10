// emailParser.js

const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Finds the plain text part of a raw message.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Object|null} The text part object or null if not found.
 */
export function findTextPart(parts) {
  if (!parts || !Array.isArray(parts)) return null;
  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) return part;
    if (part.parts) {
      const nested = findTextPart(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Finds all attachment parts in the raw message parts.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Array} An array of attachment parts.
 */
export function findAttachmentParts(parts) {
  const attachments = [];
  for (const part of parts) {
    if (
      part.contentType &&
      ALLOWED_ATTACHMENT_TYPES.includes(part.contentType) &&
      part.name
    ) {
      attachments.push({
        name: part.name || "Attachment",
        contentType: part.contentType,
        size: part.size,
        partName: part.partName,
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
 * @param {string} body - The full plain text body of the email.
 * @returns {Array<Object>} An array of message objects.
 */
export function extractConversationHistory(body) {
  if (!body) return [];

  const messages = [];
  const headerRegex =
    /^(>+\s*)?.*?(\d{1,2}[./]\d{1,2}[./]\d{2,4}).*?(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\s+(?:schrieb|wrote|a écrit|escribió)?\s*(.+?):\s*$/im;

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
      from,
      date,
      time,
      message: extractRelevantBody(messageContent),
    });
  }

  return messages;
}

/**
 * Cleans up and extracts the relevant message text.
 * @param {string} body - The input email text.
 * @returns {string} The cleaned message text.
 */
export function extractRelevantBody(body) {
  const noContentMessage =
    browser?.i18n?.getMessage("EmailNoContentMessage") ||
    "No content available.";
  if (!body) return noContentMessage;

  body = body
    .split("\n")
    .map((line) => line.replace(/^>+\s*/, ""))
    .join("\n");

  let cleanedText = body.split(/\n--\s*\n|__+\n/)[0];

  cleanedText = cleanedText
    .split("\n")
    .filter((line) => !/^\s*([*-_=+#~]{3,}\s*)+$/g.test(line.trim()))
    .join("\n");

  cleanedText = cleanedText.replace(
    /^([ \t]*[*_=\-#~]{4,}.*\n)([\s\S]*?)(^\1|\n[ \t]*[*_=\-#~]{4,}.*\n)/gm,
    ""
  );

  const disclaimerKeywords = [
    "Datenschutz:",
    "PGP",
    "LinkedIn:",
    "Xing:",
    "freundliche Grüße",
    "Geschäftsführer:",
    "fon:",
    "fax:",
    "https://",
    "Web-Applikationen",
    "bleiben Sie gesund!",
    "TYPO3",
    "Ein erster Blick.",
    "VisionConnect",
    "Hohenzollernstr.",
    "D-30161 Hannover",
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

  return cleanedText || noContentMessage;
}
