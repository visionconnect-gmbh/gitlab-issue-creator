// emailContent.js
import {
  findTextPart,
  findAttachmentParts,
  extractConversationHistory,
} from "./emailParser.js";

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
    attachments,
    conversationHistory,
  };
}
