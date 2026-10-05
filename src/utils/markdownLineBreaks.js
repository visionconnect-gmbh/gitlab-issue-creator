/**
 * @fileoverview Converts plain-text single line breaks into Markdown hard
 * breaks (`<br>`), the way GitLab's Markdown renderer needs them to actually
 * show up as separate lines (a single `\n` is a no-op soft break in
 * CommonMark). Pure string transform, no browser APIs: shared by the
 * background's issue-creation path (messageHandler.js) and the popup's
 * live Markdown preview (editor/editor.js), so what the preview shows is
 * exactly what GitLab will render, not just a close approximation.
 */

const FENCE_DELIMITER = /^```/;
const STRUCTURAL_LINE = /^\s*(#{1,6}\s|>|[-*+]\s|\d+\.\s|\|)/;
const HORIZONTAL_RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;

function isStructuralLine(line) {
  return STRUCTURAL_LINE.test(line) || HORIZONTAL_RULE.test(line.trim());
}

/**
 * Transforms plain text to markdown by replacing single newlines with <br>.
 * Consecutive newlines (paragraph breaks) are preserved as-is, and so is
 * any line that is already part of a Markdown block construct that implies
 * its own line break (a fenced code block, including an unterminated one,
 * a table row, a list item, a blockquote, or a heading), since prefixing
 * those with <br> corrupts the Markdown rather than reformatting it.
 * @param {string} text - The input plain text.
 * @returns {string} - The transformed markdown text.
 */
export function transformToMarkdown(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE_DELIMITER.test(line)) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (inFence) {
      result.push(line);
      continue;
    }

    const next = lines[i + 1];
    const canAppendBreak =
      next !== undefined &&
      next.trim() !== "" &&
      line.trim() !== "" &&
      !isStructuralLine(line) &&
      !isStructuralLine(next);

    result.push(canAppendBreak ? `${line}<br>` : line);
  }

  return result.join("\n");
}
