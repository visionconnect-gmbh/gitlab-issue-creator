import {
  parseDateAndAuthorLine,
  extractDateAndAuthorLine,
  remapDateAndAuthorLines,
  removeDateAndAuthorLines,
} from "./handler/dateAuthorHandler.js";
import {
  extractForwardedMessage,
  extractForwardedAuthorAndDate,
  removeForwardedHeader,
  removeForwardedMessage,
} from "./handler/forwardedHandler.js";
import {
  findTextPart,
  removeEmptyLines,
  removeSignature,
  splitQuotedAndLatest,
  extractQuotedMessages,
} from "./handler/textHandler.js";
import { findAttachmentParts } from "./handler/attachmentHandler.js";

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
  const conversationHistory = emailParser(emailBody);
  const attachments = findAttachmentParts(rawMessage.parts);
  return {
    id: message.id,
    subject: message.subject,
    author: message.author,
    date: message.date,
    attachments,
    conversationHistory,
  };
}

/** Parses the email body to extract conversation history, including handling quoted messages and forwarded content.
 * @param {string} emailBody - The full body text of the email.
 * @returns {Array} An array of message objects with properties: from, date, time, message, and optional forwardedMessage.
 */
export function emailParser(emailBody) {
  if (!emailBody || typeof emailBody !== "string") return [];

  const { latestMessage, quotedLines } = splitQuotedAndLatest(emailBody);
  const quotedMessages = extractQuotedMessages(quotedLines);
  const rawMessages = [latestMessage, ...quotedMessages].filter(Boolean);
  const dateAndAuthorLines = rawMessages.map(extractDateAndAuthorLine);
  const remappedMessages = remapDateAndAuthorLines(
    rawMessages,
    dateAndAuthorLines
  );
  return remappedMessages.map((rawMessage) => {
    const headerLine = rawMessage.split("\n")[0];
    const { from, date, time } = parseDateAndAuthorLine(headerLine);
    const forwardedText = extractForwardedMessage(rawMessage);
    const contentWithoutHeader = removeDateAndAuthorLines(rawMessage);
    let cleanedMessageOuter = removeEmptyLines(contentWithoutHeader);
    cleanedMessageOuter = removeForwardedMessage(cleanedMessageOuter);
    const finalMessageOuter = removeSignature(cleanedMessageOuter);

    let forwardedMessage = null;
    if (forwardedText) {
      const { author, date: forwardedDate } =
        extractForwardedAuthorAndDate(forwardedText);
      let cleanedForwardedMessage = removeForwardedHeader(forwardedText);
      cleanedForwardedMessage = removeSignature(cleanedForwardedMessage);
      const finalForwardedMessage = removeEmptyLines(cleanedForwardedMessage);

      forwardedMessage = {
        from: author,
        date: forwardedDate,
        time: null,
        message: finalForwardedMessage,
      };
    }

    return { from, date, time, message: finalMessageOuter, forwardedMessage };
  });
}
