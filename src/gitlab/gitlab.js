import { displayNotification } from "../utils/utils.js";
import { apiGet, apiPost } from "./api.js";
import { getCache, setCache, addToCacheArray } from "../utils/cache.js";

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
    return null;
  }
  return settings;
}

/**
 * Gets and validates GitLab settings. Displays notification if missing.
 * @returns {Promise<Object|null>} Valid settings or null.
 */
export async function requireValidSettings() {
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

const CACHE_TTL_MS = 9 * 60 * 60 * 1000; // 9 hours

/**
 * Returns cached projects if available and not stale.
 * Otherwise fetches from GitLab and updates the cache in background.
 * @param {function(Array):void} [onUpdate] - Optional callback for live update
 */
export async function getProjects(onUpdate) {
  const cached = getCache("projects", CACHE_TTL_MS);

  if (cached) {
    // Add new projects to the cache if they are not already present
    const newProjects = await getNewProjects();
    if (newProjects.length > 0) {
      addToCacheArray("projects", newProjects, "id");
    }
    if (onUpdate) onUpdate(cached);
    return cached;
  }

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

    setCache("projects", allProjects);
    if (onUpdate) onUpdate(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden der Projekte: " + error.message
    );
  }
}

async function getNewProjects() {
  const settings = await requireValidSettings();
  if (!settings) return [];

  const current_projects = getCache("projects", CACHE_TTL_MS); // from cache

  // Entry 0 is the most recent project
  const last_id = current_projects.length > 0 ? current_projects[0].id : -1;

  if (last_id === -1) {
    console.warn("No projects found, cannot fetch new ones.");
    return [];
  }

  try {
    const projects = await apiGet(
      `/api/v4/projects?membership=true&simple=true&id_after=${last_id}`,
      {
        headers: { "PRIVATE-TOKEN": settings.gitlabToken },
      }
    );
    return projects || [];
  } catch (error) {
    console.error("Error fetching new projects:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden der neuen Projekte: " + error.message
    );
    return [];
  }
}

/**
 * Creates a new GitLab issue.
 * @param {string} projectId
 * @param {string} assignee
 * @param {string} title
 * @param {string} description
 */
export async function createGitLabIssue(
  projectId,
  assignee,
  title,
  description
) {
  const settings = await requireValidSettings();
  if (!settings) return;

  try {
    const issueData = {
      title: title,
      description: description,
      assignee_ids: [assignee],
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
