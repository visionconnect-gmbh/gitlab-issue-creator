

/**
 * Finds the text/plain part in a message's parts array.
 * @param {*} parts - The parts array to search.
 * @returns {*} The text/plain part if found, otherwise null.
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
 * Removes empty lines from a message.
 * @param {string} message - The message text to process.
 * @returns {string} The message text without empty lines.
 */
export function removeEmptyLines(message) {
  return message
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

/**
 * Gets the index of the signature separator in a message.
 * @param {string} message - The message text to search.
 * @returns {number} The index of the signature separator, or -1 if not found.
 */
export function getSignatureIndex(message) {
  const normalized = message.replace(/\r\n/g, "\n");
  const tbPlainSeparator = /^-- $/m;
  const tbHtmlSeparator =
    /(?:<br\s*\/?>|<\/div>|<\/pre>)?\s*--\s*(?:<br\s*\/?>|<\/div>|<\/pre>)/i;
  const genericSeparator = /^(?:--\s*$|__\s*$|([^\w\s])\1{2,}\s*)$/m;

  let match;
  if ((match = normalized.match(tbPlainSeparator)))
    return normalized.indexOf(match[0]);
  if ((match = normalized.match(tbHtmlSeparator)))
    return normalized.indexOf(match[0]);
  if ((match = normalized.match(genericSeparator)))
    return normalized.indexOf(match[0]);
  return -1;
}

/**
 * Removes the signature block from a message.
 * @param {string} message - The message text to process.
 * @returns {string} The message text without the signature block.
 */
export function removeSignature(message) {
  const index = getSignatureIndex(message);
  return index !== -1 ? message.slice(0, index) : message;
}

/**
 * Splits the email body into the latest message and quoted messages.
 * @param {string} emailBody - The full body text of the email.
 * @returns {Object} An object containing the latest message and an array of quoted lines.
 */
export function splitQuotedAndLatest(emailBody) {
  const lines = emailBody.split("\n");
  const latestLines = [];
  const quotedLines = [];

  for (const line of lines) {
    if (line.startsWith(">")) quotedLines.push(line);
    else latestLines.push(line);
  }

  return { latestMessage: latestLines.join("\n").trim(), quotedLines };
}

/** Extracts individual quoted messages from an array of quoted lines.
 * @param {Array} quotedLines - An array of lines starting with '>'.
 * @returns {Array} An array of extracted quoted messages.
 */
export function extractQuotedMessages(quotedLines) {
  const messages = [];
  let buffer = [];
  let currentMinLevel = -1;

  for (let i = quotedLines.length - 1; i >= 0; i--) {
    const line = quotedLines[i];
    const quoteLevel = getQuoteLevel(line);
    const content = line.slice(quoteLevel).trim();

    if (buffer.length === 0) {
      buffer.unshift(content);
      currentMinLevel = quoteLevel;
    } else if (quoteLevel < currentMinLevel) {
      messages.unshift(buffer.join("\n").trim());
      buffer = [content];
      currentMinLevel = quoteLevel;
    } else {
      buffer.unshift(content);
      currentMinLevel = Math.min(currentMinLevel, quoteLevel);
    }
  }

  if (buffer.length > 0) messages.unshift(buffer.join("\n").trim());
  return messages;
}

/** Determines the quote level of a line based on leading '>' characters.
 * @param {string} line - The line to evaluate.
 * @returns {number} The quote level (number of leading '>').
 */
export function getQuoteLevel(line) {
  let level = 0;
  while (line.startsWith(">".repeat(level + 1))) level++;
  return level;
}
