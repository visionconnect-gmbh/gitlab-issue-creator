/**
 * @fileoverview Unit tests for src/utils/dateFormat.js
 *
 * These exist specifically to pin down a real, already-shipping bug:
 * `new Date("01.10.2026")` (the canonical date string dateAuthorHandler.js
 * produces) is read by V8 as MM.DD.YYYY, not DD.MM.YYYY: it swaps day and
 * month whenever both are <=12. `parseCanonicalDate`/`parseCanonicalTime`
 * replace that implementation-defined re-parse with an explicit one.
 */

import { parseCanonicalDate, parseCanonicalTime } from "../src/utils/dateFormat.js";

describe("parseCanonicalDate", () => {
  test("parses day, month, year in the correct order, not swapped", () => {
    // This is the exact regression case: October 1, stored as "01.10.2026",
    // must come back as month=10/day=1, not misread as January 10.
    expect(parseCanonicalDate("01.10.2026")).toEqual({ day: 1, month: 10, year: 2026 });
  });

  test("parses an unambiguous day (>12) correctly", () => {
    expect(parseCanonicalDate("28.09.2026")).toEqual({ day: 28, month: 9, year: 2026 });
  });

  test("returns null for a non-canonical / raw fallback string", () => {
    expect(parseCanonicalDate("Date: alice@example.com 01.01.2024")).toBeNull();
    expect(parseCanonicalDate("not a date")).toBeNull();
  });

  test("returns null for null/undefined input", () => {
    expect(parseCanonicalDate(null)).toBeNull();
    expect(parseCanonicalDate(undefined)).toBeNull();
  });
});

describe("parseCanonicalTime", () => {
  test("parses a 24-hour time", () => {
    expect(parseCanonicalTime("10:00")).toEqual({ hour: 10, minute: 0 });
  });

  test("parses a 12-hour PM time into 24-hour form", () => {
    expect(parseCanonicalTime("02:30 PM")).toEqual({ hour: 14, minute: 30 });
  });

  test("parses 12:xx AM as hour 0", () => {
    expect(parseCanonicalTime("12:15 AM")).toEqual({ hour: 0, minute: 15 });
  });

  test("parses 12:xx PM as hour 12 (noon), not 24", () => {
    expect(parseCanonicalTime("12:00 PM")).toEqual({ hour: 12, minute: 0 });
  });

  test("returns null for empty/missing input", () => {
    expect(parseCanonicalTime("")).toBeNull();
    expect(parseCanonicalTime(null)).toBeNull();
    expect(parseCanonicalTime(undefined)).toBeNull();
  });
});

describe("parseCanonicalDate + parseCanonicalTime combined (regression: the Jan/Oct swap)", () => {
  test("October 1, 2026 at 10:00 round-trips through new Date() correctly", () => {
    const date = parseCanonicalDate("01.10.2026");
    const time = parseCanonicalTime("10:00");
    const combined = new Date(date.year, date.month - 1, date.day, time.hour, time.minute);

    expect(combined.getFullYear()).toBe(2026);
    expect(combined.getMonth()).toBe(9); // 0-based: October
    expect(combined.getDate()).toBe(1);
    expect(combined.getHours()).toBe(10);
  });
});
