/**
 * @fileoverview Minimal native-textarea Markdown editor.
 *
 * Replaces the EasyMDE instance that used to live in popupState.js. The
 * textarea's `value` and `selectionStart`/`selectionEnd` ARE the editor's
 * state: there is no parallel document model, no command registry, no
 * plugin system. Toolbar buttons and keyboard shortcuts just compute a
 * replacement (see commands.js) and apply it.
 *
 * API surface mirrors the one EasyMDE call the rest of the app used:
 * `editor.value()` / `editor.value(str)`.
 */
import {
  toggleWrap,
  toggleLinePrefix,
  toggleOrderedList,
  insertLink,
  insertRawText,
} from "./commands.js";
import { parseMarkdown, isSafeUrl } from "./markdown.js";
import { renderBlocks } from "./preview.js";
import { buildIcon, ICONS } from "./icons.js";
import { findActiveMentionQuery, filterMentionCandidates, formatMentionLabel } from "./mention.js";
import { getCaretCoordinates } from "./caretCoords.js";
import { setCache, resetCache } from "../../../utils/cache.js";
import { LocalizeKeys } from "../../../utils/Enums.js";
import { transformToMarkdown } from "../../../utils/markdownLineBreaks.js";

const TOOLTIPS = LocalizeKeys.EDITOR.TOOLTIPS;
const MENTION = LocalizeKeys.EDITOR.MENTION;

function msg(key, fallback) {
  const text = typeof browser !== "undefined" ? browser.i18n?.getMessage(key) : null;
  return text || fallback;
}

// Toolbar order, grouping and separators match the EasyMDE `toolbar:` array
// this replaces, so muscle memory from the old editor still works. Bold/
// italic/heading/guide render as plain text glyphs (that's what the old
// icon font did too: fa-bold/fa-italic/fa-header are stylized letters);
// everything else gets a hand-built inline SVG icon (icons.js) rather than
// an emoji, which renders inconsistently across platforms/fonts.
const BUTTON_DEFS = [
  { id: "bold", text: "B", strong: true, key: "b", titleKey: TOOLTIPS.BOLD, fallback: "Bold (Ctrl+B)", apply: (t, s, e) => toggleWrap(t, s, e, "**") },
  { id: "italic", text: "I", em: true, key: "i", titleKey: TOOLTIPS.ITALIC, fallback: "Italic (Ctrl+I)", apply: (t, s, e) => toggleWrap(t, s, e, "*") },
  { id: "heading", text: "H", titleKey: TOOLTIPS.HEADING, fallback: "Heading", apply: (t, s, e) => toggleLinePrefix(t, s, e, "## ") },
  { sep: true },
  { id: "quote", icon: "quote", titleKey: TOOLTIPS.QUOTE, fallback: "Quote", apply: (t, s, e) => toggleLinePrefix(t, s, e, "> ") },
  { id: "unordered-list", icon: "unorderedList", titleKey: TOOLTIPS.UNORDERED_LIST, fallback: "Bulleted list", apply: (t, s, e) => toggleLinePrefix(t, s, e, "- ") },
  { id: "ordered-list", icon: "orderedList", titleKey: TOOLTIPS.ORDERED_LIST, fallback: "Numbered list", apply: toggleOrderedList },
  { sep: true },
  { id: "link", icon: "link", key: "k", needsUrl: true, titleKey: TOOLTIPS.LINK, fallback: "Link (Ctrl+K)", apply: (t, s, e, url) => insertLink(t, s, e, url) },
  { id: "image", icon: "image", pickFile: true, titleKey: TOOLTIPS.IMAGE, fallback: "Upload image" },
  { id: "mention", icon: "at", titleKey: TOOLTIPS.MENTION, fallback: "Mention someone", apply: (t, s, e) => insertRawText(t, s, e, "@") },
  { sep: true },
  { id: "preview", icon: "eye", toggle: true, titleKey: TOOLTIPS.PREVIEW, fallback: "Preview" },
  { id: "fullscreen", icon: "expand", toggle: true, titleKey: TOOLTIPS.FULLSCREEN, fallback: "Fullscreen" },
  { sep: true },
  { id: "guide", text: "?", href: "https://www.markdownguide.org/basic-syntax/", titleKey: TOOLTIPS.GUIDE, fallback: "Markdown guide" },
];

const AUTOSAVE_DELAY_MS = 1000;
// A day is plenty for "survives an accidental window close" without
// keeping email-derived text around indefinitely the way the old
// unbounded localStorage autosave did.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {{ draftCacheKey?: string, onPickImage?: (file: File) => Promise<{markdown: string}|null>, getMentionCandidates?: () => Array<{id: number|string, username: string, name?: string}>, onUserInput?: () => void }} [options]
 * @returns {{ value: (v?: string) => string|undefined, replace: (search: string, replacement: string) => boolean, insertAtEnd: (raw: string) => void, insertAt: (offset: number, raw: string) => void, clearDraft: () => void, destroy: () => void }}
 */
export function createEditor(textarea, { draftCacheKey, onPickImage, getMentionCandidates, onUserInput } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "md-editor";
  textarea.parentNode.insertBefore(wrapper, textarea);

  const toolbar = document.createElement("div");
  toolbar.className = "md-toolbar";
  toolbar.setAttribute("role", "toolbar");

  const urlPrompt = buildUrlPrompt();

  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.hidden = true;
  imageInput.className = "md-image-input";

  const preview = document.createElement("div");
  preview.className = "md-preview";
  preview.hidden = true;

  const mentionList = document.createElement("ul");
  mentionList.className = "md-mention-list";
  mentionList.setAttribute("role", "listbox");
  mentionList.hidden = true;

  textarea.classList.add("md-textarea");
  wrapper.append(toolbar, urlPrompt.element, imageInput, textarea, preview, mentionList);

  let pendingUrlDef = null;
  let autosaveTimer = null;
  let destroyed = false;

  // Active `@word` token under the caret, or null when the dropdown is
  // closed. `activeIndex` is -1 only while `candidates` is empty (query
  // active, nothing matched yet) so the "no matches" row isn't selectable.
  let mention = null; // { start, end, query, candidates, activeIndex }

  function setPressed(id, pressed) {
    const btn = toolbar.querySelector(`[data-command="${id}"]`);
    if (btn) btn.setAttribute("aria-pressed", String(pressed));
  }

  function refreshPreview() {
    if (preview.hidden) return;
    // Apply the same <br>-insertion GitLab submission applies (messageHandler.js),
    // so a single line break in the textarea previews exactly as it will render
    // in the created issue, instead of silently soft-wrapping into one line.
    renderBlocks(parseMarkdown(transformToMarkdown(textarea.value)), preview);
  }

  /** Grows the textarea to fit its content so the POPUP scrolls (one
   * scrollbar for the whole window), rather than the textarea scrolling
   * internally. Skipped in fullscreen, where the editor is bounded to the
   * viewport and the textarea's own native scrolling is what you want,
   * and skipped while hidden (behind the preview), since a hidden element's
   * `scrollHeight` is 0 and would collapse it to nothing. */
  function autoResizeTextarea() {
    if (destroyed || textarea.hidden || wrapper.classList.contains("md-fullscreen")) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function scheduleAutosave() {
    if (!draftCacheKey) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      setCache(draftCacheKey, textarea.value, { ttlMs: DRAFT_TTL_MS });
    }, AUTOSAVE_DELAY_MS);
  }

  /** Applies a command result, preferring execCommand so native undo keeps working. */
  function applyResult(result) {
    closeMention(); // offsets a command computed are about to go stale
    textarea.focus();
    textarea.setSelectionRange(result.rangeStart, result.rangeEnd);

    let applied = false;
    try {
      applied = document.execCommand("insertText", false, result.replacement);
    } catch {
      applied = false;
    }
    if (!applied || textarea.value !== result.text) {
      // Fallback: execCommand unsupported/blocked. Undo no longer crosses
      // this edit, but the edit itself still applies correctly.
      textarea.value = result.text;
    }

    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    autoResizeTextarea();
    refreshPreview();
    scheduleAutosave();
  }

  function runCommand(apply, url) {
    const { selectionStart, selectionEnd, value } = textarea;
    applyResult(apply(value, selectionStart, selectionEnd, url));
  }

  function closeMention() {
    if (!mention && mentionList.hidden) return;
    mention = null;
    mentionList.hidden = true;
    mentionList.replaceChildren();
  }

  function renderMentionList() {
    mentionList.replaceChildren();

    if (!mention.candidates.length) {
      const li = document.createElement("li");
      li.className = "md-mention-empty";
      li.textContent = msg(MENTION.EMPTY, "No matching members");
      mentionList.appendChild(li);
    } else {
      mention.candidates.forEach((candidate, index) => {
        const li = document.createElement("li");
        li.className = "md-mention-item";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(index === mention.activeIndex));
        li.classList.toggle("active", index === mention.activeIndex);
        li.textContent = formatMentionLabel(candidate);
        // mousedown (not click): fires before the textarea's blur, so focus
        // never leaves it and the caret position captured in `mention`
        // stays valid when acceptMention() runs.
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          acceptMention(candidate);
        });
        mentionList.appendChild(li);
      });
    }

    mentionList.hidden = false;
  }

  /** Positions the dropdown via viewport coordinates (`position: fixed` in
   * CSS), not relative to the wrapper: `.md-editor` clips overflow for its
   * rounded corners, which would otherwise cut the dropdown off whenever it
   * needs to extend below the editor's own bounds. */
  function positionMentionList() {
    const rect = textarea.getBoundingClientRect();
    const { top, left, height } = getCaretCoordinates(textarea);
    mentionList.style.top = `${rect.top + top + height}px`;
    mentionList.style.left = `${rect.left + left}px`;
  }

  /** Recomputes mention state from the current caret/text: finds the active
   * `@query` token (if any), filters the available candidates, and renders
   * the dropdown accordingly. Call after anything that could move the
   * caret or change the text. */
  function updateMention() {
    if (destroyed) return;
    if (textarea.selectionStart !== textarea.selectionEnd) return closeMention();

    const match = findActiveMentionQuery(textarea.value, textarea.selectionStart);
    if (!match) return closeMention();

    const candidates = filterMentionCandidates(getMentionCandidates?.() ?? [], match.query);
    mention = { ...match, candidates, activeIndex: candidates.length ? 0 : -1 };
    renderMentionList();
    positionMentionList();
  }

  function moveMentionActive(delta) {
    if (!mention?.candidates.length) return;
    const count = mention.candidates.length;
    mention.activeIndex = (mention.activeIndex + delta + count) % count;
    renderMentionList();
  }

  function acceptMention(candidate) {
    if (!mention) return;
    const { start, end } = mention;
    applyResult(insertRawText(textarea.value, start, end, `@${candidate.username} `));
    closeMention();
  }

  /** Swaps the preview IN PLACE OF the textarea (not alongside it), like
   * the old editor's preview mode did: only one of the two is ever shown. */
  function togglePreview() {
    const showingPreview = !preview.hidden;
    if (showingPreview) {
      preview.hidden = true;
      textarea.hidden = false;
      autoResizeTextarea(); // textarea was hidden, so it never auto-grew while content changed
      setPressed("preview", false);
      textarea.focus();
    } else {
      textarea.hidden = true;
      preview.hidden = false;
      refreshPreview();
      setPressed("preview", true);
    }
  }

  function toggleFullscreen() {
    const enteringFullscreen = !wrapper.classList.contains("md-fullscreen");
    wrapper.classList.toggle("md-fullscreen");
    setPressed("fullscreen", enteringFullscreen);
    if (enteringFullscreen) {
      // Hand sizing over to the flex layout (CSS) instead of our inline height.
      textarea.style.height = "";
    } else {
      autoResizeTextarea();
    }
  }

  function activate(def) {
    if (destroyed) return;
    if (def.href) {
      window.open(def.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (def.id === "preview") return togglePreview();
    if (def.id === "fullscreen") return toggleFullscreen();
    if (def.pickFile) {
      // Must be called synchronously within this click handler: browsers
      // only honor a programmatic file-dialog trigger within the same
      // synchronous task as a real user gesture.
      imageInput.click();
      return;
    }
    if (def.needsUrl) {
      pendingUrlDef = def;
      urlPrompt.show();
      return;
    }
    runCommand(def.apply);
    // Opens the dropdown with an empty query, same as if the user had just
    // typed "@" themselves. A no-op (closeMention via updateMention) if the
    // caret isn't in a valid mention position, e.g. right after a word.
    if (def.id === "mention") updateMention();
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    imageInput.value = ""; // reset so re-picking the same file still fires change
    if (!file || !onPickImage) return;

    const button = toolbar.querySelector('[data-command="image"]');
    if (button) button.disabled = true;
    try {
      const result = await onPickImage(file);
      if (result?.markdown) {
        const { selectionStart, selectionEnd, value } = textarea;
        applyResult(insertRawText(value, selectionStart, selectionEnd, result.markdown));
      }
      // A falsy result means onPickImage already notified the user, so there is nothing more to do here.
    } finally {
      if (button) button.disabled = false;
    }
  });

  urlPrompt.onConfirm((rawUrl) => {
    const url = rawUrl.trim();
    if (!isSafeUrl(url)) {
      urlPrompt.showError(
        msg(LocalizeKeys.EDITOR.ERRORS.INVALID_URL, "Enter a valid http(s) or mailto link."),
      );
      return;
    }
    urlPrompt.hide();
    const def = pendingUrlDef;
    pendingUrlDef = null;
    if (def) runCommand(def.apply, url);
  });
  urlPrompt.onCancel(() => {
    urlPrompt.hide();
    pendingUrlDef = null;
    textarea.focus();
  });

  for (const def of BUTTON_DEFS) toolbar.appendChild(buildButton(def, activate));

  function onKeydown(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const def = BUTTON_DEFS.find((d) => d.key && d.key === e.key.toLowerCase());
    if (!def) return;
    e.preventDefault();
    activate(def);
  }

  /** Keyboard nav for the open mention dropdown. Separate from onKeydown
   * above: these are unmodified keys (plain ArrowDown, not Ctrl+something),
   * and only mean anything while the dropdown is actually open. */
  function onMentionKeydown(e) {
    if (!mention) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveMentionActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveMentionActive(-1);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (mention.activeIndex < 0) return;
      e.preventDefault();
      acceptMention(mention.candidates[mention.activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMention();
    }
  }

  function onInput() {
    autoResizeTextarea();
    refreshPreview();
    scheduleAutosave();
    updateMention();
    onUserInput?.();
  }

  /** Recomputes mention state after the caret moves without an `input`
   * event: arrow/Home/End navigation or a mouse click. */
  function onCaretMoved(e) {
    if (e.type === "keyup" && !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    updateMention();
  }

  /** Keeps the (viewport-positioned) dropdown aligned with the caret while
   * it's open, across the popup's own page scroll (see autoResizeTextarea's
   * comment: the popup scrolls as a whole) and any window resize. `true`
   * (capture) also catches scrolling on an ancestor scroll container, not
   * just the window itself. */
  function onViewportChange() {
    if (mention) positionMentionList();
  }

  textarea.addEventListener("keydown", onKeydown);
  textarea.addEventListener("keydown", onMentionKeydown);
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("keyup", onCaretMoved);
  textarea.addEventListener("click", onCaretMoved);
  textarea.addEventListener("blur", closeMention);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);

  // Deliberately no read-side restore here: the popup always regenerates the
  // description from the selected email right after construction (see
  // projectHandler.js), which would immediately overwrite anything restored.
  // That was true under the old EasyMDE autosave too, so a draft never actually
  // survived a reopen in practice. Keeping only the write side (below) plus
  // explicit `clearDraft()` avoids a storage-read race for no behavioural
  // gain.

  function value(newValue) {
    if (newValue === undefined) return textarea.value;
    textarea.value = newValue;
    closeMention();
    autoResizeTextarea();
    refreshPreview();
    return undefined;
  }

  /** Swaps the first occurrence of `search` for `replacement`. Programmatic,
   * like `value()`: does not focus the textarea (so it can run on a timer
   * without stealing focus from wherever the user actually is) and does not
   * fire `onUserInput`. Returns false when `search` is no longer present. */
  function replace(search, replacement) {
    const start = textarea.value.indexOf(search);
    if (start === -1) return false;

    closeMention();

    const focused = document.activeElement === textarea;
    const { selectionStart, selectionEnd } = textarea;
    const delta = replacement.length - search.length;

    textarea.value =
      textarea.value.slice(0, start) +
      replacement +
      textarea.value.slice(start + search.length);

    if (focused) {
      textarea.setSelectionRange(
        selectionStart > start ? selectionStart + delta : selectionStart,
        selectionEnd > start ? selectionEnd + delta : selectionEnd,
      );
    }

    autoResizeTextarea();
    refreshPreview();
    scheduleAutosave();
    return true;
  }

  /** Appends `raw` at the end of the current text (separated by a blank
   * line from any existing content), without touching focus or selection:
   * same non-disruptive contract as `replace()`. Used when checking an
   * attachment: its placeholder lands at the end, exactly like picking an
   * image lands one at the cursor. */
  function insertAtEnd(raw) {
    const current = textarea.value;
    const offset = current.length;
    const separator = current.trim() ? "\n\n" : "";
    insertAtOffset(offset, separator + raw);
  }

  /** Splices `raw` in at an arbitrary character offset, used by
   * drag-and-drop to place an attachment exactly where it was dropped.
   * Does not focus the textarea or move the caret to the insertion point
   * (the drop already happened at a specific pixel, not via keyboard
   * focus), but does preserve the user's existing selection the same way
   * `replace()` does. */
  function insertAt(offset, raw) {
    insertAtOffset(offset, raw);
  }

  function insertAtOffset(offset, raw) {
    closeMention();
    const focused = document.activeElement === textarea;
    const { selectionStart, selectionEnd } = textarea;
    const result = insertRawText(textarea.value, offset, offset, raw);

    textarea.value = result.text;

    if (focused) {
      const delta = raw.length;
      textarea.setSelectionRange(
        selectionStart > offset ? selectionStart + delta : selectionStart,
        selectionEnd > offset ? selectionEnd + delta : selectionEnd,
      );
    }

    autoResizeTextarea();
    refreshPreview();
    scheduleAutosave();
  }

  function clearDraft() {
    if (draftCacheKey) resetCache(draftCacheKey);
  }

  function destroy() {
    destroyed = true;
    clearTimeout(autosaveTimer);
    textarea.removeEventListener("keydown", onKeydown);
    textarea.removeEventListener("keydown", onMentionKeydown);
    textarea.removeEventListener("input", onInput);
    textarea.removeEventListener("keyup", onCaretMoved);
    textarea.removeEventListener("click", onCaretMoved);
    textarea.removeEventListener("blur", closeMention);
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
    wrapper.replaceWith(textarea);
    textarea.classList.remove("md-textarea");
    textarea.style.height = "";
  }

  autoResizeTextarea();

  return { value, replace, insertAtEnd, insertAt, clearDraft, destroy };
}

function buildButton(def, onActivate) {
  if (def.sep) {
    const el = document.createElement("span");
    el.className = "md-toolbar-separator";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  const el = document.createElement("button");
  el.type = "button";
  el.className = "md-toolbar-button";
  el.dataset.command = def.id;
  if (def.icon) {
    el.appendChild(buildIcon(ICONS[def.icon]));
  } else {
    if (def.strong) el.style.fontWeight = "700";
    if (def.em) el.style.fontStyle = "italic";
    el.textContent = def.text;
  }

  const title = msg(def.titleKey, def.fallback);
  el.title = title;
  el.setAttribute("aria-label", title);
  if (def.toggle) el.setAttribute("aria-pressed", "false");

  el.addEventListener("click", () => onActivate(def));
  return el;
}

/**
 * The inline "enter a URL" prompt shown for the link/image buttons.
 * Deliberately not `window.prompt()`, so invalid input can be explained
 * inline instead of via `alert()`.
 */
function buildUrlPrompt() {
  const element = document.createElement("div");
  element.className = "md-url-prompt";
  element.hidden = true;

  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = msg(LocalizeKeys.EDITOR.URL_PROMPT.PLACEHOLDER, "https://...");

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "md-toolbar-button";
  confirmBtn.appendChild(buildIcon(ICONS.check));
  confirmBtn.title = msg(LocalizeKeys.EDITOR.URL_PROMPT.CONFIRM, "Insert");
  confirmBtn.setAttribute("aria-label", confirmBtn.title);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "md-toolbar-button";
  cancelBtn.appendChild(buildIcon(ICONS.close));
  cancelBtn.title = msg(LocalizeKeys.EDITOR.URL_PROMPT.CANCEL, "Cancel");
  cancelBtn.setAttribute("aria-label", cancelBtn.title);

  const error = document.createElement("span");
  error.className = "md-url-prompt-error";
  error.hidden = true;

  element.append(input, confirmBtn, cancelBtn, error);

  let confirmHandler = () => {};
  let cancelHandler = () => {};

  confirmBtn.addEventListener("click", () => confirmHandler(input.value));
  cancelBtn.addEventListener("click", () => cancelHandler());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmHandler(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelHandler();
    }
  });

  return {
    element,
    onConfirm(fn) {
      confirmHandler = fn;
    },
    onCancel(fn) {
      cancelHandler = fn;
    },
    show() {
      input.value = "";
      error.hidden = true;
      element.hidden = false;
      input.focus();
    },
    hide() {
      element.hidden = true;
    },
    showError(message) {
      error.textContent = message;
      error.hidden = false;
    },
  };
}
