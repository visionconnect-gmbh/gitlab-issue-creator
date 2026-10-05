/**
 * @fileoverview Unit tests for src/email/handler/textHandler.js
 *
 * Run with:  node --experimental-vm-modules node_modules/.bin/jest
 * (or simply: npm test)
 */

import {
  findTextPart,
  findHtmlPart,
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
// findHtmlPart
// ---------------------------------------------------------------------------

describe("findHtmlPart", () => {
  test("returns null for null input", () => {
    expect(findHtmlPart(null)).toBeNull();
  });

  test("finds a direct text/html part", () => {
    const parts = [{ contentType: "text/html", body: "<p>hi</p>" }];
    expect(findHtmlPart(parts)).toBe(parts[0]);
  });

  test("ignores text/html parts with empty body", () => {
    const parts = [
      { contentType: "text/html", body: "" },
      { contentType: "text/html", body: "<p>actual content</p>" },
    ];
    expect(findHtmlPart(parts)).toBe(parts[1]);
  });

  test("recurses into nested parts", () => {
    const target = { contentType: "text/html", body: "<p>nested</p>" };
    const parts = [
      {
        contentType: "multipart/alternative",
        parts: [{ contentType: "text/plain", body: "hi" }, target],
      },
    ];
    expect(findHtmlPart(parts)).toBe(target);
  });

  test("returns null when no text/html part exists", () => {
    const parts = [{ contentType: "text/plain", body: "only plain" }];
    expect(findHtmlPart(parts)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// removeEmptyLines
// ---------------------------------------------------------------------------

describe("removeEmptyLines", () => {
  // Issue E: collapses RUNS of blank lines to one, preserving real paragraph
  // breaks, instead of deleting every blank line and destroying them.
  test("collapses runs of blank lines to a single blank, preserving paragraph breaks", () => {
    const input = "line1\n\nline2\n\n\nline3";
    expect(removeEmptyLines(input)).toBe("line1\n\nline2\n\nline3");
  });

  test("treats whitespace-only lines as blank when collapsing runs", () => {
    const input = "line1\n   \nline2";
    expect(removeEmptyLines(input)).toBe("line1\n\nline2");
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

  // Issue B: valediction closings have no explicit separator before them.
  test.each([
    "Mit freundlichen Grüßen",
    "Beste Grüße",
    "Viele Grüße",
    "Freundliche Grüße",
    "Liebe Grüße",
    "Best regards",
    "Kind regards",
    "Regards",
    "Sincerely",
  ])("detects the valediction '%s' with no explicit separator", (closing) => {
    const text = `Body text\n\n${closing}\nJane Doe`;
    const idx = getSignatureIndex(text);
    expect(idx).toBe(text.indexOf(closing));
  });

  test("detects a valediction followed by trailing punctuation", () => {
    const text = "Body text\n\nBeste Grüße,\nJane Doe";
    expect(getSignatureIndex(text)).toBe(text.indexOf("Beste Grüße,"));
  });

  test("an explicit separator still wins over a valediction when both are present", () => {
    const text = "Body\n\nViele Grüße\nJane\n-- \nJane Doe\njane@example.com";
    expect(getSignatureIndex(text)).toBe(text.indexOf("-- "));
  });

  test("uses the LAST valediction occurrence, not the first, in a multi-message body", () => {
    // Simulates a merged multi-paragraph block where an earlier, quoted
    // paragraph happens to end on a greeting-like line of its own:
    // truncating at the first occurrence would cut off everything after it.
    const text = "Regards\n\nReal content that must survive.\n\nBest regards\nJane";
    const idx = getSignatureIndex(text);
    expect(idx).toBe(text.lastIndexOf("Best regards"));
  });
});

// ---------------------------------------------------------------------------
// removeSignature
// ---------------------------------------------------------------------------

describe("removeSignature", () => {
  test("removes everything from the separator onward, trimming trailing whitespace at the cut", () => {
    const text = "Hello\n-- \nMy Name\nmy.email@example.com";
    expect(removeSignature(text)).toBe("Hello");
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

  test("handles quote depth jumping by more than one level at once", () => {
    // Some clients jump straight from level 1 to level 3 (skipping level 2).
    const lines = ["> newest", ">>> older", ">>>> oldest"];
    const messages = extractQuotedMessages(lines);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toBe("newest");
    expect(messages[1]).toBe("older");
    expect(messages[2]).toBe("oldest");
  });

  test("keeps two same-level runs separate when interrupted by a RUN_BREAK", () => {
    // splitQuotedAndLatest inserts RUN_BREAK when quoted lines are interrupted
    // by non-quoted (latest-message) text, e.g. an inline requote followed
    // later by the real quoted reply chain, both at the same quote level.
    // The run that closes later (the one appearing later in the document)
    // ends up first, matching remapDateAndAuthorLines' expectation that a
    // header line found in the preceding text belongs to whatever message
    // comes right after it in the source, not to an earlier, unrelated run.
    const { quotedLines } = splitQuotedAndLatest(
      "reply text\n> inline requote\nmore reply text\n> real quoted reply"
    );
    const messages = extractQuotedMessages(quotedLines);
    expect(messages).toEqual(["real quoted reply", "inline requote"]);
  });
});
