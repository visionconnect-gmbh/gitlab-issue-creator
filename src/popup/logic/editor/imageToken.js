/**
 * @fileoverview Locates `![name](url)` Markdown image tokens in plain text.
 * DOM-free so drag-and-drop can snap a selection to a whole token.
 */

const IMAGE_TOKEN = /!\[[^\]\n]*\]\([^)\n]*\)/g;

/**
 * @param {string} text
 * @param {number} start - Selection start.
 * @param {number} end - Selection end (equal to `start` for a caret).
 * @returns {{ start: number, end: number }|null} The first token the
 *   selection lies in or overlaps, or null.
 */
export function imageTokenRange(text, start, end) {
  for (const match of text.matchAll(IMAGE_TOKEN)) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    const overlaps =
      start === end
        ? start >= tokenStart && start <= tokenEnd
        : start < tokenEnd && end > tokenStart;
    if (overlaps) return { start: tokenStart, end: tokenEnd };
  }
  return null;
}
