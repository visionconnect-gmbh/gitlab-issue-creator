// popup/handlers.js
import { MessageTypes } from "../../Enums.js";
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
    browser.i18n.getMessage("PopupNoAssigneesFound") || "No assignees found.";
  elements.assigneeSelect.innerHTML = `<option>${noAssigneesFoundMessage}</option>`;
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
    return displayLocalizedNotification("NotificationNoProjectSelected");
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
  let description = generateBaseDescription();

  if (
    elements.attachmentsCheckbox.checked &&
    messageData?.attachments?.length
  ) {
    const ticketAttachmentsTitle =
      browser.i18n.getMessage("TicketAttachmentsTitle") || "Attachments";
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
      displayLocalizedNotification("NotificationAttachmentNotFound");
      return null;
    }
    return file;
  } catch (error) {
    displayLocalizedNotification("NotificationGenericError");
    return null;
  }
}

async function uploadAttachmentOrNotify(file, attachmentName) {
  try {
    return await uploadAttachmentToGitLab(selectedProjectId, file);
  } catch (error) {
    console.error(`Error uploading attachment ${attachmentName}:`, error);
    displayLocalizedNotification("NotificationUploadAttachmentError");
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
      browser.i18n.getMessage("EmailNoContentMessage") ||
      "No content available."
    );
  }

  return history
    .map((entry, index) => {
      const fromText = browser.i18n.getMessage("PopupFromAuthor") || "From";
      const dateText =
        browser.i18n.getMessage("PopupDateReceived") || "Received on";

      const from =
        index === 0 ? messageData.author : entry.from || "Unknown sender";

      // Handle and format date
      let dateObj;
      if (index === 0 && messageData.date instanceof Date) {
        dateObj = messageData.date;
      }

      const is12HourFormat =
        entry.time?.includes("AM") || entry.time?.includes("PM");

      // Format time to local format
      let localizedTime = "";
      if (entry.time) {
        // Normalize to a Date object
        let parsedDate;

        // Create a dummy date with the time so we can parse it
        const dummyDate = "1970-01-01"; // Date part doesn't matter

        // Try parsing depending on format
        if (is12HourFormat) {
          parsedDate = new Date(`${dummyDate} ${entry.time}`);
        } else {
          // Ensure it's parsed correctly for 24-hour format
          parsedDate = new Date(`${dummyDate}T${entry.time}`);
        }

        if (!isNaN(parsedDate)) {
          localizedTime = parsedDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        } else {
          console.warn("Invalid time format:", entry.time);
          localizedTime = entry.time; // Fallback to original
        }
      }

      // Only use formatted date if dateObj is valid else use entry.date
      const dateFormatted =
        dateObj instanceof Date && !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString(undefined, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : entry.date
          ? `${new Date(entry.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })} ${localizedTime || ""}`.trim()
          : "(No date available)";

      const metaInfo = `**${fromText}**: ${from}\n**${dateText}**: ${dateFormatted}\n\n`;

      const separator = index > 0 ? "\n---\n\n" : "";
      const messageText = entry.message?.trim() || "(No message content)";
      return `${separator}${metaInfo}${messageText}`;
    })
    .join("\n")
    .trim();
}

async function getAttachmentFile(messageId, partName) {
  return browser.messages.getAttachmentFile(messageId, partName);
}

function getAttachmentMarkdownPreview(attachments) {
  const placeholderTitle =
    browser.i18n.getMessage("TicketAttachmentsTitle") || "Attachments";
  const placeholderText =
    browser.i18n.getMessage("TicketAttachmentPreviewText") ||
    "This attachment will be uploaded when the issue is created.";
  return attachments
    .map((a) => `**${placeholderTitle}:** _${a.name}_ *${placeholderText}*`)
    .join("\n\n");
}

function generateFullDescription() {
  const base = generateBaseDescription();
  const attachments = messageData?.attachments;
  if (elements.attachmentsCheckbox.checked && attachments?.length) {
    return `${base}\n\n${getAttachmentMarkdownPreview(attachments)}`;
  }
  return base;
}
