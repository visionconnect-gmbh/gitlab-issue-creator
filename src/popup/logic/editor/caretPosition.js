/**
 * @fileoverview Maps a pixel position to a character offset inside a plain
 * `<textarea>`, for drag-and-drop placement. A `<textarea>` has no native
 * hit-testing API (unlike a contenteditable element), so this uses the
 * standard workaround: a hidden "mirror" `<div>` with the textarea's exact
 * font/box metrics and the textarea's own text as content, queried via
 * `document.caretPositionFromPoint()`, a Firefox API available well
 * before this add-on's `strict_min_version: "91"` floor.
 *
 * One simplification specific to this editor: `editor.js`'s
 * `autoResizeTextarea()` guarantees the textarea never scrolls internally
 * (the whole popup scrolls instead, see that file), so the mirror only
 * has to match the textarea's own box, not track a separate scroll offset.
 */

const MIRROR_COPIED_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "textIndent",
  "whiteSpace",
  "wordWrap",
  "wordBreak",
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
];

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number|null} Character offset into `textarea.value`, or null if
 *   the browser can't compute one (unsupported API, or the point is
 *   outside any text).
 */
export function textareaOffsetFromPoint(textarea, clientX, clientY) {
  if (typeof document.caretPositionFromPoint !== "function") return null;

  const rect = textarea.getBoundingClientRect();
  const mirror = document.createElement("div");
  const style = getComputedStyle(textarea);

  mirror.style.position = "fixed";
  mirror.style.top = `${rect.top}px`;
  mirror.style.left = `${rect.left}px`;
  mirror.style.width = `${rect.width}px`;
  mirror.style.height = `${rect.height}px`;
  mirror.style.overflow = "hidden";
  mirror.style.visibility = "hidden";
  // Above everything so caretPositionFromPoint hits the mirror, not
  // whatever the textarea itself renders at this same spot.
  mirror.style.zIndex = "2147483647";

  for (const prop of MIRROR_COPIED_PROPERTIES) {
    mirror.style[prop] = style[prop];
  }

  // A trailing space so a drop past the last character still resolves to
  // a text node position rather than missing the mirror's content box.
  mirror.textContent = `${textarea.value} `;

  document.body.appendChild(mirror);
  try {
    const position = document.caretPositionFromPoint(clientX, clientY);
    if (!position || !mirror.contains(position.offsetNode)) return null;
    return characterOffset(mirror, position.offsetNode, position.offset);
  } finally {
    mirror.remove();
  }
}

/** Converts a (node, offset) pair inside `root` into a plain character
 * offset from the start of `root`'s text content. */
function characterOffset(root, node, offset) {
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent.length;
    current = walker.nextNode();
  }
  return total;
}
