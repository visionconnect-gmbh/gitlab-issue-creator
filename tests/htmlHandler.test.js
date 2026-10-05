/**
 * @fileoverview Unit tests for src/email/handler/htmlHandler.js
 */

import { readFileSync } from "fs";
import { htmlToQuotedText } from "../src/email/handler/htmlHandler.js";
import { emailParser } from "../src/email/emailParser.js";

function loadFixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

/** Non-blank lines only: blank-line noise from <div>/<p>/<blockquote>
 * boundaries is expected and harmless (the downstream plain-text pipeline
 * already collapses/tolerates it just like real quoted plain-text mail
 * does), so most of these tests check structure and content, not exact
 * blank-line counts. */
function nonBlankLines(text) {
  return text.split("\n").filter((line) => line.trim() !== "");
}

describe("htmlToQuotedText", () => {
  test("returns empty string for falsy or non-string input", () => {
    expect(htmlToQuotedText("")).toBe("");
    expect(htmlToQuotedText(null)).toBe("");
    expect(htmlToQuotedText(undefined)).toBe("");
  });

  test("converts <div> paragraphs into separate lines", () => {
    const html = "<div>Hallo,</div><div>wie geht es dir?</div>";
    expect(nonBlankLines(htmlToQuotedText(html))).toEqual(["Hallo,", "wie geht es dir?"]);
  });

  test("converts <br> into line breaks", () => {
    const html = "Zeile eins<br/>Zeile zwei<br/>Zeile drei";
    expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
      "Zeile eins",
      "Zeile zwei",
      "Zeile drei",
    ]);
  });

  test("decodes common HTML entities", () => {
    const html = "<div>A &amp; B &lt;test&gt; &quot;quoted&quot; &nbsp;end</div>";
    expect(htmlToQuotedText(html)).toBe('A & B <test> "quoted" end');
  });

  // A single `<blockquote>` becomes one level of `>` prefix, matching the
  // convention `getQuoteLevel` (and every downstream function) expects:
  // N adjacent `>` characters, then a space, then the text.
  test("converts a single <blockquote> into one level of quote markers", () => {
    const html = "<div>Reply text.</div><blockquote><div>Quoted text.</div></blockquote>";
    expect(nonBlankLines(htmlToQuotedText(html))).toEqual(["Reply text.", "> Quoted text."]);
  });

  test("converts nested <blockquote> elements into matching quote depth", () => {
    const html =
      "<blockquote><div>Level one.</div>" +
      "<blockquote><div>Level two.</div>" +
      "<blockquote><div>Level three.</div></blockquote>" +
      "</blockquote></blockquote>";
    expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
      "> Level one.",
      ">> Level two.",
      ">>> Level three.",
    ]);
  });

  // Real captured mail: Thunderbird's own reply-attribution line
  // ("moz-cite-prefix") sits in a <div> immediately before the
  // <blockquote> it introduces; this must convert to the same shape as
  // the plain-text "Am ... schrieb ...:" / "On ... wrote:" line so the
  // existing compact-header parser picks it up unchanged.
  test("keeps a moz-cite-prefix attribution line right before its blockquote", () => {
    const html =
      '<div class="moz-cite-prefix">Am 25.09.2026 um 14:30 schrieb Jane Doe:<br/></div>' +
      "<blockquote><div>Quoted reply.</div></blockquote>";
    expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
      "Am 25.09.2026 um 14:30 schrieb Jane Doe:",
      "> Quoted reply.",
    ]);
  });

  // Real captured mail: a `<pre class="moz-signature">` signature block
  // uses literal "\n" characters instead of <br/> tags. Those must survive
  // as real line breaks so "-- " lands alone on its own line, otherwise
  // `getSignatureIndex` can never find it and the whole signature leaks
  // into the message text.
  test("preserves line breaks inside a <pre> signature block", () => {
    const html =
      "<div>Reply text.</div>" +
      '<pre class="moz-signature">-- \n\nKind regards\nJane Doe</pre>';
    const text = htmlToQuotedText(html);
    // The "-- " line must be alone on its own line, exactly (not trimmed
    // away, not merged with surrounding text): getSignatureIndex requires it.
    expect(text.split("\n")).toContain("-- ");
    expect(nonBlankLines(text)).toEqual(["Reply text.", "-- ", "Kind regards", "Jane Doe"]);
  });

  // Outside <pre>, an embedded "\n" is just HTML source pretty-printing;
  // it must NOT split a sentence into two lines (which would break the
  // single-line compact-header regex, among other things).
  test("collapses source-formatting whitespace (including embedded newlines) outside <pre>", () => {
    const html = '<div class="moz-cite-prefix">On 9/1/2026 12:50 PM, Jane\n          Doe wrote:<br/></div>';
    const text = htmlToQuotedText(html);
    expect(text).toBe("On 9/1/2026 12:50 PM, Jane Doe wrote:");
  });

  // Issue A: a `<!DOCTYPE html>` preamble (and HTML comments) must not leak
  // into the extracted text: the tag walker can't match a bang-construct as
  // a well-formed tag, so without stripping it first, the "<" gets silently
  // dropped and "!DOCTYPE html>" falls through as literal text content.
  test("strips a <!DOCTYPE html> preamble and HTML comments entirely", () => {
    const html =
      "<!DOCTYPE html>\n<!-- a comment -->\n<html><body><div>Neue Antwort</div></body></html>";
    const text = htmlToQuotedText(html);
    expect(text).toBe("Neue Antwort");
    expect(text).not.toContain("DOCTYPE");
    expect(text).not.toContain("comment");
  });

  test("strips script and style content entirely", () => {
    const html = "<style>.x{color:red}</style><div>Visible text.</div><script>evil()</script>";
    const text = htmlToQuotedText(html);
    expect(text).toBe("Visible text.");
  });

  test("collapses runs of blank lines down to one", () => {
    const html = "<div>First.</div><div><br/></div><div><br/></div><div>Second.</div>";
    const text = htmlToQuotedText(html);
    expect(text).toBe("First.\n\nSecond.");
  });

  // RC-1 regression: a blank paragraph INSIDE a <blockquote> must keep its
  // quote-depth prefix (e.g. "> ") rather than becoming a bare "": an
  // unprefixed blank reads downstream as "outside the quote" and forces a
  // premature message boundary at every single paragraph break. Checked on
  // the RAW (unstripped) output deliberately: `nonBlankLines()` above
  // would delete exactly the lines this bug gets wrong.
  test("prefixes a blank line inside a <blockquote> with the current quote depth, not a bare empty string", () => {
    const html =
      "<blockquote><div>First line.<br/></div>" +
      "<div><br/></div>" +
      "<div>Second line.<br/></div></blockquote>";
    const lines = htmlToQuotedText(html).split("\n");
    expect(lines).toEqual(["> First line.", "> ", "> Second line."]);
  });

  test("prefixes a blank line at nested quote depth with the full nested prefix", () => {
    const html =
      "<blockquote><blockquote><div>Nested line.<br/></div>" +
      "<div><br/></div>" +
      "<div>More nested text.<br/></div></blockquote></blockquote>";
    const lines = htmlToQuotedText(html).split("\n");
    expect(lines).toEqual([">> Nested line.", ">> ", ">> More nested text."]);
  });

  // The actual bug this covers: <strong>/<b> headings and list items in a
  // quoted HTML reply were previously dropped to plain unstyled text,
  // losing bold section headers and bullet/numbered lists entirely instead
  // of carrying them over as Markdown.
  describe("inline formatting and lists", () => {
    test("converts <strong> to Markdown bold", () => {
      const html = "<p><strong>Google Maps und Tracking</strong></p>";
      expect(htmlToQuotedText(html)).toBe("**Google Maps und Tracking**");
    });

    test("converts <b> to Markdown bold", () => {
      const html = "<b>Von:</b> Jane Doe";
      expect(htmlToQuotedText(html)).toBe("**Von:** Jane Doe");
    });

    test("converts <em> and <i> to Markdown emphasis", () => {
      expect(htmlToQuotedText("<em>wichtig</em>")).toBe("*wichtig*");
      expect(htmlToQuotedText("<i>wichtig</i>")).toBe("*wichtig*");
    });

    test("preserves a bold span nested inside extra inline tags", () => {
      const html =
        '<p><strong><span style="font-family: Aptos, sans-serif;">Google Maps und Tracking</span></strong><o:p></o:p></p>';
      expect(htmlToQuotedText(html)).toBe("**Google Maps und Tracking**");
    });

    test("carries bold formatting through nested blockquotes with the correct quote prefix", () => {
      const html =
        "<blockquote><blockquote>" +
        "<p><strong>Google Maps und Tracking</strong></p>" +
        "<p>Auch Google Maps ist ein externer Dienst.</p>" +
        "</blockquote></blockquote>";
      expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
        ">> **Google Maps und Tracking**",
        ">> Auch Google Maps ist ein externer Dienst.",
      ]);
    });

    test("converts a <ul> into a Markdown bullet list", () => {
      const html =
        "<ul><li>Erster Punkt</li><li>Zweiter Punkt</li></ul>";
      expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
        "- Erster Punkt",
        "- Zweiter Punkt",
      ]);
    });

    test("converts an <ol> into a Markdown numbered list", () => {
      const html = "<ol><li>Erster Schritt</li><li>Zweiter Schritt</li></ol>";
      expect(nonBlankLines(htmlToQuotedText(html))).toEqual([
        "1. Erster Schritt",
        "2. Zweiter Schritt",
      ]);
    });

    test("does not let a mismatched closing inline tag corrupt the marker", () => {
      // Malformed/real-world mail HTML: a stray </em> with no matching open.
      const html = "<strong>Bold text</em></strong>";
      expect(htmlToQuotedText(html)).toBe("**Bold text**");
    });
  });
});

describe("htmlToQuotedText piped through emailParser", () => {
  // End-to-end: a structured "Von:/Betreff:/Datum:/An:" forward header
  // rendered as plain <div>s (no asterisk markdown needed in HTML, unlike
  // Apple Mail's plain-text export) converts to exactly the shape the
  // existing structured-header parser already handles.
  test("recovers a forwarded message introduced by a <div class=\"forwardHeader\">", () => {
    const html =
      "<div>Siehe unten.</div>" +
      '<div class="forwardHeader">' +
      "<div>Betreff: Re: Something</div>" +
      "<div>Datum: 25. September 2026 um 15:37:51 MESZ</div>" +
      "<div>Von: Jane Doe &lt;jane@example.com&gt;</div>" +
      "<div>An: John Roe &lt;john@example.com&gt;</div>" +
      "</div>" +
      '<div class="parent_body"><blockquote type="cite">' +
      "<p>Hallo John,</p><p>Danke für die Rückmeldung.</p>" +
      "</blockquote></div>";

    const result = emailParser(htmlToQuotedText(html));

    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("Siehe unten");
    expect(result[0].forwardedMessage).not.toBeNull();
    expect(result[0].forwardedMessage.from).toBe("Jane Doe");
    expect(result[0].forwardedMessage.message).not.toContain("Betreff:");
    expect(result[0].forwardedMessage.message).toContain("Hallo John");
    expect(result[0].forwardedMessage.message).toContain("Danke für die Rückmeldung");
  });

  // The 1-level-deeper case that broke this parser on real mail: two
  // consecutive <blockquote> opens with nothing but an empty
  // moz-cite-prefix between them (a genuine quote-depth jump, same as an
  // irregular ">>>>" jump in plain text) must not merge unrelated messages.
  test("keeps messages distinct across a blockquote depth jump with no attribution text", () => {
    const html =
      "<blockquote><p>Level one reply.</p>" +
      '<div class="moz-cite-prefix"><br/></div>' +
      "<blockquote><blockquote><p>Level three, jumped straight from one.</p></blockquote></blockquote>" +
      "</blockquote>";

    const result = emailParser(htmlToQuotedText(html));

    expect(result.some((m) => m.message.includes("Level one reply"))).toBe(true);
    expect(result.some((m) => m.message.includes("Level three, jumped straight from one"))).toBe(
      true
    );
  });

  // RC-1 end-to-end regression, derived from a real nested-forward email
  // that produced 25 fragmented messages (6 empty, 5 duplicate sender/date
  // pairs, signature lines split into their own phantom entries) before
  // this fix. Synthetic names/addresses; same structural shape: a reply,
  // quoting a message whose body has several paragraph breaks and a
  // multi-line signature, which itself quotes a deeper, older message.
  test("does not fragment a multi-paragraph quoted message with paragraph breaks and a signature block", () => {
    const html = loadFixture("thread-html-blockquote-paragraph-breaks.html");
    const result = emailParser(htmlToQuotedText(html));

    // Exact count, not `.some(...)`: over-fragmentation is the bug, and a
    // content-presence check alone can't detect extra phantom entries.
    expect(result).toHaveLength(3);

    for (const entry of result) {
      // No entry with an empty message (the "header-only" phantom-entry symptom).
      expect(entry.message.trim()).not.toBe("");
    }
    // No entry with content but an unresolved sender (the "Unbekannter
    // Absender" symptom) among the quoted messages (the latest/top message
    // legitimately has no from/date of its own, that comes from the
    // email's own metadata elsewhere in the pipeline).
    expect(result[1].from).not.toBe("");
    expect(result[2].from).not.toBe("");

    // No duplicate sender/date pairs.
    const pairs = result.map((m) => `${m.from}|${m.date}`);
    expect(new Set(pairs).size).toBe(pairs.length);

    // Ordering: latest reply first, then chronologically.
    expect(result[0].message).toContain("Kurze Antwort");
    expect(result[1].from).toBe("Anna Muster");
    expect(result[2].from).toBe("Ben Beispiel");

    // The signature block is neither split off into its own entry NOR left
    // attached to the message it signs: it's recognized as a signature
    // (Issue B) and stripped entirely, same as any other message's.
    expect(result[1].message).toContain("Erste Zeile der Antwort");
    expect(result[1].message).not.toContain("Freundliche Grüße");
    expect(result[1].message).not.toContain("Beispiel GmbH");
  });
});
