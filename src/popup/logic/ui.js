import { LocalizeKeys } from "../../utils/Enums.js";
import {
  elements,
  filteredProjects,
  currentAssignees,
  selectedAssigneeId,
  easyMDE,
  selectedAttachments,
  toggleAttachmentSelection,
  messageData,
} from "./popupState.js";
import { generateFullDescription } from "./handler/descriptionHandler.js";

export function renderProjectSuggestions() {
  elements.projectSuggestions.replaceChildren();

  filteredProjects.forEach((proj) => {
    const name =
      proj.name_with_namespace ||
      proj.name ||
      browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_PROJECT_NAME) ||
      "No project name";
    const option = new Option(name, name);
    elements.projectSuggestions.appendChild(option);
  });
}

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

export function updateAssigneeSelectVisibility(isVisible) {
  const parentDiv = elements.assigneeSelect.parentElement;
  if (parentDiv) {
    parentDiv.style.display = isVisible ? "block" : "none";
  }
}

const LOADING_TIMNEOUT_S = 10;
export function showButtonLoadingState() {
  elements.createBtn.disabled = true;
  elements.createBtn.classList.add("loading");

  // Reset after a short delay
  setTimeout(() => {
    elements.createBtn.disabled = false;
    elements.createBtn.classList.remove("loading");
  }, LOADING_TIMNEOUT_S * 1000);
}

export function toggleAttachmentSelectorVisibility() {
  const isVisible =
    elements.attachmentSelectorBackdrop.style.display === "flex";
  elements.attachmentSelectorBackdrop.style.display = isVisible
    ? "none"
    : "flex";
}

export function createAttachmentList(attachments) {
  clearAttachmentList();

  if (attachments.length === 0) {
    elements.attachmentList.appendChild(createNoAttachmentItem());
    return;
  }

  elements.loadAttachmentsPreviewBtn.style.display = "block";
  attachments.forEach((attachment) => {
    const listItem = createAttachmentItem(attachment);
    elements.attachmentList.appendChild(listItem);
  });
}

function clearAttachmentList() {
  while (elements.attachmentList.firstChild) {
    elements.attachmentList.removeChild(elements.attachmentList.firstChild);
  }
}

function createNoAttachmentItem() {
  const noAttachmentItem = document.createElement("div");
  noAttachmentItem.className = "no-attachment-item";
  noAttachmentItem.textContent =
    browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ATTACHMENTS) ||
    "No attachments available.";
  return noAttachmentItem;
}

function createAttachmentCheckbox(attachment) {
  const checkbox = document.createElement("input");
  const uniqueSuffix = Math.random().toString(36).slice(2, 9);

  checkbox.id = `attachment-${attachment.partName || attachment.name}-${uniqueSuffix}`;
  checkbox.type = "checkbox";
  checkbox.checked = selectedAttachments.some(
    (a) => a.partName === attachment.partName && a.name === attachment.name
  );

  checkbox.addEventListener("change", () => {
    toggleAttachmentSelection(attachment);
    easyMDE.value(generateFullDescription(selectedAttachments));
  });

  return checkbox;
}

function createAttachmentLabel(attachment, checkboxId, maxLength = 20) {
  const label = document.createElement("label");
  label.className = "attachment-label";

  const name = attachment.name;
  const dotIndex = name.lastIndexOf(".");

  let displayName = name;

  if (dotIndex > 0) {
    const baseName = name.slice(0, dotIndex);
    const extension = name.slice(dotIndex); // includes the dot, e.g., ".jpg"

    if (baseName.length + extension.length > maxLength) {
      const truncatedBase = baseName.slice(0, maxLength - extension.length - 1);
      displayName = truncatedBase + "…" + extension;
    }
  } else if (name.length > maxLength) {
    displayName = name.slice(0, maxLength - 1) + "…";
  }

  label.textContent = displayName;
  label.htmlFor = checkboxId;
  return label;
}

function createAttachmentItem(attachment) {
  const listItem = document.createElement("div");
  listItem.className = "attachment-item";
  listItem.style.display = "flex";
  listItem.style.flexDirection = "column"; // label+checkbox row on top, preview below
  listItem.style.marginBottom = "10px";

  // Row for label + checkbox
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.justifyContent = "space-between";
  row.style.alignItems = "center";

  const checkbox = createAttachmentCheckbox(attachment);
  const label = createAttachmentLabel(attachment, checkbox.id);

  row.appendChild(label);
  row.appendChild(checkbox);
  listItem.appendChild(row);

  return listItem;
}

export async function loadAttachmentsPreview() {
  const attachments = messageData?.attachments || [];
  const attachmentList = document.getElementById("attachment-list");

  if (!attachmentList || attachments.length === 0) return;

  // Remove existing previews
  attachmentList.querySelectorAll(".attachment-preview").forEach((el) => el.remove());

  for (const attachment of attachments) {
    let file;
    try {
      const dataId = messageData?.id || "";
      if (!dataId) continue;

      // Fetch the attachment file
      file = await browser.messages.getAttachmentFile(dataId, attachment.partName);
    } catch (err) {
      console.error(`Failed to load attachment ${attachment.name}:`, err);
      continue;
    }

    const previewWrapper = document.createElement("div");
    previewWrapper.className = "attachment-preview";
    previewWrapper.style.height = "150px";
    previewWrapper.style.overflow = "hidden";
    previewWrapper.style.display = "flex";
    previewWrapper.style.alignItems = "center";
    previewWrapper.style.justifyContent = "center";
    previewWrapper.style.border = "1px solid #ccc";
    previewWrapper.style.borderRadius = "8px";
    previewWrapper.style.marginTop = "5px";
    previewWrapper.style.background = "#f9f9f9";

    const objectURL = URL.createObjectURL(file);

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = objectURL;
      img.alt = attachment.name || "Image attachment";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      previewWrapper.appendChild(img);
    } else if (file.type === "application/pdf") {
      const embed = document.createElement("embed");
      embed.src = objectURL + "#page=1&zoom=100";
      embed.type = "application/pdf";
      embed.style.width = "100%";
      embed.style.height = "100%";
      previewWrapper.appendChild(embed);
    } else {
      const placeholder = document.createElement("div");
      placeholder.textContent = attachment.name || "Unsupported file";
      placeholder.style.fontSize = "12px";
      placeholder.style.textAlign = "center";
      placeholder.style.padding = "5px";
      previewWrapper.appendChild(placeholder);
    }

    // Find the corresponding list item by partName
    let listItem = null;
    for (const item of attachmentList.querySelectorAll(".attachment-item")) {
      const checkbox = item.querySelector("input[type=checkbox]");
      if (checkbox && checkbox.id.includes(attachment.partName)) {
        listItem = item;
        break;
      }
    }

    if (listItem) listItem.appendChild(previewWrapper);
    else attachmentList.appendChild(previewWrapper);
  }
}