/**
 * @fileoverview Unit tests for src/email/handler/dateAuthorHandler.js
 */

import {
  parseDateAndAuthorLine,
  extractDateAndAuthorLine,
  removeDateAndAuthorLines,
  remapDateAndAuthorLines,
  extractLeadingStructuredHeader,
  extractName,
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

  // Thunderbird's `mailnews.reply_header_type` pref generates three
  // different German compact-line shapes; this is the "name before date"
  // one ("#1 schrieb am #2 um #3:"), the mirror image of the "Am #2 um #3
  // schrieb #1:" shape already covered above.
  test("parses the reversed 'name schrieb am date um time:' German shape", () => {
    const line = "Marek Voss schrieb am 25.09.2026 um 14:30:";
    const { from, date, time } = parseDateAndAuthorLine(line);
    expect(date).toBe("25.09.2026");
    expect(time).toBe("14:30");
    expect(from).toBe("Marek Voss");
  });

  // A 4-digit year up front is unambiguous (unlike day-first vs
  // month-first, which can't be told apart from digits alone). Without
  // special-casing this, the day-first regex coincidentally short-matches
  // inside a year-first date (e.g. "26-10-01" out of "2026-10-01",
  // silently reading 2001 as the year) instead of failing or parsing
  // correctly (see I18N_AUDIT_REPORT.md §4.4).
  test("parses an unambiguous year-first (ISO-style) date, reordering to the canonical DD.MM.YYYY", () => {
    expect(parseDateAndAuthorLine("2026-10-01, 10:00, Max Mustermann:")).toMatchObject({
      date: "01.10.2026",
      time: "10:00",
      from: "Max Mustermann",
    });
  });

  test("parses a year-first date with slash separators", () => {
    expect(parseDateAndAuthorLine("2026/10/01 10:00 schrieb Max Mustermann:")).toMatchObject({
      date: "01.10.2026",
      time: "10:00",
      from: "Max Mustermann",
    });
  });

  test("leaves an ordinary day-first date unaffected", () => {
    expect(parseDateAndAuthorLine("01.10.2026, 10:00, Max Mustermann:")).toMatchObject({
      date: "01.10.2026",
      time: "10:00",
      from: "Max Mustermann",
    });
  });
});

// ---------------------------------------------------------------------------
// extractName
// ---------------------------------------------------------------------------

describe("extractName", () => {
  // Audit §6.4 / §8.1: a non-German-alphabet name inside an otherwise
  // German/English attribution line must extract cleanly instead of being
  // silently dropped by the old `[A-ZÄÖÜ][a-zäöüß]+` character class.
  test("extracts a Polish name with diacritics outside the German alphabet", () => {
    expect(extractName("Łukasz Kowalski schrieb")).toBe("Łukasz Kowalski");
  });

  // Audit §6.4's concrete bad-output example: a Cyrillic name followed by a
  // Russian attribution verb must never absorb the verb into the name.
  test("does not absorb a trailing verb into the extracted name", () => {
    expect(extractName("Алиса Примерова писал(а)")).toBe("Алиса Примерова");
    expect(extractName("Jane Doe wrote")).toBe("Jane Doe");
    expect(extractName("Max Mustermann schrieb")).toBe("Max Mustermann");
  });

  // A company name glued (no space) in front of the real name must not
  // fragment into partial matches ("Nord"/"Licht Gmb") the way a naive
  // Unicode-property rewrite of the old regex would.
  test("ignores a letter-run glued to the name with no space boundary", () => {
    expect(extractName("NordLicht GmbH Nora Keller")).toBe("Nora Keller");
  });

  // A lowercase surname particle between two capitalized words must not
  // truncate the name to just its last word.
  test("keeps a surname particle as part of the name", () => {
    expect(extractName("Willem de Vries wrote")).toBe("Willem de Vries");
    expect(extractName("Ludwig von Beethoven schrieb")).toBe("Ludwig von Beethoven");
    expect(extractName("Giovanni di Lorenzo ha scritto")).toBe("Giovanni di Lorenzo");
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

  test("returns the LAST header line when a block contains its own header plus a trailing header for the next nested quote", () => {
    // This mirrors Thunderbird's nesting: a block can contain its own
    // attribution line at the top and the attribution line for the next,
    // deeper-nested message at the bottom.
    const message = [
      "Am 01.01.2024 um 10:00 schrieb Jane Doe:",
      "This is Jane's reply.",
      "Am 01.01.2024 um 09:00 schrieb John Smith:",
    ].join("\n");
    const result = extractDateAndAuthorLine(message);
    expect(result).toContain("John Smith");
  });

  // RC-5 regression: some clients hard-wrap a compact attribution line
  // across two physical lines: date+time+"schrieb"/"wrote" on one line,
  // the trailing name and closing colon on the next (observed in real
  // mail as "Am DD.MM.YYYY um HH:MM schrieb Nachname, Vorname" / "<addr>:").
  test("joins a compact header hard-wrapped across two physical lines", () => {
    const message = [
      "Older context.",
      "Am 15.09.2026 um 16:08 schrieb Lachmund, Maren",
      "<maren.lachmund@aha-region.de>:",
      "This is the nested reply body.",
    ].join("\n");
    const result = extractDateAndAuthorLine(message);
    expect(result).not.toBeNull();
    expect(result).toContain("15.09.2026");
    expect(result).toContain("Lachmund, Maren");
    expect(result).toContain("<maren.lachmund@aha-region.de>:");
  });

  test("does NOT join ordinary prose that mentions a date with an unrelated colon-ending next line", () => {
    const message = [
      "The meeting on 28.09.2026 at 09:30 was moved.",
      "Agenda:",
      "- point one",
    ].join("\n");
    expect(extractDateAndAuthorLine(message)).toBeNull();
  });

  test("does NOT join a date+time line lacking the schrieb/wrote keyword", () => {
    const message = ["Deadline is 28.09.2026 um 09:30 for the report", "Please review:", "- item"].join(
      "\n",
    );
    expect(extractDateAndAuthorLine(message)).toBeNull();
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

  // RC-5: both physical lines of a wrapped header must be stripped, not
  // just the first, otherwise the dangling "<addr>:" continuation line
  // leaks into the message body.
  test("removes BOTH physical lines of a hard-wrapped compact header", () => {
    const message = [
      "Am 15.09.2026 um 16:08 schrieb Lachmund, Maren",
      "<maren.lachmund@aha-region.de>:",
      "Body content here.",
    ].join("\n");
    const result = removeDateAndAuthorLines(message);
    expect(result.trim()).toBe("Body content here.");
    expect(result).not.toContain("Lachmund");
    expect(result).not.toContain("maren.lachmund@aha-region.de");
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

// ---------------------------------------------------------------------------
// extractLeadingStructuredHeader
// ---------------------------------------------------------------------------

describe("extractLeadingStructuredHeader", () => {
  // Apple Mail's plain-text export renders a forwarded/replied header's
  // labels as markdown-bold, glued directly to the colon with no space
  // ("*Von:*value") or with a space before the closing asterisk
  // ("*Von: *value"); both occur in real captured mail.
  test("tolerates asterisk-decorated labels with no space before the value", () => {
    const text = [
      "*Von:*Mira Vogt <vogt@nordlicht-software.example>",
      "*Gesendet:*Dienstag, 22. September 2026 16:22",
      "*Betreff:*Re: Something",
      "",
      "Body text.",
    ].join("\n");
    const result = extractLeadingStructuredHeader(text);
    expect(result).not.toBeNull();
    expect(result.from).toBe("Mira Vogt");
    expect(result.date).not.toContain("*");
    expect(result.remainder).toContain("Body text.");

    // Issue D: a textual Outlook "Gesendet:" value reformats to the same
    // DD.MM.YYYY/HH:MM shape used everywhere else, instead of staying raw
    // with its time silently dropped.
    expect(result.date).toBe("22.09.2026");
    expect(result.time).toBe("16:22");
  });

  test("tolerates asterisk-decorated labels with a space before the value", () => {
    const text = [
      '*Von: *"Keller, Nora" <nora.keller@example-utility.example>',
      "*Betreff: **AW: Reaktivierung Thema*",
      "*Datum: *25. September 2026 um 15:37:51 MESZ",
      "*An: *'Mira Vogt' <vogt@nordlicht-software.example>",
      "",
      "Hallo,",
    ].join("\n");
    const result = extractLeadingStructuredHeader(text);
    expect(result).not.toBeNull();
    expect(result.from).toBe("Keller Nora");
    // No leftover "*" from the "*Datum: *..." spacing variant.
    expect(result.date.startsWith("*")).toBe(false);
    expect(result.remainder).toContain("Hallo,");

    // Issue D: a textual Apple-Mail "Datum:" value (with "um" connector,
    // seconds, and a timezone abbreviation) reformats the same way.
    expect(result.date).toBe("25.09.2026");
    expect(result.time).toBe("15:37");
  });

  // A numeric header value in year-first (ISO/Japanese) order must be
  // reordered to the canonical DD.MM.YYYY, not coincidentally short-matched
  // the way the bare day-first regex would (see I18N_AUDIT_REPORT.md §4.4).
  test("reorders a year-first numeric header value to the canonical DD.MM.YYYY", () => {
    const text = [
      "Von: Max Mustermann <m@example.com>",
      "Datum: 2026/10/01 10:00",
      "An: Bob",
      "Betreff: Test",
      "",
      "Hallo.",
    ].join("\n");
    const result = extractLeadingStructuredHeader(text);
    expect(result).not.toBeNull();
    expect(result.date).toBe("01.10.2026");
    expect(result.time).toBe("10:00");
  });
});
