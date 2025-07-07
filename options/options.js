// Optionen für die SVG-Pfaddaten zur besseren Lesbarkeit
const EYE_OPEN_PATH =
  "M2.1 3.51L1 4.62l4.02 4.02C3.43 10.18 2.07 11.96 1 14c2.73 3.89 7 7.5 11 7.5 2.13 0 4.25-.7 6.09-1.9l3.29 3.29 1.11-1.11L2.1 3.51zM12 18c-3.03 0-5.5-2.47-5.5-5.5 0-.72.14-1.41.39-2.04l1.52 1.52a3.5 3.5 0 004.62 4.62l1.51 1.51A5.49 5.49 0 0112 18zm6.3-2.3l-2.17-2.17a5.5 5.5 0 00-6.66-6.66L7.3 5.7A13.9 13.9 0 0112 4.5c5 0 9.27 3.61 11 7.5-1.03 2.3-2.61 4.27-4.7 5.7z";

const EYE_CLOSED_PATH =
  "M12 4.5C7 4.5 2.73 8.11 1 12c1.73 3.89 6 7.5 11 7.5s9.27-3.61 11-7.5c-1.73-3.89-6-7.5-11-7.5zm0 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9z ";
document.addEventListener("DOMContentLoaded", async () => {
  const toggleBtn = document.getElementById("toggleVisibility");
  const tokenInput = document.getElementById("gitlabToken");
  const eyeIcon = document.getElementById("eyeIcon");
  const saveButton = document.getElementById("save");

  const cacheClearButton = document.getElementById("clearCacheBtn");

  // Event Listener für den Cache-Löschen-Button
  cacheClearButton.addEventListener("click", async () => {
    try {
      alert("NOT IMPLEMENTED YET");
    } catch (error) {
      console.error("Fehler beim Löschen des Caches:", error);
      alert("Fehler beim Löschen des Caches.");
    }
  });

  // Lade das gespeicherte Token beim Laden der Seite
  const { gitlabToken } = await browser.storage.local.get(["gitlabToken"]);
  tokenInput.value = gitlabToken || "";

  // Initialisiere den Sichtbarkeitsstatus
  let isTokenVisible = false;

  // Event Listener für die Umschaltfläche der Sichtbarkeit
  toggleBtn.addEventListener("click", () => {
    isTokenVisible = !isTokenVisible;
    tokenInput.type = isTokenVisible ? "text" : "password";
    eyeIcon.setAttribute("d", isTokenVisible ? EYE_OPEN_PATH : EYE_CLOSED_PATH);
  });

  // Event Listener für den Speichern-Button
  saveButton.addEventListener("click", async () => {
    const currentToken = tokenInput.value.trim();

    if (!currentToken) {
      alert("Bitte geben Sie ein gültiges GitLab-Token ein.");
      return;
    }

    try {
      await browser.storage.local.set({ gitlabToken: currentToken });
      alert("Einstellungen erfolgreich gespeichert!");
      browser.runtime.sendMessage({ type: "settings-updated" });
      window.close();
    } catch (error) {
      console.error("Fehler beim Speichern der Einstellungen:", error);
      alert("Fehler beim Speichern der Einstellungen.");
    }
  });
});
