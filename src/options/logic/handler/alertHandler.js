import { LocalizeKeys } from "../../../utils/Enums.js";

/**
 * Shows an alert message with localization support.
 * @param {string} [messageKey]
 */
export const alertMessage = (messageKey) => {
  const message = browser.i18n.getMessage(
    messageKey || LocalizeKeys.NOTIFICATION.GENERIC_ERROR
  );
  if (!message)
    console.warn(`No localized message found for ID: ${messageKey}`);
  else alert(message);
};

/**
 * Logs an error and shows a user alert.
 * @param {string} messageKey
 * @param {Error} error
 */
export const handleError = (messageKey, error) => {
  const message = browser.i18n.getMessage(messageKey);
  console.error(message || "Error:", error);
  alert(`${message || "Error"}\n${error?.message || ""}`);
};
