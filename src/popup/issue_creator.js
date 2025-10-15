import { Popup_MessageTypes } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
import { getCurrentUser } from "../gitlab/gitlab.js";
import {
  elements,
  setSelectedAssigneeId,
  setCurrentAssignees,
  setIssueEndDate,
} from "./logic/popupState.js";
import {
  loadAttachmentsPreview,
  renderAssignees,
  toggleAttachmentSelectorVisibility,
} from "./logic/ui.js";
import { resetEditor } from "./logic/handler/resetHandler.js";
import {
  handleIncomingMessage,
  handleProjectSearchChange,
  handleProjectSearchInput,
} from "./logic/handler/projectHandler.js";
import {
  handleAttachmentButtonClick,
  handleCreateButtonClick,
} from "./logic/handler/issueHandler.js";

document.addEventListener("DOMContentLoaded", init);

/**
 * Initializes the popup by setting up event listeners, loading initial data,
 * and notifying the background script that the popup is ready.
 */
async function init() {
  await resetEditor();
  localizeHtmlPage();

  const currentTab = await browser.tabs.getCurrent();

  const {
    projectSearch,
    assigneeSelect,
    issueEnd,
    createBtn,
    attachmentsButton,
    attachmentSelectorBackdrop,
    loadAttachmentsPreviewBtn,
    closeAttachmentSelectorBtn,
  } = elements;

  setupProjectSearch(projectSearch);
  await setupAssigneeSelect(assigneeSelect);
  setupIssueEnd(issueEnd);
  setupAttachmentHandling(
    attachmentsButton,
    attachmentSelectorBackdrop,
    closeAttachmentSelectorBtn,
    loadAttachmentsPreviewBtn
  );
  createBtn.addEventListener("click", handleCreateButtonClick);
  
  browser.runtime.sendMessage({
    type: Popup_MessageTypes.POPUP_READY,
    tabId: currentTab.windowId,
  });
  browser.runtime.onMessage.addListener(handleIncomingMessage);
  browser.runtime.sendMessage({
    type: Popup_MessageTypes.REQUEST_INITIAL_DATA,
  });
}

/**
 * Sets up the project search input field.
 * @param {HTMLInputElement} projectSearch The project search input element.
 */
function setupProjectSearch(projectSearch) {
  projectSearch.addEventListener("input", handleProjectSearchInput);
  projectSearch.addEventListener("change", handleProjectSearchChange);
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

/** Sets up attachment handling including button clicks and backdrop interactions.
 * @param {HTMLButtonElement} attachmentsButton The button to open the attachment selector.
 * @param {HTMLElement} backdrop The backdrop element for the attachment selector.
 * @param {HTMLButtonElement} closeBtn The button to close the attachment selector.
 * @param {HTMLButtonElement} previewBtn The button to load the attachment preview.
 */
function setupAttachmentHandling(
  attachmentsButton,
  backdrop,
  closeBtn,
  previewBtn
) {
  attachmentsButton.addEventListener("click", handleAttachmentButtonClick);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) toggleAttachmentSelectorVisibility();
  });

  closeBtn.addEventListener("click", toggleAttachmentSelectorVisibility);
  previewBtn.addEventListener("click", loadAttachmentsPreview);
}
