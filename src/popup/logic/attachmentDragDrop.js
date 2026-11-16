/**
 * @fileoverview Wires drag-and-drop placement of email attachments onto the
 * description textarea. The attachment picker modal (`ui.js`) is the drag
 * source (see its `draggable`/`getDragPayload` config); this module owns
 * the drop target.
 *
 * Deliberately kept separate from `editor.js` (stays a domain-agnostic
 * markdown editor, knows nothing about attachments) and `uploadRegistry.js`
 * (stays DOM-free): this is the one place that knows about both.
 */
import { editor, messageData, pickerModal, uploadRegistry } from "./popupState.js";
import { getAttachmentFileOrNotify } from "./handler/issueHandler.js";
import { textareaOffsetFromPoint } from "./editor/caretPosition.js";
import { imageTokenRange } from "./editor/imageToken.js";

const DRAG_MIME = "application/x-gitlab-attachment";
const MOVE_MIME = "application/x-md-token-move";

function isOurDrag(e) {
  const types = e.dataTransfer.types;
  return types.includes(DRAG_MIME) || types.includes(MOVE_MIME);
}

/**
 * @param {HTMLTextAreaElement} textarea - The description textarea
 *   (`elements.issueDescription`), the same node `editor.js` wraps.
 */
export function setupAttachmentDragDrop(textarea) {
  // Snap a drag that starts on an image token to the whole token, so it
  // moves as one unit instead of leaving half of it behind.
  textarea.addEventListener("dragstart", (e) => {
    const range = imageTokenRange(textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (!range) return;
    textarea.setSelectionRange(range.start, range.end);
    const text = textarea.value.slice(range.start, range.end);
    e.dataTransfer.setData("text/plain", text);
    e.dataTransfer.setData(MOVE_MIME, JSON.stringify({ ...range, text }));
  });

  textarea.addEventListener("dragover", (e) => {
    if (!isOurDrag(e)) return;
    e.preventDefault(); // required for a `drop` event to fire at all
    textarea.classList.add("drop-target");
  });

  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("drop-target");
  });

  textarea.addEventListener("drop", (e) => {
    if (!isOurDrag(e)) return;
    e.preventDefault(); // also stops the browser's own text move
    textarea.classList.remove("drop-target");
    if (e.dataTransfer.types.includes(MOVE_MIME)) handleMove(e);
    else handleDrop(e);
  });
}

function handleMove(e) {
  let move;
  try {
    move = JSON.parse(e.dataTransfer.getData(MOVE_MIME));
  } catch {
    return;
  }

  const textarea = e.currentTarget;
  if (textarea.value.slice(move.start, move.end) !== move.text) return;

  const target = textareaOffsetFromPoint(textarea, e.clientX, e.clientY);
  if (target === null) return;
  editor.moveRange(move.start, move.end, target);
}

function handleDrop(e) {
  let payload;
  try {
    payload = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
  } catch {
    return;
  }

  const attachment = (messageData?.attachments || []).find(
    (a) => a.partName === payload?.partName,
  );
  if (!attachment) return;

  const textarea = e.currentTarget;

  // Idempotent: registers the attachment if it isn't already (the drop
  // implicitly "checks" it), or just returns the existing entry's current
  // markdown without any side effect: either way this is the string that
  // belongs in the text.
  const markdown = uploadRegistry.addAttachment(attachment, () =>
    getAttachmentFileOrNotify(attachment),
  );

  // Measured against the textarea as it is right now, before any edit:
  // the drop coordinates are only valid against this exact layout.
  const rawOffset = textareaOffsetFromPoint(textarea, e.clientX, e.clientY);
  const targetOffset = rawOffset ?? textarea.value.length;

  const existingIndex = textarea.value.indexOf(markdown);
  if (existingIndex !== -1) {
    editor.moveRange(existingIndex, existingIndex + markdown.length, targetOffset);
  } else {
    editor.insertAt(targetOffset, markdown);
  }

  // The drop registers the attachment, so its checkbox must now show checked.
  pickerModal.refresh();
}
