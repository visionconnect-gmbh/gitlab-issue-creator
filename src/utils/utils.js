/**
 * Displays a browser notification.
 * @param {string} title The title of the notification.
 * @param {string} message The message content of the notification.
 */
async function displayNotification(message, title = "GitLab Ticket Creator") {
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
  title = "GitLab Ticket Creator"
) {
  try {
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
    displayNotification("GitLab Ticket Addon", "Fehler beim Öffnen der Einstellungen.");
  });
}
