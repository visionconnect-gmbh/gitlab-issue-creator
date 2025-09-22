import { LocalizeKeys, MessageTypes } from "./Enums";

/**
 * Displays a browser notification.
 * @param {string} title The title of the notification.
 * @param {string} message The message content of the notification.
 */
async function displayNotification(message, title = null) {
  if (!title) {
    title = browser.i18n.getMessage(LocalizeKeys.EXTENSION.NAME) || "GitLab Issue Creator";
  }
  const notificationId = await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48px.png"),
    title: title,
    message: message,
  });
  return notificationId;
}

export async function displayLocalizedNotification(
  messageKey,
  title = null
) {
  try {
    if (!title) {
      title = browser.i18n.getMessage(LocalizeKeys.EXTENSION.NAME) || "GitLab Issue Creator";
    }

    const message = browser.i18n.getMessage(messageKey);
    if (message) {
      return displayNotification(message, title);
    } else {
      console.warn(`No localized message found for ID: ${messageKey}`);
      return displayNotification(
        `No localized message found for ID: ${messageKey}`,
        title
      );
    }
  } catch (error) {
    console.error("Error displaying localized notification:", error);
    return displayNotification(
      "Error displaying notification: " + error.message,
      title
    );
  }
}

export function openOptionsPage() {
  browser.runtime.openOptionsPage().catch((error) => {
    console.error("Error opening options page:", error);
    displayNotification("Error opening options page: " + error.message);
  });
}

export function closePopup() {
  // Close the popup by sending a message to the background script
  browser.runtime
    .sendMessage({ type: MessageTypes.CLOSE_POPUP })
    .catch((err) => {
      if (!/Receiving end does not exist/i.test(err.message)) {
        console.error("Error closing popup:", err);
        displayNotification("Error closing popup: " + err.message);
      }
    });
}

export function getUILanguage() {
  const lang = browser.i18n.getUILanguage();
  if (!lang) {
    console.warn("No UI language set, defaulting");
    // Default to default language in manifest.json
    const defaultLang = browser.runtime.getManifest().default_locale || "en";
    return defaultLang;
  }
  return lang;
}

export async function getAddonVersion() {
  const version = await browser.runtime.getManifest().version;
  return version || "unknown";
}