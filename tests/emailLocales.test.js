/**
 * @fileoverview Parity gate for src/email/locales/emailLocales.js: it fails
 * loudly if a locale is ever added with a category forgotten, instead of
 * degrading silently the way the scattered per-file literal lists used to.
 */

import { EMAIL_LOCALES, MONTH_NUMBER_BY_NAME } from "../src/email/locales/emailLocales.js";

const REQUIRED_CATEGORIES = [
  "forwardPhrases",
  "headerLabels",
  "attributionVerbs",
  "connectors",
  "valedictions",
];

describe("EMAIL_LOCALES parity", () => {
  for (const [lang, locale] of Object.entries(EMAIL_LOCALES)) {
    test(`${lang} has every required category non-empty`, () => {
      for (const category of REQUIRED_CATEGORIES) {
        const value = locale[category];
        const size = Array.isArray(value) ? value.length : Object.keys(value).length;
        expect(size).toBeGreaterThan(0);
      }
    });
  }

  // `months` is the one category allowed to be empty (English relies on
  // JS's native Date parser instead of a textual-month table).
  test("every locale declares a (possibly empty) months table", () => {
    for (const locale of Object.values(EMAIL_LOCALES)) {
      expect(typeof locale.months).toBe("object");
    }
  });

  test("no month name maps to two different numbers across locales", () => {
    const seen = {};
    for (const [lang, locale] of Object.entries(EMAIL_LOCALES)) {
      for (const [name, number] of Object.entries(locale.months)) {
        if (name in seen && seen[name].number !== number) {
          throw new Error(
            `"${name}" maps to ${seen[name].number} in ${seen[name].lang} but ${number} in ${lang}`,
          );
        }
        seen[name] = { number, lang };
      }
    }
    // Sanity: the merged table actually contains what we just checked.
    expect(Object.keys(MONTH_NUMBER_BY_NAME).length).toBeGreaterThan(0);
  });
});
