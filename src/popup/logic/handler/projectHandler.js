import { MessageTypes, Popup_MessageTypes } from "../../../utils/Enums.js";
import {
  projects,
  elements,
  setProjects,
  setFilteredProjects,
  setAssigneesCache,
  setCurrentAssignees,
  setMessageData,
  setSelectedProjectId,
  selectedProjectId,
  assigneesCache,
  messageData,
  easyMDE,
  isAssigneeLoadingEnabled,
} from "../popupState.js";
import { renderProjectSuggestions, renderAssignees } from "../ui.js";
import { generateFullDescription } from "./descriptionHandler.js";
import { isPopupMessageType } from "../../../utils/utils.js";

export function handleIncomingMessage(msg) {
  try {
    // Check if message type is Popup_MessageTypes
    if (isPopupMessageType(msg.type)) return;

    switch (msg.type) {
      case MessageTypes.INITIAL_DATA:
        handleInitalData(msg);
        break;
      case MessageTypes.PROJECT_LIST:
        handleProjectsData(msg.projects);
        break;
      case MessageTypes.ASSIGNEES_LIST:
        handleAssigneeData(msg);
        break;
      default:
        console.warn("Unknown message type:", msg.type);
    }
  } catch (error) {
    console.error(`Error handling message of type ${msg.type}: ${error}. Message:`, msg);
  }
}

function handleInitalData(msg) {
  const projects = msg.projects;
  if (projects) handleProjectsData(projects);

  setMessageData(msg.email);
  elements.issueTitle.value = messageData.subject ?? "";
  easyMDE.value(generateFullDescription());

  sendMessageToBackground(Popup_MessageTypes.REQUEST_PROJECTS);
}

function handleProjectsData(projects) {
  setProjects(projects || []);
  setFilteredProjects([...projects]);
  renderProjectSuggestions();
}

function handleAssigneeData(msg) {
  const projectId = msg.projectId;
  const assignees = msg.assignees;
  if (!projectId || !Array.isArray(assignees)) {
    console.warn("Invalid assignee data received:", msg);
    return;
  }

  if (!projectId == selectedProjectId) {
    // Data is for a different project, ignore
    return;
  }

  setAssigneesCache(projectId, assignees);
  setCurrentAssignees(assignees);
  renderAssignees();
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

async function updateAssigneesForSelectedProject() {
  if (!isAssigneeLoadingEnabled) return;

  if (!selectedProjectId) {
    setCurrentAssignees([]);
    renderAssignees();
    return;
  }

  if (assigneesCache[selectedProjectId]) {
    setCurrentAssignees(assigneesCache[selectedProjectId]);
    renderAssignees();
    return;
  }

  sendMessageToBackground(Popup_MessageTypes.REQUEST_ASSIGNEES, {
    projectId: selectedProjectId,
  });
}

function sendMessageToBackground(type, payload = {}) {
  browser.runtime.sendMessage({ type, ...payload });
}
