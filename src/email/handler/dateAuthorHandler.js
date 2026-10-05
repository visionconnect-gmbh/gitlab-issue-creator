import {
  HEADER_FIELD_BY_LABEL,
  LABEL_ALTERNATION,
  TRAILING_ATTRIBUTION_VERB_RE,
  ATTRIBUTION_VERB_RE,
  CONNECTOR_OPTIONAL_FRAGMENT,
  CONNECTOR_STRIP_RE,
  MONTH_NUMBER_BY_NAME,
  PARTICLE_ALTERNATION,
} from "../locales/emailLocales.js";

// Tried before the day-first pattern below: a 4-digit year up front is
// unambiguous, and the day-first regex would otherwise coincidentally
// short-match inside it (e.g. "26-10-01" out of "2026-10-01", silently
// reading 2001 as the year instead of failing loudly) since both patterns
// share separators and 1-2-digit groups. Always returns the date
// canonicalized to "DD.MM.YYYY", the format every other part of this
// module already expects. `match` is the raw substring (for callers that
// still need to locate it within the original text) and `canonical` is the
// reordered output value.
function matchNumericDate(text) {
  const yearFirst = text.match(/\b(\d{4})([./-])(\d{1,2})\2(\d{1,2})\b/);
  if (yearFirst) {
    const [full, year, , month, day] = yearFirst;
    return { match: full, canonical: `${pad2(day)}.${pad2(month)}.${year}` };
  }
  // Date: 1–2 digits sep 1–2 digits sep 2–4 digits
  const dayFirst = text.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);
  return dayFirst ? { match: dayFirst[0], canonical: dayFirst[0] } : null;
}

/**
 * Parses a date and author line from an email message.
 * @param {string} line - The line to parse.
 * @returns {Object} An object containing the parsed from, date, and time.
 */
export function parseDateAndAuthorLine(line) {
  if (!line) return { from: "", date: "", time: "" };

  const cleaned = line.replace(/\s+/g, " ").trim();

  // Time: 1–2 digits:2 digits + optional AM/PM
  const timePattern = /\d{1,2}:\d{2}(?:\s?(?:AM|PM))?/i;

  const dateInfo = matchNumericDate(cleaned);
  const timeMatch = cleaned.match(timePattern);

  if (!dateInfo || !timeMatch) {
    return { from: "", date: "", time: "" };
  }

  const { match: rawDate, canonical: date } = dateInfo;
  const time = timeMatch[0];

  // The name usually follows the date/time: German "Am {date} um {time}
  // schrieb {name}:" and English "On {date}, {time}, {name} wrote:" both
  // put it there. Take the substring after the time, up to the first colon.
  const afterTime = cleaned.slice(cleaned.indexOf(time) + time.length).trim();
  let from = extractName((afterTime.split(":")[0] || "").trim());

  // Thunderbird also generates the reverse order: "{name} schrieb am
  // {date} um {time}:", where the after-time text is empty/just a colon.
  // Fall back to the text before the date in that case. Uses the RAW match
  // (not the canonicalized `date`), since a reordered year-first date is no
  // longer a literal substring of `cleaned`.
  if (!from) {
    const beforeDate = cleaned.slice(0, cleaned.indexOf(rawDate)).trim();
    from = extractName(beforeDate.replace(TRAILING_ATTRIBUTION_VERB_RE, "").trim());
  }

  return { date, time, from };
}

// Unicode-aware: at least one uppercase letter followed by at least one
// lowercase letter, so all-caps tokens ("RE", "CC") still don't match, but
// unlike the old `[A-ZÄÖÜ][a-zäöüß]+` class this also covers names outside
// the German Latin alphabet (e.g. "Łukasz", "Алиса"). The lookaround pair
// (rather than `\b`, ASCII-only and wrong under `u`) keeps the old
// behaviour of never matching PART of a longer letter run with no space
// boundary: e.g. "NordLicht GmbH Nora Keller" must only yield "Nora
// Keller", not fragments like "Nord"/"Licht Gmb" split out of the company
// name glued in front of it. A known lowercase surname particle ("von
// Neumann", "van Gogh", "de Vries") may appear once between two
// capitalized tokens without breaking the match.
const NAME_RE = new RegExp(
  `(?<!\\p{L})\\p{Lu}[\\p{Ll}'’-]+(?:\\s+(?:(?:${PARTICLE_ALTERNATION})\\s+)?\\p{Lu}[\\p{Ll}'’-]+)*(?!\\p{L})`,
  "gu",
);

/**
 * Extracts the author's name from a date and author line.
 * @param {string} line - The line to extract the name from.
 * @returns {string} The extracted author's name.
 */
export function extractName(line) {
  // Strip a trailing attribution verb first ("... writes/schrieb/wrote") so
  // it's never mistaken for part of the name when the capitalized-word scan
  // below finds nothing better to anchor on.
  const stripped = line.replace(ATTRIBUTION_VERB_RE, "").trim();

  const matches = stripped.match(NAME_RE);
  if (!matches) return stripped;

  // Return all capitalized sequences joined by space (in case there are multiple)
  return matches.join(' ').trim();
}

// ---------------------------------------------------------------------------
// Structured ("Von:/From:", "Betreff:/Subject:", ...) reply headers
// ---------------------------------------------------------------------------

// Recognised header field labels and their alternation regex fragment come
// from the centralized locale table (see ../locales/emailLocales.js): every
// known language's labels, each mapped to the semantic field it fills. Mail
// clients (Outlook in particular) emit these as a block at the top of a
// reply/forward instead of (or in addition to) a single "Am ... schrieb
// ...:" line.

// Apple Mail's plain-text export of a forwarded/replied header renders the
// labels as markdown-style bold with no surrounding space, e.g.
// "*Von:*Jane Doe <...>" instead of "Von: Jane Doe <...>", so tolerate an
// optional leading/trailing "*" around the label and colon.
const LABEL_LINE_RE = new RegExp(`^\\*?(${LABEL_ALTERNATION})\\s*:\\*?\\s*(.*)$`, "i");

/**
 * A structured header block is always short in practice (a handful of
 * fields, even in split-label style with blank-line gaps between label and
 * value); bounding how far a scan looks before giving up keeps every call
 * O(1) instead of O(remaining message length), which matters because
 * callers (`findStructuredHeaderBlocks`, `findForwardTrigger`) probe this
 * at every line of a message.
 */
const MAX_HEADER_BLOCK_LINES = 30;

/**
 * Core of `extractLeadingStructuredHeader`, operating on an already-split
 * `lines` array plus a `start` index instead of a fresh substring, so
 * callers that probe many candidate start positions in the same message
 * (line by line) can reuse one `lines` array instead of paying an O(n)
 * `slice().join()` at every position, which made those callers O(n²).
 *
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ from: string, date: string, time: string, remainder: string, consumedLines: number }|null}
 *   `consumedLines` is relative to `start` (i.e. `start + consumedLines`
 *   is the absolute index the block ends at).
 */
export function extractLeadingStructuredHeaderFromLines(lines, start) {
  if (!lines || start >= lines.length) return null;

  const limit = Math.min(lines.length, start + MAX_HEADER_BLOCK_LINES);
  const fields = {};
  let i = start;

  // Skip leading blank lines.
  while (i < limit && lines[i].trim() === "") i++;

  while (i < limit) {
    const trimmed = lines[i].trim();
    if (trimmed === "") break;

    const match = trimmed.match(LABEL_LINE_RE);
    if (!match) break;

    const field = HEADER_FIELD_BY_LABEL[match[1].toLowerCase()];
    let value = match[2].trim();
    i++;

    if (!value) {
      // Split-style: skip blank lines, then the next non-blank line is the value.
      while (i < limit && lines[i].trim() === "") i++;
      if (i < limit && !LABEL_LINE_RE.test(lines[i].trim())) {
        value = lines[i].trim();
        i++;
      }
    }

    // A value can wrap onto a following line without its own label, e.g.
    // a long Cc list continuing as "<name@example.com>" on the next line.
    // Swallow such continuation lines so they don't prematurely end the
    // header block or leak into the message body.
    while (
      i < limit &&
      lines[i].trim() !== "" &&
      !LABEL_LINE_RE.test(lines[i].trim()) &&
      /[<>@]/.test(lines[i])
    ) {
      value = `${value} ${lines[i].trim()}`.trim();
      i++;
    }

    // Strip markdown-bold decoration left over from asterisk placements
    // `LABEL_LINE_RE` doesn't anchor for (e.g. "*Von: *value", with a space
    // before the asterisk, or a value fully wrapped as "**value*").
    value = value.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim();

    if (value && !(field in fields)) fields[field] = value;

    // Skip blank lines between fields, but stop the block once the next
    // non-blank line isn't itself a label line.
    let lookahead = i;
    while (lookahead < limit && lines[lookahead].trim() === "") lookahead++;
    if (lookahead < limit && LABEL_LINE_RE.test(lines[lookahead].trim())) {
      i = lookahead;
    }
  }

  if (!fields.from || !fields.date) return null;

  // Skip the blank line(s) separating the header block from the body.
  // (Not bounded by `limit`: this just walks past whitespace, not more
  // label content, so it can't run away.)
  while (i < lines.length && lines[i].trim() === "") i++;

  const { date, time } = parseHeaderDateValue(fields.date);
  const cleanedFrom = extractName(fields.from) || fields.from;

  return {
    from: cleanedFrom,
    date,
    time,
    remainder: lines.slice(i).join("\n"),
    consumedLines: i - start,
  };
}

/**
 * Attempts to parse a structured "Von:/Betreff:/Datum:/An:" style header
 * block starting at the very first (non-blank) line of `text`. Each label
 * may either share its line with its value ("Von: Jane Doe") or be split
 * across two lines ("Von:" then, possibly after blank lines, "Jane Doe");
 * both styles occur in the wild depending on the originating mail client.
 *
 * @param {string} text
 * @returns {{ from: string, date: string, time: string, remainder: string }|null}
 *   `null` when no valid header block (requiring at least a from/date pair)
 *   is found at the start of `text`.
 */
export function extractLeadingStructuredHeader(text) {
  if (!text) return null;
  return extractLeadingStructuredHeaderFromLines(text.split("\n"), 0);
}

/**
 * Best-effort date/time split for a header field value (e.g. "24.09.2026,
 * 09:09" or a client-specific format that doesn't match the numeric
 * date/time patterns at all, in which case the raw value is kept as-is).
 *
 * @param {string} value
 * @returns {{ date: string, time: string }}
 */
const pad2 = (n) => String(n).padStart(2, "0");

// JS's Date constructor only understands ENGLISH month names. "September"
// happens to parse by coincidence (same spelling in German), but "Dezember",
// "Januar", "März", "septembre", "septiembre", etc. silently fail. Parse
// "DD[.] [de] MonthName [de] YYYY[ HH:MM]" explicitly against the merged
// locale month table instead of hoping the platform parser guesses right.
// The day's trailing dot (German/Austrian convention) is optional so this
// also covers locales that don't use it (e.g. French "25 septembre 2026"),
// and the optional "de" connectors cover Spanish/Portuguese's "25 de
// septiembre de 2026" / "25 de setembro de 2026" grammar, where the day and
// year are each joined to the month by a literal "de".
const TEXTUAL_DATE_RE =
  /(\d{1,2})\.?\s*(?:de\s+)?(\p{L}+)\s+(?:de\s+)?(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/u;

function parseTextualDate(cleaned) {
  const m = cleaned.match(TEXTUAL_DATE_RE);
  if (!m) return null;
  const [, day, monthName, year, hour, minute] = m;
  const month = MONTH_NUMBER_BY_NAME[monthName.toLowerCase()];
  if (!month) return null;
  return {
    date: `${pad2(day)}.${pad2(month)}.${year}`,
    time: hour !== undefined ? `${pad2(hour)}:${minute}` : "",
  };
}

function parseHeaderDateValue(value) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w+,\s*/, "") // drop a leading weekday name ("Dienstag, ")
    .replace(CONNECTOR_STRIP_RE, " ") // date/time connector ("... 2026 um 15:37" -> "... 2026 15:37")
    .replace(/\s+\b(?:MESZ|MEZ|CEST|CET|UTC|GMT[+-]?\d*)\b\s*$/i, ""); // trailing timezone abbrev
  const numericDate = matchNumericDate(cleaned);
  const timeMatch = cleaned.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM))?/i);

  if (numericDate) {
    return { date: numericDate.canonical, time: timeMatch ? timeMatch[0] : "" };
  }

  // No numeric DD.MM.YYYY pattern: likely a textual month name (e.g.
  // "25. September 2026" or "30. Dezember 2025"). Reformat to the same
  // DD.MM.YYYY/HH:MM shape used everywhere else instead of displaying the
  // client's raw textual format verbatim. No timezone info remains in
  // `cleaned` at this point, so reading LOCAL getters off a parsed Date
  // gives back the same wall-clock time as the original header.
  const textual = parseTextualDate(cleaned);
  if (textual) return textual;

  // Last resort: let the platform parse it (English month names, and
  // anything else the explicit German parser above doesn't need to cover).
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return {
      date: `${pad2(parsed.getDate())}.${pad2(parsed.getMonth() + 1)}.${parsed.getFullYear()}`,
      time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
    };
  }

  // Still unparseable: fall back to the raw value rather than guessing.
  return { date: cleaned, time: "" };
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

const COMPACT_HEADER_RE = new RegExp(
  `(?:\\d{1,2}[./-]){2}\\d{2,4}[\\s,]+${CONNECTOR_OPTIONAL_FRAGMENT}\\d{1,2}:\\d{2}(?:\\s?(?:AM|PM))?[,:\\s-]+.+?:`,
  "i",
);

// A compact header missing only its trailing name+colon: used to detect a
// header that got hard-wrapped across two physical lines by the originating
// client (observed in real mail: "Am DD.MM.YYYY um HH:MM schrieb Nachname,
// Vorname" on one line, "<addr>:" on the next). Requires a known attribution
// verb adjacent to the date+time, not just a date anywhere in the line:
// ordinary prose that happens to mention a date doesn't have that.
const COMPACT_HEADER_OPENER_RE = new RegExp(
  `\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}[\\s,]+${CONNECTOR_OPTIONAL_FRAGMENT}\\d{1,2}:\\d{2}(?:\\s?(?:AM|PM))?.{0,40}${ATTRIBUTION_VERB_RE.source}`,
  "iu",
);

/**
 * Finds every compact "Am ... schrieb ...:" / "On ..., ... wrote:" header in
 * `lines`, in order, including a header hard-wrapped across two physical
 * lines (see `COMPACT_HEADER_OPENER_RE`). A two-line join is only attempted
 * when the first line already looks like a header opener but has no colon
 * yet, and the very next line is short and colon-terminated (the only shape
 * observed in the wild: a bare "<address>:" continuation), narrow enough
 * that a two-line join never fires on ordinary prose.
 *
 * @param {string[]} lines
 * @returns {Array<{ startLine: number, endLine: number, raw: string }>}
 */
function findCompactHeaderMatches(lines) {
  const matches = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (COMPACT_HEADER_RE.test(line)) {
      matches.push({ startLine: i, endLine: i + 1, raw: line });
      i++;
      continue;
    }

    const next = lines[i + 1];
    if (next !== undefined) {
      const looksLikeOpener = COMPACT_HEADER_OPENER_RE.test(line) && !/:\s*$/.test(line.trim());
      const continuesWithColon =
        next.trim().length > 0 && next.trim().length <= 80 && /:\s*$/.test(next.trim());
      if (looksLikeOpener && continuesWithColon) {
        const joined = `${line.trim()} ${next.trim()}`;
        if (COMPACT_HEADER_RE.test(joined)) {
          matches.push({ startLine: i, endLine: i + 2, raw: joined });
          i += 2;
          continue;
        }
      }
    }
    i++;
  }
  return matches;
}

/**
 * Finds every non-overlapping structured "Von:/Betreff:/Datum:/An:" header
 * block in `message`, in order. Positions inside an already-matched block
 * are skipped so a label line partway through one block (e.g. its own "Von:"
 * a few lines down) is never mistaken for the start of a second, separate
 * block, mirroring `extractLeadingStructuredHeader`'s own single-block
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
    const parsed = extractLeadingStructuredHeaderFromLines(lines, i);
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
 * alternative to the single compact line: some clients (Outlook, Apple
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
  const compactMatches = findCompactHeaderMatches(lines);
  const lastCompact = compactMatches[compactMatches.length - 1] ?? null;
  const lastCompactIndex = lastCompact ? lastCompact.startLine : -1;
  const lastCompactLine = lastCompact ? lastCompact.raw : null;

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
  const compactLines = new Set();
  findCompactHeaderMatches(lines).forEach(({ startLine, endLine }) => {
    for (let k = startLine; k < endLine; k++) compactLines.add(k);
  });

  return lines
    .filter((line, idx) => !structuredBlockLines.has(idx) && !compactLines.has(idx))
    .join("\n");
}

/**
 * Whether `msg` already starts with its own recognizable header (compact
 * single-line or structured multi-line block), as opposed to needing one
 * remapped in from the previous block.
 *
 * @param {string} msg
 * @returns {boolean}
 */
function hasOwnLeadingHeader(msg) {
  if (extractLeadingStructuredHeader(msg)) return true;
  const firstLine = msg.split("\n")[0] ?? "";
  return Boolean(parseDateAndAuthorLine(firstLine).from);
}

/** Remaps date and author lines to the beginning of each message.
 *
 * Skips the remap when a message already has its own leading header:
 * e.g. a quoted block whose forward chain was stripped (see
 * `emailParser.js`) can still be directly followed by a genuinely separate,
 * deeper-quoted message that already carries its own "Am ... schrieb ...:"
 * line; blindly prepending the previous block's header on top of that
 * would shadow the message's own correct attribution instead of leaving it
 * alone.
 *
 * @param {Array} messages - An array of email message texts.
 * @param {Array} dateLines - An array of extracted date and author lines.
 * @returns {Array} An array of messages with date and author lines prepended.
 */
export function remapDateAndAuthorLines(messages, dateLines) {
  return messages.map((msg, i) => {
    const previousHeader = dateLines[i - 1];
    if (!previousHeader || hasOwnLeadingHeader(msg)) return msg;
    return `${previousHeader}\n\n${msg}`;
  });
}
