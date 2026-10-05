import { State, resetPopupSession } from "../backgroundState.js";
import { MessageTypes, LocalizeKeys } from "../../utils/Enums.js";
import {
  getAssignees,
  getLabels,
  getProjects,
  searchProjects,
  recordRecentProject,
  deleteUploadOrNotify,
} from "../../gitlab/gitlab.js";
import { displayLocalizedNotification } from "../../utils/utils.js";

const POPUP_PATH = "src/popup/issue_creator.html";

/** Deletes every upload the closing popup reported as still-orphaned (never
 * attached to a created issue). `State.takePendingUploads()` reads and
 * clears the list in one step, so whichever of closePopup() / the
 * windows.onRemoved handler runs first does the work and the other is a
 * no-op on an already-empty list, so this can't double-delete. */
function cleanUpOrphanedUploads() {
  const orphans = State.takePendingUploads();
  for (const { projectId, id } of orphans) {
    void deleteUploadOrNotify(projectId, { id });
  }
}

/**
 * Opens the popup window for creating a GitLab issue.
 * Closes any existing popup before opening a new one.
 * Sets up a dedicated listener to handle popup closure.
 */
export async function openPopup() {
  // Close the last popup and await it fully
  await closeLastPopup();

  // Create the new popup
  const popup = await browser.windows.create({
    url: browser.runtime.getURL(POPUP_PATH),
    type: "popup",
    width: 700,
    height: 900,
  });

  // Update state after popup is created
  State.setPopupWindowId(popup.id);

  // Each popup gets its own dedicated listener
  const handler = (windowId) => {
    if (windowId === popup.id) {
      cleanUpOrphanedUploads();
      resetPopupSession();
      State.setLastPopupWindowId(null);
      browser.windows.onRemoved.removeListener(handler);
    }
  };

  browser.windows.onRemoved.addListener(handler);
}

/**
 * Closes the currently open popup window.
 */
export async function closePopup() {
  const id = State.getPopupWindowId();
  if (!id) return;

  try {
    await browser.windows.remove(id);
  } catch (e) {
    console.warn("Popup already closed or invalid:", e);
  }

  cleanUpOrphanedUploads();
  resetPopupSession();
  State.setPopupWindowId(null);
  State.setLastPopupWindowId(null);
}

/** Closes the last opened popup window if it exists.
 */
async function closeLastPopup() {
  const lastId = State.getLastPopupWindowId();
  if (!lastId) return;

  try {
    await browser.windows.remove(lastId);
  } catch (e) {
    console.warn("Last popup already closed or invalid:", e);
  }

  State.setLastPopupWindowId(null);
}

/**
 * Validates the popup tab.
 * @returns {Promise<number>} The tab ID of the popup, or -1 if not found or invalid.
 */
async function validateTab() {
  const winId = State.getPopupWindowId();
  if (!winId) return -1;

  const [tab] = await browser.tabs.query({ windowId: winId });
  if (!tab) return -1;

  const isValid = isPopup(tab);
  if (!isValid) return -1;

  return tab.id;
}

/** Sends the initial data (email and projects) to the popup.
 */
export async function sendInitialDataToPopup() {
  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn(
      "Popup tab not found or invalid. When trying to send initial data."
    );
    return;
  }

  const email = State.getEmail();
  if (!email) {
    console.warn("No email data available to send to popup.");
    return;
  }

  const projects = State.getProjects();

  await browser.tabs.sendMessage(tabId, {
    type: MessageTypes.INITIAL_DATA,
    email,
    projects,
  });
}

/**
 * Sends the project list to the popup. Cache-first: if the in-memory state
 * already has a list (warm from this session or a prefetch), it's sent
 * immediately: `getProjects()`'s own cache-first + revalidate behavior
 * handles the cold-cache and background-refresh cases via `onUpdate`, which
 * pushes a second `PROJECT_LIST` if the refresh actually changes anything.
 */
export async function sendProjectsToPopup() {
  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn(
      "Popup tab not found or invalid. When trying to send projects."
    );
    return;
  }

  const push = (projects) => {
    State.setProjects(projects);
    State.setProjectsStale(false); // a fresh render always supersedes a prior staleness claim
    // Fire-and-forget: a stale tab (popup already closed) is not an error here.
    browser.tabs.sendMessage(tabId, {
      type: MessageTypes.PROJECT_LIST,
      projects,
    }).catch(() => {});
  };

  const sendStaleNotice = () => {
    State.setProjectsStale(true);
    browser.tabs.sendMessage(tabId, { type: MessageTypes.PROJECTS_STALE }).catch(() => {});
  };

  const existing = State.getProjects();
  if (existing && existing.length > 0) {
    // No revalidation runs in this branch (it already ran, or is running,
    // as part of whatever earlier call warmed this state (the prefetch in
    // background.js, most commonly), reflect whatever it last found,
    // captured before push() below clears the flag for the next check.
    const wasStale = State.isProjectsStale();
    push(existing);
    if (wasStale) sendStaleNotice();
    return;
  }

  try {
    await getProjects(push, sendStaleNotice);
  } catch (err) {
    console.error("Failed to fetch projects:", err);
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
  }
}

/** Sends the assignees for a given project to the popup.
 * Fetches from cache or GitLab API if not cached. A fetch failure is sent
 * to the popup as an explicit error status rather than being cached as an
 * empty list, so the UI can offer a retry instead of showing "no
 * assignees" for what might just be a transient failure.
 *
 * @param {number} projectId - The ID of the project to get assignees for.
 * @param {object} [project] - The full project object, recorded as
 *   recently-used so it stays available even if it falls off the cached
 *   page of most-recently-active projects.
 */
export async function sendAssigneesToPopup(projectId, project) {
  if (!projectId) return;

  if (project) void recordRecentProject(project);

  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn(
      "Popup tab not found or invalid. When trying to send assignees."
    );
    return;
  }

  const push = (assignees) => {
    State.setAssignees(projectId, assignees);
    browser.tabs.sendMessage(tabId, {
      type: MessageTypes.ASSIGNEES_LIST,
      projectId,
      assignees,
      status: "ok",
    }).catch(() => {});
  };

  const cached = State.getAssignees(projectId);
  if (cached) {
    push(cached);
    return;
  }

  try {
    await getAssignees(projectId, push);
  } catch (err) {
    console.error(`Failed to load assignees for project ${projectId}:`, err);
    try {
      await browser.tabs.sendMessage(tabId, {
        type: MessageTypes.ASSIGNEES_LIST,
        projectId,
        assignees: [],
        status: "error",
      });
    } catch (sendErr) {
      console.error("Failed to send assignee error status to popup:", sendErr);
    }
  }
}

/** Sends the labels for a given project to the popup. Same cache-first +
 * explicit-error-status shape as `sendAssigneesToPopup`: a fetch failure
 * is never cached as an empty list.
 *
 * @param {number} projectId - The ID of the project to get labels for.
 */
export async function sendLabelsToPopup(projectId) {
  if (!projectId) return;

  const tabId = await validateTab();
  if (tabId === -1) {
    console.warn("Popup tab not found or invalid. When trying to send labels.");
    return;
  }

  const push = (labels) => {
    State.setLabels(projectId, labels);
    browser.tabs.sendMessage(tabId, {
      type: MessageTypes.LABELS_LIST,
      projectId,
      labels,
      status: "ok",
    }).catch(() => {});
  };

  const cached = State.getLabels(projectId);
  if (cached) {
    push(cached);
    return;
  }

  try {
    await getLabels(projectId, push);
  } catch (err) {
    console.error(`Failed to load labels for project ${projectId}:`, err);
    try {
      await browser.tabs.sendMessage(tabId, {
        type: MessageTypes.LABELS_LIST,
        projectId,
        labels: [],
        status: "error",
      });
    } catch (sendErr) {
      console.error("Failed to send label error status to popup:", sendErr);
    }
  }
}

/** Searches GitLab for projects server-side and sends the result to the
 * popup, cancelling any still-in-flight search from this popup first so an
 * older, slower response can never land after (and overwrite) a newer one.
 *
 * @param {string} query
 * @param {number} seq - Monotonic sequence number from the popup; echoed
 *   back so the popup can drop an out-of-order reply itself too.
 */
let activeSearchController = null;

export async function sendProjectSearchResult(query, seq) {
  activeSearchController?.abort();
  const ctrl = new AbortController();
  activeSearchController = ctrl;

  const tabId = await validateTab();
  if (tabId === -1) return;

  try {
    const projects = await searchProjects(query, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return; // superseded while the request was in flight

    await browser.tabs.sendMessage(tabId, {
      type: MessageTypes.PROJECT_SEARCH_RESULT,
      query,
      seq,
      projects,
      status: "ok",
    });
  } catch (error) {
    if (error?.name === "AbortError") return; // superseded, nothing to report

    console.error(`Project search failed for "${query}":`, error);
    try {
      await browser.tabs.sendMessage(tabId, {
        type: MessageTypes.PROJECT_SEARCH_RESULT,
        query,
        seq,
        projects: [],
        status: "error",
      });
    } catch (sendErr) {
      console.error("Failed to send search error status to popup:", sendErr);
    }
  }
}

/** Checks if the given tab is a popup tab.
 * @param {Object} tab - The tab object to check.
 * @returns {boolean} True if the tab is a popup, false otherwise.
 */
/** Tells the popup an issue-creation attempt failed, so it can clear its
 * loading state immediately instead of waiting out the fallback timeout.
 * On success the background closes the popup instead, so no signal is
 * needed there.
 */
export async function notifyIssueCreateFailed() {
  const tabId = await validateTab();
  if (tabId === -1) return;
  browser.tabs
    .sendMessage(tabId, { type: MessageTypes.ISSUE_CREATE_FAILED })
    .catch(() => {});
}

export function isPopup(tab) {
  if (!tab?.title) return false;

  const { type, title, url } = tab;
  return (
    type === "popup" ||
    title.toLowerCase().includes("popup") ||
    url.includes(POPUP_PATH)
  );
}
