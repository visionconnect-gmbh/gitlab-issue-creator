// popup/ui.js
import {
  elements,
  filteredProjects,
  currentAssignees,
  selectedAssigneeId,
} from "./state.js";

export function renderProjectSuggestions() {
  elements.projectSuggestions.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const name = proj.name_with_namespace || proj.name || "Unbekannt";
    const option = new Option(name, name);
    elements.projectSuggestions.appendChild(option);
  });
}

export function renderAssignees() {
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
