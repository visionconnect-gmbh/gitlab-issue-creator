/**
 * @fileoverview Unit tests for src/email/emailParser.js
 *
 * `getEmailContent` is not tested here because it depends on the Thunderbird
 * `browser.messages` API.  `emailParser` is pure and fully testable.
 */

import { emailParser } from "../src/email/emailParser.js";

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
