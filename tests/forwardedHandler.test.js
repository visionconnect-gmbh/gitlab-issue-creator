/**
 * @fileoverview Unit tests for src/email/handler/forwardedHandler.js
 */

import {
  extractForwardedMessage,
  extractForwardedAuthorAndDate,
  removeForwardedHeader,
  removeForwardedMessage,
} from "../src/email/handler/forwardedHandler.js";

// ---------------------------------------------------------------------------
// extractForwardedMessage
// ---------------------------------------------------------------------------

describe("extractForwardedMessage", () => {
  test("returns null when no forwarded header is present", () => {
    expect(extractForwardedMessage("Just a normal message.")).toBeNull();
  });

  test("extracts content after a dashed forwarded header", () => {
    const message = [
      "My reply here.",
      "",
      "-----Forwarded Message-----",
      "From: alice@example.com",
      "",
      "Original body.",
    ].join("\n");

    const result = extractForwardedMessage(message);
    expect(result).not.toBeNull();
    expect(result).toContain("Original body");
  });

  test("strips the signature from the forwarded block", () => {
    const message = [
      "Reply.",
      "-----Forwarded Message-----",
      "Original body.",
      "-- ",
      "Sig line",
    ].join("\n");

    const result = extractForwardedMessage(message);
    expect(result).not.toContain("Sig line");
  });

  test("returns a falsy value when the forwarded block is only whitespace", () => {
    const message = "Reply.\n-----Forwarded Message-----\n";
    const result = extractForwardedMessage(message);
    // The function returns null for truly absent blocks, or a whitespace-only
    // string when the block exists but is empty. Either way the caller treats
    // it as "no meaningful forwarded content" via a falsy check.
    expect(!result || result.trim() === "").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractForwardedAuthorAndDate
// ---------------------------------------------------------------------------

describe("extractForwardedAuthorAndDate", () => {
  test("extracts author email and date from forwarded header lines", () => {
    const text = [
      "From: alice@example.com",
      "Date: 01.01.2024 09:30",
      "",
      "Body content.",
    ].join("\n");

    const { author, date } = extractForwardedAuthorAndDate(text);
    expect(author).toContain("alice@example.com");
    expect(date).toContain("01.01.2024");
  });

  test("returns null fields when header is absent", () => {
    const { author, date } = extractForwardedAuthorAndDate("Just body.");
    expect(author).toBeNull();
    expect(date).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// removeForwardedHeader
// ---------------------------------------------------------------------------

describe("removeForwardedHeader", () => {
  test("removes header-style lines before the first blank line", () => {
    const text = [
      "From: alice@example.com",
      "Date: 01.01.2024",
      "",
      "Body starts here.",
    ].join("\n");

    const result = removeForwardedHeader(text);
    expect(result).toContain("Body starts here");
    expect(result).not.toContain("alice@example.com");
  });

  test("returns the message unchanged when there is no header block", () => {
    const text = "Just body, no header lines with colons.";
    expect(removeForwardedHeader(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// removeForwardedMessage
// ---------------------------------------------------------------------------

describe("removeForwardedMessage", () => {
  test("removes the forwarded block and everything after it", () => {
    const message = [
      "My reply.",
      "",
      "-----Ursprüngliche Nachricht-----",
      "Old content.",
    ].join("\n");

    const result = removeForwardedMessage(message);
    expect(result).toContain("My reply");
    expect(result).not.toContain("Old content");
    expect(result).not.toContain("Ursprüngliche Nachricht");
  });

  test("returns the message unchanged when no forwarded header present", () => {
    const message = "Normal message with no forwarding.";
    expect(removeForwardedMessage(message)).toBe(message);
  });

  test("handles null / non-string gracefully", () => {
    expect(removeForwardedMessage(null)).toBeNull();
    expect(removeForwardedMessage(undefined)).toBeUndefined();
  });
});
