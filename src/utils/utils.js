import { LocalizeKeys, MessageTypes, Popup_MessageTypes } from "./Enums";

const TITLE = browser.i18n.getMessage(LocalizeKeys.EXTENSION.NAME) || "GitLab Issue Creator";

/**
 * Displays a browser notification.
 * @param {string} title The title of the notification.
 * @param {string} message The message content of the notification.
 */
async function displayNotification(message, title = null) {
  if(!title) title = TITLE;

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
    if(!title) title = TITLE;

    const message = browser.i18n.getMessage(messageKey);
    if (message) {
      return displayNotification(message, title);
    } else {
      console.warn(`No localized message found for ID: ${messageKey}`);
      const message = browser.i18n.getMessage(LocalizeKeys.FALLBACK.NO_TRANSLATION) || "An unknown error occurred.";
      return displayNotification(message, title);
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
    displayLocalizedNotification(LocalizeKeys.OPTIONS.ERRORS.ERROR_OPENING);
  });
}

export function closePopup() {
  // Close the popup by sending a message to the background script
  browser.runtime
    .sendMessage({ type: MessageTypes.CLOSE_POPUP })
    .catch((err) => {
      if (!/Receiving end does not exist/i.test(err.message)) {
        console.error("Error closing popup:", err);
        displayLocalizedNotification(LocalizeKeys.POPUP.ERRORS.ERROR_CLOSING);
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

/**
 * Checks if a value is one of the Popup_MessageTypes.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPopupMessageType(value) {
  return Object.values(Popup_MessageTypes).includes(value);
}