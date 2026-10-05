import { Popup_MessageTypes } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
import { getCurrentUser } from "../gitlab/gitlab.js";
import {
  elements,
  setSelectedAssigneeId,
  setCurrentAssignees,
  setIssueEndDate,
} from "./logic/popupState.js";
import { renderAssignees } from "./logic/ui.js";
import { setupAttachmentDragDrop } from "./logic/attachmentDragDrop.js";
import { resetEditor } from "./logic/handler/resetHandler.js";
import {
  handleIncomingMessage,
  handleProjectSearchInput,
  handleProjectSearchKeydown,
  handleProjectSearchBlur,
  handleProjectSearchFocus,
  handleProjectOptionMouseDown,
} from "./logic/handler/projectHandler.js";
import {
  handleAttachmentButtonClick,
  handleLabelsButtonClick,
  handleCreateButtonClick,
} from "./logic/handler/issueHandler.js";

document.addEventListener("DOMContentLoaded", init);

/**
 * Initializes the popup by setting up event listeners, loading initial data,
 * and notifying the background script that the popup is ready.
 */
async function init() {
  // resetEditor() already reads the assignee-loading setting and calls
  // setIsAssigneeLoadingEnabled(), so there is no need to read it again here.
  await resetEditor();
  localizeHtmlPage();

  const currentTab = await browser.tabs.getCurrent();

  const {
    projectSearch,
    projectSuggestions,
    assigneeSelect,
    issueEnd,
    createBtn,
    attachmentsButton,
    labelsButton,
    issueDescription,
  } = elements;

  setupProjectSearch(projectSearch, projectSuggestions);
  setupIssueEnd(issueEnd);
  attachmentsButton.addEventListener("click", handleAttachmentButtonClick);
  labelsButton.addEventListener("click", handleLabelsButtonClick);
  setupAttachmentDragDrop(issueDescription);
  createBtn.addEventListener("click", handleCreateButtonClick);

  // Register the listener before anything is sent: a message the
  // background sends before this line exists would otherwise be lost
  // silently, with no way to recover it.
  browser.runtime.onMessage.addListener(handleIncomingMessage);
  browser.runtime.sendMessage({
    type: Popup_MessageTypes.POPUP_READY,
    tabId: currentTab.windowId,
  });
  browser.runtime.sendMessage({
    type: Popup_MessageTypes.REQUEST_INITIAL_DATA,
  });

  // Off the critical path: the assignee select fills in once the user
  // profile resolves, but doesn't block project loading or the rest of the
  // popup becoming interactive.
  void setupAssigneeSelect(assigneeSelect);
}

/**
 * Sets up the project search combobox: the text input plus its suggestion
 * listbox.
 * @param {HTMLInputElement} projectSearch The project search input element.
 * @param {HTMLUListElement} projectSuggestions The suggestion listbox element.
 */
function setupProjectSearch(projectSearch, projectSuggestions) {
  projectSearch.addEventListener("input", handleProjectSearchInput);
  projectSearch.addEventListener("keydown", handleProjectSearchKeydown);
  projectSearch.addEventListener("focus", handleProjectSearchFocus);
  projectSearch.addEventListener("blur", handleProjectSearchBlur);
  projectSuggestions.addEventListener("mousedown", handleProjectOptionMouseDown);
}

/**
 * Sets up the assignee select element.
 * @param {HTMLSelectElement} assigneeSelect The assignee select element.
 */
async function setupAssigneeSelect(assigneeSelect) {
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
}

/**
 * Sets up the issue end date input field.
 * @param {HTMLInputElement} issueEnd The issue end date input element.
 */
function setupIssueEnd(issueEnd) {
  issueEnd.addEventListener("change", (e) => {
    setIssueEndDate(e.target.value ? new Date(e.target.value) : null);
  });
}
