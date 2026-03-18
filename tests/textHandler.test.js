/**
 * @fileoverview Unit tests for src/email/handler/textHandler.js
 *
 * Run with:  node --experimental-vm-modules node_modules/.bin/jest
 * (or simply: npm test)
 */

import {
  findTextPart,
  removeEmptyLines,
  getSignatureIndex,
  removeSignature,
  splitQuotedAndLatest,
  getQuoteLevel,
  extractQuotedMessages,
} from "../src/email/handler/textHandler.js";

// ---------------------------------------------------------------------------
// findTextPart
// ---------------------------------------------------------------------------

describe("findTextPart", () => {
  test("returns null for null input", () => {
    expect(findTextPart(null)).toBeNull();
  });

  test("returns null for empty array", () => {
    expect(findTextPart([])).toBeNull();
  });

  test("finds a direct text/plain part", () => {
    const parts = [{ contentType: "text/plain", body: "Hello" }];
    expect(findTextPart(parts)).toBe(parts[0]);
  });

  test("ignores text/plain parts with empty body", () => {
    const parts = [
      { contentType: "text/plain", body: "" },
      { contentType: "text/plain", body: "actual content" },
    ];
    expect(findTextPart(parts)).toBe(parts[1]);
  });

  test("recurses into nested parts", () => {
    const target = { contentType: "text/plain", body: "nested" };
    const parts = [
      {
        contentType: "multipart/mixed",
        parts: [{ contentType: "text/html", body: "<p>hi</p>" }, target],
      },
    ];
    expect(findTextPart(parts)).toBe(target);
  });

  test("returns null when no text/plain part exists", () => {
    const parts = [{ contentType: "text/html", body: "<p>only HTML</p>" }];
    expect(findTextPart(parts)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// removeEmptyLines
// ---------------------------------------------------------------------------

describe("removeEmptyLines", () => {
  test("removes blank lines", () => {
    const input = "line1\n\nline2\n\n\nline3";
    expect(removeEmptyLines(input)).toBe("line1\nline2\nline3");
  });

  test("removes lines that are only whitespace", () => {
    const input = "line1\n   \nline2";
    expect(removeEmptyLines(input)).toBe("line1\nline2");
  });

  test("trims leading/trailing whitespace from the result", () => {
    expect(removeEmptyLines("\n\nhello\n\n")).toBe("hello");
  });

  test("returns empty string for all-blank input", () => {
    expect(removeEmptyLines("\n\n   \n")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getSignatureIndex
// ---------------------------------------------------------------------------

describe("getSignatureIndex", () => {
  test("returns -1 when there is no signature", () => {
    expect(getSignatureIndex("Hello\nWorld")).toBe(-1);
  });

  test("detects Thunderbird plain-text separator `-- `", () => {
    const text = "Body text\n-- \nSig line";
    const idx = getSignatureIndex(text);
    expect(idx).toBe(text.indexOf("-- "));
  });

  test("detects generic `--` separator", () => {
    const text = "Body text\n--\nSig line";
    const idx = getSignatureIndex(text);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  test("detects repeated-character separator `---`", () => {
    const text = "Body text\n---\nSig line";
    const idx = getSignatureIndex(text);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  test("handles CRLF line endings", () => {
    const text = "Body text\r\n-- \r\nSig line";
    const idx = getSignatureIndex(text);
    expect(idx).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// removeSignature
// ---------------------------------------------------------------------------

describe("removeSignature", () => {
  test("removes everything from the separator onward", () => {
    const text = "Hello\n-- \nMy Name\nmy.email@example.com";
    expect(removeSignature(text)).toBe("Hello\n");
  });

  test("returns the original string when no signature is present", () => {
    const text = "Hello\nWorld";
    expect(removeSignature(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// splitQuotedAndLatest
// ---------------------------------------------------------------------------

describe("splitQuotedAndLatest", () => {
  test("separates quoted and non-quoted lines", () => {
    const body = "Latest line\n> Quoted line\n> Another quoted";
    const { latestMessage, quotedLines } = splitQuotedAndLatest(body);
    expect(latestMessage).toBe("Latest line");
    expect(quotedLines).toEqual(["> Quoted line", "> Another quoted"]);
  });

  test("returns empty quotedLines when nothing is quoted", () => {
    const body = "Just a plain message";
    const { latestMessage, quotedLines } = splitQuotedAndLatest(body);
    expect(latestMessage).toBe("Just a plain message");
    expect(quotedLines).toHaveLength(0);
  });

  test("trims the latestMessage", () => {
    const body = "\n\nActual content\n\n> quote";
    const { latestMessage } = splitQuotedAndLatest(body);
    expect(latestMessage).toBe("Actual content");
  });
});

// ---------------------------------------------------------------------------
// getQuoteLevel
// ---------------------------------------------------------------------------

describe("getQuoteLevel", () => {
  test("returns 0 for non-quoted lines", () => {
    expect(getQuoteLevel("Hello")).toBe(0);
  });

  test("returns 1 for single-level quotes", () => {
    expect(getQuoteLevel("> Hello")).toBe(1);
  });

  test("returns 2 for double-level quotes", () => {
    expect(getQuoteLevel(">> Hello")).toBe(2);
  });

  test("returns 3 for triple-level quotes", () => {
    expect(getQuoteLevel(">>> Hello")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// extractQuotedMessages
// ---------------------------------------------------------------------------

describe("extractQuotedMessages", () => {
  test("returns empty array for empty input", () => {
    expect(extractQuotedMessages([])).toEqual([]);
  });

  test("extracts a single quoted message", () => {
    const lines = ["> Line one", "> Line two"];
    const messages = extractQuotedMessages(lines);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Line one");
    expect(messages[0]).toContain("Line two");
  });

  test("splits messages at level transitions", () => {
    // Three levels of nesting → three distinct messages.
    // Level 1 lines are the most recent quoted message,
    // level 2 lines are older, level 3 lines are oldest.
    const lines = ["> A", "> B", ">> C older", ">>> D oldest"];
    const messages = extractQuotedMessages(lines);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    // The deepest level should appear as its own message.
    expect(messages.some((m) => m.includes("D oldest"))).toBe(true);
  });

  test("strips leading `>` prefixes from content", () => {
    const lines = ["> Hello"];
    const [msg] = extractQuotedMessages(lines);
    expect(msg).toBe("Hello");
  });
});
