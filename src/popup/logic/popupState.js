let isAssigneeLoadingEnabled = false;
let assigneesCache = {};
let currentAssignees = [];
let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;
let selectedAssigneeId = null;
let issueEndDate = null;
let selectedAttachments = [];

const elements = {
  projectSearch: document.getElementById("projectSearch"),
  projectSuggestions: document.getElementById("projectSuggestions"),
  issueTitle: document.getElementById("issueTitle"),
  assigneeSelect: document.getElementById("assigneeSelect"),
  issueEnd: document.getElementById("issueEnd"),
  attachmentsButton: document.getElementById("attachmentsButton"),
  createBtn: document.getElementById("create"),

  closeAttachmentSelectorBtn: document.getElementById("close-attachment-selector"),
  attachmentSelectorBackdrop: document.getElementById("attachment-selector-backdrop"),
  attachmentList: document.getElementById("attachment-list"),
  loadAttachmentsPreviewBtn: document.getElementById("load-attachments-preview"),
};

const easyMDE = new EasyMDE({
  element: document.getElementById("issueDescription"),
  spellChecker: false,
  autosave: {
    enabled: true,
    delay: 1000,
    uniqueId: "gitlab-issue-creator-description-popup",
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

export {
  isAssigneeLoadingEnabled,
  assigneesCache,
  currentAssignees,
  projects,
  filteredProjects,
  messageData,
  selectedProjectId,
  selectedAssigneeId,
  issueEndDate,
  selectedAttachments,
  elements,
  easyMDE,
};

export function setIsAssigneeLoadingEnabled(value) {
  isAssigneeLoadingEnabled = value;
}

export function setAssigneesCache(projectId, assignees) {
  assigneesCache[projectId] = assignees;
}

export function setCurrentAssignees(assignees) {
  currentAssignees = assignees;
}

export function setProjects(newProjects) {
  projects = newProjects;
}

export function setFilteredProjects(newFilteredProjects) {
  filteredProjects = newFilteredProjects;
}

export function setMessageData(data) {
  messageData = data;
}

export function setSelectedProjectId(id) {
  selectedProjectId = id;
}

export function setSelectedAssigneeId(id) {
  selectedAssigneeId = id;
}

export function setIssueEndDate(date) {
  const newDate = date ? date.toISOString().split("T")[0] : null;
  elements.issueEnd.value = newDate;
  issueEndDate = newDate;
}

export function setSelectedAttachments(attachments) {
  selectedAttachments = attachments;
}

export function toggleAttachmentSelection(attachment) {
  const index = selectedAttachments.findIndex(att => att.partName === attachment.partName);

  if (index !== -1) {
    // remove
    selectedAttachments.splice(index, 1);
  } else {
    // add
    selectedAttachments.push(attachment);
  }
}

export function resetState() {
  easyMDE.value("");
  elements.issueTitle.value = "";
  elements.issueEnd.value = null;
  selectedProjectId = null;
  currentAssignees = [];
  filteredProjects = [];
  projects = [];
  assigneesCache = {};
  selectedAssigneeId = null;
  issueEndDate = null;
  selectedAttachments = [];
  elements.projectSearch.value = "";
  elements.projectSuggestions.replaceChildren();
  elements.projectSearch.focus();
  elements.projectSearch.select();
}
