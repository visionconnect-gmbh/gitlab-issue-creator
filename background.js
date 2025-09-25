import { handleMessage } from "./src/background/handler/messageHandler.js";
import {
  openPopup,
} from "./src/background/handler/popupHandler.js";
import { State } from "./src/background/backgroundState.js";
import { getGitLabSettings, getProjects } from "./src/gitlab/gitlab.js";
import { getEmailContent } from "./src/email/emailParser.js";
import { LocalizeKeys } from "./src/utils/Enums.js";
import { displayLocalizedNotification } from "./src/utils/utils.js";

async function handleClick(messageId = null) {
  if (!(await getGitLabSettings())) return;

  const msg = messageId
    ? await browser.messages.get(messageId)
    : await getMessage();

  if (!msg) {
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.NO_MESSAGE_SELECTED);
    return;
  }

  const email = await getEmailContent(msg);
  if (!email) {
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.NO_EMAIL_CONTENT);
    return;
  }
  
  const projects = await getProjects();
  State.setEmail(email);
  State.setProjects(projects);

  openPopup();
}

async function getMessage() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return await browser.messageDisplay.getDisplayedMessage(tab.id);
}

function init() {
  const ADDON_ID = "create-gitlab-issue";
  browser.menus.create({
    id: ADDON_ID,
    title: browser.i18n.getMessage(LocalizeKeys.BROWSER.ACTION_TITLE),
    contexts: ["message_list"],
  });

  browser.menus.onClicked.addListener(async (info) => {
    if (info.menuItemId === ADDON_ID) {
      await handleClick(info.selectedMessages.messages[0]?.id || null);
    }
  });

  browser.browserAction.onClicked.addListener(async () => await handleClick(null));
  browser.runtime.onMessage.addListener(handleMessage);
}

init();
