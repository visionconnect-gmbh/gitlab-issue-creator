/**
 * Displays a browser notification.
 * @param {string} title The title of the notification.
 * @param {string} message The message content of the notification.
 */
export function displayNotification(title, message) {
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.png"),
    title: title,
    message: message,
  });
}
