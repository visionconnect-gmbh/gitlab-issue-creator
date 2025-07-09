/**
 * Displays a browser notification.
 * @param {string} title The title of the notification.
 * @param {string} message The message content of the notification.
 */
export async function displayNotification(title, message) {
  const notificationId = await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48px.png"),
    title: title,
    message: message,
  });
  return notificationId;
}

export function openOptionsPage() {
  browser.runtime.openOptionsPage().catch((error) => {
    console.error("Error opening options page:", error);
    displayNotification("GitLab Ticket Addon", "Fehler beim Öffnen der Einstellungen.");
  });
}
