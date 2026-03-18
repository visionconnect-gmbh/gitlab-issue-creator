/**
 * @fileoverview Top-level email parsing entry point.
 *
 * Orchestrates the various handler modules to extract a structured
 * conversation history from a raw Thunderbird message object.
 *
 * Typical call flow:
 *   getEmailContent(message)
 *     └─ browser.messages.getFull(id)
 *          ├─ findTextPart       → extract plain-text body
 *          ├─ emailParser        → parse conversation history
 *          └─ findAttachmentParts → list attachments
 */

import {
  parseDateAndAuthorLine,
  extractDateAndAuthorLine,
  remapDateAndAuthorLines,
  removeDateAndAuthorLines,
} from "./handler/dateAuthorHandler.js";
import {
  extractForwardedMessage,
  extractForwardedAuthorAndDate,
  removeForwardedHeader,
  removeForwardedMessage,
} from "./handler/forwardedHandler.js";
import {
  findTextPart,
  removeEmptyLines,
  removeSignature,
  splitQuotedAndLatest,
  extractQuotedMessages,
} from "./handler/textHandler.js";
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
  const emailBody = textPart?.body ?? "";

  return {
    id: message.id,
    subject: message.subject,
    author: message.author,
    date: message.date,
    attachments: findAttachmentParts(rawMessage.parts),
    conversationHistory: emailParser(emailBody),
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

  // 1. Split the body into the top-level message and quoted lines.
  const { latestMessage, quotedLines } = splitQuotedAndLatest(emailBody);

  // 2. Reconstruct individual quoted messages from the `>` lines.
  const quotedMessages = extractQuotedMessages(quotedLines);

  // 3. Combine: latest first, then quoted (which are in chronological order).
  const rawMessages = [latestMessage, ...quotedMessages].filter(Boolean);

  // 4. Extract the "From: / Date:" header line from each raw message block.
  const headerLines = rawMessages.map(extractDateAndAuthorLine);

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
  const { from, date, time } = parseDateAndAuthorLine(headerLine);

  // Extract the forwarded block (if present) before cleaning the outer message.
  const forwardedText = extractForwardedMessage(rawMessage);

  // Remove the date/author header and forwarded block from the outer message.
  const withoutHeader = removeDateAndAuthorLines(rawMessage);
  const withoutForwarded = removeForwardedMessage(withoutHeader);
  const cleanedOuter = removeSignature(removeEmptyLines(withoutForwarded));

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
  const { author, date: forwardedDate } = extractForwardedAuthorAndDate(forwardedText);
  const withoutHeader = removeForwardedHeader(forwardedText);
  const cleaned = removeEmptyLines(removeSignature(withoutHeader));

  return {
    from: author,
    date: forwardedDate,
    time: null,
    message: cleaned,
    forwardedMessage: null,
  };
}
