/**
 * @fileoverview Pure Markdown editing commands.
 *
 * Every function here takes the textarea's full value plus a selection range
 * and returns the minimal contiguous replacement needed to apply the edit:
 *
 *   { text, rangeStart, rangeEnd, replacement, selectionStart, selectionEnd }
 *
 * `text` is the full resulting value (convenient for callers and tests).
 * `rangeStart`/`rangeEnd`/`replacement` describe the same edit as a single
 * splice of the ORIGINAL text, where `text === original.slice(0, rangeStart) +
 * replacement + original.slice(rangeEnd)`, so a caller can apply it to a
 * live textarea via `execCommand("insertText")` without destroying the
 * browser's native undo stack.
 *
 * No DOM, no browser globals: these run anywhere.
 */

/**
 * Wraps (or unwraps) the selection with a symmetric marker, e.g. `**` for
 * bold or `*` for italic. Toggles off if the selection is already wrapped,
 * either because the markers sit just outside it or because they're
 * included in it.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} marker
 */
export function toggleWrap(text, start, end, marker) {
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  const wrappedOutside =
    selected.length > 0 && before.endsWith(marker) && after.startsWith(marker);

  const wrappedInside =
    selected.length > marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker);

  let rangeStart, rangeEnd, replacement, selectionStart, selectionEnd;

  if (wrappedOutside) {
    rangeStart = start - marker.length;
    rangeEnd = end + marker.length;
    replacement = selected;
    selectionStart = rangeStart;
    selectionEnd = rangeStart + selected.length;
  } else if (wrappedInside) {
    rangeStart = start;
    rangeEnd = end;
    replacement = selected.slice(marker.length, selected.length - marker.length);
    selectionStart = start;
    selectionEnd = start + replacement.length;
  } else {
    rangeStart = start;
    rangeEnd = end;
    replacement = marker + selected + marker;
    selectionStart = start + marker.length;
    selectionEnd = selectionStart + selected.length;
  }

  const newText = text.slice(0, rangeStart) + replacement + text.slice(rangeEnd);
  return { text: newText, rangeStart, rangeEnd, replacement, selectionStart, selectionEnd };
}

/**
 * Finds the line(s) covering [start, end] in `text`.
 * @returns {{ lineStart: number, lineEnd: number }}
 */
function getLineBlockBounds(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  return { lineStart, lineEnd };
}

/**
 * Toggles a static line prefix (e.g. `"> "`, `"- "`, `"## "`) across every
 * line touched by the selection. Removes it from every line if all
 * non-empty lines already carry it; otherwise adds it to every non-empty
 * line that lacks it.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} prefix
 */
export function toggleLinePrefix(text, start, end, prefix) {
  const { lineStart, lineEnd } = getLineBlockBounds(text, start, end);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");

  const nonEmpty = lines.filter((l) => l.length > 0);
  const shouldRemove = nonEmpty.length > 0 && nonEmpty.every((l) => l.startsWith(prefix));

  let oldOffset = lineStart;
  let newOffset = lineStart;
  let selectionStart = null;
  let selectionEnd = null;
  const newLines = [];

  for (const line of lines) {
    const oldLineStart = oldOffset;
    const oldLineEnd = oldLineStart + line.length;

    let newLine = line;
    let pad = 0;
    if (shouldRemove) {
      if (line.startsWith(prefix)) {
        newLine = line.slice(prefix.length);
        pad = -prefix.length;
      }
    } else if (line.length > 0 && !line.startsWith(prefix)) {
      newLine = prefix + line;
      pad = prefix.length;
    }

    const mapPos = (pos) => {
      const inLine = pos - oldLineStart;
      const clampedPad = pad < 0 ? Math.max(-inLine, pad) : pad;
      return newOffset + inLine + clampedPad;
    };

    if (start >= oldLineStart && start <= oldLineEnd) selectionStart = mapPos(start);
    if (end >= oldLineStart && end <= oldLineEnd) selectionEnd = mapPos(end);

    newLines.push(newLine);
    oldOffset = oldLineEnd + 1; // +1 for the '\n'
    newOffset = newOffset + newLine.length + 1;
  }

  const replacement = newLines.join("\n");
  const newText = text.slice(0, lineStart) + replacement + text.slice(lineEnd);

  return {
    text: newText,
    rangeStart: lineStart,
    rangeEnd: lineEnd,
    replacement,
    selectionStart: selectionStart ?? start,
    selectionEnd: selectionEnd ?? end,
  };
}

const ORDERED_PREFIX = /^\d+\.\s/;

/**
 * Toggles a numbered-list prefix ("1. ", "2. ", ...) across every line
 * touched by the selection, renumbering sequentially from 1.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
export function toggleOrderedList(text, start, end) {
  const { lineStart, lineEnd } = getLineBlockBounds(text, start, end);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");

  const nonEmpty = lines.filter((l) => l.length > 0);
  const shouldRemove = nonEmpty.length > 0 && nonEmpty.every((l) => ORDERED_PREFIX.test(l));

  let n = 1;
  let oldOffset = lineStart;
  let newOffset = lineStart;
  let selectionStart = null;
  let selectionEnd = null;
  const newLines = [];

  for (const line of lines) {
    const oldLineStart = oldOffset;
    const oldLineEnd = oldLineStart + line.length;

    let newLine = line;
    let removedLen = 0;
    let addedLen = 0;

    if (shouldRemove) {
      const m = line.match(ORDERED_PREFIX);
      if (m) {
        newLine = line.slice(m[0].length);
        removedLen = m[0].length;
      }
    } else if (line.length > 0 && !ORDERED_PREFIX.test(line)) {
      const marker = `${n}. `;
      newLine = marker + line;
      addedLen = marker.length;
      n++;
    }

    const mapPos = (pos) => {
      const inLine = pos - oldLineStart;
      if (shouldRemove) return newOffset + Math.max(0, inLine - removedLen);
      return newOffset + inLine + addedLen;
    };

    if (start >= oldLineStart && start <= oldLineEnd) selectionStart = mapPos(start);
    if (end >= oldLineStart && end <= oldLineEnd) selectionEnd = mapPos(end);

    newLines.push(newLine);
    oldOffset = oldLineEnd + 1;
    newOffset = newOffset + newLine.length + 1;
  }

  const replacement = newLines.join("\n");
  const newText = text.slice(0, lineStart) + replacement + text.slice(lineEnd);

  return {
    text: newText,
    rangeStart: lineStart,
    rangeEnd: lineEnd,
    replacement,
    selectionStart: selectionStart ?? start,
    selectionEnd: selectionEnd ?? end,
  };
}

/**
 * Wraps the selection (or inserts at the caret) as a Markdown link.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} url
 */
export function insertLink(text, start, end, url) {
  return insertLinkLike(text, start, end, url, false);
}

/**
 * Wraps the selection (or inserts at the caret) as a Markdown image.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} url
 */
export function insertImage(text, start, end, url) {
  return insertLinkLike(text, start, end, url, true);
}

function insertLinkLike(text, start, end, url, isImage) {
  const selected = text.slice(start, end);
  const label = selected || (isImage ? "image" : "link text");
  const replacement = `${isImage ? "!" : ""}[${label}](${url})`;

  const newText = text.slice(0, start) + replacement + text.slice(end);
  const labelStart = start + (isImage ? 2 : 1);
  const labelEnd = labelStart + label.length;

  return {
    text: newText,
    rangeStart: start,
    rangeEnd: end,
    replacement,
    selectionStart: labelStart,
    selectionEnd: labelEnd,
  };
}

/**
 * Splices a ready-made string in at the cursor (or in place of the current
 * selection), collapsing the selection to just after it. Unlike
 * `insertLink`/`insertImage`, which wrap user-typed/selected text in
 * Markdown syntax, this inserts `raw` verbatim: for a fragment that's
 * already complete Markdown, such as GitLab's own upload response.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} raw
 */
export function insertRawText(text, start, end, raw) {
  const newText = text.slice(0, start) + raw + text.slice(end);
  const caret = start + raw.length;

  return {
    text: newText,
    rangeStart: start,
    rangeEnd: end,
    replacement: raw,
    selectionStart: caret,
    selectionEnd: caret,
  };
}
