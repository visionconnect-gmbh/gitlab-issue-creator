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

    expect(result[4].message).toContain("Anfang der weitergeleiteten Nachricht");
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

    expect(result[0].message).toContain("Moin Finn");

    expect(result[1]).toMatchObject({ from: "Karl Brenner", date: "23.09.2026", time: "17:42" });
    expect(result[1].message).toContain("Hallo Mira");
    // This is the fragment Jonas inline-quoted for context; it must not leak
    // into Karl's actual message.
    expect(result[1].message).not.toContain("Steht der Wert auf true");
    expect(result[1].forwardedMessage).not.toBeNull();
    expect(result[1].forwardedMessage.message).toContain("Bezüglich der Ehrenkarte");

    // The inline requote itself surfaces as its own (unattributed) fragment
    // instead of silently corrupting message[1].
    expect(result[2].message).toContain("Steht der Wert auf true");
  });
});
