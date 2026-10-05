/**
 * @fileoverview Pixel position of the caret inside a `<textarea>`.
 *
 * Textareas have no native API for this (unlike `<input>`'s none either,
 * but at least that's single-line). The standard workaround — used by every
 * "@mention"/emoji-picker textarea library — is a hidden "mirror" element:
 * clone the textarea's text-affecting computed styles onto an offscreen
 * div, fill it with the same text up to the caret, insert a marker span at
 * that point, and read the marker's offset. Because the mirror has
 * identical font metrics/padding/wrapping, the marker lands exactly where
 * the real caret would.
 */

// Only the properties that affect text layout/wrapping need copying; colors,
// borders etc. don't change where glyphs fall.
const MIRROR_STYLE_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "textAlign",
  "wordSpacing",
];

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {number} [position] - Defaults to the current caret (`selectionEnd`).
 * @returns {{ top: number, left: number, height: number }} Position
 *   relative to the textarea's own top-left corner (i.e. already accounts
 *   for the textarea's internal scroll). Add `textarea.getBoundingClientRect()`
 *   to get viewport coordinates for a `position: fixed` element — see
 *   editor.js's `positionMentionList()`.
 */
export function getCaretCoordinates(textarea, position = textarea.selectionEnd) {
  const style = window.getComputedStyle(textarea);

  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.height = "auto";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  for (const prop of MIRROR_STYLE_PROPS) mirror.style[prop] = style[prop];

  mirror.appendChild(document.createTextNode(textarea.value.slice(0, position)));
  const marker = document.createElement("span");
  // A zero-width space gives the marker an actual box to measure; an empty
  // span can collapse to zero height in some layout engines.
  marker.textContent = "​";
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(textarea.value.slice(position)));

  document.body.appendChild(mirror);
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  const height = parseFloat(style.lineHeight) || marker.offsetHeight || 16;
  mirror.remove();

  return { top, left, height };
}
