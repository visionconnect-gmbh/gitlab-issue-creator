/**
 * @fileoverview Top-level email parsing entry point.
 *
 * Orchestrates the various handler modules to extract a structured
 * conversation history from a raw Thunderbird message object.
 *
 * Typical call flow:
 *   getEmailContent(message)
 *     └─ browser.messages.getFull(id)
 *          ├─ findTextPart + emailParser              → parse plain-text body
 *          ├─ findHtmlPart + htmlToQuotedText + emailParser → parse HTML body
 *          │    (whichever recovers more of the conversation wins: see
 *          │    htmlHandler.js for why the HTML alternative sometimes has
 *          │    quoted history the plain-text part doesn't)
 *          └─ findAttachmentParts                      → list attachments
 */

import {
  parseDateAndAuthorLine,
  extractDateAndAuthorLine,
  remapDateAndAuthorLines,
  removeDateAndAuthorLines,
  extractLeadingStructuredHeader,
  extractName,
} from "./handler/dateAuthorHandler.js";
import {
  extractForwardedMessage,
  extractForwardedAuthorAndDate,
  removeForwardedHeader,
  removeForwardedMessage,
} from "./handler/forwardedHandler.js";
import {
  findTextPart,
  findHtmlPart,
  removeEmptyLines,
  removeSignature,
  splitQuotedAndLatest,
  extractQuotedMessages,
} from "./handler/textHandler.js";
import { htmlToQuotedText } from "./handler/htmlHandler.js";
import { findAttachmentParts } from "./handler/attachmentHandler.js";

// ---------------------------------------------------------------------------
// Types (JSDoc only – no runtime cost)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ParsedMessage
 * @property {string}             from             - Sender name or email address.
 * @property {string}             date             - Date string (as extracted from the body).
 * @property {string}             time             - Time string (as extracted from the body).
 * @property {string}             message          - Cleaned message text.
 * @property {ParsedMessage|null} forwardedMessage - Nested forwarded message, if any.
 */

/**
 * @typedef {Object} EmailContent
 * @property {number}         id                  - Thunderbird message ID.
 * @property {string}         subject             - Email subject line.
 * @property {string}         author              - From: header value.
 * @property {Date}           date                - Message date from Thunderbird.
 * @property {object[]}       attachments         - Array of attachment descriptors.
 * @property {ParsedMessage[]} conversationHistory - Parsed conversation chain.
 */

/**
 * Counts entries in a parsed conversation history that have real content,
 * used to judge which of the plain-text/HTML parses actually recovered
 * more of the conversation (see `getEmailContent`).
 *
 * @param {ParsedMessage[]} history
 * @returns {number}
 */
export function usableMessageCount(history) {
  return history.filter((m) => m.message && m.message.trim() !== "").length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the full content of a Thunderbird message and parses it into a
 * structured `EmailContent` object.
 *
 * Returns `null` when `message` is falsy (e.g. no message is currently selected).
 *
 * @param {object|null} message - Thunderbird `MessageHeader` object.
 * @returns {Promise<EmailContent|null>}
 */
export async function getEmailContent(message) {
  if (!message) return null;

  const rawMessage = await browser.messages.getFull(message.id);

  const textPart = findTextPart(rawMessage.parts);
  const plainBody = textPart?.body ?? "";
  const plainHistory = emailParser(plainBody);

  // Some clients (Outlook, Apple Mail forwards) put the full conversation
  // history only in the HTML alternative: the plain-text part can be just
  // the new reply text, with the quoted history existing solely as nested
  // <blockquote> elements. Convert the HTML to the same >-quoted shape and
  // prefer whichever recovers more of the conversation; this also covers
  // the (rarer) case where HTML recovers a level the plain-text side lost
  // to an ambiguous quote marker. Always falls back to the plain-text
  // result when there's no HTML part, or it parses to nothing useful.
  //
  // "More of the conversation" is judged by USABLE message count (entries
  // with real content), not raw entry count: a parser bug that fragments
  // one message into several empty/duplicate entries would otherwise look
  // like it "recovered more," rewarding the fragmentation instead of
  // detecting it.
  const htmlPart = findHtmlPart(rawMessage.parts);
  const htmlHistory = htmlPart ? emailParser(htmlToQuotedText(htmlPart.body)) : [];

  const htmlQuality = usableMessageCount(htmlHistory);
  const plainQuality = usableMessageCount(plainHistory);

  const conversationHistory =
    htmlQuality > plainQuality
      ? htmlHistory
      : plainQuality > 0
        ? plainHistory
        : htmlHistory; // both empty of real content, so fall back to whichever exists

  return {
    id: message.id,
    subject: message.subject,
    author: message.author,
    date: message.date,
    attachments: findAttachmentParts(rawMessage.parts),
    conversationHistory,
  };
}

/**
 * Parses a plain-text email body into a list of `ParsedMessage` objects,
 * one per message in the conversation thread (oldest first).
 *
 * Handles:
 * - The latest (top) message
 * - `>`-quoted replies (at any depth)
 * - Forwarded messages embedded with a `--- ... ---` header
 *
 * Returns an empty array for falsy or non-string input.
 *
 * @param {string} emailBody
 * @returns {ParsedMessage[]}
 */
export function emailParser(emailBody) {
  if (!emailBody || typeof emailBody !== "string") return [];

  // Normalize line endings ONCE, here, so every downstream function (all of
  // which split on "\n" and some of which compute character offsets, e.g.
  // `getSignatureIndex`) operates on a single consistent convention. Doing
  // this locally inside individual helpers instead is what caused a real
  // bug: an offset computed against a `\r\n`-stripped copy no longer lines
  // up with the original (CRLF) string once you slice it.
  const normalizedBody = emailBody.replace(/\r\n/g, "\n");

  // 1. Split the body into the top-level message and quoted lines.
  const { latestMessage, quotedLines } = splitQuotedAndLatest(normalizedBody);

  // 2. Reconstruct individual quoted messages from the `>` lines.
  const quotedMessages = extractQuotedMessages(quotedLines);

  // 3. Combine: latest first, then quoted (which are in chronological order).
  const rawMessages = [latestMessage, ...quotedMessages].filter(Boolean);

  // 4. Extract the "From: / Date:" header line from each raw message block.
  // Extract from the FORWARD-STRIPPED block, not the raw one: a header that
  // introduces a forward embedded within this block (e.g. Apple Mail
  // representing a forward chain as nested content within one quote level)
  // belongs to that forward, not to the NEXT message: using the raw block
  // would let that header "leak" past its own forward and get remapped onto
  // the wrong following message, shadowing that message's own correct
  // header. Mirrors the predicate `removeForwardedMessage`'s own forward
  // detection already relies on.
  const headerLines = rawMessages.map((m) => extractDateAndAuthorLine(removeForwardedMessage(m)));

  // 5. Remap: prepend the previous message's header line to each subsequent
  //    message (since the header belongs to the quoted block above it).
  const remappedMessages = remapDateAndAuthorLines(rawMessages, headerLines);

  // 6. Parse each remapped block into a structured ParsedMessage.
  return remappedMessages.map(parseRawMessage);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a single raw message block string into a `ParsedMessage`.
 *
 * @param {string} rawMessage
 * @returns {ParsedMessage}
 */
function parseRawMessage(rawMessage) {
  // The first line (if any) is the date/author header after remapping.
  const headerLine = rawMessage.split("\n")[0];
  let { from, date, time } = parseDateAndAuthorLine(headerLine);

  // Some clients (Outlook, Apple Mail) use a structured "Von:/Datum:/
  // Betreff:/An:" block instead of a single compact line, either as this
  // message's own self-header (pasted at the very top), or after
  // `remapDateAndAuthorLines` runs, as the header remapped here from the
  // previous block because it introduces this one. Read it from the raw,
  // not-yet-stripped message so its (often textual) date/time survive;
  // `removeDateAndAuthorLines` below strips the block itself regardless of
  // whether it ends up used here.
  if (!from && !date) {
    const leading = extractLeadingStructuredHeader(rawMessage);
    if (leading) ({ from, date, time } = leading);
  }

  // Extract the forwarded block (if present) before cleaning the outer message.
  const forwardedText = extractForwardedMessage(rawMessage);

  // Remove the forwarded block first, from the ORIGINAL message: when a
  // forward has no dashed/phrase trigger of its own (just a structured
  // "Von:/Betreff:/..." header immediately followed by the forwarded body),
  // the header block IS the forward boundary `removeForwardedMessage` needs
  // to re-locate. Stripping header lines first would erase that boundary out
  // from under it, so date/author cleanup runs on what's left afterward.
  const withoutForwarded = removeForwardedMessage(rawMessage);
  const withoutHeader = removeDateAndAuthorLines(withoutForwarded);
  const cleanedOuter = removeSignature(removeEmptyLines(withoutHeader));

  // Parse the forwarded block, if any.
  const forwardedMessage = forwardedText
    ? parseForwardedBlock(forwardedText)
    : null;

  return { from, date, time, message: cleanedOuter, forwardedMessage };
}

/**
 * Parses the body of a forwarded message block into a partial `ParsedMessage`.
 *
 * @param {string} forwardedText
 * @returns {ParsedMessage}
 */
function parseForwardedBlock(forwardedText) {
  const {
    author,
    date: forwardedDate,
    time: forwardedTime,
  } = extractForwardedAuthorAndDate(forwardedText);
  const withoutHeader = removeForwardedHeader(forwardedText);

  // A forwarded block can itself contain a further forwarded/original
  // message (e.g. A forwards to B, who forwards on to C), so recursion makes each
  // level surfaces as its own entry instead of dumping raw headers into the
  // parent's message text.
  const nestedForwardedText = extractForwardedMessage(withoutHeader);
  const bodyText = nestedForwardedText
    ? removeForwardedMessage(withoutHeader)
    : withoutHeader;
  const forwardedMessage = nestedForwardedText
    ? parseForwardedBlock(nestedForwardedText)
    : null;

  const cleaned = removeEmptyLines(removeSignature(bodyText));

  return {
    from: author ? extractName(author) || author : author,
    date: forwardedDate,
    time: forwardedTime,
    message: cleaned,
    forwardedMessage,
  };
}
