import { displayNotification } from "../utils/utils.js";
import { apiGet, apiPost } from "./api.js";

/**
 * Fetches the current user from GitLab.
 * @param {Object} settings - GitLab settings containing URL and token.
 * @returns {Promise<Object|null>} The current user object or null on error.
 */
export async function getCurrentUser(settings) {
  try {
    const user = await apiGet(`/api/v4/user`, {
      headers: { "PRIVATE-TOKEN": settings.gitlabToken },
    });
    return user;
  } catch (error) {
    console.error("Error fetching current user:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden des aktuellen Benutzers: " + error.message
    );
    return null;
  }
}

/**
 * Fetches projects from GitLab.
 * @param {Object} settings - GitLab settings containing URL and token.
 * @returns {Promise<Array|null>} An array of projects or null on error.
 */
export async function fetchProjects(settings) {
  try {
    const projects = await apiGet(
      `/api/v4/projects?membership=true&simple=true`,
      {
        headers: { "PRIVATE-TOKEN": settings.gitlabToken },
      }
    );
    return projects;
  } catch (error) {
    console.error("Error fetching projects:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Laden der Projekte: " + error.message
    );
    return null;
  }
}

/**
 * Creates a new GitLab issue.
 * @param {string} projectId - The ID of the GitLab project.
 * @param {string} title - The title of the issue.
 * @param {string} description - The description of the issue.
 * @param {string} gitlabToken - The GitLab private token.
 */
export async function createGitLabIssue(
  projectId,
  title,
  description,
  gitlabToken
) {
  try {
    await apiPost(
      `/api/v4/projects/${projectId}/issues`,
      { title, description },
      { headers: { "PRIVATE-TOKEN": gitlabToken } }
    );
    displayNotification("GitLab Ticket Addon", "Ticket erfolgreich erstellt.");
  } catch (error) {
    console.error("Error creating issue:", error);
    displayNotification(
      "GitLab Ticket Addon",
      "Fehler beim Erstellen des Tickets:\n" + error.message
    );
  } finally {
    if (popupWindowId) {
      browser.windows.remove(popupWindowId);
      popupWindowId = null;
    }
  }
}
