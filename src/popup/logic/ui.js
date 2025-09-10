import {
  elements,
  filteredProjects,
  currentAssignees,
  selectedAssigneeId,
} from "./state.js";

import { LocalizeKeys } from "../../utils/Enums.js";

export function renderProjectSuggestions() {
  elements.projectSuggestions.replaceChildren();

  filteredProjects.forEach((proj) => {
    const name = proj.name_with_namespace || proj.name || browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_PROJECT_NAME) || "No project name";
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
    option.textContent = assignee.name || assignee.username || browser.i18n.getMessage(LocalizeKeys.FALLBACK.UNKNOWN_ASSIGNEE) || "Unknown assignee";
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
