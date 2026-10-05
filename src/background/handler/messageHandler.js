import {
  MessageTypes,
  LocalizeKeys,
  Popup_MessageTypes,
} from "../../utils/Enums.js";
import { State } from "../backgroundState.js";
import {
  closePopup,
  isPopup,
  notifyIssueCreateFailed,
  sendAssigneesToPopup,
  sendLabelsToPopup,
  sendInitialDataToPopup,
  sendProjectsToPopup,
  sendProjectSearchResult,
} from "./popupHandler.js";
import {
  createGitLabIssue,
  getCurrentUser,
} from "../../gitlab/gitlab.js";
import { displayLocalizedNotification } from "../../utils/utils.js";
import { transformToMarkdown } from "../../utils/markdownLineBreaks.js";

/** Handles incoming messages from the popup.
 * @param {Object} msg - The incoming message object.
 */
export async function handleMessage(msg) {
  if (!msg) {
    console.warn("Received null/undefined message");
    return; // Stop processing if message is invalid
  }

  try {
    switch (msg.type) {
      case Popup_MessageTypes.POPUP_READY:
        State.setPopupReady(true);
        State.setPopupWindowId(msg.tabId || null);
        break;

      case Popup_MessageTypes.REQUEST_INITIAL_DATA:
        await sendInitialDataToPopup();
        break;

      case Popup_MessageTypes.REQUEST_PROJECTS:
        await sendProjectsToPopup();
        break;

      case Popup_MessageTypes.REQUEST_PROJECT_SEARCH:
        await sendProjectSearchResult(msg.query, msg.seq);
        break;

      case Popup_MessageTypes.REQUEST_ASSIGNEES:
        await sendAssigneesToPopup(msg.projectId, msg.project);
        break;

      case Popup_MessageTypes.REQUEST_LABELS:
        await sendLabelsToPopup(msg.projectId);
        break;

      case Popup_MessageTypes.REPORT_UPLOADS:
        State.setPendingUploads(msg.uploads ?? []);
        break;

      case Popup_MessageTypes.CREATE_GITLAB_ISSUE:
        await handleCreateIssue(msg);
        break;

      case MessageTypes.SETTINGS_UPDATED:
        await reloadPopup();
        break;

      case MessageTypes.CLOSE_POPUP:
        closePopup();
        break;

      default:
        console.warn("Unknown message type:", msg.type);
    }
  } catch (err) {
    console.error("Runtime message error:", err);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
  }
}

/** Handles the creation of a GitLab issue based on the message data.
 * @param {Object} msg - The incoming message object containing issue details.
 */
async function handleCreateIssue(msg) {
  const projectId = msg.projectId;
  const title = msg.title?.trim() || `Email: ${State.getEmail().subject}`;
  const description = transformToMarkdown(msg.description || "");
  const endDate = msg.endDate;

  try {
    const assignee = msg.assignee || (await getCurrentUser());
    // createGitLabIssue() always handles its own errors (notification +
    // cache cleanup) and returns false rather than throwing, so its result,
    // not a catch here, is what decides whether to close the popup.
    const created = await createGitLabIssue(projectId, assignee, title, description, endDate, msg.labels || []);

    if (created) {
      // The uploads just referenced by this issue are no longer orphans:
      // drop them before closePopup()'s own cleanup would otherwise delete them.
      State.takePendingUploads();
      closePopup();
    } else {
      await notifyIssueCreateFailed();
    }
  } catch (err) {
    // Reaches here only for a failure outside createGitLabIssue itself,
    // e.g. getCurrentUser() or a malformed email with no subject.
    console.error("Issue creation failed:", err);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    await notifyIssueCreateFailed();
  }
}

/** Reloads the popup tab if it exists and is valid.
 * If the tab is not a popup, clears the popup state.
 */
async function reloadPopup() {
  const [tab] = await browser.tabs.query({
    windowId: State.getPopupWindowId(),
  });
  if (tab) {
    // check if tab is actually popup
    if (isPopup(tab)) {
      await browser.tabs.reload(tab.id);
    } else {
      State.setPopupWindowId(null);
      State.setPopupReady(false);
    }
  }
}
