import { getSignatureIndex } from "./textHandler.js";

/** Extracts the forwarded message from the email body
 * @param {string} message - The full email message
 * @returns {string|null} The extracted forwarded message or null if not found
 */
export function extractForwardedMessage(message) {
  const forwardHeaderRegex = /^-{3,}.*?-{3,}$/m;
  const match = message.match(forwardHeaderRegex);
  if (!match) return null;

  const startIndex = message.indexOf(match[0]) + match[0].length;
  let forwardedText = message.slice(startIndex);

  const endIndex = getSignatureIndex(forwardedText);
  const cleanText =
    endIndex === -1 ? forwardedText : forwardedText.slice(0, endIndex);
  return cleanText || null;
}

/** Extracts the author and date from the forwarded message header
 * @param {string} forwardedText - The text of the forwarded message
 * @returns {Object} An object with 'author' and 'date' properties, or null if not found
 */
export function extractForwardedAuthorAndDate(forwardedText) {
  const lines = forwardedText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let author = null;
  let date = null;

  for (const line of lines) {
    const emailMatch = line.match(/<?([\w.-]+@[\w.-]+\.\w+)>?/);
    if (!author && emailMatch) author = line;

    const dateMatch = line.match(
      /\b(?:\d{1,2}\.\s*\w+|\w+,\s*\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b.*\d{2}:\d{2}/
    );
    if (!date && dateMatch) date = line;

    if (author && date) break;
  }

  return { author, date };
}

/** Removes the header of the forwarded message, if present
 * @param {string} message - The full email message
 * @returns {string} The message without the forwarded header
 */
export function removeForwardedHeader(message) {
  const lines = message.split("\n");
  let headerEndIndex = -1;
  let headerCandidate = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" && i > 0) {
      headerEndIndex = i;
      break;
    }
    if (line !== "" && !line.includes(":")) {
      headerCandidate = false;
      break;
    }
  }

  if (headerEndIndex === -1 || !headerCandidate) return message;
  return lines.slice(headerEndIndex + 1).join("\n");
}


/**
 * Removes the forwarded message and its header from the base message
 */
export function removeForwardedMessage(baseMessage) {
  if (!baseMessage || typeof baseMessage !== "string") return baseMessage;

  // Regex for forwarded message header (like "-----Ursprüngliche Nachricht-----")
  const forwardHeaderRegex = /^-{3,}.*?-{3,}$/m;
  const match = baseMessage.match(forwardHeaderRegex);
  if (!match) return baseMessage;

  // Remove everything from the start of the header to the end of the message
  return baseMessage.slice(0, baseMessage.indexOf(match[0])).trimEnd();
}
