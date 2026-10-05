/**
 * @fileoverview Unit tests for src/email/emailParser.js
 *
 * `emailParser` is pure and tested directly. `getEmailContent` depends on
 * `browser.messages.getFull`, stubbed per-test below for the plain-vs-HTML
 * selection tiebreak (RC-2); the rest of its behavior is exercised
 * end-to-end by the regression fixtures.
 */

import { jest } from "@jest/globals";
import { emailParser, usableMessageCount, getEmailContent } from "../src/email/emailParser.js";

describe("emailParser", () => {
  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  test("returns empty array for empty string", () => {
    expect(emailParser("")).toEqual([]);
  });

  test("returns empty array for null", () => {
    expect(emailParser(null)).toEqual([]);
  });

  test("returns empty array for non-string values", () => {
    expect(emailParser(42)).toEqual([]);
    expect(emailParser({})).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Simple single-message email
  // ---------------------------------------------------------------------------

  test("parses a plain email with no history", () => {
    const body = "Hello,\n\nPlease fix issue #42.\n\nThanks";
    const result = emailParser(body);

    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("Please fix issue #42");
    expect(result[0].forwardedMessage).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Email with one level of quoting
  // ---------------------------------------------------------------------------

  test("extracts the latest message and one quoted reply", () => {
    const body = [
      "Thanks for the update.",
      "",
      "> 01.01.2024, 10:00, Jane Doe:",
      "> Hello, here is the update.",
    ].join("\n");

    const result = emailParser(body);

    // Should have at least the latest message
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].message).toContain("Thanks for the update");
  });

  // ---------------------------------------------------------------------------
  // Signature stripping
  // ---------------------------------------------------------------------------

  test("strips the email signature", () => {
    const body = "Main content\n-- \nFirst Last\nfirst@example.com";
    const [msg] = emailParser(body);
    expect(msg.message).not.toContain("First Last");
    expect(msg.message).toContain("Main content");
  });

  // ---------------------------------------------------------------------------
  // Forwarded messages
  // ---------------------------------------------------------------------------

  test("parses a forwarded message block", () => {
    const body = [
      "FYI – see below.",
      "",
      "-----Forwarded Message-----",
      "From: alice@example.com",
      "Date: 01.01.2024 08:00",
      "",
      "Original content here.",
    ].join("\n");

    const result = emailParser(body);
    expect(result).toHaveLength(1);
    expect(result[0].forwardedMessage).not.toBeNull();
    expect(result[0].forwardedMessage.message).toContain("Original content here");
  });

  // ---------------------------------------------------------------------------
  // Result shape
  // ---------------------------------------------------------------------------

  test("each result entry has the expected shape", () => {
    const body = "Just a message.";
    const [entry] = emailParser(body);

    expect(entry).toHaveProperty("from");
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("time");
    expect(entry).toHaveProperty("message");
    expect(entry).toHaveProperty("forwardedMessage");
  });
});

describe("usableMessageCount", () => {
  test("counts only entries with non-empty message text", () => {
    const history = [
      { message: "real content" },
      { message: "" },
      { message: "   " },
      { message: "more content" },
    ];
    expect(usableMessageCount(history)).toBe(2);
  });

  test("returns 0 for an empty array", () => {
    expect(usableMessageCount([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getEmailContent: plain-vs-HTML selection tiebreak (RC-2)
// ---------------------------------------------------------------------------

function makeMessage({ plainBody, htmlBody }) {
  const parts = [];
  if (plainBody !== undefined) parts.push({ contentType: "text/plain", body: plainBody });
  if (htmlBody !== undefined) parts.push({ contentType: "text/html", body: htmlBody });

  global.browser.messages = {
    getFull: jest.fn(async () => ({ parts })),
  };

  return { id: 1, subject: "Test", author: "someone@example.com", date: new Date() };
}

describe("getEmailContent: plain vs HTML selection", () => {
  test("prefers the HTML parse when it recovers strictly more USABLE messages, not just more raw entries", async () => {
    const plainBody = "Latest reply.\n\n> 01.01.2024, 10:00, Jane Doe:\n> Quoted reply.";
    // HTML recovers an extra, genuinely distinct nested quote the plain
    // side's ambiguous markers lost: more usable content, legitimately.
    const htmlBody =
      "<div>Latest reply.</div>" +
      '<div class="moz-cite-prefix">Am 01.01.2024 um 10:00 schrieb Jane Doe:<br/></div>' +
      "<blockquote><div>Quoted reply.<br/></div>" +
      "<div>Am 31.12.2023 um 09:00 schrieb Ben Beispiel:<br/></div>" +
      "<blockquote><div>Older nested reply.<br/></div></blockquote>" +
      "</blockquote>";

    const result = await getEmailContent(makeMessage({ plainBody, htmlBody }));
    expect(result.conversationHistory.length).toBeGreaterThan(
      emailParser(plainBody).length,
    );
    expect(result.conversationHistory.some((m) => m.message.includes("Older nested reply"))).toBe(
      true,
    );
  });

  test("prefers the plain-text parse when the HTML path is more fragmented despite having more raw entries", async () => {
    // A pathologically fragmented HTML parse (several empty/near-empty
    // entries) must NOT beat a clean plain-text parse just because it has
    // more array entries, which is the exact failure mode RC-1/RC-2 fixed.
    const plainBody = "Latest reply.\n\n> 01.01.2024, 10:00, Jane Doe:\n> A real quoted reply.";
    const htmlBody =
      "<div>Latest reply.</div>" +
      '<div class="moz-cite-prefix">Am 01.01.2024 um 10:00 schrieb Jane Doe:<br/></div>' +
      "<blockquote><div><br/></div><div><br/></div><div><br/></div></blockquote>";

    const result = await getEmailContent(makeMessage({ plainBody, htmlBody }));
    expect(result.conversationHistory.some((m) => m.message.includes("A real quoted reply"))).toBe(
      true,
    );
  });

  test("falls back to the HTML result when both parses are empty of real content", async () => {
    const result = await getEmailContent(makeMessage({ plainBody: "", htmlBody: "<div></div>" }));
    expect(Array.isArray(result.conversationHistory)).toBe(true);
  });

  test("uses the plain-text result when there is no HTML part at all", async () => {
    const plainBody = "Just a plain reply.";
    const result = await getEmailContent(makeMessage({ plainBody }));
    expect(result.conversationHistory[0].message).toContain("Just a plain reply");
  });
});
