import { MessageTypes } from "../../../utils/Enums.js";
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

export function handleIncomingMessage(msg) {
  switch (msg.type) {
    case MessageTypes.INITIAL_DATA:
      handleProjectsData(msg);

      setMessageData(msg.email);
      elements.issueTitle.value = messageData.subject ?? "";
      easyMDE.value(generateFullDescription());
      break;
    case MessageTypes.PROJECT_LIST:
      handleProjectsData(msg);
      break;
    case MessageTypes.ASSIGNEES_LIST:
      if (msg.projectId === selectedProjectId) {
        setAssigneesCache(msg.projectId, msg.assignees || []);
        setCurrentAssignees(assigneesCache[msg.projectId]);
        renderAssignees();
      }
      break;
    default:
      console.warn("Unknown message type:", msg.type);
  }
}

function handleProjectsData(msg) {
  setProjects(msg.projects || []);
  setFilteredProjects([...projects]);
  renderProjectSuggestions();
  setAssigneesCache(null, msg.assignees || {}); // full cache update
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
  if (!selectedProjectId) {
    setCurrentAssignees([]);
    renderAssignees();
    return;
  }

  if (assigneesCache[selectedProjectId]) {
    setCurrentAssignees(assigneesCache[selectedProjectId]);
    renderAssignees();
  } else if (isAssigneeLoadingEnabled) {
    browser.runtime.sendMessage({
      type: MessageTypes.REQUEST_ASSIGNEES,
      projectId: selectedProjectId,
    });
  }
}
