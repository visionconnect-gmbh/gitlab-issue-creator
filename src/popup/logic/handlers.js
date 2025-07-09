// popup/handlers.js
import { MessageTypes } from "../../Enums.js";
import { displayNotification } from "../../utils/utils.js";
import { uploadAttachmentToGitLab, getCurrentUser } from "../../gitlab/gitlab.js";
import {
  elements,
  easyMDE,
  projects,
  messageData,
  selectedProjectId,
  isAssigneeLoadingEnabled,
  assigneesCache,
  selectedAssigneeId,
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
} from "./ui.js";

export async function resetEditor() {
  resetState();

  const { enableAssigneeLoading } = await browser.storage.local.get(
    "enableAssigneeLoading"
  );
  setIsAssigneeLoadingEnabled(enableAssigneeLoading || false);
  updateAssigneeSelectVisibility(isAssigneeLoadingEnabled);

  elements.assigneeSelect.innerHTML =
    "<option>(Keine Bearbeiter gefunden)</option>";
  elements.assigneeSelect.disabled = true;
}

export function handleIncomingMessage(msg) {
  if (msg.type === MessageTypes.PROJECT_LIST) {
    setProjects(msg.projects || []);
    setFilteredProjects([...projects]);
    setAssigneesCache(null, msg.assignees || {}); // Update the entire cache
    renderProjectSuggestions();

    setMessageData(msg.email);
    elements.ticketTitle.value = messageData.subject ?? "";
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
    return displayNotification(
      "GitLab Ticket Addon",
      "Bitte gib ein gültiges Projekt aus der Vorschlagsliste ein."
    );
  }

  try {
    const description = await createTicketDescription();
    await sendCreateIssueMessage(description);
    closeWindowAfterDelay(100);
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
    description += `\n\n**Angehängte Dateien:**\n\n`;
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
      displayNotification(
        "GitLab Ticket Addon",
        `Anhang ${attachment.name} konnte nicht gefunden werden. Ticket-Erstellung abgebrochen.`
      );
      return null;
    }
    return file;
  } catch (error) {
    displayNotification(
      "GitLab Ticket Addon",
      `Fehler beim Zugriff auf Anhang ${attachment.name}. Ticket-Erstellung abgebrochen.`
    );
    return null;
  }
}

async function uploadAttachmentOrNotify(file, attachmentName) {
  try {
    return await uploadAttachmentToGitLab(selectedProjectId, file);
  } catch (error) {
    displayNotification(
      "GitLab Ticket Addon",
      `Fehler beim Hochladen von ${attachmentName}. Ticket-Erstellung abgebrochen.`
    );
    throw error;
  }
}

function sendCreateIssueMessage(description) {
  return browser.runtime.sendMessage({
    type: MessageTypes.CREATE_GITLAB_ISSUE,
    projectId: selectedProjectId,
    assignee: selectedAssigneeId || null,
    title: elements.ticketTitle.value,
    description,
  });
}

function closeWindowAfterDelay(delayMs) {
  setTimeout(() => window.close(), delayMs);
}

function generateBaseDescription() {
  const history = messageData?.conversationHistory ?? [];
  if (!history.length) return "(Kein Konversationsverlauf verfügbar)";

  return history
    .map((entry, index) => {
      const from = entry.from
        ? `**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}\n\n`
        : "";
      const separator = index > 0 ? "\n---\n\n" : "";
      return `${separator}${from}${entry.message}`;
    })
    .join("\n")
    .trim();
}

async function getAttachmentFile(messageId, partName) {
  return browser.messages.getAttachmentFile(messageId, partName);
}

function getAttachmentMarkdownPreview(attachments) {
  return attachments
    .map((a) => `**Anhang:** _${a.name}_ *(Wird beim Erstellen hochgeladen)*`)
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
