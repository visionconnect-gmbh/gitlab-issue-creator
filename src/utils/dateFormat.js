/**
 * @fileoverview Explicit parsers for the email parser's canonical date/time
 * shape ("DD.MM.YYYY" / "HH:MM[ AM/PM]", produced by
 * src/email/handler/dateAuthorHandler.js).
 *
 * Deliberately NOT `new Date(dateStr)`: that's implementation-defined for a
 * dot-separated string, and V8 silently reads it as MM.DD.YYYY instead of
 * DD.MM.YYYY whenever both components are <=12, confirmed:
 * `new Date("01.10.2026")` parses as January 10, not October 1. Parsing the
 * known shape explicitly avoids that entirely, so the resulting components
 * can be fed into `new Date(year, month - 1, day, hour, minute)` and
 * displayed via `toLocaleDateString`/`toLocaleTimeString` in the viewer's
 * own locale convention, correctly.
 */

export function parseCanonicalDate(dateStr) {
  const m = dateStr?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? { day: +m[1], month: +m[2], year: +m[3] } : null;
}

export function parseCanonicalTime(timeStr) {
  const m = timeStr?.match(/^(\d{1,2}):(\d{2})(?:\s?(AM|PM))?$/i);
  if (!m) return null;
  let hour = +m[1];
  if (m[3]) hour = (hour % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return { hour, minute: +m[2] };
}
