import {
  MessageTypes,
  LocalizeKeys,
  Popup_MessageTypes,
} from "../../utils/Enums.js";
import { State } from "../backgroundState.js";
import {
  closePopup,
  isPopup,
  sendAssigneesToPopup,
  sendInitialDataToPopup,
  sendProjectsToPopup,
} from "./popupHandler.js";
import {
  createGitLabIssue,
  getCurrentUser,
} from "../../gitlab/gitlab.js";
import { displayLocalizedNotification } from "../../utils/utils.js";

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
        
      case Popup_MessageTypes.REQUEST_ASSIGNEES:
        await sendAssigneesToPopup(msg.projectId);
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

async function handleCreateIssue(msg) {
  const projectId = msg.projectId;
  const title = msg.title?.trim() || `Email: ${State.getEmail().subject}`;
  const description = transformToMarkdown(msg.description || "");
  const endDate = msg.endDate;

  try {
    const assignee = msg.assignee || (await getCurrentUser());
    await createGitLabIssue(projectId, assignee, title, description, endDate);
    closePopup();
  } catch (err) {
    console.error("Issue creation failed:", err);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
  }
}

/**
 * Transforms plain text to markdown by replacing single newlines with <br>.
 * Consecutive newlines (i.e. paragraphs) are preserved.
 * @param {string} text - The input plain text.
 * @returns {string} - The transformed markdown text.
 */
function transformToMarkdown(text) {
  return (
    text
      // First normalize CRLF/CR → LF
      .replace(/\r\n?/g, "\n")
      // Replace single newline (not preceded/followed by another newline) with <br>
      .replace(/([^\n])\n(?!\n)/g, "$1<br>\n")
  );
}

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
