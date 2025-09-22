import { State, reset } from "../backgroundState.js";
import { MessageTypes } from "../../utils/Enums.js";

const POPUP_PATH = "src/popup/issue_creator.html";

export async function openPopup() {
  // Close the last popup and await it fully
  await closeLastPopup();

  // Create the new popup
  const popup = await browser.windows.create({
    url: browser.runtime.getURL(POPUP_PATH),
    type: "popup",
    width: 700,
    height: 900,
  });

  // Update state after popup is created
  State.setPopupWindowId(popup.id);

  // Each popup gets its own dedicated listener
  const handler = (windowId) => {
    if (windowId === popup.id) {
      reset();
      State.setLastPopupWindowId(null);
      browser.windows.onRemoved.removeListener(handler);
    }
  };

  browser.windows.onRemoved.addListener(handler);
}

export async function closePopup() {
  const id = State.getPopupWindowId();
  if (!id) return;

  try {
    await browser.windows.remove(id);
  } catch (e) {
    console.warn("Popup already closed or invalid:", e);
  }

  reset();
  State.setPopupWindowId(null);
  State.setLastPopupWindowId(null);
}

// Wait for the last popup to fully close before creating a new one
async function closeLastPopup() {
  const lastId = State.getLastPopupWindowId();
  if (!lastId) return;

  try {
    await browser.windows.remove(lastId);
  } catch (e) {
    console.warn("Last popup already closed or invalid:", e);
  }

  State.setLastPopupWindowId(null);
}

async function validateTab() {
  const winId = State.getPopupWindowId();
  if (!winId) return -1;

  const [tab] = await browser.tabs.query({ windowId: winId });
  if (!tab) return -1;

  if (!isPopup(tab)) return -1;

  return tab.id;
}

export async function sendInitialDataToPopup() {
  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn("Popup tab not found or invalid.");
    return;
  }

  const email = State.getEmail();
  if (!email) {
    console.warn("No email data available to send to popup.");
    return;
  }

  const projects = State.getProjects();

  await browser.tabs.sendMessage(tabId, {
    type: MessageTypes.INITIAL_DATA,
    email,
    projects,
  });
}

export async function sendProjectsToPopup() {
  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn("Popup tab not found or invalid.");
    return;
  }

  const projects = State.getProjects();

  await browser.tabs.sendMessage(tabId, {
    type: MessageTypes.PROJECT_LIST,
    projects,
  });
}

export function isPopup(tab) {
  if (!tab?.title) return false;

  const { type, title, url } = tab;

  return (
    type === "popup" ||
    title.toLowerCase().includes("popup") ||
    url.includes(POPUP_PATH)
  );
}
