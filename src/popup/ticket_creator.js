let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;

// Doku: https://github.com/Ionaru/easy-markdown-editor#configuration
const easyMDE = new EasyMDE({
  element: document.getElementById("ticketDescription"),
  spellChecker: false, // Rechtschreibprüfung deaktiviert (kann bei Bedarf aktiviert werden)
  autosave: {
    // Optional: Speichert den Inhalt im LocalStorage
    enabled: true,
    delay: 1000,
    uniqueId: "gitlab-ticket-creator-description-popup", // Eindeutiger ID für dieses Popup
  },
  status: false, // Optional: Statusleiste unten (Zeichenzähler etc.)
  forceSync: true, // Sehr wichtig: Stellt sicher, dass die ursprüngliche Textarea immer den aktuellen Inhalt des Editors hat.
  // Optionen für die Toolbar, falls gewünscht. Standard-Toolbar enthält meist auch Preview.
  toolbar: [
    "bold",
    "italic",
    "heading",
    "|",
    "quote",
    "unordered-list",
    "ordered-list",
    "|",
    "link",
    "image",
    "|",
    "preview",
    "side-by-side",
    "fullscreen",
    "|",
    "guide",
  ],
});

console.log("GitLab Ticket Addon: Projekt-Auswahl Popup geladen");

const projectSearch = document.getElementById("projectSearch");
const projectSuggestions = document.getElementById("projectSuggestions");
const ticketTitle = document.getElementById("ticketTitle");
// Die ursprüngliche ticketDescription Textarea wird jetzt von EasyMDE verwaltet.
const createBtn = document.getElementById("create");

// Signalisiere Background, dass das Popup bereit ist
browser.runtime.sendMessage({ type: "popup-ready" });

// Empfange Nachricht mit Projektliste und E-Mail-Daten vom Background-Script
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "project-list" && msg.email) {
    projects = msg.projects || [];
    filteredProjects = projects;
    renderProjectSuggestions();

    messageData = msg.email;
    ticketTitle.value = messageData.subject || "";

    let descriptionContent = "";
    if (
      messageData.conversationHistory &&
      messageData.conversationHistory.length > 0
    ) {
      messageData.conversationHistory.forEach((entry) => {
        if (entry.from) {
          // Verwende Markdown für Formatierung
          descriptionContent += `\n---\n\n**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}\n\n`;
        }
        descriptionContent += `${entry.message}\n`;
      });
    } else {
      descriptionContent = "(Kein Konversationsverlauf verfügbar)";
    }

    // Setze den Inhalt des EasyMDE-Editors
    easyMDE.value(descriptionContent.trim());
  }
});

projectSearch.addEventListener("input", () => {
  const search = projectSearch.value.toLowerCase();
  filteredProjects = projects.filter((p) =>
    (p.name_with_namespace || p.name || "").toLowerCase().includes(search)
  );
  renderProjectSuggestions();

  // Prüfen, ob exakter Match → Projekt-ID setzen
  const match = projects.find(
    (p) => (p.name_with_namespace || p.name || "").toLowerCase() === search
  );
  selectedProjectId = match ? match.id : null;
});

// Listener für das 'change'-Event auf der Datalist, um die ID zu setzen, wenn ein Vorschlag gewählt wird
projectSearch.addEventListener("change", () => {
  const selectedOption = Array.from(projectSuggestions.options).find(
    (option) => option.value === projectSearch.value
  );
  selectedProjectId = selectedOption
    ? projects.find(
        (p) => (p.name_with_namespace || p.name) === selectedOption.value
      )?.id
    : null;
});

createBtn.addEventListener("click", () => {
  if (!selectedProjectId) {
    displayNotification(
      "GitLab Ticket Addon",
      "Bitte gib ein gültiges Projekt aus der Vorschlagsliste ein."
    );
    return;
  }

  // Hole den Markdown-Inhalt vom EasyMDE-Editor
  const ticketDescriptionMarkdown = easyMDE.value();

  browser.runtime.sendMessage({
    type: "create-gitlab-issue",
    projectId: selectedProjectId,
    title: ticketTitle.value,
    description: ticketDescriptionMarkdown, // Sende den Markdown-Inhalt
  });

  setTimeout(() => {
    window.close();
  }, 100);
});

function renderProjectSuggestions() {
  projectSuggestions.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const option = document.createElement("option");
    option.value = proj.name_with_namespace || proj.name || "Unbekannt";
    projectSuggestions.appendChild(option);
  });
}
