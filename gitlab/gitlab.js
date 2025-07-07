import { displayNotification } from "../utils/utils.js";
import { apiGet, apiPost } from "./api.js";

/**
 * Shows a standard GitLab settings missing notification.
 */
function notifyMissingSettings() {
  displayNotification(
    "GitLab Ticket Addon",
    "GitLab-Einstellungen fehlen. Bitte in den Addon-Einstellungen konfigurieren."
  );
}

/**
 * Gets and validates GitLab settings from local storage.
 * @returns {Promise<Object|null>} Settings or null if invalid.
 */
async function getGitLabSettings() {
  const settings = await browser.storage.local.get(["gitlabToken"]);
  if (!settings.gitlabToken) {
    notifyMissingSettings();
    browser.runtime.openOptionsPage();
    return null;
  }
  return settings;
}

/**
 * Gets and validates GitLab settings. Displays notification if missing.
 * @returns {Promise<Object|null>} Valid settings or null.
 */
async function requireValidSettings() {
  const settings = await getGitLabSettings();
  if (!settings) return null;
  return settings;
}

/**
 * Fetches the current GitLab user.
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  const settings = await requireValidSettings();
  if (!settings) return null;

  try {
    return await apiGet("/api/v4/user", {
      headers: { "PRIVATE-TOKEN": settings.gitlabToken },
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden des aktuellen Benutzers: " + error.message
    );
    return null;
  }
}

let projectCache = {
  projects: null,
  timestamp: null,
};

const CACHE_TTL_MS = 9 * 60 * 60 * 1000; // 9 hours

/**
 * Returns cached projects if available and not stale.
 * Otherwise fetches from GitLab and updates the cache in background.
 * @param {function(Array):void} [onUpdate] - Optional callback for live update
 */
export async function getProjects(onUpdate) {
  const now = Date.now();

  // Return cached if valid
  if (
    projectCache.projects &&
    projectCache.timestamp &&
    now - projectCache.timestamp < CACHE_TTL_MS
  ) {
    if (onUpdate) onUpdate(projectCache.projects); // Provide immediately
    return;
  }

  // Load settings first
  const settings = await requireValidSettings();
  if (!settings) return;

  try {
    const allProjects = [];
    let page = 1;
    let fetched;

    do {
      fetched = await apiGet(
        `/api/v4/projects?membership=true&simple=true&per_page=100&page=${page}`,
        {
          headers: { "PRIVATE-TOKEN": settings.gitlabToken },
        }
      );

      if (!Array.isArray(fetched)) {
        console.warn("Unerwartete Antwort:", fetched);
        break;
      }

      allProjects.push(...fetched);
      page++;
    } while (fetched.length === 100);

    console.log(`Fetched ${allProjects.length} projects`);

    projectCache = {
      projects: allProjects,
      timestamp: Date.now(),
    };

    if (onUpdate) onUpdate(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden der Projekte: " + error.message
    );
  }
}

/**
 * Creates a new GitLab issue.
 * @param {string} projectId
 * @param {string} title
 * @param {string} description
 */
export async function createGitLabIssue(
  projectId,
  assigne,
  title,
  description
) {
  const settings = await requireValidSettings();
  if (!settings) return;

  try {
    const issueData = {
      title: title,
      description: description,
      assignee_ids: [assigne],
    };
    await apiPost(`/api/v4/projects/${projectId}/issues`, issueData, {
      headers: { "PRIVATE-TOKEN": settings.gitlabToken },
    });
    displayNotification("GitLab Ticket Addon", "Ticket erfolgreich erstellt.");
  } catch (error) {
    console.error("Error creating issue:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Erstellen des Tickets:\n" + error.message
    );
  }
}
