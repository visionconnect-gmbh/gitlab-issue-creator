/**
 * @fileoverview Plain-text email body utilities.
 *
 * Handles three concerns:
 *  1. **Part discovery** – finding the `text/plain` part in a nested MIME tree.
 *  2. **Cleaning** – stripping empty lines and signature blocks.
 *  3. **Conversation splitting** – separating the latest message from quoted replies.
 */

import { VALEDICTION_RE } from "../locales/emailLocales.js";

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

/**
 * Recursively finds the first `text/html` part with a non-empty body in the
 * message's MIME tree. Some clients (notably Outlook and Apple Mail forwards)
 * only include the full conversation history in the HTML alternative, with
 * the plain-text part containing just the new reply text: see
 * `htmlHandler.js`, which converts this into the same quoted-text shape
 * `emailParser()` already understands.
 *
 * @param {object[]|null} parts - Array of MIME part objects.
 * @returns {object|null} The matching part, or null if none is found.
 */
export function findHtmlPart(parts) {
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    if (part.contentType === "text/html" && part.body) return part;
    if (part.parts) {
      const nested = findHtmlPart(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------

/**
 * Collapses runs of blank lines down to one and trims surrounding
 * whitespace, preserving real paragraph breaks instead of destroying them.
 * Same run-collapsing predicate as `htmlHandler.js`'s final cleanup, for
 * consistency between the plain-text and HTML parsing paths.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeEmptyLines(text) {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line))
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
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
// Closing/valediction phrases with no explicit separator before them: any
// known language (see ../locales/emailLocales.js).

export function getSignatureIndex(text) {
  // Callers operate on text already normalized to `\n` line endings (see
  // `emailParser()`), so `match.index` here is directly usable by
  // `removeSignature` to slice `text` itself: matching against a
  // normalized COPY while slicing the original would shift every offset
  // that follows a stripped `\r` by however many preceded it.
  const patterns = [
    /^-- $/m,
    /(?:<br\s*\/?>|<\/div>|<\/pre>)?\s*--\s*(?:<br\s*\/?>|<\/div>|<\/pre>)/i,
    /^(?:--\s*$|__\s*$|([^\w\s])\1{2,}\s*)$/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    // Use the match's own position, not `indexOf(match[0])`: for a short,
    // generic match like "--\n" the same text can occur earlier in the
    // string by coincidence (e.g. inside a "--------" separator line),
    // which would truncate the message well before the real signature.
    if (match) return match.index;
  }

  // A valediction has no explicit separator, so unlike the patterns above,
  // use its LAST occurrence rather than its first: a multi-paragraph body
  // could otherwise coincidentally echo a greeting-like phrase mid-message
  // and truncate the message far too early.
  let lastMatch = null;
  let m;
  while ((m = VALEDICTION_RE.exec(text))) lastMatch = m;
  if (lastMatch) return lastMatch.index;

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
  return index !== -1 ? text.slice(0, index).trimEnd() : text;
}

// ---------------------------------------------------------------------------
// Conversation splitting
// ---------------------------------------------------------------------------

/**
 * Sentinel pushed into `quotedLines` between two separate runs of quoted
 * lines that are interrupted by non-quoted (latest-message) text, e.g. when
 * a reply inline-quotes a fragment for context and then continues with its
 * own text before the real quoted reply chain starts. `extractQuotedMessages`
 * treats it as a hard boundary so the two runs are never merged into a
 * single reconstructed message just because they share a quote level.
 */
const RUN_BREAK = Symbol("quote-run-break");

/**
 * Splits an email body into the latest (non-quoted) message and the quoted lines.
 *
 * Lines beginning with `>` are considered quoted; all other lines belong to the
 * latest message. Non-adjacent runs of quoted lines (interrupted by latest-message
 * text in between) are separated by a `RUN_BREAK` sentinel so they aren't later
 * mistaken for one contiguous quoted block.
 *
 * @param {string} emailBody - The full raw email body.
 * @returns {{ latestMessage: string, quotedLines: Array<string|symbol> }}
 */
export function splitQuotedAndLatest(emailBody) {
  const latestLines = [];
  const quotedLines = [];
  let wasQuoted = false;

  for (const line of emailBody.split("\n")) {
    const isQuoted = line.startsWith(">");
    if (isQuoted) {
      if (!wasQuoted && quotedLines.length > 0) quotedLines.push(RUN_BREAK);
      quotedLines.push(line);
    } else {
      latestLines.push(line);
    }
    wasQuoted = isQuoted;
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
 * Walks forward through the lines maintaining a stack of open messages, one
 * per quote level currently nested into: a level deeper than the current top
 * opens a new message, a level shallower closes messages back down to it,
 * and an equal level appends to the current one. Because quote depth doesn't
 * always increase by exactly one per level (mail clients sometimes jump by
 * more than one `>` per reply), boundaries are detected by comparing to the
 * currently open level rather than assuming a fixed step.
 *
 * A `RUN_BREAK` sentinel (see `splitQuotedAndLatest`) forces all currently
 * open messages closed, so two non-adjacent runs of quoted lines at the same
 * level are never merged into one reconstructed message. Closes are always
 * unshifted to the front of the result: content that stays open longer
 * (deeper nesting, or simply appearing later in the document, e.g. after a
 * `RUN_BREAK`) is closed later and so ends up earlier in the output, which
 * is what lets `remapDateAndAuthorLines` attach a header line found earlier
 * in the document to the message that actually follows it there, even when
 * an unrelated, unnested fragment (e.g. an inline requote) closes sooner.
 *
 * @param {Array<string|symbol>} quotedLines - Lines that begin with one or more
 *   `>` characters, possibly interspersed with `RUN_BREAK` sentinels.
 * @returns {string[]} Array of de-prefixed message strings.
 */
export function extractQuotedMessages(quotedLines) {
  const messages = [];
  const stack = [];

  const closeTop = () => {
    const { buffer } = stack.pop();
    messages.unshift(buffer.join("\n").trim());
  };

  for (const line of quotedLines) {
    if (line === RUN_BREAK) {
      while (stack.length) closeTop();
      continue;
    }

    const level = getQuoteLevel(line);
    const content = line.slice(level).trim();

    while (stack.length && level < stack[stack.length - 1].level) {
      closeTop();
    }

    if (!stack.length || level > stack[stack.length - 1].level) {
      stack.push({ level, buffer: [] });
    }

    stack[stack.length - 1].buffer.push(content);
  }

  while (stack.length) closeTop();

  return messages;
}
