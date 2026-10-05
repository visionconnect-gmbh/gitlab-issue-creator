/**
 * @fileoverview Regression tests for email threads that previously exposed
 * parser bugs (see git history of src/email/handler/textHandler.js and
 * dateAuthorHandler.js). Fixtures are synthetic (no real names, addresses,
 * or emails) but reproduce the exact structural quirks that triggered each
 * bug. If any of these break, the conversation-history parser has
 * regressed in a user-visible way.
 */

import { readFileSync } from "fs";
import { emailParser } from "../src/email/emailParser.js";

function loadFixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("emailParser regression fixtures", () => {
  // ---------------------------------------------------------------------------
  // Bug: extractDateAndAuthorLine took the FIRST date/author line in a block
  // instead of the LAST, so a header meant for the next nested message was
  // discarded and the next message reused the wrong author/date.
  // ---------------------------------------------------------------------------
  test("attributes each message to its own author/date, not a duplicate of its neighbor", () => {
    const result = emailParser(loadFixture("thread-nested-quote-attribution.txt"));

    expect(result).toHaveLength(5);

    expect(result[0].message).toContain("ich sehe das als Freigabe deiner Mail");

    expect(result[1]).toMatchObject({ from: "Mira Vogt", date: "28.09.2026", time: "09:14" });
    expect(result[1].message).toContain("Gute Frage");

    expect(result[2]).toMatchObject({ from: "Jonas Berg", date: "28.09.2026", time: "09:13" });
    expect(result[2].message).toContain("aber ist das damit auch eine Freigabe");

    // This is the message that used to be wrongly duplicated as "Jonas Berg, 09:13"
    // instead of getting its own, distinct attribution.
    expect(result[3]).toMatchObject({ from: "Mira Vogt", date: "28.09.2026", time: "09:02" });
    expect(result[3].message).toContain("kurze Rückmeldung von Frau Lindmann");

    // This nested block is a genuine forward (not just another quoted
    // reply): a non-dashed "Anfang der weitergeleiteten Nachricht:" trigger
    // followed by a structured "Von:/Betreff:/Datum:/An:" header. It must be
    // recognised and surfaced as a `forwardedMessage`, not dumped as raw,
    // unparsed header text.
    expect(result[4].message).not.toContain("Anfang der weitergeleiteten Nachricht");
    expect(result[4].forwardedMessage).not.toBeNull();
    expect(result[4].forwardedMessage.message).not.toContain("Von:");
    expect(result[4].forwardedMessage.message).not.toContain("Betreff:");
    expect(result[4].forwardedMessage.message).toContain("Hallo Frau Vogt");
    expect(result[4].forwardedMessage.message).toContain(
      "danke für diesen Zwischenstand"
    );
  });

  // ---------------------------------------------------------------------------
  // Bug: quote-level grouping only split on a level DECREASE, so an
  // irregular jump in `>` depth (mail clients don't always increase by
  // exactly one per reply) merged multiple distinct messages, authors, and
  // signatures into a single corrupted blob.
  // ---------------------------------------------------------------------------
  test("keeps every message in a thread with irregular quote-depth jumps distinct", () => {
    const result = emailParser(loadFixture("thread-irregular-quote-depth.txt"));

    expect(result).toHaveLength(6);

    expect(result[0].message).toContain("Mindestlaufzeit beim Anbieter 36 Monate");
    expect(result[1].message).toContain("leider ist der Hardware-Preis");
    expect(result[2].message).toContain("Wenn Sie für die ein oder andere Variante");

    expect(result[3]).toMatchObject({ from: "Nora Keller", date: "9/1/2026", time: "12:50 PM" });
    expect(result[3].message).toContain("könnten wir zu den genannten Produkten");

    expect(result[4]).toMatchObject({ from: "Marek Voss", date: "18.08.2026", time: "11:33" });
    expect(result[4].message).toContain("bitte entschuldigen Sie die späte Antwort");

    expect(result[5]).toMatchObject({ from: "Nora Keller", date: "8/4/2026", time: "11:13 AM" });
    expect(result[5].message).toContain("bei dem Technologietag in Ihrem Hause");

    // None of the reconstructed messages should contain another message's
    // signature block bleeding into it.
    expect(result[3].message).not.toContain("ServerForge GmbH");
    expect(result[4].message).not.toContain("Freundliche Grüße\nNora Keller");
  });

  // ---------------------------------------------------------------------------
  // Bug: an inline requote (a short fragment quoted for context in the
  // middle of a reply, at the same `>` depth as the real quoted reply below
  // it) got merged into the real quoted message because the splitter had no
  // concept of position, only "quoted" vs "not quoted".
  // ---------------------------------------------------------------------------
  test("does not let an inline requote contaminate the real quoted message that follows it", () => {
    const result = emailParser(loadFixture("thread-inline-requote.txt"));

    expect(result).toHaveLength(3);

    // A structured "Betreff:/Von:/Datum:/An:" block pasted at the very top
    // of the body is this message's own (self-referential) header, not a
    // forward: it must be parsed into from/date/time and stripped, not
    // leaked into the message text.
    expect(result[0]).toMatchObject({ from: "Jonas Berg", date: "24.09.2026", time: "09:09" });
    expect(result[0].message).not.toContain("Betreff:");
    expect(result[0].message).toContain("Moin Finn");

    expect(result[1]).toMatchObject({ from: "Karl Brenner", date: "23.09.2026", time: "17:42" });
    expect(result[1].message).toContain("Hallo Mira");
    // This is the fragment Jonas inline-quoted for context; it must not leak
    // into Karl's actual message.
    expect(result[1].message).not.toContain("Steht der Wert auf true");

    // Karl's message embeds a two-level forward chain (Finn forwarded Jonas's
    // original mail, then Karl forwarded/replied on top of that): each level
    // must surface as its own entry instead of leaking raw "Von:/Betreff:"
    // header lines into a message's text.
    expect(result[1].forwardedMessage).not.toBeNull();
    expect(result[1].forwardedMessage.from).toBe("Finn Adler");
    expect(result[1].forwardedMessage.message).not.toContain("Von:");
    expect(result[1].forwardedMessage.forwardedMessage).not.toBeNull();
    expect(result[1].forwardedMessage.forwardedMessage.message).toContain(
      "Bezüglich der Ehrenkarte"
    );

    // The inline requote itself surfaces as its own (unattributed) fragment
    // instead of silently corrupting message[1].
    expect(result[2].message).toContain("Steht der Wert auf true");
  });

  // ---------------------------------------------------------------------------
  // Bug: `getSignatureIndex` computed a match position against a `\r\n`-
  // stripped COPY of the text but `removeSignature` then sliced the
  // ORIGINAL (CRLF) text with that position. On real, CRLF-terminated
  // Thunderbird bodies this cut messages off far too early, sometimes
  // leaving `message: ""` and making it look like the parser dropped
  // everything after the first message. This fixture is CRLF-terminated
  // throughout (`\r\n`, not `\n`) to specifically exercise that path.
  //
  // It also reproduces a second, independently confirmed real-mail quirk:
  // Apple Mail's plain-text export renders a forwarded header's labels as
  // markdown-bold with no reliable spacing convention: "*Von:*value" (no
  // space) in one message and "*Von: *value" (space before the closing
  // asterisk) in another, sometimes even wrapping the whole value in "**value*",
  // plus a genuine two-level forward chain (A forwarded to B, who forwarded
  // on to C) that must surface as `forwardedMessage.forwardedMessage`.
  // ---------------------------------------------------------------------------
  test("handles a CRLF-terminated thread with asterisk-decorated forward headers", () => {
    const result = emailParser(loadFixture("thread-asterisk-labels-crlf.txt"));

    expect(result).toHaveLength(5);

    expect(result[0].message).toContain("Das sehe ich als Freigabe");
    expect(result[1]).toMatchObject({ from: "Mira Vogt", date: "28.09.2026", time: "09:14" });
    expect(result[1].message).toContain("Gute Frage");
    expect(result[2]).toMatchObject({ from: "Jonas Berg", date: "28.09.2026", time: "09:13" });
    expect(result[3]).toMatchObject({ from: "Mira Vogt", date: "28.09.2026", time: "09:02" });

    // The two-level forward chain, with clean (asterisk-free) attribution
    // at each level and none of the "*Von:*"/"*Betreff:*" label noise
    // leaking into either message's text.
    const level1 = result[4].forwardedMessage;
    expect(level1).not.toBeNull();
    expect(level1.from).toBe("Petra Lindmann");
    expect(level1.date).not.toContain("*");
    expect(level1.message).not.toContain("*Von:");
    expect(level1.message).not.toContain("*Betreff:");
    expect(level1.message).toContain("Hallo Frau Vogt");

    const level2 = level1.forwardedMessage;
    expect(level2).not.toBeNull();
    expect(level2.from).toBe("Mira Vogt");
    expect(level2.message).not.toContain("*Gesendet:");
    expect(level2.message).toContain("Sehr geehrte Frau Lindmann");
    expect(level2.message).toContain("Die Umsetzung ist vom 28.09. bis 16.10.");
  });

  // ---------------------------------------------------------------------------
  // Bug (RC-5): a compact "Am ... schrieb ...:" attribution hard-wrapped
  // across two physical lines (date+time+"schrieb" on one line, the name
  // and closing "<addr>:" on the next) was invisible to the single-line
  // header regex, so the nested message it introduced lost its attribution
  // and bled into its parent's body instead of surfacing as its own entry.
  // ---------------------------------------------------------------------------
  test("resolves a compact attribution hard-wrapped across two physical lines, without leaking it into the parent message", () => {
    const result = emailParser(loadFixture("thread-wrapped-compact-attribution.txt"));

    expect(result).toHaveLength(4);

    expect(result[0].message).toContain("Danke dir!");

    expect(result[1]).toMatchObject({ from: "Tobias Arnold", date: "20.09.2026", time: "10:00" });
    expect(result[1].message).toContain("Klar, kein Problem.");
    // Ordinary prose that happens to mention a date must stay in the body,
    // not get mistaken for the start of a wrapped header.
    expect(result[1].message).toContain("Wir hatten das Treffen am 18.09.2026 verschoben.");
    // The wrapped header line itself must not leak into this message's text.
    expect(result[1].message).not.toContain("schrieb Lachmund");

    // The wrapped-header message resolves its own from/date instead of
    // staying "Unbekannter Absender".
    expect(result[2]).toMatchObject({ from: "Lachmund Maren", date: "15.09.2026", time: "16:08" });
    expect(result[2].message).toContain("Hallo zusammen,");
    expect(result[2].message).not.toContain("maren.lachmund@aha-region.de");

    expect(result[3]).toMatchObject({ from: "Jonas Keller", date: "10.09.2026", time: "08:00" });
    expect(result[3].message).toContain("Erste Nachricht im Thread.");
  });

  // ---------------------------------------------------------------------------
  // Bug (Issue C): a forward chain represented as nested content within ONE
  // quote level (Apple Mail's style: "Anfang der weitergeleiteten
  // Nachricht:" followed by two further "Von:/Datum:" blocks at the SAME
  // depth, not additional nesting) was only rendered one level deep, and
  // the innermost forward's header leaked onto a genuinely separate, deeper
  // quoted message that followed, shadowing its own correct attribution.
  // ---------------------------------------------------------------------------
  test("renders a full multi-level forward chain embedded in one quote level, without shadowing the next message's own header", () => {
    const result = emailParser(loadFixture("thread-forward-chain-in-one-quote-level.txt"));

    expect(result).toHaveLength(3);

    expect(result[0].message).toContain("Neue Antwort");

    // Anna's own reply, with the full two-level forward chain attached.
    expect(result[1]).toMatchObject({ from: "Anna Muster", date: "02.01.2026", time: "10:00" });
    expect(result[1].message).toContain("Danke fuer die Weiterleitung");

    expect(result[1].forwardedMessage).not.toBeNull();
    expect(result[1].forwardedMessage).toMatchObject({
      from: "Ben Beispiel",
      date: "01.01.2026",
      time: "09:00",
    });
    expect(result[1].forwardedMessage.message).toContain("Body Ben");

    // The SECOND level of the forward chain, previously dropped entirely.
    expect(result[1].forwardedMessage.forwardedMessage).not.toBeNull();
    expect(result[1].forwardedMessage.forwardedMessage).toMatchObject({
      from: "Clara Fischer",
      date: "30.12.2025",
      time: "08:00",
    });
    expect(result[1].forwardedMessage.forwardedMessage.message).toContain("Body Clara");

    // The next, genuinely separate, deeper-quoted message resolves its OWN
    // header instead of being shadowed by Anna's (or Clara's) header.
    expect(result[2]).toMatchObject({ from: "David Klein", date: "29.12.2025", time: "07:00" });
    expect(result[2].message).toBe("Body David");
  });

  // ---------------------------------------------------------------------------
  // Bug (Issue B): valediction closings ("Mit freundlichen Grüßen", "Beste
  // Grüße", "Viele Grüße", ...) with no explicit separator were never
  // recognized as a signature, so they stayed attached (or, combined with the
  // company-footer block that follows them, bloated every quoted message
  // at every nesting depth, not just the top-level one).
  // ---------------------------------------------------------------------------
  test("strips a valediction + company-footer signature at every nesting depth, not just the top message", () => {
    const result = emailParser(loadFixture("thread-nested-valediction-signature.txt"));

    expect(result).toHaveLength(4);

    expect(result[1]).toMatchObject({ from: "Petra Vogel", date: "03.03.2026", time: "11:00" });
    expect(result[1].message).toBe("Hier die Antwort auf deine Frage.");

    expect(result[2]).toMatchObject({ from: "Jan Schulz", date: "02.03.2026", time: "09:00" });
    expect(result[2].message).toBe("Danke fuer die schnelle Rueckmeldung, das hilft sehr weiter.");

    expect(result[3]).toMatchObject({ from: "Rosa Klein", date: "01.03.2026", time: "08:00" });
    expect(result[3].message).toBe("Koennten wir das kurz telefonisch besprechen?");

    for (const entry of result) {
      expect(entry.message).not.toMatch(/Grüßen|Grüße/);
      expect(entry.message).not.toContain("www.");
      expect(entry.message).not.toContain("Beispiel GmbH");
      expect(entry.message).not.toContain("Zweckverband");
    }
  });

  // ---------------------------------------------------------------------------
  // Bug (Issue E): removeEmptyLines deleted EVERY blank line instead of
  // collapsing runs of them, destroying paragraph structure in both the
  // top-level reply and every quoted message.
  // ---------------------------------------------------------------------------
  test("preserves paragraph breaks (collapsing a double-blank run to one), at the top level and when quoted", () => {
    const result = emailParser(loadFixture("thread-paragraph-spacing.txt"));

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe(
      "First paragraph of the reply.\n\nSecond paragraph of the reply.\n\nThird paragraph, after a double blank line.",
    );
    expect(result[1]).toMatchObject({ from: "Nora Albrecht", date: "05.05.2026", time: "12:00" });
    expect(result[1].message).toBe(
      "First quoted paragraph.\n\nSecond quoted paragraph.\n\nThird quoted paragraph, after a double-blank quoted run.",
    );
  });

  // ---------------------------------------------------------------------------
  // i18n audit §8.4/§8.8: the forward-trigger phrase, structured header
  // labels, and valediction list were hardcoded to German/English only.
  // These fixtures exercise the centralized locale table (see
  // src/email/locales/emailLocales.js) end to end for French and Spanish:
  // forward detection, header-block splitting, attribution parsing, and
  // valediction stripping all firing on a language neither was ever
  // hardcoded for before.
  // ---------------------------------------------------------------------------
  test("recognises a French forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-fr.txt"));

    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Merci pour l'info.");

    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Alice Dupont", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Début du message transféré");
    expect(forwarded.message).not.toContain("Objet :");
    expect(forwarded.message).not.toMatch(/Cordialement/);
    expect(forwarded.message).toBe("Bonjour,\n\nPouvez-vous valider ce point ?");
  });

  test("recognises a Spanish forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-es.txt"));

    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Gracias por la info.");

    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Alicia Duarte", time: "10:00" });
    expect(forwarded.date).toContain("01");
    expect(forwarded.message).not.toContain("Inicio del mensaje reenviado");
    expect(forwarded.message).not.toContain("Asunto:");
    expect(forwarded.message).not.toMatch(/Saludos/);
    expect(forwarded.message).toBe("Hola,\n\n¿Puedes confirmar este punto?");
  });

  // ---------------------------------------------------------------------------
  // i18n audit §6 (post-refactor follow-up): pt/it/nl/pl/ru added to the
  // locale table as pure data once the French/Spanish wiring proved the
  // architecture. Each fixture exercises forward detection, header-block
  // splitting, attribution parsing, and valediction stripping in a language
  // that previously had zero parsing support.
  // ---------------------------------------------------------------------------
  test("recognises a Portuguese forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-pt.txt"));

    expect(result).toHaveLength(1);
    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Ana Silva", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Início da mensagem reencaminhada");
    expect(forwarded.message).not.toContain("Assunto :");
    expect(forwarded.message).not.toMatch(/Atenciosamente/);
    expect(forwarded.message).toContain("Pode confirmar este ponto?");
  });

  test("recognises an Italian forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-it.txt"));

    expect(result).toHaveLength(1);
    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Giulia Rossi", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Messaggio inoltrato");
    expect(forwarded.message).not.toContain("Oggetto :");
    expect(forwarded.message).not.toMatch(/Cordiali saluti/);
    expect(forwarded.message).toContain("Puoi confermare questo punto?");
  });

  test("recognises a Dutch forward trigger, header block, and valediction, including a surname particle", () => {
    const result = emailParser(loadFixture("thread-forward-nl.txt"));

    expect(result).toHaveLength(1);
    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    // "de Vries" exercises the surname-particle fix: must not be truncated
    // to just "Vries".
    expect(forwarded).toMatchObject({ from: "Willem de Vries", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Doorgestuurd bericht");
    expect(forwarded.message).not.toContain("Onderwerp :");
    expect(forwarded.message).not.toMatch(/Met vriendelijke groet/);
    expect(forwarded.message).toContain("Kun je dit punt bevestigen?");
  });

  test("recognises a Polish forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-pl.txt"));

    expect(result).toHaveLength(1);
    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Łukasz Kowalski", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Przekazana wiadomość");
    expect(forwarded.message).not.toContain("Temat :");
    expect(forwarded.message).not.toMatch(/Z poważaniem/);
    expect(forwarded.message).toContain("potwierdzić ten punkt?");
  });

  test("recognises a Russian forward trigger, header block, and valediction", () => {
    const result = emailParser(loadFixture("thread-forward-ru.txt"));

    expect(result).toHaveLength(1);
    const forwarded = result[0].forwardedMessage;
    expect(forwarded).not.toBeNull();
    expect(forwarded).toMatchObject({ from: "Алиса Примерова", date: "01.10.2026", time: "10:00" });
    expect(forwarded.message).not.toContain("Пересылаемое сообщение");
    expect(forwarded.message).not.toContain("Тема :");
    expect(forwarded.message).not.toMatch(/С уважением/);
    expect(forwarded.message).toContain("Можешь подтвердить этот пункт?");
  });
});
