let projects = [];
let assignees = {};
let email = null;
let popupWindowId = null;
let popupReady = false;

let lastPopupWindowId = null;

export function reset() {
  projects = [];
  assignees = {};
  email = null;
  popupWindowId = null;
  popupReady = false;
}

export const State = {
  setProjects: (p) => {
    projects = p;
  },
  getProjects: () => projects,

  setAssignees: (id, list) => {
    assignees[id] = list;
  },
  getAssignees: (id) => assignees[id],

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
};
