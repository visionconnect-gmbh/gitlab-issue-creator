import { messageData } from "../popupState.js";
import { LocalizeKeys } from "../../../utils/Enums.js";
import { parseCanonicalDate, parseCanonicalTime } from "../../../utils/dateFormat.js";

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
      // When a message's own body was entirely consumed by a forward it
      // introduces (e.g. Apple Mail representing a forward chain as nested
      // content within one quote level, rather than as its own quote
      // depth), there is no real content of its own to show, so skip the
      // "Unbekannter Absender / Kein E-Mail-Inhalt verfügbar" placeholder
      // and go straight to the forward chain.
      const hasOwnContent = Boolean(entry.message?.trim());
      const main = hasOwnContent ? formatEntry(entry, index) : "";
      const forwarded = formatForwardChain(entry, index);
      return `${separator}${main}${forwarded}`;
    })
    .join("\n")
    .trim();
}

/**
 * Formats the full chain of forwarded messages for an entry. A forward can
 * itself contain a further forward (the same Apple-Mail-represents-a-chain-
 * within-one-quote-level case above), not just one level deep.
 */
function formatForwardChain(entry, index) {
  let out = "";
  let current = entry.forwardedMessage;
  while (current) {
    out += "\n\n" + formatEntry(current, index, true);
    current = current.forwardedMessage;
  }
  return out;
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

/** Determine the sender for an entry
 */
function determineSender(entry, index, isForwarded) {
  if (index === 0 && !isForwarded) return messageData.author;
  return (
    entry.from ||
    browser.i18n.getMessage(LocalizeKeys.FALLBACK.UNKNOWN_SENDER) ||
    "Unknown sender"
  );
}

/** Format the date for an entry
 * Tries to use the message date for the first entry if available
 * Falls back to parsing the date and time strings
 * If all fails, returns a localized fallback message
 * @param {Object} entry - The entry object containing date and time
 * @param {number} index - The index of the entry in the history
 * @param {boolean} isForwarded - Whether this entry is a forwarded message
 * @returns {string} The formatted date string
 */
function formatDate(entry, index, isForwarded) {
  const messageDate =
    !isForwarded && index === 0 && messageData?.date instanceof Date
      ? messageData.date
      : null;

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
    const dateParts = parseCanonicalDate(entry.date);
    if (dateParts) {
      const timeParts = parseCanonicalTime(entry.time);
      const combined = new Date(
        dateParts.year,
        dateParts.month - 1,
        dateParts.day,
        timeParts?.hour ?? 0,
        timeParts?.minute ?? 0,
      );
      const formattedDate = combined.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!timeParts) return formattedDate;
      const formattedTime = combined.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${formattedDate} ${formattedTime}`;
    }
    // `entry.date` isn't in the canonical shape, so nothing upstream could
    // recognize a date at all, so show the raw value rather than guessing.
    return `${entry.date} ${entry.time ?? ""}`.trim();
  }

  return (
    browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_DATE_AVAILABLE) ||
    "No date available."
  );
}
