// popup/main.js
import { MessageTypes } from "../Enums.js";
import { getCurrentUser } from "../gitlab/gitlab.js";
import {
  elements,
  setSelectedAssigneeId,
  setCurrentAssignees,
  setIssueEndDate,
} from "./logic/state.js";
import { renderAssignees } from "./logic/ui.js";
import {
  resetEditor,
  handleIncomingMessage,
  handleProjectSearchInput,
  handleProjectSearchChange,
  handleAttachmentsCheckboxChange,
  handleCreateButtonClick,
} from "./logic/handlers.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("GitLab Ticket Addon: Projekt-Auswahl Popup geladen");

  await resetEditor();

  browser.runtime.sendMessage({ type: MessageTypes.POPUP_READY });

  browser.runtime.onMessage.addListener(handleIncomingMessage);

  elements.projectSearch.addEventListener("input", handleProjectSearchInput);
  elements.projectSearch.addEventListener("change", handleProjectSearchChange);

  // Initialize the assignee select with the current user
  elements.assigneeSelect.addEventListener("change", async (e) => {
    setSelectedAssigneeId(e.target.value || (await getCurrentUser()).id);
  });

  getCurrentUser().then((user) => {
    if (user) {
      setSelectedAssigneeId(user.id);
      setCurrentAssignees([user]); // Initialize currentAssignees with current user
      renderAssignees();
      elements.assigneeSelect.value = user.id;
    }
  });

  elements.issueEnd.addEventListener("change", (e) => {
    const endDate = e.target.value;
    setIssueEndDate(endDate ? new Date(endDate) : null);
  });

  elements.attachmentsCheckbox.addEventListener(
    "change",
    handleAttachmentsCheckboxChange
  );
  elements.createBtn.addEventListener("click", handleCreateButtonClick);
});
