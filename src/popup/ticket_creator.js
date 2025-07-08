import { displayNotification } from "../utils/utils.js";
import { MessageTypes } from "../Enums.js";

let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;

const elements = {
  projectSearch: document.getElementById("projectSearch"),
  projectSuggestions: document.getElementById("projectSuggestions"),
  attachmentsCheckbox: document.getElementById("attachmentsCheckbox"),
  ticketTitle: document.getElementById("ticketTitle"),
  createBtn: document.getElementById("create"),
};

const easyMDE = new EasyMDE({
  element: document.getElementById("ticketDescription"),
  spellChecker: false,
  autosave: {
    enabled: true,
    delay: 1000,
    uniqueId: "gitlab-ticket-creator-description-popup",
  },
  status: false,
  forceSync: true,
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

// Signalisiere Background, dass das Popup bereit ist
browser.runtime.sendMessage({ type: MessageTypes.POPUP_READY });

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "project-list" || !msg.email) return;

  projects = msg.projects || [];
  filteredProjects = projects;
  renderProjectSuggestions();

  messageData = msg.email;
  elements.ticketTitle.value = messageData.subject || "";

  const descriptionContent =
    (messageData.conversationHistory || [])
      .map((entry) => {
        const fromLine = entry.from
          ? `**Von**: ${entry.from}\n**Datum**: ${entry.date} ${entry.time}\n\n`
          : "";
        return `\n---\n\n${fromLine}${entry.message}`;
      })
      .join("\n") || "(Kein Konversationsverlauf verfügbar)";

  easyMDE.value(descriptionContent.trim());
});

elements.projectSearch.addEventListener("input", () => {
  const search = elements.projectSearch.value.toLowerCase();

  filteredProjects = projects.filter((p) =>
    (p.name_with_namespace || p.name || "").toLowerCase().includes(search)
  );
  renderProjectSuggestions();

  const exactMatch = projects.find(
    (p) => (p.name_with_namespace || p.name || "").toLowerCase() === search
  );
  selectedProjectId = exactMatch?.id || null;
});

elements.projectSearch.addEventListener("change", () => {
  const selectedName = elements.projectSearch.value;
  const matchedProject = projects.find(
    (p) => (p.name_with_namespace || p.name) === selectedName
  );
  selectedProjectId = matchedProject?.id || null;
});

elements.createBtn.addEventListener("click", () => {
  if (!selectedProjectId) {
    return displayNotification(
      "GitLab Ticket Addon",
      "Bitte gib ein gültiges Projekt aus der Vorschlagsliste ein."
    );
  }

  browser.runtime.sendMessage({
    type: MessageTypes.CREATE_GITLAB_ISSUE,
    projectId: selectedProjectId,
    title: elements.ticketTitle.value,
    description: easyMDE.value(),
  });

  setTimeout(() => window.close(), 100);
});

function renderProjectSuggestions() {
  elements.projectSuggestions.innerHTML = "";
  filteredProjects.forEach((proj) => {
    const option = document.createElement("option");
    option.value = proj.name_with_namespace || proj.name || "Unbekannt";
    elements.projectSuggestions.appendChild(option);
  });
}
