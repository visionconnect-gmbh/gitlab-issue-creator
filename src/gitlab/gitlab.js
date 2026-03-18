/**
 * @fileoverview High-level GitLab operations.
 *
 * Wraps the raw HTTP client in `api.js` with:
 *  - settings validation / notification on misconfiguration,
 *  - TTL-based caching via `cache.js`,
 *  - incremental project refresh (only fetch projects newer than the cached set),
 *  - per-project assignee caching,
 *  - file upload and issue creation helpers.
 *
 * All exported functions return `null` / `[]` on failure rather than throwing,
 * so UI code does not need to wrap every call in try/catch.
 */

import {
  displayLocalizedNotification,
  openOptionsPage,
} from "../utils/utils.js";
import { apiGet, apiPost, doRequest } from "./api.js";
import { getCache, setCache, addToCacheArray, getSetting } from "../utils/cache.js";
import { CacheKeys, LocalizeKeys } from "../utils/Enums.js";

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

/** 9 hours in milliseconds – used as the base TTL for most cached data. */
const TTL_9H_MS = 9 * 60 * 60 * 1000;

/** 24 hours – user profile rarely changes. */
const TTL_24H_MS = 24 * 60 * 60 * 1000;

/**
 * ~5 days – projects change infrequently; incremental refresh keeps the list
 * up-to-date without a full re-fetch.
 */
const TTL_PROJECT_MS = TTL_9H_MS * 13.5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Shows the "GitLab settings missing" notification and opens the Options page.
 * Call this whenever token or URL is absent.
 */
function notifyMissingSettings() {
  displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GITLAB_SETTINGS_MISSING);
  openOptionsPage();
  console.warn("GitLab settings are missing or invalid. Please configure them in Options.");
}

/**
 * Builds the standard PRIVATE-TOKEN header object from a settings object.
 *
 * @param {{ token: string }} settings
 * @returns {{ headers: { 'PRIVATE-TOKEN': string } }}
 */
function authHeader(settings) {
  return { headers: { "PRIVATE-TOKEN": settings.token } };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Reads and validates the GitLab settings (URL + token) from storage.
 * Notifies the user and returns null when settings are incomplete.
 *
 * @returns {Promise<{ url: string, token: string }|null>}
 */
export async function getGitLabSettings() {
  const settings = await getSetting(CacheKeys.GITLAB_SETTINGS, {});
  if (!settings.token || !settings.url) {
    notifyMissingSettings();
    return null;
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

/**
 * Returns the currently authenticated GitLab user.
 * The result is cached for 24 hours to avoid redundant API calls.
 *
 * @returns {Promise<object|null>} GitLab user object, or null on failure.
 */
export async function getCurrentUser() {
  const cached = await getCache(CacheKeys.CURRENT_USER, TTL_24H_MS);
  if (cached) return cached;

  const settings = await getGitLabSettings();
  if (!settings) return null;

  try {
    const user = await apiGet("/api/v4/user", authHeader(settings));
    if (!user) {
      console.warn("getCurrentUser: empty response from API");
      return null;
    }
    await setCache(CacheKeys.CURRENT_USER, user);
    return user;
  } catch (error) {
    console.error("Error fetching current user:", error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Fetches all GitLab projects the user is a member of, with pagination.
 * Results are stored in a single cache entry.
 *
 * @param {{ token: string, url: string }} settings
 * @returns {Promise<object[]>} Flat array of project objects.
 */
async function fetchAllProjects(settings) {
  const allProjects = [];
  let page = 1;

  while (true) {
    const fetched = await apiGet(
      `/api/v4/projects?membership=true&simple=true&per_page=100&page=${page}`,
      authHeader(settings)
    );

    if (!Array.isArray(fetched)) {
      console.warn("fetchAllProjects: unexpected response", fetched);
      break;
    }

    allProjects.push(...fetched);

    // GitLab returns exactly 100 items per page when there are more; stop when fewer.
    if (fetched.length < 100) break;
    page++;
  }

  return allProjects;
}

/**
 * Fetches projects created after `afterId`, used to incrementally refresh
 * the project cache without a full re-download.
 *
 * @param {{ token: string }} settings
 * @param {number} afterId - Only fetch projects with an ID greater than this value.
 * @returns {Promise<object[]>}
 */
async function fetchNewProjects(settings, afterId) {
  try {
    const projects = await apiGet(
      `/api/v4/projects?membership=true&simple=true&id_after=${afterId}`,
      authHeader(settings)
    );
    return Array.isArray(projects) ? projects : [];
  } catch (error) {
    console.error("fetchNewProjects: error", error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    return [];
  }
}

/**
 * Returns the list of GitLab projects the user is a member of.
 *
 * Strategy:
 * 1. If a fresh cache exists → serve it immediately, then check for newly
 *    added projects and prepend them to the cache in the background.
 * 2. If no cache → perform a full paginated fetch and cache the result.
 *
 * @param {function(object[]): void} [onUpdate] - Called with the project array
 *   when data is available (useful for live UI updates).
 * @returns {Promise<object[]|undefined>}
 */
export async function getProjects(onUpdate) {
  const cached = await getCache(CacheKeys.PROJECTS, TTL_PROJECT_MS, []);

  if (cached && cached.length > 0) {
    const settings = await getGitLabSettings();
    if (settings) {
      const mostRecentId = cached[0].id;
      const newProjects = await fetchNewProjects(settings, mostRecentId);
      if (newProjects.length > 0) {
        await addToCacheArray(CacheKeys.PROJECTS, newProjects, "id");
        cached.unshift(...newProjects);
      }
    }
    if (onUpdate) onUpdate(cached);
    return cached;
  }

  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const allProjects = await fetchAllProjects(settings);
    await setCache(CacheKeys.PROJECTS, allProjects);
    if (onUpdate) onUpdate(allProjects);
    return allProjects;
  } catch (error) {
    console.error("getProjects: error fetching projects", error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
  }
}

// ---------------------------------------------------------------------------
// Assignees
// ---------------------------------------------------------------------------

/**
 * Returns the list of users for a given GitLab project.
 *
 * All projects' assignee lists are stored together under a single cache key
 * (`CacheKeys.ASSIGNEES`) as a map of `{ [projectId]: assignee[] }`.
 * This avoids one storage entry per project.
 *
 * @param {string|number} projectId
 * @param {function(object[]): void} [onUpdate] - Called with the assignee list
 *   when data is available.
 * @returns {Promise<object[]>}
 */
export async function getAssignees(projectId, onUpdate) {
  if (!projectId) {
    console.warn("getAssignees: called without a projectId");
    return [];
  }

  const cachedMap = await getCache(CacheKeys.ASSIGNEES, TTL_9H_MS);

  if (cachedMap?.[projectId]) {
    if (onUpdate) onUpdate(cachedMap[projectId]);
    return cachedMap[projectId];
  }

  const settings = await getGitLabSettings();
  if (!settings) return [];

  try {
    const assignees = await apiGet(
      `/api/v4/projects/${projectId}/users`,
      authHeader(settings)
    );

    if (!Array.isArray(assignees)) {
      console.warn("getAssignees: unexpected response", assignees);
      return [];
    }

    const updatedMap = { ...(cachedMap ?? {}), [projectId]: assignees };
    await setCache(CacheKeys.ASSIGNEES, updatedMap);

    if (onUpdate) onUpdate(assignees);
    return assignees;
  } catch (error) {
    console.error(`getAssignees: error for project ${projectId}`, error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Uploads a file attachment to a GitLab project.
 *
 * @param {string|number} projectId
 * @param {File} attachmentFile - A browser `File` object.
 * @returns {Promise<{ url: string, markdown: string, alt: string }>}
 * @throws {Error} When the file is invalid, empty, or the upload fails.
 */
export async function uploadAttachmentToGitLab(projectId, attachmentFile) {
  const settings = await getGitLabSettings();
  if (!settings) throw new Error("GitLab settings unavailable");

  if (!(attachmentFile instanceof File)) {
    throw new Error("uploadAttachmentToGitLab: invalid file argument");
  }

  const content = await attachmentFile.arrayBuffer();
  if (!content?.byteLength) {
    throw new Error("uploadAttachmentToGitLab: attachment content is empty");
  }

  const blob = new Blob([new Uint8Array(content)], {
    type: attachmentFile.type || "application/octet-stream",
  });

  const formData = new FormData();
  formData.append("file", blob, attachmentFile.name || "Attachment");

  // Do NOT set Content-Type manually for FormData – the browser sets the
  // correct multipart boundary automatically.
  const response = await doRequest(
    `/api/v4/projects/${projectId}/uploads`,
    {
      method: "POST",
      body: formData,
      headers: { "PRIVATE-TOKEN": settings.token },
    },
    false // addContentType = false
  );

  if (!response?.ok) {
    const text = await response?.text();
    throw new Error(`GitLab upload failed: ${response?.status} ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * Creates a new issue in a GitLab project.
 *
 * On success, shows a notification; clicking it opens the new issue in the
 * default browser. On failure, shows a generic error notification.
 *
 * @param {string|number} projectId
 * @param {string|number} assigneeId  - GitLab user ID to assign the issue to.
 * @param {string}        title
 * @param {string}        description - Markdown-formatted issue body.
 * @param {string|null}   [dueDate]   - ISO date string (YYYY-MM-DD) or null.
 * @returns {Promise<void>}
 */
export async function createGitLabIssue(projectId, assigneeId, title, description, dueDate = null) {
  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const issuePayload = {
      title,
      description,
      assignee_ids: [assigneeId],
      due_date: dueDate,
    };

    const issue = await apiPost(
      `/api/v4/projects/${projectId}/issues`,
      issuePayload,
      authHeader(settings)
    );

    const issueUrl = issue?.web_url ?? "";
    const notificationId = await displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.ISSUE_CREATED
    );

    // Open the issue in the browser when the user clicks the notification.
    browser.notifications.onClicked.addListener((id) => {
      if (id === notificationId) {
        messenger.windows.openDefaultBrowser(issueUrl);
      }
    });
  } catch (error) {
    console.error("createGitLabIssue: error", error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
  }
}