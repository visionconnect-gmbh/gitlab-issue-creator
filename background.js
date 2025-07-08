import { MessageTypes } from "./src/Enums.js";
import { displayNotification, openOptionsPage } from "./src/utils/utils.js";
import { getEmailContent } from "./src/emailContent.js";
import {
  requireValidSettings,
  getProjects,
  createGitLabIssue,
  getCurrentUser,
} from "./src/gitlab/gitlab.js";

const POPUP_PATH = "src/popup/ticket_creator.html"; // Pfad zum Popup

let projectsGlobal = [];
let emailGlobal = null;
let popupWindowId = null;
let popupReady = false;

async function handleBrowserActionClick() {
  try {
    const emailData = await getEmailContent();
    if (!emailData) return;
    emailGlobal = emailData;

    if (!(await requireValidSettings())) {
      openOptionsPage();
      return;
    }

    // Popup öffnen
    const popupWindow = await browser.windows.create({
      url: browser.runtime.getURL(POPUP_PATH),
      type: "popup",
      width: 700,
      height: 850,
    });

    popupWindowId = popupWindow.id;

    // Projekte laden
    getProjects((projects) => {
      projectsGlobal = projects;
      if (popupReady) {
        sendProjectDataToPopup();
      } else {
        // Popup ist noch nicht bereit, warten auf Nachricht
        browser.runtime.onMessage.addListener((msg) => {
          if (msg.type === MessageTypes.POPUP_READY) {
            popupReady = true;
            sendProjectDataToPopup();
          }
        });
      }
    });
  } catch (err) {
    displayNotification(
      "GitLab Ticket Addon",
      `Ein Fehler ist aufgetreten. Fehler: ${err.message}`
    );
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
    });
  } catch (err) {
    console.warn("Could not send message to popup:", err);
  }
}

async function handleRuntimeMessages(msg, sender) {
  const msgType = msg.type;
  if (!msgType) return;

  // TODO: Switch to Enums
  switch (msgType) {
    case MessageTypes.POPUP_READY: {
      popupReady = true;
      sendProjectDataToPopup();
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

      try {
        const assignee = await getCurrentUser();
        await createGitLabIssue(projectId, assignee.id, title, description);
      } catch (error) {
        console.error("Fehler beim Erstellen des GitLab-Issues:", error);
        displayNotification(
          "GitLab Ticket Addon",
          "Fehler beim Erstellen des Tickets: " + error.message
        );
      }
      break;
    }

    case MessageTypes.SETTINGS_UPDATED: {
      // Einstellungen wurden aktualisiert, Popup neu laden
      if (popupWindowId) {
        const tabs = await browser.tabs.query({ windowId: popupWindowId });
        if (tabs.length > 0) {
          await browser.tabs.reload(tabs[0].id);
        }
      }
      break;
    }

    default:
      console.warn("Unbekannter Nachrichtentyp:", msgType);
  }
}

// Add event listeners
browser.browserAction.onClicked.addListener(handleBrowserActionClick);
browser.runtime.onMessage.addListener(handleRuntimeMessages);
