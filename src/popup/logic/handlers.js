// popup/handlers.js
import { MessageTypes, LocalizeKeys } from "../../Enums.js";
import { displayLocalizedNotification } from "../../utils/utils.js";
import {
  uploadAttachmentToGitLab,
  getCurrentUser,
} from "../../gitlab/gitlab.js";
import {
  elements,
  easyMDE,
  projects,
  messageData,
  selectedProjectId,
  isAssigneeLoadingEnabled,
  assigneesCache,
  selectedAssigneeId,
  issueEndDate as selectedIssueEndDate,
  filteredProjects,
  setProjects,
  setFilteredProjects,
  setMessageData,
  setAssigneesCache,
  setCurrentAssignees,
  setSelectedProjectId,
  setSelectedAssigneeId,
  setIsAssigneeLoadingEnabled,
  resetState,
} from "./state.js";
import {
  renderProjectSuggestions,
  renderAssignees,
  updateAssigneeSelectVisibility,
  showButtonLoadingState,
} from "./ui.js";

export async function resetEditor() {
  resetState();

  const { enableAssigneeLoading } = await browser.storage.local.get(
    "enableAssigneeLoading"
  );
  setIsAssigneeLoadingEnabled(enableAssigneeLoading || false);
  updateAssigneeSelectVisibility(isAssigneeLoadingEnabled);

  const noAssigneesFoundMessage =
    browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ASSIGNEES_FOUND) ||
    "No assignees found.";

  const option = document.createElement("option");
  option.textContent = noAssigneesFoundMessage;

  elements.assigneeSelect.replaceChildren(option);
  elements.assigneeSelect.disabled = true;
}

export function handleIncomingMessage(msg) {
  if (msg.type === MessageTypes.PROJECT_LIST) {
    setProjects(msg.projects || []);
    setFilteredProjects([...projects]);
    setAssigneesCache(null, msg.assignees || {}); // Update the entire cache
    renderProjectSuggestions();

    setMessageData(msg.email);
    elements.issueTitle.value = messageData.subject ?? "";
    easyMDE.value(generateFullDescription());
  } else if (msg.type === MessageTypes.ASSIGNEES_RESPONSE) {
    if (msg.projectId === selectedProjectId) {
      setAssigneesCache(msg.projectId, msg.assignees || []);
      setCurrentAssignees(assigneesCache[msg.projectId]);
      renderAssignees();
    }
  }
}

export function handleProjectSearchInput() {
  const searchTerm = elements.projectSearch.value.toLowerCase();

  setFilteredProjects(
    projects.filter((p) =>
      (p.name_with_namespace || p.name || "").toLowerCase().includes(searchTerm)
    )
  );
  renderProjectSuggestions();

  const exactMatch = projects.find(
    (p) => (p.name_with_namespace || p.name || "").toLowerCase() === searchTerm
  );
  setSelectedProjectId(exactMatch?.id ?? null);

  updateAssigneesForSelectedProject();
}

export function handleProjectSearchChange() {
  const inputValue = elements.projectSearch.value;
  const match = projects.find(
    (p) => (p.name_with_namespace || p.name) === inputValue
  );
  setSelectedProjectId(match?.id ?? null);

  updateAssigneesForSelectedProject();
}

export function handleAttachmentsCheckboxChange() {
  easyMDE.value(generateFullDescription());
}

export async function handleCreateButtonClick() {
  if (!selectedProjectId) {
    return displayLocalizedNotification(LocalizeKeys.NOTIFICATION.NO_PROJECT_SELECTED);
  }

  try {
    const description = await createTicketDescription();
    await sendCreateIssueMessage(description);
    showButtonLoadingState();
  } catch (error) {
    console.error("Ticket creation failed:", error);
  }
}

async function updateAssigneesForSelectedProject() {
  if (!selectedProjectId) {
    setCurrentAssignees([]);
    renderAssignees();
    return;
  }

  if (assigneesCache[selectedProjectId]) {
    setCurrentAssignees(assigneesCache[selectedProjectId]);
    renderAssignees();
  } else {
    if (!isAssigneeLoadingEnabled) {
      return;
    }
    browser.runtime.sendMessage({
      type: MessageTypes.REQUEST_ASSIGNEES,
      projectId: selectedProjectId,
    });
  }
}

async function createTicketDescription() {
  let description = easyMDE.value().trim() || generateBaseDescription();

  if (
    elements.attachmentsCheckbox.checked &&
    messageData?.attachments?.length
  ) {
    // Remove placeholder attachments if they exist
    const placeholderAttachments = getAttachmentMarkdownPreview(messageData.attachments);
    description = description.replace(placeholderAttachments, "");
    const ticketAttachmentsTitle =
      browser.i18n.getMessage(LocalizeKeys.TICKET.ATTACHMENTS_TITLE) || "Attachments";
    description += `\n\n**${ticketAttachmentsTitle}:**\n\n`;
    description += await generateAttachmentsMarkdown();
  }

  return description;
}

async function generateAttachmentsMarkdown() {
  let markdown = "";

  for (const attachment of messageData.attachments) {
    const file = await getAttachmentFileOrNotify(attachment);
    if (!file) throw new Error(`Attachment file ${attachment.name} not found`);

    const uploadResult = await uploadAttachmentOrNotify(file, attachment.name);
    if (uploadResult?.markdown) {
      markdown += `${attachment.name}:\n\n${uploadResult.markdown}\n\n`;
    }
  }

  return markdown;
}

async function getAttachmentFileOrNotify(attachment) {
  try {
    const file = await getAttachmentFile(
      messageData.id,
      attachment.partName || attachment.name
    );
    if (!(file instanceof File)) {
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.ATTACHMENT_NOT_FOUND);
      return null;
    }
    return file;
  } catch (error) {
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    return null;
  }
}

async function uploadAttachmentOrNotify(file, attachmentName) {
  try {
    return await uploadAttachmentToGitLab(selectedProjectId, file);
  } catch (error) {
    console.error(`Error uploading attachment ${attachmentName}:`, error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.UPLOAD_ATTACHMENT_ERROR);
    throw error;
  }
}

function sendCreateIssueMessage(description) {
  return browser.runtime.sendMessage({
    type: MessageTypes.CREATE_GITLAB_ISSUE,
    projectId: selectedProjectId,
    assignee: selectedAssigneeId || null,
    endDate: selectedIssueEndDate,
    title: elements.issueTitle.value,
    description,
  });
}

function generateBaseDescription() {
  const history = messageData?.conversationHistory ?? [];

  if (!history.length) {
    return (
      browser.i18n.getMessage(LocalizeKeys.EMAIL.NO_CONTENT) ||
      "No content available."
    );
  }

  return history
    .map((entry, index) => {
      const separator = index > 0 ? "\n---\n\n" : "";
      const main = formatEntry(entry, index);
      const forwarded = entry.forwardedMessage
        ? "\n\n" + formatEntry(entry.forwardedMessage, index, true)
        : "";
      return `${separator}${main}${forwarded}`;
    })
    .join("\n")
    .trim();
}

function formatEntry(entry, index, isForwarded = false) {
  const from = determineSender(entry, index, isForwarded);
  const dateFormatted = formatDate(entry, index, isForwarded);
  const fromText =
    browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.FROM_AUTHOR) || "From";
  const dateText =
    browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.DATE_RECEIVED) || "Received on";
  const forwardedPrefix = isForwarded ? `**(${browser.i18n.getMessage(LocalizeKeys.POPUP.LABELS.FORWARDED_MESSAGE) || "Forwarded Message"})**\n` : "\n";

  const metaInfo = `**${fromText}**: ${from}\n**${dateText}**: ${dateFormatted}\n\n`;
  const messageText = entry.message?.trim() || "(No message content)";
  return `${forwardedPrefix}${metaInfo}${messageText}`;
}

function determineSender(entry, index, isForwarded) {
  if (isForwarded) {
    return entry.from || "Unknown sender";
  }

  if (index === 0) {
    return messageData.author;
  }

  return entry.from || "Unknown sender";
}

function formatDate(entry, index, isForwarded) {
  const messageDate = (!isForwarded && index === 0 && messageData.date instanceof Date)
    ? messageData.date
    : null;

  const is12HourFormat = entry.time?.includes("AM") || entry.time?.includes("PM");
  const localizedTime = formatTime(entry.time, is12HourFormat);

  if (messageDate && !isNaN(messageDate.getTime())) {
    return messageDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (entry.date) {
    const parsed = new Date(entry.date);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })} ${localizedTime}`.trim();
    }
    return `${entry.date} ${localizedTime}`.trim();
  }

  return "(No date available)";
}

function formatTime(timeStr, is12HourFormat) {
  if (!timeStr) return "";

  const dummyDate = "1970-01-01";
  const timeString = is12HourFormat
    ? `${dummyDate} ${timeStr}`
    : `${dummyDate}T${timeStr}`;
  const parsedDate = new Date(timeString);

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  console.warn("Invalid time format:", timeStr);
  return timeStr;
}

async function getAttachmentFile(messageId, partName) {
  return browser.messages.getAttachmentFile(messageId, partName);
}

function getAttachmentMarkdownPreview(attachments) {
  const placeholderTitle =
    browser.i18n.getMessage(LocalizeKeys.TICKET.ATTACHMENTS_TITLE) || "Attachments";
  const placeholderText =
    browser.i18n.getMessage(LocalizeKeys.TICKET.ATTACHMENT_PREVIEW_TEXT) ||
    "This attachment will be uploaded when the issue is created.";
  const placeholderDisclaimer = browser.i18n.getMessage(LocalizeKeys.TICKET.ATTACHMENT_PREVIEW_TEXT_DISCLAIMER) || "DO NOT EDIT!";
  return attachments
    .map((a) => `**${placeholderTitle}:** _${a.name}_ *(${placeholderText})* **${placeholderDisclaimer}**`)
    .join("\n\n");
}

function generateFullDescription() {
  const base = easyMDE.value().trim() || generateBaseDescription();
  const attachments = messageData?.attachments;
  if (elements.attachmentsCheckbox.checked && attachments?.length) {
    return `${base}\n\n${getAttachmentMarkdownPreview(attachments)}`;
  }
  return base;
}
