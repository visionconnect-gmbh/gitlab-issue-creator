import { getSignatureIndex } from "./textHandler.js";
import { extractLeadingStructuredHeader } from "./dateAuthorHandler.js";

// ---------------------------------------------------------------------------
// Forward-boundary detection
// ---------------------------------------------------------------------------

/** A classic dashed separator, e.g. "-----Forwarded Message-----" or
 * "---------- Weitergeleitete Nachricht ----------". */
const DASH_TRIGGER_RE = /^-{3,}.*?-{3,}$/m;

/** A plain-text trigger phrase with no dashes, German and English. */
const PHRASE_TRIGGER_RE =
  /^(?:Anfang der weitergeleiteten Nachricht|Begin forwarded message|Weitergeleitete Nachricht|Forwarded message|Ursprüngliche Nachricht|Original Message)\s*:?\s*$/im;

/**
 * Finds where a forwarded block begins inside `message`, trying every
 * recognised trigger style and picking whichever occurs earliest:
 *  - a dashed separator line
 *  - a plain trigger phrase line ("Anfang der weitergeleiteten Nachricht:", ...)
 *  - a structured "Von:/Betreff:/Datum:/An:" header block (Outlook-style),
 *    which — unlike the other two — IS itself part of the forwarded
 *    content, so it must not be consumed away.
 *
 * The structured-header style is only considered from the second line
 * onward: at position 0 it would instead be the CURRENT message's own
 * (self-referential) header, which callers handle separately via
 * `extractLeadingStructuredHeader`/`removeLeadingStructuredHeader`.
 *
 * @param {string} message
 * @returns {{ lineStart: number, contentStart: number }|null}
 *   `lineStart` is where the outer message should be truncated;
 *   `contentStart` is where the forwarded content itself begins.
 */
function findForwardTrigger(message) {
  const candidates = [];

  const dashMatch = message.match(DASH_TRIGGER_RE);
  if (dashMatch) {
    const lineStart = message.indexOf(dashMatch[0]);
    candidates.push({ lineStart, contentStart: lineStart + dashMatch[0].length });
  }

  const phraseMatch = message.match(PHRASE_TRIGGER_RE);
  if (phraseMatch) {
    const lineStart = message.indexOf(phraseMatch[0]);
    candidates.push({ lineStart, contentStart: lineStart + phraseMatch[0].length });
  }

  // Structured-header candidates: skip past the message's OWN leading
  // header block first (if any), so its own label lines ("Von:", "Datum:",
  // ...) aren't each re-tested and mistaken for a second, nested header a
  // few lines further down the very same block.
  const lines = message.split("\n");
  const selfHeader = extractLeadingStructuredHeader(message);
  const startLine = selfHeader ? selfHeader.consumedLines : 1;

  let offset = 0;
  for (let k = 0; k < startLine && k < lines.length; k++) offset += lines[k].length + 1;

  for (let i = startLine; i < lines.length; i++) {
    const rest = lines.slice(i).join("\n");
    const parsed = extractLeadingStructuredHeader(rest);
    // Only a genuine forward: the header must introduce actual forwarded
    // content within THIS SAME block. A structured header with nothing (or
    // only whitespace) after it isn't a forward — it's the header for the
    // NEXT quoted message, which `dateAuthorHandler` remaps separately.
    if (parsed && parsed.remainder.trim()) {
      candidates.push({ lineStart: offset, contentStart: offset });
      break;
    }
    offset += lines[i].length + 1;
  }

  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.lineStart <= b.lineStart ? a : b));
}

/** Extracts the forwarded message from the email body
 * @param {string} message - The full email message
 * @returns {string|null} The extracted forwarded message or null if not found
 */
export function extractForwardedMessage(message) {
  const trigger = findForwardTrigger(message);
  if (!trigger) return null;

  const forwardedText = message.slice(trigger.contentStart);

  const endIndex = getSignatureIndex(forwardedText);
  const cleanText =
    endIndex === -1 ? forwardedText : forwardedText.slice(0, endIndex);
  return cleanText.trim() ? cleanText : null;
}

/** Extracts the author and date from the forwarded message header
 * @param {string} forwardedText - The text of the forwarded message
 * @returns {Object} An object with 'author' and 'date' properties, or null if not found
 */
export function extractForwardedAuthorAndDate(forwardedText) {
  const structured = extractLeadingStructuredHeader(forwardedText);
  if (structured) {
    return { author: structured.from, date: structured.date };
  }

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
 *
 * Handles both "Label: value" (same line, optionally wrapped onto a
 * continuation line) and "Label:" / "value" (split across two lines, with
 * or without blank lines in between) styles, for the labels recognised by
 * `extractLeadingStructuredHeader` (German and English).
 *
 * @param {string} message - The full email message
 * @returns {string} The message without the forwarded header
 */
export function removeForwardedHeader(message) {
  const structured = extractLeadingStructuredHeader(message);
  if (structured) return structured.remainder;

  // Fall back to the older heuristic (every leading line up to the first
  // blank line contains a colon) for header styles the structured parser
  // doesn't recognise, e.g. a bare "From: alice@example.com" without a
  // matching Datum/Gesendet/Date field.
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

  const trigger = findForwardTrigger(baseMessage);
  if (!trigger) return baseMessage;

  return baseMessage.slice(0, trigger.lineStart).trimEnd();
}
