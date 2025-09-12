import { MessageTypes } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
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

const CACHE_KEY = "ticket_creator";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await resetEditor();
  localizeHtmlPage(CACHE_KEY);

  browser.runtime.sendMessage({ type: MessageTypes.POPUP_READY });
  browser.runtime.onMessage.addListener(handleIncomingMessage);

  const {
    projectSearch,
    assigneeSelect,
    issueEnd,
    attachmentsCheckbox,
    createBtn,
  } = elements;

  // Input listeners
  projectSearch.addEventListener("input", handleProjectSearchInput);
  projectSearch.addEventListener("change", handleProjectSearchChange);

  // Assignee setup
  assigneeSelect.addEventListener("change", async (e) => {
    const selectedId = e.target.value || (await getCurrentUser()).id;
    setSelectedAssigneeId(selectedId);
  });

  const user = await getCurrentUser();
  if (user) {
    setSelectedAssigneeId(user.id);
    setCurrentAssignees([user]);
    renderAssignees();
    assigneeSelect.value = user.id;
  }

  // End date
  issueEnd.addEventListener("change", (e) => {
    const date = e.target.value;
    setIssueEndDate(date ? new Date(date) : null);
  });

  // Other handlers
  attachmentsCheckbox.addEventListener("change", handleAttachmentsCheckboxChange);
  createBtn.addEventListener("click", handleCreateButtonClick);
}
