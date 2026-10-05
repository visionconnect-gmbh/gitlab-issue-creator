import { LocalizeKeys } from "../../utils/Enums.js";
import {
  elements,
  filteredProjects,
  selectedProjectId,
  currentAssignees,
  selectedAssigneeId,
  editor,
  messageData,
  pickerModal,
  uploadRegistry,
} from "./popupState.js";
import { getAttachmentFileOrNotify } from "./handler/issueHandler.js";

/** Whether a server-side project search is currently in flight. Rendered as
 * a trailing "Searching…" row in the suggestion listbox rather than
 * replacing it, so the locally-matched (cached-page) results stay visible
 * while the server result is still pending. */
let isSearching = false;

/** @param {boolean} value */
export function setSearchingIndicator(value) {
  isSearching = value;
}

/** Whether the initial project page has not arrived yet. Distinguishes an
 * empty combobox during the cold fetch from "you genuinely have no
 * projects"; cleared on the first PROJECT_LIST, never set again. */
let projectsLoading = true;

/** @param {boolean} value */
export function setProjectsLoading(value) {
  projectsLoading = value;
}

/**
 * Renders the project suggestion listbox options based on filteredProjects.
 */
export function renderProjectSuggestions() {
  elements.projectSuggestions.replaceChildren();

  if (projectsLoading && filteredProjects.length === 0 && !isSearching) {
    const loadingItem = document.createElement("li");
    loadingItem.className = "combobox-option combobox-status";
    loadingItem.setAttribute("aria-disabled", "true");
    loadingItem.textContent =
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.PROJECTS_LOADING) ||
      "Loading projects…";
    elements.projectSuggestions.appendChild(loadingItem);
    return;
  }

  filteredProjects.forEach((proj) => {
    const name =
      proj.name ||
      proj.name_with_namespace ||
      browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_PROJECT_NAME) ||
      "No project name";
    // name_with_namespace is "<group> / <subgroup> / <name>", the group
    // path is everything before that last segment.
    const path = proj.name_with_namespace
      ? proj.name_with_namespace.split(" / ").slice(0, -1).join(" / ")
      : "";

    const option = document.createElement("li");
    option.id = `project-option-${proj.id}`;
    option.className = "combobox-option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(proj.id === selectedProjectId));
    option.dataset.projectId = String(proj.id);

    const nameEl = document.createElement("span");
    nameEl.className = "combobox-option-name";
    nameEl.textContent = name;
    option.appendChild(nameEl);

    if (path) {
      const pathEl = document.createElement("span");
      pathEl.className = "combobox-option-path";
      pathEl.textContent = path;
      option.appendChild(pathEl);
    }

    elements.projectSuggestions.appendChild(option);
  });

  if (isSearching) {
    const searchingItem = document.createElement("li");
    searchingItem.className = "combobox-option combobox-status";
    searchingItem.setAttribute("aria-disabled", "true");
    searchingItem.textContent =
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.PROJECTS_SEARCHING) ||
      "Searching…";
    elements.projectSuggestions.appendChild(searchingItem);
  }
}

/** Shows the project suggestion listbox. */
export function showProjectSuggestions() {
  elements.projectSuggestions.hidden = false;
  elements.projectSearch.setAttribute("aria-expanded", "true");
}

/** Hides the project suggestion listbox and clears keyboard-active state. */
export function hideProjectSuggestions() {
  elements.projectSuggestions.hidden = true;
  elements.projectSearch.setAttribute("aria-expanded", "false");
  setActiveProjectOption(-1);
}

/** Marks the option at `index` as the keyboard-active one (or clears it for
 * a negative index), and points the input's aria-activedescendant at it.
 * @param {number} index
 */
export function setActiveProjectOption(index) {
  const options = [...elements.projectSuggestions.children];
  options.forEach((opt) => opt.classList.remove("active"));

  const active = options[index];
  if (active) {
    active.classList.add("active");
    elements.projectSearch.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  } else {
    elements.projectSearch.removeAttribute("aria-activedescendant");
  }
}

/** Updates the visible "selected project" hint and the input's committed
 * styling. Pass `null` to show the no-project-selected hint.
 * @param {{ name?: string, name_with_namespace?: string }|null} project
 */
export function updateProjectSelectedState(project) {
  const stateEl = elements.projectSelectedState;
  const input = elements.projectSearch;

  if (project) {
    stateEl.textContent = project.name_with_namespace || project.name || "";
    stateEl.classList.add("committed");
    input.classList.add("committed");
  } else {
    stateEl.textContent =
      browser.i18n.getMessage(LocalizeKeys.POPUP.COMBOBOX.NO_PROJECT_SELECTED) ||
      "No project selected: select one to enable assignees, labels, and issue creation";
    stateEl.classList.remove("committed");
    input.classList.remove("committed");
  }
}

/** Shows/hides the notice that the project list is being served from cache
 * because a background refresh failed: see gitlab.js's `onStale` callback.
 * Never implies the data is wrong, only that it may not be current. */
export function showProjectsStaleNotice() {
  elements.projectsStaleNotice.hidden = false;
}

export function hideProjectsStaleNotice() {
  elements.projectsStaleNotice.hidden = true;
}

/** Shows/hides the inline error near the Create button for a failed issue
 * creation: the OS notification alone is too easy to miss. */
export function showCreateError() {
  elements.createError.hidden = false;
}

export function hideCreateError() {
  elements.createError.hidden = true;
}

/**
 * Renders the assignees in the select element based on currentAssignees.
 */
export function renderAssignees() {
  elements.assigneeSelect.replaceChildren();

  if (!currentAssignees.length) {
    elements.assigneeSelect.disabled = true;

    const noAssigneesFoundMessage =
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ASSIGNEES_FOUND) ||
      "No assignees found.";

    const option = document.createElement("option");
    option.textContent = noAssigneesFoundMessage;
    elements.assigneeSelect.appendChild(option);

    return;
  }

  elements.assigneeSelect.disabled = false;

  currentAssignees.forEach((assignee) => {
    const option = document.createElement("option");
    option.value = assignee.id;
    option.textContent =
      assignee.name ||
      assignee.username ||
      browser.i18n.getMessage(LocalizeKeys.FALLBACK.UNKNOWN_ASSIGNEE) ||
      "Unknown assignee";
    elements.assigneeSelect.appendChild(option);
  });

  if (selectedAssigneeId) {
    elements.assigneeSelect.value = selectedAssigneeId;
  }
}

/** Renders the assignee select in an explicit error state, distinct from
 * "this project genuinely has no members": a failed load should invite a
 * retry (re-selecting the project), not look identical to an empty one. */
export function renderAssigneeLoadError() {
  elements.assigneeSelect.replaceChildren();
  elements.assigneeSelect.disabled = true;

  const option = document.createElement("option");
  option.textContent =
    browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.ASSIGNEES_LOAD_ERROR) ||
    "(Could not load assignees; reselect the project to retry)";
  elements.assigneeSelect.appendChild(option);
}

const LOADING_TIMEOUT_S = 10;
let loadingTimeoutId = null;

/** Shows the create-issue button's loading state. On success the popup
 * closes anyway, so nothing needs to clear it; on failure the background
 * sends ISSUE_CREATE_FAILED and `clearButtonLoadingState()` clears it
 * immediately. The timeout here is only a fallback in case that message is
 * ever lost, not the primary way this state ends. */
export function showButtonLoadingState() {
  elements.createBtn.disabled = true;
  elements.createBtn.classList.add("loading");

  clearTimeout(loadingTimeoutId);
  loadingTimeoutId = setTimeout(clearButtonLoadingState, LOADING_TIMEOUT_S * 1000);
}

/** Clears the create-issue button's loading state immediately. */
export function clearButtonLoadingState() {
  clearTimeout(loadingTimeoutId);
  loadingTimeoutId = null;
  elements.createBtn.disabled = false;
  elements.createBtn.classList.remove("loading");
}

/** Opens the shared picker modal configured for selecting email attachments.
 * Checking an item inserts its placeholder at the end of the description
 * immediately (mirroring how picking an image already inserts one at the
 * cursor); unchecking removes it from the text. Rows are draggable so the
 * user can place one at an arbitrary position instead, see
 * `attachmentDragDrop.js`.
 * @param {Array} attachments - Attachment objects from the email.
 */
export function openAttachmentPicker(attachments) {
  pickerModal.open({
    title:
      browser.i18n.getMessage(LocalizeKeys.POPUP.TITLES.ATTACHMENTS) ||
      "Attachments",
    items: attachments,
    getId: (a) => a.partName,
    getLabel: (a) => a.name,
    isSelected: (a) => uploadRegistry.hasAttachment(a.partName),
    onToggle: (attachment, checked) => {
      if (checked) {
        const placeholder = uploadRegistry.addAttachment(attachment, () =>
          getAttachmentFileOrNotify(attachment),
        );
        editor.insertAtEnd(placeholder);
      } else {
        const markdown = uploadRegistry.removeAttachment(attachment.partName);
        if (markdown) editor.replace(markdown, "");
      }
    },
    draggable: true,
    getDragPayload: (a) => ({ partName: a.partName, name: a.name }),
    hint:
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.PICKER_DRAG_HINT) ||
      "Drag an attachment onto the description to place it exactly where you want it.",
    emptyText:
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ATTACHMENTS) ||
      "No attachments available.",
    actionLabel: attachments.length
      ? browser.i18n.getMessage(LocalizeKeys.BUTTON.LOAD_ATTACHMENTS) ||
        "Load previews"
      : undefined,
    onAction: () => loadAttachmentsPreview(attachments),
  });
}

/** Loads and displays previews for supported attachments (images, PDFs)
 * inside the already-open picker modal. Previews are appended below each
 * attachment's row, matched by the row's stable `data-item-id` (the
 * attachment's partName) rather than substring-matching a checkbox id.
 * Unsupported types show a placeholder with the filename. Revokes each
 * preview's object URL when the modal is closed via `close`'s caller.
 * @param {Array} attachments - Attachment objects from the email.
 */
async function loadAttachmentsPreview(attachments) {
  if (!attachments.length) return;

  pickerModal.list.querySelectorAll(".attachment-preview").forEach((el) => {
    URL.revokeObjectURL(el.dataset.objectUrl);
    el.remove();
  });

  for (const attachment of attachments) {
    let file;
    try {
      if (!messageData?.id) continue;
      file = await browser.messages.getAttachmentFile(messageData.id, attachment.partName);
    } catch (err) {
      console.error(`Failed to load attachment ${attachment.name}:`, err);
      continue;
    }

    const row = pickerModal.list.querySelector(
      `[data-item-id="${CSS.escape(attachment.partName)}"]`,
    );
    if (!row) continue;

    const previewWrapper = document.createElement("div");
    previewWrapper.className = "attachment-preview";

    const objectURL = URL.createObjectURL(file);
    previewWrapper.dataset.objectUrl = objectURL;

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = objectURL;
      img.alt = attachment.name || "Image attachment";
      previewWrapper.appendChild(img);
    } else if (file.type === "application/pdf") {
      const embed = document.createElement("embed");
      embed.src = objectURL + "#page=1&zoom=100";
      embed.type = "application/pdf";
      previewWrapper.appendChild(embed);
    } else {
      const placeholder = document.createElement("div");
      placeholder.textContent = attachment.name || "Unsupported file";
      previewWrapper.appendChild(placeholder);
    }

    row.appendChild(previewWrapper);
  }
}

/** Opens the shared picker modal configured for selecting GitLab labels on
 * the currently committed project.
 * @param {Array} labels - Label objects ({ id, name, color }) for the
 *   committed project.
 * @param {Array} selectedLabels - Currently selected labels.
 * @param {(label: object, checked: boolean) => void} onToggle
 * @param {string} [emptyText] - Overridden when the load failed, so the
 *   modal can say so instead of looking like "this project has no labels."
 */
export function openLabelPicker(labels, selectedLabels, onToggle, emptyText) {
  pickerModal.open({
    title:
      browser.i18n.getMessage(LocalizeKeys.POPUP.TITLES.LABELS) || "Labels",
    items: labels,
    getId: (l) => l.id,
    getLabel: (l) => l.name,
    getColor: (l) => l.color,
    isSelected: (l) => selectedLabels.some((s) => s.id === l.id),
    onToggle,
    draggable: false,
    emptyText:
      emptyText ||
      browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_LABELS_FOUND) ||
      "No labels found.",
  });
}