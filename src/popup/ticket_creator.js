import { MessageTypes } from "../Enums.js";
import { displayNotification } from "../utils/utils.js";
import { uploadAttachmentToGitLab, getCurrentUser } from "../gitlab/gitlab.js";

let isAssigneeLoadingEnabled = false; // This can be set based on user preference in options
let assigneesCache = {};
let currentAssignees = [];

let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;
let selectedAssigneeId = null; // Will be set to current user by default

const elements = {
  projectSearch: document.getElementById("projectSearch"),
  projectSuggestions: document.getElementById("projectSuggestions"),
  attachmentsCheckbox: document.getElementById("attachmentsCheckbox"),
  ticketTitle: document.getElementById("ticketTitle"),
  createBtn: document.getElementById("create"),
  assigneeSelect: document.getElementById("assigneeSelect"),
};

const easyMDE = new EasyMDE({
  element: document.getElementById("ticketDescription"),
  spellChecker: false,
  autosave: {
    enabled: true,
    delay: 1000,
    uniqueId: "gitlab-ticket-creator-description-popup",
  },
  status: false,
  forceSync: true,
  toolbar: [
    "bold",
    "italic",
    "heading",
    "|",
    "quote",
    "unordered-list",
    "ordered-list",
    "|",
    "link",
    "image",
    "|",
    "preview",
    "side-by-side",
    "fullscreen",
    "|",
    "guide",
  ],
});

document.addEventListener("DOMContentLoaded", async () => {
  console.log("GitLab Ticket Addon: Projekt-Auswahl Popup geladen");

  await resetEditor();

  // Signal background that the popup is ready
  browser.runtime.sendMessage({ type: MessageTypes.POPUP_READY });

  browser.runtime.onMessage.addListener(handleIncomingMessage);

  elements.projectSearch.addEventListener("input", handleProjectSearchInput);
  elements.projectSearch.addEventListener("change", handleProjectSearchChange);
  // On load set assignee to current user
  getCurrentUser().then((user) => {
    if (user) {
      selectedAssigneeId = user.id;
      currentAssignees.push(user);
      renderAssignees();
      elements.assigneeSelect.value = user.id;
    } else {
      elements.assigneeSelect.addEventListener("change", async (e) => {
        selectedAssigneeId = e.target.value || (await getCurrentUser()).id;
      });
    }
  });
  elements.attachmentsCheckbox.addEventListener(
    "change",
    handleAttachmentsCheckboxChange
  );
  elements.createBtn.addEventListener("click", handleCreateButtonClick);
});

async function resetEditor() {
  easyMDE.value("");
  elements.ticketTitle.value = "";
  elements.attachmentsCheckbox.checked = false;
  selectedProjectId = null;
  currentAssignees = [];
  filteredProjects = [];
  projects = [];
  assigneesCache = {};
  selectedAssigneeId = null; // Reset to no selection
  elements.projectSearch.value = "";
  elements.projectSuggestions.innerHTML = "";
  elements.projectSearch.focus();
  elements.projectSearch.select();

  const { enableAssigneeLoading } = await browser.storage.local.get(
    "enableAssigneeLoading"
  );
  isAssigneeLoadingEnabled = enableAssigneeLoading || false;
  // Hide assignee select if loading is disabled
  const parentDiv = elements.assigneeSelect.parentElement;
  if (parentDiv) {
    parentDiv.style.display = isAssigneeLoadingEnabled ? "block" : "none";
  }
  elements.assigneeSelect.innerHTML =
    "<option>(Keine Bearbeiter gefunden)</option>";
  elements.assigneeSelect.disabled = true;
}

function handleIncomingMessage(msg) {
  if (msg.type === MessageTypes.PROJECT_LIST) {
    projects = msg.projects || [];
    filteredProjects = [...projects];
    assigneesCache = msg.assignees || {};
    renderProjectSuggestions();

    messageData = msg.email;
    elements.ticketTitle.value = messageData.subject ?? "";
    easyMDE.value(generateFullDescription());
  } else if (msg.type === MessageTypes.ASSIGNEES_RESPONSE) {
    if (msg.projectId === selectedProjectId) {
      if (assigneesCache) {
        assigneesCache[msg.projectId] = msg.assignees || [];
        currentAssignees = assigneesCache[msg.projectId];
      }

      renderAssignees();
    }
  }
}

function handleProjectSearchInput() {
  const searchTerm = elements.projectSearch.value.toLowerCase();

  filteredProjects = projects.filter((p) =>
    (p.name_with_namespace || p.name || "").toLowerCase().includes(searchTerm)
  );
  renderProjectSuggestions();

  const exactMatch = projects.find(
    (p) => (p.name_with_namespace || p.name || "").toLowerCase() === searchTerm
  );
  selectedProjectId = exactMatch?.id ?? null;

  updateAssigneesForSelectedProject();
}

function handleProjectSearchChange() {
  const inputValue = elements.projectSearch.value;
  const match = projects.find(
    (p) => (p.name_with_namespace || p.name) === inputValue
  );
  selectedProjectId = match?.id ?? null;

  updateAssigneesForSelectedProject();
}

function handleAttachmentsCheckboxChange() {
  easyMDE.value(generateFullDescription());
}

function updateAssigneesForSelectedProject() {
  if (!selectedProjectId) {
    currentAssignees = [];
    renderAssignees();
    return;
  }

  // Check if assignees for this project are cached already
  if (assigneesCache[selectedProjectId]) {
    currentAssignees = assigneesCache[selectedProjectId];
    renderAssignees();
  } else {
    // Request assignees from background script if not cached

    // ONLY request if assignee loading is enabled
    if (!isAssigneeLoadingEnabled) {
      return;
    }
    browser.runtime.sendMessage({
      type: MessageTypes.REQUEST_ASSIGNEES,
      projectId: selectedProjectId,
    });
  }
}

function renderAssignees() {
  elements.assigneeSelect.innerHTML = "";
  if (!currentAssignees.length) {
    elements.assigneeSelect.disabled = true;
    elements.assigneeSelect.innerHTML = `<option>(Keine Bearbeiter gefunden)</option>`;
    return;
  }

  elements.assigneeSelect.disabled = false;
  currentAssignees.forEach((assignee) => {
    const option = document.createElement("option");
    option.value = assignee.id;
    option.textContent = assignee.name || assignee.username || "(Unbekannt)";
    elements.assigneeSelect.appendChild(option);
  });
  if (selectedAssigneeId) {
    elements.assigneeSelect.value = selectedAssigneeId;
  }
}

async function handleCreateButtonClick() {
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

function renderProjectSuggestions() {
  elements.projectSuggestions.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const name = proj.name_with_namespace || proj.name || "Unbekannt";
    const option = new Option(name, name);
    elements.projectSuggestions.appendChild(option);
  });
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
