/**
 * @fileoverview High-level GitLab operations: settings, current user,
 * projects, assignees, attachments, and issue creation.
 *
 * Caching strategy (see GITLAB_API_AUDIT_REPORT.md for the measurements
 * behind it): a probe of a real self-managed instance found 1,105 projects
 * across 12 pages. Caching "all projects" doesn't scale: it's 1.27 MB on
 * that instance, more than the 1 MB per-key storage ceiling, and a 10-35s
 * cold start. Instead:
 *
 *  - One page of the 100 most recently active projects is cached and
 *    revalidated with `ETag`/`If-None-Match` (measured: a 304 costs 0 bytes
 *    vs ~115 KB for a full 200).
 *  - A small "recently used" list keeps projects the user actually picked
 *    available even if they fall off that page.
 *  - Anything else is found via `searchProjects()`, which hits GitLab's
 *    server-side `search` parameter directly (measured: ~15-25 KB, <1s).
 *
 * Every cache read here is cache-first: stale-but-present data is served
 * immediately, and revalidation happens in the background via `onUpdate`.
 */

import { apiGetPage, apiPost, doRequest } from "./api.js";
import { displayLocalizedNotification, openOptionsPage } from "../utils/utils.js";
import {
  getCache,
  getCacheEntry,
  setCache,
  getSetting,
} from "../utils/cache.js";
import { CacheKeys, LocalizeKeys } from "../utils/Enums.js";

// ---------------------------------------------------------------------------
// TTL / sizing constants
// ---------------------------------------------------------------------------

const TTL_9H_MS = 9 * 60 * 60 * 1000;
const TTL_24H_MS = 24 * 60 * 60 * 1000;

/** Soft TTL for the cached project page: it's ETag-revalidated well before
 * this, so this mainly bounds how long fully-offline data is still shown. */
const PROJECTS_TTL_MS = TTL_9H_MS * 13.5; // ~5 days
const ASSIGNEES_TTL_MS = TTL_9H_MS;
const LABELS_TTL_MS = TTL_9H_MS;

const PROJECTS_PAGE_SIZE = 100;
/** GitLab's own per_page ceiling, used in full here (not just a small
 * sample): the search endpoint has no relevance ranking, it's ordered by
 * `created_at` like any other listing, so a too-small cap can silently
 * drop the match a user actually wants in favor of newer unrelated ones
 * that happen to share the search term. */
const SEARCH_PAGE_SIZE = 100;
const MIN_SEARCH_LENGTH = 2;
/** In-memory, not persisted: search results are transient and would churn
 * storage for no benefit. */
const SEARCH_CACHE_TTL_MS = 60_000;

const RECENT_PROJECTS_MAX = 10;

/** Guards the assignee/label pagination loops against a pathological
 * server that never stops returning a next page. 10 × 100 = 1,000 items
 * ought to be enough for any project this add-on is used against. */
const MAX_PAGINATION_PAGES = 10;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Shows the "GitLab settings missing" notification and opens the Options page.
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

/** `true` if the AuthError/network error is one we've already surfaced to
 * the user (401 notifies inside api.js); callers just need to stop quietly. */
function isAuthError(error) {
  return error?.name === "AuthError";
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
 * Cache-first: a cached value is returned immediately; a background
 * revalidation keeps it fresh without blocking the caller.
 *
 * @param {function(object): void} [onUpdate] - Called again if revalidation
 *   finds a different user (e.g. the token was rotated to a different account).
 * @returns {Promise<object|null>} GitLab user object, or null on failure.
 */
export async function getCurrentUser(onUpdate) {
  const entry = await getCacheEntry(CacheKeys.CURRENT_USER, TTL_24H_MS);
  if (entry?.data) {
    if (onUpdate) onUpdate(entry.data);
    void revalidateCurrentUser(entry.data, entry.etag, onUpdate);
    return entry.data;
  }

  const settings = await getGitLabSettings();
  if (!settings) return null;

  try {
    const { data: user, etag } = await apiGetPage("/api/v4/user", authHeader(settings));
    if (!user) {
      console.warn("getCurrentUser: empty response from API");
      return null;
    }
    await setCache(CacheKeys.CURRENT_USER, user, { ttlMs: TTL_24H_MS, etag });
    if (onUpdate) onUpdate(user);
    return user;
  } catch (error) {
    if (!isAuthError(error)) {
      console.error("Error fetching current user:", error);
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    }
    return null;
  }
}

async function revalidateCurrentUser(cached, etag, onUpdate) {
  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const { data, notModified, etag: newEtag } = await apiGetPage(
      "/api/v4/user",
      { ...authHeader(settings), etag },
    );
    if (notModified) return;
    await setCache(CacheKeys.CURRENT_USER, data, { ttlMs: TTL_24H_MS, etag: newEtag });
    if (onUpdate && data?.id !== cached?.id) onUpdate(data);
  } catch (error) {
    console.warn("revalidateCurrentUser: background refresh failed", error);
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * @param {{ token: string }} settings
 * @param {{ etag?: string }} [opts]
 * @returns {Promise<{ data: object[], etag: string|null, notModified: boolean }>}
 */
async function fetchProjectsPage(settings, { etag } = {}) {
  const { data, etag: newEtag, notModified } = await apiGetPage(
    `/api/v4/projects?membership=true&simple=true&per_page=${PROJECTS_PAGE_SIZE}&order_by=last_activity_at`,
    { ...authHeader(settings), etag },
  );
  return { data: Array.isArray(data) ? data : [], etag: newEtag, notModified };
}

/** Cheap shallow comparison to decide whether a revalidated project list is
 * actually different, so background refreshes don't push a redundant
 * `onUpdate` that would reset UI state for no reason. */
function haveListsChanged(a, b) {
  if (a.length !== b.length) return true;
  const fingerprint = (p) => `${p.id}:${p.name_with_namespace || p.name}`;
  const seen = new Set(a.map(fingerprint));
  return b.some((p) => !seen.has(fingerprint(p)));
}

async function revalidateProjects(cached, etag, onUpdate, onStale) {
  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const { data, etag: newEtag, notModified } = await fetchProjectsPage(settings, { etag });
    if (notModified) return; // still fresh, 0 bytes, nothing to do

    await setCache(CacheKeys.PROJECTS, data, { ttlMs: PROJECTS_TTL_MS, etag: newEtag });
    if (onUpdate && haveListsChanged(cached, data)) onUpdate(data);
  } catch (error) {
    // Stale-but-usable: keep serving what's cached. AuthError already
    // notified the user inside api.js: only a genuinely unexpected failure
    // (GitLab unreachable, 5xx, etc.) should surface as "you might be
    // looking at stale data."
    if (!isAuthError(error)) {
      console.warn("revalidateProjects: background refresh failed", error);
      onStale?.();
    }
  }
}

/**
 * Returns the cached page of (up to 100) most-recently-active projects the
 * user is a member of. Cache-first: cached data returns immediately and a
 * background revalidation (ETag-conditional) follows. Projects outside this
 * page are found via `searchProjects()`, not by fetching more pages: see
 * the file overview for why.
 *
 * @param {function(object[]): void} [onUpdate] - Called again only if the
 *   background revalidation finds an actual change.
 * @param {function(): void} [onStale] - Called if the background
 *   revalidation fails for a reason other than auth (GitLab unreachable,
 *   5xx, etc.), a signal that the data just returned may no longer be
 *   current, not that anything is wrong with it.
 * @returns {Promise<object[]>}
 */
export async function getProjects(onUpdate, onStale) {
  const entry = await getCacheEntry(CacheKeys.PROJECTS, PROJECTS_TTL_MS);

  if (entry?.data?.length) {
    if (onUpdate) onUpdate(entry.data);
    void revalidateProjects(entry.data, entry.etag, onUpdate, onStale);
    return entry.data;
  }

  const settings = await getGitLabSettings();
  if (!settings) return [];

  try {
    const { data, etag } = await fetchProjectsPage(settings);
    await setCache(CacheKeys.PROJECTS, data, { ttlMs: PROJECTS_TTL_MS, etag });
    if (onUpdate) onUpdate(data);
    return data;
  } catch (error) {
    if (!isAuthError(error)) {
      console.error("getProjects: error fetching projects", error);
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    }
    return [];
  }
}

/** @type {Map<string, { data: object[], timestamp: number }>} */
const searchCache = new Map();

/** Test-only: clears the in-memory search cache so results don't leak
 * between tests that happen to use the same query string. */
export function clearSearchCache() {
  searchCache.clear();
}

/**
 * Searches GitLab for projects the user is a member of, server-side.
 * This is how a project outside the cached page (see `getProjects`) is
 * found, never by paging through the full membership list.
 *
 * Results are cached in memory only (never written to
 * `browser.storage.local`) for the popup's lifetime, since search results
 * are transient and per-query storage would churn for no lasting benefit.
 *
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object[]>}
 */
export async function searchProjects(query, { signal } = {}) {
  const trimmed = (query ?? "").trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const normalized = trimmed.toLowerCase();
  const cached = searchCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const settings = await getGitLabSettings();
  if (!settings) return [];

  const { data } = await apiGetPage(
    `/api/v4/projects?membership=true&simple=true&per_page=${SEARCH_PAGE_SIZE}&search=${encodeURIComponent(trimmed)}`,
    { ...authHeader(settings), signal },
  );

  const results = Array.isArray(data) ? data : [];
  searchCache.set(normalized, { data: results, timestamp: Date.now() });
  return results;
}

/**
 * Records a project the user actually selected so it stays instantly
 * available (and usable offline) even if it falls off the cached page of
 * most-recently-active projects. Bounded to the most recent
 * `RECENT_PROJECTS_MAX` picks.
 *
 * @param {{ id: number }} project
 * @returns {Promise<void>}
 */
export async function recordRecentProject(project) {
  if (!project?.id) return;

  const existing = (await getCache(CacheKeys.RECENT_PROJECTS, null, [])) || [];
  const deduped = existing.filter((p) => p.id !== project.id);
  const updated = [project, ...deduped].slice(0, RECENT_PROJECTS_MAX);
  await setCache(CacheKeys.RECENT_PROJECTS, updated, { ttlMs: null });
}

/**
 * Returns the recently-used projects list (most recent first).
 * @returns {Promise<object[]>}
 */
export async function getRecentProjects() {
  return (await getCache(CacheKeys.RECENT_PROJECTS, null, [])) || [];
}

/**
 * Drops a project from the cached page and the recently-used list. Used
 * when issue creation 404s, which means the project became invalid
 * (deleted, renamed away, or access revoked) since it was cached.
 *
 * @param {number|string} projectId
 * @returns {Promise<void>}
 */
export async function dropProjectFromCache(projectId) {
  const cached = (await getCache(CacheKeys.PROJECTS, null, [])) || [];
  if (cached.some((p) => p.id === projectId)) {
    await setCache(
      CacheKeys.PROJECTS,
      cached.filter((p) => p.id !== projectId),
      { ttlMs: PROJECTS_TTL_MS },
    );
  }

  const recent = (await getCache(CacheKeys.RECENT_PROJECTS, null, [])) || [];
  if (recent.some((p) => p.id === projectId)) {
    await setCache(
      CacheKeys.RECENT_PROJECTS,
      recent.filter((p) => p.id !== projectId),
      { ttlMs: null },
    );
  }
}

// ---------------------------------------------------------------------------
// Assignees
// ---------------------------------------------------------------------------

function assigneesCacheKey(projectId) {
  // A per-project key (rather than one shared map) so each project's ETag
  // is tracked against its own URL: ETags are only meaningful per-URL.
  return `${CacheKeys.ASSIGNEES}:${projectId}`;
}

/**
 * Fetches every page of a project's members, following `X-Next-Page`.
 * @returns {Promise<{ data: object[], etag: string|null, notModified: boolean }>}
 */
async function fetchAllAssigneePages(settings, projectId, { etag } = {}) {
  let page = 1;
  const combined = [];
  let firstPageEtag = null;

  while (page <= MAX_PAGINATION_PAGES) {
    const { data, etag: pageEtag, notModified, nextPage } = await apiGetPage(
      `/api/v4/projects/${projectId}/users?per_page=100&page=${page}`,
      { ...authHeader(settings), etag: page === 1 ? etag : undefined },
    );

    if (page === 1 && notModified) {
      return { data: null, etag, notModified: true };
    }

    if (!Array.isArray(data)) break;
    combined.push(...data);
    if (page === 1) firstPageEtag = pageEtag;
    if (!nextPage) break;
    page = nextPage;
  }

  return { data: combined, etag: firstPageEtag, notModified: false };
}

async function revalidateAssignees(projectId, cached, etag, onUpdate) {
  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const { data, etag: newEtag, notModified } = await fetchAllAssigneePages(
      settings,
      projectId,
      { etag },
    );
    if (notModified) return;

    await setCache(assigneesCacheKey(projectId), data, {
      ttlMs: ASSIGNEES_TTL_MS,
      etag: newEtag,
    });
    if (onUpdate && haveListsChanged(cached, data)) onUpdate(data);
  } catch (error) {
    if (!isAuthError(error)) {
      console.warn(`revalidateAssignees: background refresh failed for project ${projectId}`, error);
    }
  }
}

/**
 * Returns the list of users for a given GitLab project, paginated past
 * GitLab's default 20-per-page so projects with more members than that
 * aren't silently truncated.
 *
 * Cache-first, like `getProjects()`. Unlike the old implementation, a
 * failure is NOT cached as an empty list: it throws, so the caller (the
 * background message handler) can tell "load failed, retry available"
 * apart from "this project genuinely has no members".
 *
 * @param {string|number} projectId
 * @param {function(object[]): void} [onUpdate]
 * @returns {Promise<object[]>}
 * @throws When there is no cached data and the fetch fails.
 */
export async function getAssignees(projectId, onUpdate) {
  if (!projectId) {
    console.warn("getAssignees: called without a projectId");
    return [];
  }

  const cacheKey = assigneesCacheKey(projectId);
  const entry = await getCacheEntry(cacheKey, ASSIGNEES_TTL_MS);

  if (entry?.data) {
    if (onUpdate) onUpdate(entry.data);
    void revalidateAssignees(projectId, entry.data, entry.etag, onUpdate);
    return entry.data;
  }

  const settings = await getGitLabSettings();
  if (!settings) return [];

  const { data } = await fetchAllAssigneePages(settings, projectId);
  await setCache(cacheKey, data, { ttlMs: ASSIGNEES_TTL_MS });
  if (onUpdate) onUpdate(data);
  return data;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function labelsCacheKey(projectId) {
  // Per-project, same reasoning as assigneesCacheKey: ETags are per-URL.
  return `${CacheKeys.LABELS}:${projectId}`;
}

/**
 * Fetches every page of a project's labels, following `X-Next-Page`.
 * @returns {Promise<{ data: object[], etag: string|null, notModified: boolean }>}
 */
async function fetchAllLabelPages(settings, projectId, { etag } = {}) {
  let page = 1;
  const combined = [];
  let firstPageEtag = null;

  while (page <= MAX_PAGINATION_PAGES) {
    const { data, etag: pageEtag, notModified, nextPage } = await apiGetPage(
      `/api/v4/projects/${projectId}/labels?per_page=100&page=${page}`,
      { ...authHeader(settings), etag: page === 1 ? etag : undefined },
    );

    if (page === 1 && notModified) {
      return { data: null, etag, notModified: true };
    }

    if (!Array.isArray(data)) break;
    combined.push(...data);
    if (page === 1) firstPageEtag = pageEtag;
    if (!nextPage) break;
    page = nextPage;
  }

  return { data: combined, etag: firstPageEtag, notModified: false };
}

async function revalidateLabels(projectId, cached, etag, onUpdate) {
  const settings = await getGitLabSettings();
  if (!settings) return;

  try {
    const { data, etag: newEtag, notModified } = await fetchAllLabelPages(
      settings,
      projectId,
      { etag },
    );
    if (notModified) return;

    await setCache(labelsCacheKey(projectId), data, {
      ttlMs: LABELS_TTL_MS,
      etag: newEtag,
    });
    if (onUpdate && haveListsChanged(cached, data)) onUpdate(data);
  } catch (error) {
    if (!isAuthError(error)) {
      console.warn(`revalidateLabels: background refresh failed for project ${projectId}`, error);
    }
  }
}

/**
 * Returns the list of labels for a given GitLab project, paginated past
 * GitLab's default 20-per-page. Cache-first and ETag-revalidated, exactly
 * like `getAssignees()`, including the same "throws on a cold-cache
 * failure instead of caching an empty list" contract, so the caller can
 * distinguish "load failed" from "this project genuinely has no labels".
 *
 * @param {string|number} projectId
 * @param {function(object[]): void} [onUpdate]
 * @returns {Promise<object[]>}
 * @throws When there is no cached data and the fetch fails.
 */
export async function getLabels(projectId, onUpdate) {
  if (!projectId) {
    console.warn("getLabels: called without a projectId");
    return [];
  }

  const cacheKey = labelsCacheKey(projectId);
  const entry = await getCacheEntry(cacheKey, LABELS_TTL_MS);

  if (entry?.data) {
    if (onUpdate) onUpdate(entry.data);
    void revalidateLabels(projectId, entry.data, entry.etag, onUpdate);
    return entry.data;
  }

  const settings = await getGitLabSettings();
  if (!settings) return [];

  const { data } = await fetchAllLabelPages(settings, projectId);
  await setCache(cacheKey, data, { ttlMs: LABELS_TTL_MS });
  if (onUpdate) onUpdate(data);
  return data;
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

/**
 * Uploads a file to GitLab, notifying the user and returning `null` on
 * failure instead of throwing, matching this module's contract (see
 * fileoverview) so callers in the UI layer never need their own try/catch.
 * Shared by the email-attachment upload flow and the description editor's
 * inline "upload a local image" button.
 *
 * @param {string|number} projectId
 * @param {File} file
 * @param {string} [displayName] - Used only in the console error log.
 * @returns {Promise<{ url: string, markdown: string, alt: string }|null>}
 */
export async function uploadFileOrNotify(projectId, file, displayName = file?.name) {
  try {
    return await uploadAttachmentToGitLab(projectId, file);
  } catch (error) {
    console.error(`Error uploading file ${displayName}:`, error);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.UPLOAD_ATTACHMENT_ERROR);
    return null;
  }
}

/** Set once a delete failure has been shown, so a flaky/under-privileged
 * GitLab connection notifies at most once per process instead of once per
 * orphaned upload. */
let deleteFailureNotified = false;

/** Test-only: resets the notify-once flag so module state doesn't leak between tests. */
export function resetDeleteFailureNotification() {
  deleteFailureNotified = false;
}

/** Test-only: resets the shared notification-click listener registration
 * flag (and its URL map) so module state doesn't leak between tests. */
export function resetIssueNotificationListener() {
  issueNotificationListenerRegistered = false;
  issueNotificationUrls.clear();
}

/**
 * Deletes a previously-uploaded file from a GitLab project. Best-effort: the
 * delete endpoint (GitLab >= 17.2) requires the Maintainer or Owner role,
 * while uploading only requires Developer, so a lower-privileged token will
 * get a 403 here even though the upload itself succeeded. Never throws.
 *
 * `upload.id` is only present in the upload response from GitLab >= 17.3; an
 * older instance has no reachable delete endpoint at all, so this is a no-op
 * rather than attempting a secret+filename fallback.
 *
 * @param {string|number} projectId
 * @param {{ id?: number }} upload - The object previously returned by `uploadFileOrNotify`.
 * @returns {Promise<boolean>} Whether the upload was deleted.
 */
export async function deleteUploadOrNotify(projectId, upload) {
  if (!projectId || !upload?.id) return false;

  const settings = await getGitLabSettings();
  if (!settings) return false;

  try {
    await doRequest(`/api/v4/projects/${projectId}/uploads/${upload.id}`, {
      method: "DELETE",
      ...authHeader(settings),
    });
    return true;
  } catch (error) {
    console.warn(`Failed to delete upload ${upload.id} from project ${projectId}:`, error);
    if (!deleteFailureNotified) {
      deleteFailureNotified = true;
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.UPLOAD_DELETE_ERROR);
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/** Single shared listener for "issue created" notification clicks, keyed by
 * notification ID. Registering one listener per created issue (the previous
 * approach) leaked a listener, and a closure over that issue's URL, for
 * every issue ever created in the session. */
const issueNotificationUrls = new Map();
let issueNotificationListenerRegistered = false;

function ensureIssueNotificationListener() {
  if (issueNotificationListenerRegistered) return;
  issueNotificationListenerRegistered = true;

  browser.notifications.onClicked.addListener((id) => {
    const url = issueNotificationUrls.get(id);
    if (url) {
      issueNotificationUrls.delete(id);
      messenger.windows.openDefaultBrowser(url);
    }
  });
}

/**
 * Creates a new issue in a GitLab project.
 *
 * On success, shows a notification; clicking it opens the new issue in the
 * default browser. On failure, shows a generic error notification, and, if
 * the failure looks like a 404, drops the project from the cached page and
 * recently-used list, since that's a project that no longer exists or is no
 * longer accessible.
 *
 * @param {string|number} projectId
 * @param {string|number} assigneeId  - GitLab user ID to assign the issue to.
 * @param {string}        title
 * @param {string}        description - Markdown-formatted issue body.
 * @param {string|null}   [dueDate]   - ISO date string (YYYY-MM-DD) or null.
 * @param {string[]}      [labelNames] - Label names to apply.
 * @returns {Promise<boolean>} Whether the issue was created. Callers use
 *   this (rather than a try/catch) to decide whether to close the popup or
 *   tell the user to retry, since this function always handles its own
 *   errors (notification + cache cleanup) rather than throwing.
 */
export async function createGitLabIssue(projectId, assigneeId, title, description, dueDate = null, labelNames = []) {
  const settings = await getGitLabSettings();
  if (!settings) return false;

  try {
    const issuePayload = {
      title,
      description,
      assignee_ids: [assigneeId],
      due_date: dueDate,
      // GitLab's documented create/update format: a comma-separated string
      // of label names (verify against the live instance if this ever
      // changes: see GITLAB_API_AUDIT_REPORT.md's "verify against the
      // actual API" standard).
      ...(labelNames.length ? { labels: labelNames.join(",") } : {}),
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

    issueNotificationUrls.set(notificationId, issueUrl);
    ensureIssueNotificationListener();
    return true;
  } catch (error) {
    console.error("createGitLabIssue: error", error);
    if (!isAuthError(error)) {
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    }
    // Heuristic: GitLab's 404 body for this endpoint is "404 Project Not
    // Found": good enough to tell "stale project reference" apart from
    // other failures without a typed error from apiPost.
    if (String(error?.message).includes("404")) {
      await dropProjectFromCache(projectId);
    }
    return false;
  }
}
