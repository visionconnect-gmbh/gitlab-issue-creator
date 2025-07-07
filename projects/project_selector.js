let projects = [];
let filteredProjects = [];
let messageData = null; // Wird jetzt das Objekt mit subject, author, date und conversationHistory enthalten

console.log("GitLab Ticket Addon: Projekt-Auswahl Popup geladen");

const projectSelect = document.getElementById("projectSelect");
const projectSearch = document.getElementById("projectSearch");
const ticketTitle = document.getElementById("ticketTitle");
const ticketDescription = document.getElementById("ticketDescription");
const createBtn = document.getElementById("create");

// Signalisiere Background, dass das Popup bereit ist
browser.runtime.sendMessage({ type: "popup-ready" });

// Empfange Nachrichten mit Projektliste und E-Mail-Daten
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "project-list" && msg.email) {
    // Dies ist der Nachrichtentyp, der jetzt sowohl Projekte als auch E-Mail-Daten enthält.
    projects = msg.projects || [];
    filteredProjects = projects;
    renderProjectList();

    messageData = msg.email; // messageData enthält jetzt conversationHistory
    ticketTitle.value = messageData.subject || "";

    // Generiere die Ticket-Beschreibung aus dem conversationHistory-Array
    let descriptionContent = "";
    if (
      messageData.conversationHistory &&
      messageData.conversationHistory.length > 0
    ) {
      // Option 1: Konversation in der Reihenfolge der E-Mail (neueste zuerst)
      // Dies spiegelt die Darstellung im E-Mail-Client wider.
      messageData.conversationHistory.forEach((entry) => {
        // Füge nur einen Header hinzu, wenn der Absender bekannt ist (also keine erste/aktuelle Nachricht)
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

function renderProjectList() {
  projectSelect.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const option = document.createElement("option");
    option.value = proj.id;
    option.textContent = proj.name_with_namespace || proj.name || "Unbekannt";
    projectSelect.appendChild(option);
  });
  if (projectSelect.options.length > 0) {
    projectSelect.selectedIndex = 0;
  }
}

// Filter für Projektsuche
projectSearch.addEventListener("input", () => {
  const search = projectSearch.value.toLowerCase();
  filteredProjects = projects.filter((p) =>
    (p.name_with_namespace || p.name || "").toLowerCase().includes(search)
  );
  renderProjectList();
});

// Ticket erstellen
createBtn.addEventListener("click", () => {
  if (projectSelect.selectedOptions.length === 0) {
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon.png"),
      title: "GitLab Ticket Addon",
      message: "Bitte ein Projekt auswählen.",
    });
    return;
  }
  const projectId = projectSelect.value;
  browser.runtime.sendMessage({
    type: "project-selected",
    projectId,
    title: ticketTitle.value,
    description: ticketDescription.value,
  });
  window.close();
});
