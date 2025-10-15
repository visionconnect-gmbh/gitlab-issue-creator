

/**
 * Parses a date and author line from an email message.
 * @param {string} line - The line to parse.
 * @returns {Object} An object containing the parsed from, date, and time.
 */
export function parseDateAndAuthorLine(line) {
  if (!line) return { from: "", date: "", time: "" };

  const cleaned = line.replace(/\s+/g, " ").trim();

  // Date: 1–2 digits sep 1–2 digits sep 2–4 digits
  const datePattern = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
  // Time: 1–2 digits:2 digits + optional AM/PM
  const timePattern = /\d{1,2}:\d{2}(?:\s?(?:AM|PM))?/i;

  const dateMatch = cleaned.match(datePattern);
  const timeMatch = cleaned.match(timePattern);

  if (!dateMatch || !timeMatch) {
    return { from: "", date: "", time: "" };
  }

  const date = dateMatch[0];
  const time = timeMatch[0];

  // Take substring starting *after* the time
  const afterTime = cleaned.slice(cleaned.indexOf(time) + time.length).trim();

  // Author = until first colon
  let from = (afterTime.split(":")[0] || "").trim();

  from = extractName(from);
  return { date, time, from };
}

/**
 * Extracts the author's name from a date and author line.
 * @param {string} line - The line to extract the name from.
 * @returns {string} The extracted author's name.
 */
function extractName(line) {
  // Match sequences of capitalized words
  const matches = line.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)*)\b/g);
  if (!matches) return line.trim();
  
  // Return all capitalized sequences joined by space (in case there are multiple)
  return matches.join(' ').trim();
}

/**
 * Extracts the date and author line from an email message.
 * @param {string} message - The email message text.
 * @returns {string|null} The extracted date and author line, or null if not found.
 */
export function extractDateAndAuthorLine(message) {
  const genericRegex =
    /(?:\d{1,2}[./-]){2}\d{2,4}[\s,]+(?:um\s)?\d{1,2}:\d{2}(?:\s?(?:AM|PM))?[,:\s-]+.+?:/i;
  return message.split("\n").find((line) => genericRegex.test(line)) || null;
}

/** Removes date and author lines from an email message.
 * @param {string} message - The email message text.
 * @returns {string} The message without date and author lines.
 */
export function removeDateAndAuthorLines(message) {
  const lines = message.split("\n");
  return lines.filter((line) => !extractDateAndAuthorLine(line)).join("\n");
}

/** Remaps date and author lines to the beginning of each message.
 * @param {Array} messages - An array of email message texts.
 * @param {Array} dateLines - An array of extracted date and author lines.
 * @returns {Array} An array of messages with date and author lines prepended.
 */
export function remapDateAndAuthorLines(messages, dateLines) {
  return messages.map((msg, i) =>
    dateLines[i - 1] ? `${dateLines[i - 1]}\n\n${msg}` : msg
  );
}
