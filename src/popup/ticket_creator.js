// popup/main.js
import { MessageTypes } from "../Enums.js";
import { getCurrentUser } from "../gitlab/gitlab.js";
import {
  elements,
  setSelectedAssigneeId,
  setCurrentAssignees,
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

  getCurrentUser().then((user) => {
    if (user) {
      setSelectedAssigneeId(user.id);
      setCurrentAssignees([user]); // Initialize currentAssignees with current user
      renderAssignees();
      elements.assigneeSelect.value = user.id;
    } else {
      elements.assigneeSelect.addEventListener("change", async (e) => {
        setSelectedAssigneeId(e.target.value || (await getCurrentUser()).id);
      });
    }
  });

  elements.attachmentsCheckbox.addEventListener(
    "change",
    handleAttachmentsCheckboxChange
  );
  elements.createBtn.addEventListener("click", handleCreateButtonClick);
});
