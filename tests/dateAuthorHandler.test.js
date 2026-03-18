/**
 * @fileoverview Unit tests for src/email/handler/dateAuthorHandler.js
 */

import {
  parseDateAndAuthorLine,
  extractDateAndAuthorLine,
  removeDateAndAuthorLines,
  remapDateAndAuthorLines,
} from "../src/email/handler/dateAuthorHandler.js";

// ---------------------------------------------------------------------------
// parseDateAndAuthorLine
// ---------------------------------------------------------------------------

describe("parseDateAndAuthorLine", () => {
  test("returns empty strings for null input", () => {
    expect(parseDateAndAuthorLine(null)).toEqual({ from: "", date: "", time: "" });
  });

  test("returns empty strings for empty string", () => {
    expect(parseDateAndAuthorLine("")).toEqual({ from: "", date: "", time: "" });
  });

  test("parses a typical German email header line", () => {
    const line = "01.01.2024, 10:00, Max Mustermann:";
    const { from, date, time } = parseDateAndAuthorLine(line);
    expect(date).toBe("01.01.2024");
    expect(time).toBe("10:00");
    expect(from).toContain("Max");
  });

  test("parses a line with AM/PM time", () => {
    const line = "12/25/2023 at 02:30 PM, John Doe:";
    const { time } = parseDateAndAuthorLine(line);
    expect(time.toUpperCase()).toContain("PM");
  });

  test("returns empty strings when no date/time found", () => {
    const line = "This line has no date or time";
    expect(parseDateAndAuthorLine(line)).toEqual({ from: "", date: "", time: "" });
  });
});

// ---------------------------------------------------------------------------
// extractDateAndAuthorLine
// ---------------------------------------------------------------------------

describe("extractDateAndAuthorLine", () => {
  test("returns null when no header line is present", () => {
    const message = "Hello\nHow are you?";
    expect(extractDateAndAuthorLine(message)).toBeNull();
  });

  test("extracts the header line from a quoted message", () => {
    const message = [
      "01.01.2024, 10:00, Jane Doe:",
      "This is the body.",
    ].join("\n");
    const result = extractDateAndAuthorLine(message);
    expect(result).not.toBeNull();
    expect(result).toContain("01.01.2024");
  });
});

// ---------------------------------------------------------------------------
// removeDateAndAuthorLines
// ---------------------------------------------------------------------------

describe("removeDateAndAuthorLines", () => {
  test("removes header lines and keeps the rest", () => {
    const message = [
      "01.01.2024, 10:00, Jane Doe:",
      "Body content here.",
    ].join("\n");
    const result = removeDateAndAuthorLines(message);
    expect(result).toContain("Body content here");
    expect(result).not.toContain("Jane Doe");
  });

  test("returns message unchanged when no header line exists", () => {
    const message = "Just a message.";
    expect(removeDateAndAuthorLines(message)).toBe(message);
  });
});

// ---------------------------------------------------------------------------
// remapDateAndAuthorLines
// ---------------------------------------------------------------------------

describe("remapDateAndAuthorLines", () => {
  test("prepends previous header to each message", () => {
    const messages = ["msg0", "msg1", "msg2"];
    const headers = ["header0", "header1", "header2"];
    const result = remapDateAndAuthorLines(messages, headers);

    // First message has no previous header (index 0 → dateLines[i-1] = dateLines[-1] = undefined)
    expect(result[0]).toBe("msg0");
    // Second message gets the first header
    expect(result[1]).toContain("header0");
    expect(result[1]).toContain("msg1");
  });

  test("handles single-message array", () => {
    const result = remapDateAndAuthorLines(["only"], ["h0"]);
    expect(result[0]).toBe("only");
  });
});
