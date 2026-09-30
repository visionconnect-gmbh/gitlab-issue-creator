

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
export function extractName(line) {
  // Match sequences of capitalized words
  const matches = line.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)*)\b/g);
  if (!matches) return line.trim();

  // Return all capitalized sequences joined by space (in case there are multiple)
  return matches.join(' ').trim();
}

// ---------------------------------------------------------------------------
// Structured ("Von:/From:", "Betreff:/Subject:", ...) reply headers
// ---------------------------------------------------------------------------

/**
 * Recognised header field labels, German and English side by side, each
 * mapped to the semantic field it fills. Mail clients (Outlook in
 * particular) emit these as a block at the top of a reply/forward instead
 * of (or in addition to) a single "Am ... schrieb ...:" line.
 */
const HEADER_FIELD_BY_LABEL = {
  von: "from",
  from: "from",
  gesendet: "date",
  sent: "date",
  datum: "date",
  date: "date",
  an: "to",
  to: "to",
  cc: "cc",
  "kopie (cc)": "cc",
  kopie: "cc",
  betreff: "subject",
  subject: "subject",
};

const LABEL_ALTERNATION = Object.keys(HEADER_FIELD_BY_LABEL)
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[()]/g, (c) => `\\${c}`))
  .join("|");

const LABEL_LINE_RE = new RegExp(`^(${LABEL_ALTERNATION})\\s*:\\s*(.*)$`, "i");

/**
 * Attempts to parse a structured "Von:/Betreff:/Datum:/An:" style header
 * block starting at the very first (non-blank) line of `text`. Each label
 * may either share its line with its value ("Von: Jane Doe") or be split
 * across two lines ("Von:" then, possibly after blank lines, "Jane Doe") —
 * both styles occur in the wild depending on the originating mail client.
 *
 * @param {string} text
 * @returns {{ from: string, date: string, time: string, remainder: string }|null}
 *   `null` when no valid header block (requiring at least a from/date pair)
 *   is found at the start of `text`.
 */
export function extractLeadingStructuredHeader(text) {
  if (!text) return null;

  const lines = text.split("\n");
  const fields = {};
  let i = 0;

  // Skip leading blank lines.
  while (i < lines.length && lines[i].trim() === "") i++;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "") break;

    const match = trimmed.match(LABEL_LINE_RE);
    if (!match) break;

    const field = HEADER_FIELD_BY_LABEL[match[1].toLowerCase()];
    let value = match[2].trim();
    i++;

    if (!value) {
      // Split-style: skip blank lines, then the next non-blank line is the value.
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i < lines.length && !LABEL_LINE_RE.test(lines[i].trim())) {
        value = lines[i].trim();
        i++;
      }
    }

    // A value can wrap onto a following line without its own label, e.g.
    // a long Cc list continuing as "<name@example.com>" on the next line.
    // Swallow such continuation lines so they don't prematurely end the
    // header block or leak into the message body.
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !LABEL_LINE_RE.test(lines[i].trim()) &&
      /[<>@]/.test(lines[i])
    ) {
      value = `${value} ${lines[i].trim()}`.trim();
      i++;
    }

    if (value && !(field in fields)) fields[field] = value;

    // Skip blank lines between fields, but stop the block once the next
    // non-blank line isn't itself a label line.
    let lookahead = i;
    while (lookahead < lines.length && lines[lookahead].trim() === "") lookahead++;
    if (lookahead < lines.length && LABEL_LINE_RE.test(lines[lookahead].trim())) {
      i = lookahead;
    }
  }

  if (!fields.from || !fields.date) return null;

  // Skip the blank line(s) separating the header block from the body.
  while (i < lines.length && lines[i].trim() === "") i++;

  const { date, time } = parseHeaderDateValue(fields.date);
  const cleanedFrom = extractName(fields.from) || fields.from;

  return {
    from: cleanedFrom,
    date,
    time,
    remainder: lines.slice(i).join("\n"),
    consumedLines: i,
  };
}

/**
 * Best-effort date/time split for a header field value (e.g. "24.09.2026,
 * 09:09" or a client-specific format that doesn't match the numeric
 * date/time patterns at all, in which case the raw value is kept as-is).
 *
 * @param {string} value
 * @returns {{ date: string, time: string }}
 */
function parseHeaderDateValue(value) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const dateMatch = cleaned.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);
  const timeMatch = cleaned.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM))?/i);

  // Only split out a separate `time` when `date` itself is the clean,
  // numeric match — otherwise `date` already falls back to the full raw
  // value (textual month names, "um", timezone abbreviations, ...), and a
  // separately reported `time` would just duplicate what's already in it.
  return dateMatch
    ? { date: dateMatch[0], time: timeMatch ? timeMatch[0] : "" }
    : { date: cleaned, time: "" };
}

/**
 * Strips a leading structured header block (see `extractLeadingStructuredHeader`)
 * from `text`, if present. Returns `text` unchanged otherwise.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeLeadingStructuredHeader(text) {
  const parsed = extractLeadingStructuredHeader(text);
  return parsed ? parsed.remainder : text;
}

const COMPACT_HEADER_RE =
  /(?:\d{1,2}[./-]){2}\d{2,4}[\s,]+(?:um\s)?\d{1,2}:\d{2}(?:\s?(?:AM|PM))?[,:\s-]+.+?:/i;

/**
 * Finds every non-overlapping structured "Von:/Betreff:/Datum:/An:" header
 * block in `message`, in order. Positions inside an already-matched block
 * are skipped so a label line partway through one block (e.g. its own "Von:"
 * a few lines down) is never mistaken for the start of a second, separate
 * block — mirroring `extractLeadingStructuredHeader`'s own single-block
 * behaviour, just repeated across the whole message.
 *
 * @param {string} message
 * @returns {Array<{ startLine: number, endLine: number, raw: string, parsed: object }>}
 */
function findStructuredHeaderBlocks(message) {
  const lines = message.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rest = lines.slice(i).join("\n");
    const parsed = extractLeadingStructuredHeader(rest);
    if (parsed) {
      const endLine = i + parsed.consumedLines;
      blocks.push({
        startLine: i,
        endLine,
        raw: lines.slice(i, endLine).join("\n"),
        parsed,
      });
      i = Math.max(endLine, i + 1);
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * Extracts the date and author line from an email message.
 *
 * When a message block contains more than one such line (e.g. its own
 * attribution line plus the attribution line for the next, deeper-nested
 * quote), the LAST one is returned: that trailing line is the header for
 * the following message in the conversation, which is what the caller
 * (`remapDateAndAuthorLines`) needs to attach to the next block.
 *
 * This also recognises a structured "Von:/Betreff:/Datum:/An:" block as an
 * alternative to the single compact line — some clients (Outlook, Apple
 * Mail) put one of those in front of the quoted message instead. When both
 * occur, whichever is positioned later in the message wins, matching the
 * "last one wins" rule above. For a structured match, the full multi-line
 * block text is returned (not just one line) so the caller can prepend it
 * as-is; `extractLeadingStructuredHeader` on the receiving end understands
 * it directly, richer date formats included.
 *
 * @param {string} message - The email message text.
 * @returns {string|null} The extracted date/author header, or null if not found.
 */
export function extractDateAndAuthorLine(message) {
  const lines = message.split("\n");
  let lastCompactIndex = -1;
  let lastCompactLine = null;
  lines.forEach((line, idx) => {
    if (COMPACT_HEADER_RE.test(line)) {
      lastCompactIndex = idx;
      lastCompactLine = line;
    }
  });

  const structuredBlocks = findStructuredHeaderBlocks(message);
  const lastStructured = structuredBlocks[structuredBlocks.length - 1];

  if (lastStructured && lastStructured.startLine > lastCompactIndex) {
    return lastStructured.raw;
  }

  return lastCompactLine;
}

/** Removes date and author lines (compact single-line and structured
 * multi-line "Von:/Betreff:/Datum:/An:" blocks alike) from an email message.
 * @param {string} message - The email message text.
 * @returns {string} The message without date and author lines.
 */
export function removeDateAndAuthorLines(message) {
  const lines = message.split("\n");
  const structuredBlockLines = new Set();
  findStructuredHeaderBlocks(message).forEach(({ startLine, endLine }) => {
    for (let k = startLine; k < endLine; k++) structuredBlockLines.add(k);
  });

  return lines
    .filter((line, idx) => !structuredBlockLines.has(idx) && !COMPACT_HEADER_RE.test(line))
    .join("\n");
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
