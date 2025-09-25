import { easyMDE, messageData } from "../popupState.js";
import { LocalizeKeys } from "../../../utils/Enums.js";

/**
 * Generate Markdown preview block for attachments
 */
export function getAttachmentMarkdownPreview(attachments) {
  const placeholderTitle =
    browser.i18n.getMessage(LocalizeKeys.ISSUE.ATTACHMENTS_TITLE) ||
    "Attachments";
  const placeholderText =
    browser.i18n.getMessage(LocalizeKeys.ISSUE.ATTACHMENT_PREVIEW_TEXT) ||
    "This attachment will be uploaded when the issue is created.";
  const placeholderDisclaimer =
    browser.i18n.getMessage(
      LocalizeKeys.ISSUE.ATTACHMENT_PREVIEW_TEXT_DISCLAIMER
    ) || "DO NOT EDIT!";

  return attachments
    .map(
      (a) =>
        `**${placeholderTitle}:** _${a.name}_ *(${placeholderText})* **${placeholderDisclaimer}**`
    )
    .join("\n\n");
}

/**
 * Generate the base description from email/message history
 */
export function generateBaseDescription() {
  const history = messageData?.conversationHistory ?? [];
  if (!history.length) {
    return (
      browser.i18n.getMessage(LocalizeKeys.EMAIL.NO_CONTENT) ||
      "No content available."
    );
  }

  return history
    .map((entry, index) => {
      const separator = index > 0 ? "\n---\n" : "";
      const main = formatEntry(entry, index);
      const forwarded = entry.forwardedMessage
        ? "\n\n" + formatEntry(entry.forwardedMessage, index, true)
        : "";
      return `${separator}${main}${forwarded}`;
    })
    .join("\n")
    .trim();
}

/**
 * Format a single entry in the conversation
 */
function formatEntry(entry, index, isForwarded = false) {
  const from = determineSender(entry, index, isForwarded);
  const dateFormatted = formatDate(entry, index, isForwarded);
  const fromText =
    browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.FROM_AUTHOR) || "From";
  const dateText =
    browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.DATE_RECEIVED) ||
    "Received on";
  const forwardedPrefix = isForwarded
    ? `**(${
        browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.FORWARDED_MESSAGE) ||
        "Forwarded Message"
      })**\n`
    : "\n";

  const metaInfo = `**${fromText}**: ${from}\n**${dateText}**: ${dateFormatted}\n\n`;
  const messageText =
    entry.message?.trim() ||
    browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_EMAIL_CONTENT) ||
    "No email content available.";

  return `${forwardedPrefix}${metaInfo}${messageText}`;
}

function determineSender(entry, index, isForwarded) {
  if (index === 0 && !isForwarded) return messageData.author;
  return (
    entry.from ||
    browser.i18n.getMessage(LocalizeKeys.FALLBACK.UNKNOWN_SENDER) ||
    "Unknown sender"
  );
}

function formatDate(entry, index, isForwarded) {
  const messageDate =
    !isForwarded && index === 0 && messageData?.date instanceof Date
      ? messageData.date
      : null;

  const is12HourFormat =
    entry.time?.includes("AM") || entry.time?.includes("PM");
  const localizedTime = formatTime(entry.time, is12HourFormat);

  if (messageDate && !isNaN(messageDate.getTime())) {
    return messageDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (entry.date) {
    const parsed = new Date(entry.date);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })} ${localizedTime}`.trim();
    }
    return `${entry.date} ${localizedTime}`.trim();
  }

  return (
    browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_DATE_AVAILABLE) ||
    "No date available."
  );
}

function formatTime(timeStr, is12HourFormat) {
  if (!timeStr) return "";
  const dummyDate = "1970-01-01";
  const timeString = is12HourFormat
    ? `${dummyDate} ${timeStr}`
    : `${dummyDate}T${timeStr}`;
  const parsedDate = new Date(timeString);

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  console.warn("Invalid time format:", timeStr);
  return timeStr;
}

/**
 * Generate full description including attachments preview block
 */
export function generateFullDescription(attachments = []) {
  const baseDescription = generateBaseDescription();

  // current text
  let text = easyMDE.value().trim();

  // remove old attachment preview block if present
  text = text.replace(
    /\n*\[attachments\][\s\S]*?\[\/attachments\]\s*/m,
    ""
  );

  // if no attachments left, just return base text
  if (attachments.length === 0) {
    return text || baseDescription;
  }

  // build new attachment block
  const attachmentBlock = `[attachments]\n${getAttachmentMarkdownPreview(
    attachments
  )}\n[/attachments]`;

  return `${text || baseDescription}\n\n${attachmentBlock}`;
}
