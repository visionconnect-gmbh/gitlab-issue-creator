let projects = [];
/** Whether the last background revalidation of `projects` failed (GitLab
 * unreachable, 5xx, etc., not auth, which notifies separately). Cleared
 * whenever a revalidation attempt is made again, and set on its failure: see
 * gitlab.js's `onStale` callback and popupHandler.js's use of it. */
let projectsStale = false;
let assignees = {};
let labels = {};
let email = null;
let popupWindowId = null;
let popupReady = false;

let lastPopupWindowId = null;

/** Uploads the current popup has eagerly created on GitLab ({ projectId, id }
 * entries) that aren't yet referenced by a created issue. Reported by the
 * popup's upload registry after every change; drained (read + cleared) once
 * the popup closes or the issue is created, whichever comes first. */
let pendingUploads = [];

/** Clears everything tied to one popup's lifetime: email, window bookkeeping,
 * pending uploads. Deliberately leaves `projects`/`assignees` alone: the
 * background page is a persistent session, not a per-popup scratchpad, so
 * data it already fetched should still answer the next popup's first
 * request without a network round trip. Call this on popup close. */
export function resetPopupSession() {
  email = null;
  popupWindowId = null;
  popupReady = false;
  pendingUploads = [];
}

/** Full reset including the GitLab data caches. Used for tests / a complete
 * factory reset; normal popup close should use `resetPopupSession()`. */
export function reset() {
  resetPopupSession();
  projects = [];
  projectsStale = false;
  assignees = {};
  labels = {};
}

export const State = {
  setProjects: (p) => {
    projects = p;
  },
  getProjects: () => projects,

  setProjectsStale: (val) => {
    projectsStale = val;
  },
  isProjectsStale: () => projectsStale,

  setAssignees: (id, list) => {
    assignees[id] = list;
  },
  getAssignees: (id) => assignees[id],

  setLabels: (id, list) => {
    labels[id] = list;
  },
  getLabels: (id) => labels[id],

  setEmail: (e) => {
    email = e;
  },
  getEmail: () => email,

  setPopupWindowId: (id) => {
    if (popupWindowId !== null) {
      // normal case: we already had one
      State.setLastPopupWindowId(popupWindowId);
    } else {
      // first popup: last == current
      State.setLastPopupWindowId(id);
    }
    popupWindowId = id;
  },
  getPopupWindowId: () => popupWindowId,

  setLastPopupWindowId: (id) => {
    lastPopupWindowId = id;
  },
  getLastPopupWindowId: () => lastPopupWindowId,

  setPopupReady: (val) => {
    popupReady = val;
  },
  isPopupReady: () => popupReady,

  setPendingUploads: (list) => {
    pendingUploads = list;
  },
  /** Returns the current list and clears it in the same step, so two
   * callers racing to clean up (e.g. closePopup() and the onRemoved
   * listener it triggers) can't both act on the same uploads. */
  takePendingUploads: () => {
    const uploads = pendingUploads;
    pendingUploads = [];
    return uploads;
  },
};
