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
import { editor, messageData, uploadRegistry } from "./popupState.js";
import { getAttachmentFileOrNotify } from "./handler/issueHandler.js";
import { textareaOffsetFromPoint } from "./editor/caretPosition.js";

const DRAG_MIME = "application/x-gitlab-attachment";

/**
 * @param {HTMLTextAreaElement} textarea - The description textarea
 *   (`elements.issueDescription`), the same node `editor.js` wraps.
 */
export function setupAttachmentDragDrop(textarea) {
  textarea.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault(); // required for a `drop` event to fire at all
    textarea.classList.add("drop-target");
  });

  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("drop-target");
  });

  textarea.addEventListener("drop", (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    textarea.classList.remove("drop-target");
    handleDrop(e);
  });
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
  const isReposition = existingIndex !== -1;

  // Removing the old occurrence shifts everything after it left by its own
  // length, so adjust the target offset to compensate: the drop still
  // lands where the user actually pointed rather than drifting.
  const adjustedOffset =
    isReposition && existingIndex < targetOffset
      ? targetOffset - markdown.length
      : targetOffset;

  if (isReposition) editor.replace(markdown, "");
  editor.insertAt(Math.max(0, adjustedOffset), markdown);
}
