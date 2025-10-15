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

/** Displays a localized notification using a message key from _locales.
 * If the message key is not found, it falls back to a default error message.
 * @param {string} messageKey The key for the localized message.
 * @param {string|null} title Optional title for the notification. Defaults to extension name.
 */
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

/** Opens the options page of the extension.
 * If the options page cannot be opened, it catches the error and logs it.
 */
export function openOptionsPage() {
  browser.runtime.openOptionsPage().catch((error) => {
    console.error("Error opening options page:", error);
    displayLocalizedNotification(LocalizeKeys.OPTIONS.ERRORS.ERROR_OPENING);
  });
}

/** Opens the popup by sending a message to the background script.
 * If the background script is not available, it catches the error and logs it.
 */
export function openPopup() {
  browser.runtime
    .sendMessage({ type: MessageTypes.OPEN_POPUP })
    .catch((err) => {
      console.error("Error opening popup:", err);
      displayLocalizedNotification(LocalizeKeys.POPUP.ERRORS.ERROR_OPENING);
    });
}

/** Closes the popup by sending a message to the background script.
 * If the background script is not available, it catches the error and logs it.
 */
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

/**
 * Gets the UI language, defaults to manifest.json default_locale or 'en'
 * @returns {string} The UI language code, e.g. "en", "de"
 */
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

/**
 * Gets the addon version from the manifest.
 * @returns {Promise<string>} The addon version from manifest.json or "unknown"
 */
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