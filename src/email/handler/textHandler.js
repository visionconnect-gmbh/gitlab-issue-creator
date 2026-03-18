/**
 * @fileoverview Plain-text email body utilities.
 *
 * Handles three concerns:
 *  1. **Part discovery** – finding the `text/plain` part in a nested MIME tree.
 *  2. **Cleaning** – stripping empty lines and signature blocks.
 *  3. **Conversation splitting** – separating the latest message from quoted replies.
 */

// ---------------------------------------------------------------------------
// MIME part discovery
// ---------------------------------------------------------------------------

/**
 * Recursively finds the first `text/plain` part with a non-empty body in the
 * message's MIME tree.
 *
 * @param {object[]|null} parts - Array of MIME part objects.
 * @returns {object|null} The matching part, or null if none is found.
 */
export function findTextPart(parts) {
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) return part;
    if (part.parts) {
      const nested = findTextPart(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------

/**
 * Removes all blank lines from a string and trims surrounding whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeEmptyLines(text) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

/**
 * Finds the character index of the email signature separator within `text`.
 *
 * Recognised separators (in priority order):
 * - Thunderbird plain-text: `-- ` on its own line
 * - Thunderbird HTML: `-- ` surrounded by HTML tags
 * - Generic: `--`, `__`, or a repeated special character on its own line
 *
 * @param {string} text - The message text to search.
 * @returns {number} Index of the separator, or -1 if no signature found.
 */
export function getSignatureIndex(text) {
  const normalised = text.replace(/\r\n/g, "\n");

  const patterns = [
    /^-- $/m,
    /(?:<br\s*\/?>|<\/div>|<\/pre>)?\s*--\s*(?:<br\s*\/?>|<\/div>|<\/pre>)/i,
    /^(?:--\s*$|__\s*$|([^\w\s])\1{2,}\s*)$/m,
  ];

  for (const pattern of patterns) {
    const match = normalised.match(pattern);
    if (match) return normalised.indexOf(match[0]);
  }
  return -1;
}

/**
 * Strips the email signature from `text` by truncating at the signature separator.
 * Returns the original string unchanged when no separator is found.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeSignature(text) {
  const index = getSignatureIndex(text);
  return index !== -1 ? text.slice(0, index) : text;
}

// ---------------------------------------------------------------------------
// Conversation splitting
// ---------------------------------------------------------------------------

/**
 * Splits an email body into the latest (non-quoted) message and the quoted lines.
 *
 * Lines beginning with `>` are considered quoted; all other lines belong to the
 * latest message.
 *
 * @param {string} emailBody - The full raw email body.
 * @returns {{ latestMessage: string, quotedLines: string[] }}
 */
export function splitQuotedAndLatest(emailBody) {
  const latestLines = [];
  const quotedLines = [];

  for (const line of emailBody.split("\n")) {
    if (line.startsWith(">")) {
      quotedLines.push(line);
    } else {
      latestLines.push(line);
    }
  }

  return { latestMessage: latestLines.join("\n").trim(), quotedLines };
}

/**
 * Returns the quote depth of a line (number of leading `>` characters).
 *
 * @param {string} line
 * @returns {number}
 */
export function getQuoteLevel(line) {
  let level = 0;
  while (line.startsWith(">".repeat(level + 1))) level++;
  return level;
}

/**
 * Reconstructs individual quoted messages from an array of `>`-prefixed lines.
 *
 * The algorithm walks backwards through the lines and groups them by their
 * minimum quote level, yielding one "message" per level transition.
 *
 * @param {string[]} quotedLines - Lines that begin with one or more `>` characters.
 * @returns {string[]} Array of de-prefixed message strings.
 */
export function extractQuotedMessages(quotedLines) {
  const messages = [];
  let buffer = [];
  let currentMinLevel = -1;

  for (let i = quotedLines.length - 1; i >= 0; i--) {
    const line = quotedLines[i];
    const level = getQuoteLevel(line);
    const content = line.slice(level).trim();

    if (buffer.length === 0) {
      buffer.unshift(content);
      currentMinLevel = level;
    } else if (level < currentMinLevel) {
      messages.unshift(buffer.join("\n").trim());
      buffer = [content];
      currentMinLevel = level;
    } else {
      buffer.unshift(content);
      currentMinLevel = Math.min(currentMinLevel, level);
    }
  }

  if (buffer.length > 0) {
    messages.unshift(buffer.join("\n").trim());
  }

  return messages;
}
