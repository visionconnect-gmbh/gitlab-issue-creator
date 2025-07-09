import {
  getAssignees,
  getProjects,
  requireValidSettings,
  createGitLabIssue,
  getCurrentUser,
} from "./src/gitlab/gitlab.js";
import { MessageTypes } from "./src/Enums.js";
import { displayNotification, openOptionsPage } from "./src/utils/utils.js";
import { getEmailContent } from "./src/emailContent.js";

const POPUP_PATH = "src/popup/ticket_creator.html";

let projectsGlobal = [];
let assigneesGlobal = {}; // key: projectId, value: assignees array
let emailGlobal = null;
let popupWindowId = null;
let popupReady = false;

async function handleBrowserActionClick() {
  try {
    if (!(await requireValidSettings())) {
      console.warn("GitLab settings are not valid.");
      openOptionsPage();
      return;
    }

    const emailData = await getEmailContent();
    if (!emailData) return;
    emailGlobal = emailData;

    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL(POPUP_PATH),
      type: "popup",
      width: 700,
      height: 900,
    });

    popupWindowId = popupWindow.id;

    // Load projects and send to popup
    getProjects(async (projects) => {
      projectsGlobal = projects;

      if (popupReady) {
        sendProjectDataToPopup();
      } else {
        browser.runtime.onMessage.addListener((msg) => {
          if (msg.type === MessageTypes.POPUP_READY) {
            popupReady = true;
            sendProjectDataToPopup();
          }
        });
      }
    });
  } catch (err) {
    displayNotification("GitLab Ticket Addon", `Error: ${err.message}`);
  }
}

async function sendProjectDataToPopup() {
  if (!popupWindowId) return;
  const tabs = await browser.tabs.query({ windowId: popupWindowId });
  if (tabs.length === 0) {
    console.warn("Popup window tab not found.");
    return;
  }

  try {
    await browser.tabs.sendMessage(tabs[0].id, {
      type: MessageTypes.PROJECT_LIST,
      projects: projectsGlobal,
      email: emailGlobal,
      assignees: assigneesGlobal ? assigneesGlobal : null,
    });
  } catch (err) {
    console.warn("Could not send message to popup:", err);
  }
}

async function handleRuntimeMessages(msg, sender) {
  switch (msg.type) {
    case MessageTypes.POPUP_READY:
      popupReady = true;
      sendProjectDataToPopup();
      break;

    case MessageTypes.REQUEST_ASSIGNEES: {
      // Lazy load assignees for a single project on demand from popup
      const projectId = msg.projectId;
      if (!projectId) return;
      if (!assigneesGlobal[projectId]) {
        try {
          assigneesGlobal[projectId] = await getAssignees(projectId);
        } catch {
          assigneesGlobal[projectId] = [];
        }
      }
      const tabs = await browser.tabs.query({ windowId: popupWindowId });
      if (tabs.length > 0) {
        await browser.tabs.sendMessage(tabs[0].id, {
          type: MessageTypes.ASSIGNEES_RESPONSE,
          projectId,
          assignees: assigneesGlobal[projectId],
        });
      }
      break;
    }

    case MessageTypes.CREATE_GITLAB_ISSUE: {
      const projectId = msg.projectId;
      const title = msg.title?.trim() || `Email: ${emailGlobal.subject}`;

      const conversation = emailGlobal.conversationHistory
        .map((entry) => {
          const header = entry.from
            ? `**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}`
            : "";
          return `${header}\n\n${entry.message}`;
        })
        .join("\n\n---\n\n");

      const description = msg.description?.trim() || conversation;
      const issueEnd = msg.endDate;
      try {
        const assignee = msg.assignee || (await getCurrentUser());
        await createGitLabIssue(
          projectId,
          assignee,
          title,
          description,
          issueEnd
        );
      } catch (error) {
        console.error("Error creating GitLab issue:", error);
        displayNotification(
          "GitLab Ticket Addon",
          "Error creating ticket: " + error.message
        );
      }
      break;
    }

    case MessageTypes.SETTINGS_UPDATED: {
      if (popupWindowId) {
        const tabs = await browser.tabs.query({ windowId: popupWindowId });
        if (tabs.length > 0) {
          await browser.tabs.reload(tabs[0].id);
        }
      }
      break;
    }

    default:
      console.warn("Unknown message type:", msg.type);
  }
}

browser.browserAction.onClicked.addListener(handleBrowserActionClick);
browser.runtime.onMessage.addListener(handleRuntimeMessages);
