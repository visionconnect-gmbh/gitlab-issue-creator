let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;

console.log("GitLab Ticket Addon: Projekt-Auswahl Popup geladen");

const projectSearch = document.getElementById("projectSearch");
const projectSuggestions = document.getElementById("projectSuggestions");
const ticketTitle = document.getElementById("ticketTitle");
const ticketDescription = document.getElementById("ticketDescription");
const createBtn = document.getElementById("create");

// Signalisiere Background, dass das Popup bereit ist
browser.runtime.sendMessage({ type: "popup-ready" });

// Empfange Nachricht mit Projektliste und E-Mail-Daten
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
          descriptionContent += `\n---\n\n**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}\n\n`;
        }
        descriptionContent += `${entry.message}\n`;
      });
    } else {
      descriptionContent = "(Kein Konversationsverlauf verfügbar)";
    }

    ticketDescription.value = descriptionContent.trim();
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

createBtn.addEventListener("click", () => {
  if (!selectedProjectId) {
    displayNotification(
      "GitLab Ticket Addon",
      "Bitte gib ein gültiges Projekt aus der Vorschlagsliste ein."
    );
    return;
  }

  browser.runtime.sendMessage({
    type: "project-selected",
    projectId: selectedProjectId,
    title: ticketTitle.value,
    description: ticketDescription.value,
  });

  window.close();
});

function renderProjectSuggestions() {
  projectSuggestions.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const option = document.createElement("option");
    option.value = proj.name_with_namespace || proj.name || "Unbekannt";
    projectSuggestions.appendChild(option);
  });
}

function displayNotification(title, message) {
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48px.png"),
    title: title,
    message: message,
  });
}
