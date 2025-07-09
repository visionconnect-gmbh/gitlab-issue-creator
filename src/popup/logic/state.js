// popup/state.js

let isAssigneeLoadingEnabled = false;
let assigneesCache = {};
let currentAssignees = [];
let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;
let selectedAssigneeId = null;

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

export {
  isAssigneeLoadingEnabled,
  assigneesCache,
  currentAssignees,
  projects,
  filteredProjects,
  messageData,
  selectedProjectId,
  selectedAssigneeId,
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

export function resetState() {
  easyMDE.value("");
  elements.ticketTitle.value = "";
  elements.attachmentsCheckbox.checked = false;
  selectedProjectId = null;
  currentAssignees = [];
  filteredProjects = [];
  projects = [];
  assigneesCache = {};
  selectedAssigneeId = null;
  elements.projectSearch.value = "";
  elements.projectSuggestions.innerHTML = "";
  elements.projectSearch.focus();
  elements.projectSearch.select();
}
