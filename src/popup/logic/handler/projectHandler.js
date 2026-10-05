import { MessageTypes, Popup_MessageTypes } from "../../../utils/Enums.js";
import {
  projects,
  elements,
  setProjects,
  setFilteredProjects,
  filteredProjects,
  setAssigneesCache,
  setCurrentAssignees,
  labelsCache,
  setLabelsCache,
  setSelectedLabels,
  setMessageData,
  setSelectedProjectId,
  selectedProjectId,
  assigneesCache,
  messageData,
  editor,
  isAssigneeLoadingEnabled,
} from "../popupState.js";
import {
  renderProjectSuggestions,
  renderAssignees,
  renderAssigneeLoadError,
  showProjectSuggestions,
  hideProjectSuggestions,
  setActiveProjectOption,
  updateProjectSelectedState,
  showProjectsStaleNotice,
  hideProjectsStaleNotice,
  showCreateError,
  setSearchingIndicator,
  setProjectsLoading,
  clearButtonLoadingState,
} from "../ui.js";
import { defineGate, evaluateGates } from "../gates.js";
import { generateBaseDescription } from "./descriptionHandler.js";
import { isPopupMessageType } from "../../../utils/utils.js";

/** The project id assignees have actually settled (arrived, success or
 * error) for, distinct from `assigneesCache` (only set on success): drives
 * the assignee select's gate without conflating "no data yet" with "loaded,
 * but empty/errored". Reset to null on every selection change. */
let assigneesSettledFor = null;

defineGate({
  element: elements.createBtn,
  mode: "disabled",
  when: () => !!selectedProjectId,
});

defineGate({
  element: elements.labelsButton,
  mode: "hidden",
  when: () => !!selectedProjectId && labelsCache[selectedProjectId] !== undefined,
});

defineGate({
  element: elements.assigneeSelect.parentElement,
  mode: "display",
  when: () => !!selectedProjectId && assigneesSettledFor === selectedProjectId,
});

defineGate({
  element: elements.attachmentsButton,
  mode: "hidden",
  when: () => (messageData?.attachments?.length ?? 0) > 0,
});

/** Keyboard-active index into `filteredProjects`, while the suggestion
 * listbox is open. Transient UI state, reset whenever the listbox closes. */
let activeIndex = -1;

/** The full project object behind `selectedProjectId`, so a server-side
 * assignee request can tell the background which project to record as
 * recently-used: background only otherwise sees the bare id. */
let selectedProject = null;

// ---------------------------------------------------------------------------
// Server-side project search: debounced, sequenced against out-of-order
// replies, and superseded requests are cancelled in the background so
// GitLab stops working on them.
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SERVER_SEARCH_LENGTH = 2;

let searchDebounceTimer = null;
let searchSeq = 0;
let lastSentQuery = "";

function scheduleServerSearch(term) {
  clearTimeout(searchDebounceTimer);

  const trimmed = term.trim();
  if (trimmed.length < MIN_SERVER_SEARCH_LENGTH || trimmed === lastSentQuery) {
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    lastSentQuery = trimmed;
    const seq = ++searchSeq;
    setSearchingIndicator(true);
    renderProjectSuggestions();
    sendMessageToBackground(Popup_MessageTypes.REQUEST_PROJECT_SEARCH, {
      query: trimmed,
      seq,
    });
  }, SEARCH_DEBOUNCE_MS);
}

function handleProjectSearchResult(msg) {
  if (msg.seq !== searchSeq) return; // a newer search has already superseded this reply

  setSearchingIndicator(false);

  if (msg.status !== "ok") {
    renderProjectSuggestions();
    return;
  }

  // Merge server results into whatever the local (cached-page) filter
  // already matched, de-duplicated by id: the server search covers
  // projects outside the cached page, it doesn't replace the local match.
  const term = elements.projectSearch.value;
  const localMatches = projects.filter((p) => matchesSearch(p, term));
  const merged = [...localMatches];
  const seen = new Set(localMatches.map((p) => p.id));

  for (const p of msg.projects) {
    if (!seen.has(p.id)) {
      merged.push(p);
      seen.add(p.id);
    }
  }

  setFilteredProjects(merged);
  if (activeIndex >= merged.length) activeIndex = -1;
  renderProjectSuggestions();
}

/**
 * Handles incoming messages from the background script.
 * @param {Object} msg - The incoming message object.
 * @returns {void}
 */
export function handleIncomingMessage(msg) {
  try {
    // Check if message type is Popup_MessageTypes
    if (isPopupMessageType(msg.type)) return;

    switch (msg.type) {
      case MessageTypes.INITIAL_DATA:
        handleInitalData(msg);
        break;
      case MessageTypes.PROJECT_LIST:
        handleProjectsData(msg.projects);
        break;
      case MessageTypes.PROJECT_SEARCH_RESULT:
        handleProjectSearchResult(msg);
        break;
      case MessageTypes.ASSIGNEES_LIST:
        handleAssigneeData(msg);
        break;
      case MessageTypes.LABELS_LIST:
        handleLabelsData(msg);
        break;
      case MessageTypes.PROJECTS_STALE:
        showProjectsStaleNotice();
        break;
      case MessageTypes.ISSUE_CREATE_FAILED:
        clearButtonLoadingState();
        showCreateError();
        break;
      default:
        console.warn("Unknown message type:", msg.type);
    }
  } catch (error) {
    console.error(
      `Error handling message of type ${msg.type}: ${error}. Message:`,
      msg,
    );
  }
}

/**
 * Handles initial data message from the background script.
 * @param {Object} msg - The incoming message object.
 */
function handleInitalData(msg) {
  const projects = msg.projects;
  if (projects) handleProjectsData(projects);

  setMessageData(msg.email);
  elements.issueTitle.value = messageData.subject ?? "";
  editor.value(generateBaseDescription());
  evaluateGates(); // the attachments button depends on messageData.attachments

  sendMessageToBackground(Popup_MessageTypes.REQUEST_PROJECTS);
}

/**
 * Handles project data message from the background script. Non-destructive:
 * this fires again whenever a background revalidation finds a real change
 * (see gitlab.js `getProjects`), potentially while the user is mid-typing or
 * has a project committed, so the current search term, its filter, and the
 * selection are preserved rather than being reset to the full list.
 * @param {Array} newProjects - The array of project objects.
 */
function handleProjectsData(newProjects) {
  const incoming = newProjects || [];
  setProjectsLoading(false);
  hideProjectsStaleNotice(); // a fresh successful list always supersedes a prior staleness claim
  setProjects(incoming);

  const term = elements.projectSearch.value;
  setFilteredProjects(
    term.trim().length > 0
      ? incoming.filter((p) => matchesSearch(p, term))
      : [...incoming],
  );

  if (activeIndex >= filteredProjects.length) activeIndex = -1;

  if (selectedProjectId !== null && !incoming.some((p) => p.id === selectedProjectId)) {
    // The committed project genuinely disappeared from the refreshed list
    // (not just scrolled off, it's gone), so the selection can't stand.
    clearSelection();
  }

  renderProjectSuggestions();
}

/**
 * Handles assignee data message from the background script.
 * @param {Object} msg - The incoming message object.
 * @returns {void}
 */
function handleAssigneeData(msg) {
  const projectId = msg.projectId;
  const assignees = msg.assignees;
  if (!projectId || !Array.isArray(assignees)) {
    console.warn("Invalid assignee data received:", msg);
    return;
  }

  if (projectId !== selectedProjectId) {
    // Data is for a different project, ignore
    return;
  }

  // Settled either way: an explicit error state (below) still needs the
  // control visible to show it; the alternative (staying hidden) would
  // just look identical to "still loading," forever.
  assigneesSettledFor = projectId;
  evaluateGates();

  if (msg.status === "error") {
    renderAssigneeLoadError();
    return;
  }

  setAssigneesCache(projectId, assignees);
  setCurrentAssignees(assignees);
  renderAssignees();
}

/**
 * Handles label data message from the background script. Only cached for
 * the picker to read on demand (unlike assignees, there's no always-visible
 * UI element to re-render here), see `issueHandler.js`'s
 * `handleLabelsButtonClick`.
 * @param {Object} msg - The incoming message object.
 */
function handleLabelsData(msg) {
  const { projectId, labels, status } = msg;
  if (!projectId || projectId !== selectedProjectId) return;
  setLabelsCache(projectId, Array.isArray(labels) ? labels : [], status);
  // Settled (success or error), safe to reveal now; see
  // updateLabelsForSelectedProject()'s doc comment for why this matters.
  evaluateGates();
}

function matchesSearch(project, term) {
  return (project.name_with_namespace || project.name || "")
    .toLowerCase()
    .includes(term.trim().toLowerCase());
}

function filterAndRenderSuggestions() {
  setFilteredProjects(projects.filter((p) => matchesSearch(p, elements.projectSearch.value)));
  activeIndex = -1;
  renderProjectSuggestions();
}

/** Commits `project` as the selected project: the single chokepoint that
 * calls setSelectedProjectId: every other interaction only filters or
 * highlights, it never selects. */
function commitSelection(project) {
  elements.projectSearch.value = project.name_with_namespace || project.name || "";
  setSelectedProjectId(project.id);
  selectedProject = project;
  setSelectedLabels([]); // a previous project's labels don't apply to this one
  updateProjectSelectedState(project);
  // Create's gate has no further data dependency once a project is picked,
  // so it opens immediately. Labels/Assignee each depend on an async fetch
  // for *this* project: clearing assigneesSettledFor closes their gates
  // again here, and updateAssigneesForSelectedProject()/
  // updateLabelsForSelectedProject() (cache-hit, synchronous) or
  // handleAssigneeData()/handleLabelsData() (network, async) reopen them
  // only once that fetch has actually settled. Opening them early risks a
  // "no labels found"/stale-assignee flash for a project whose data just
  // hasn't arrived yet.
  assigneesSettledFor = null;
  evaluateGates();
  hideProjectSuggestions();
  activeIndex = -1;
  updateAssigneesForSelectedProject();
  updateLabelsForSelectedProject();
}

/** Clears the committed project, e.g. because the user edited the field
 * away from it or explicitly cleared it. */
function clearSelection() {
  setSelectedProjectId(null);
  selectedProject = null;
  setSelectedLabels([]);
  updateProjectSelectedState(null);
  assigneesSettledFor = null;
  evaluateGates();
  updateAssigneesForSelectedProject();
}

/**
 * Handles the project search field gaining focus: opens the suggestion
 * listbox for whatever is currently typed, without touching the
 * committed selection.
 */
export function handleProjectSearchFocus() {
  filterAndRenderSuggestions();
  showProjectSuggestions();
}

/**
 * Handles input events on the project search field: filters the
 * suggestion list as the user types. Typing away from a committed
 * project's exact name clears that selection: committing a new one
 * always happens explicitly (Enter / click), never implicitly here.
 */
export function handleProjectSearchInput() {
  filterAndRenderSuggestions(); // instant local filter over the cached page
  showProjectSuggestions();
  scheduleServerSearch(elements.projectSearch.value); // finds anything outside it

  if (selectedProjectId !== null) clearSelection();
}

/**
 * Handles keyboard navigation of the suggestion listbox: ArrowUp/ArrowDown
 * move the active option, Enter commits it, Escape closes the listbox (or,
 * if already closed, clears a committed selection).
 * @param {KeyboardEvent} e
 */
export function handleProjectSearchKeydown(e) {
  const optionCount = filteredProjects.length;
  const isOpen = !elements.projectSuggestions.hidden;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (!optionCount) return;
      if (!isOpen) {
        showProjectSuggestions();
        activeIndex = 0;
      } else {
        activeIndex = (activeIndex + 1) % optionCount;
      }
      setActiveProjectOption(activeIndex);
      break;

    case "ArrowUp":
      e.preventDefault();
      if (!optionCount) return;
      if (!isOpen) {
        showProjectSuggestions();
        activeIndex = optionCount - 1;
      } else {
        activeIndex = activeIndex <= 0 ? optionCount - 1 : activeIndex - 1;
      }
      setActiveProjectOption(activeIndex);
      break;

    case "Enter":
      if (activeIndex >= 0 && filteredProjects[activeIndex]) {
        e.preventDefault();
        commitSelection(filteredProjects[activeIndex]);
      }
      break;

    case "Escape":
      if (isOpen) {
        e.preventDefault();
        hideProjectSuggestions();
        activeIndex = -1;
      } else if (selectedProjectId !== null) {
        e.preventDefault();
        elements.projectSearch.value = "";
        clearSelection();
      }
      break;

    default:
      break;
  }
}

/**
 * Handles a mousedown on the suggestion listbox (delegated, since the listbox is
 * re-rendered on every keystroke, so a single listener outlives the
 * options). Uses mousedown rather than click so it commits before the
 * input's blur fires.
 * @param {MouseEvent} e
 */
export function handleProjectOptionMouseDown(e) {
  const option = e.target.closest(".combobox-option");
  if (!option) return;
  e.preventDefault(); // keep focus on the input instead of moving it to the <li>

  const project = filteredProjects.find((p) => String(p.id) === option.dataset.projectId);
  if (project) commitSelection(project);
}

/** Handles the project search field losing focus: closes the listbox. */
export function handleProjectSearchBlur() {
  hideProjectSuggestions();
  activeIndex = -1;
}

/** Updates the assignees for the currently committed project.
 * Fetches from cache or requests from background if not cached.
 */
async function updateAssigneesForSelectedProject() {
  if (!isAssigneeLoadingEnabled) return;

  if (!selectedProjectId) {
    setCurrentAssignees([]);
    renderAssignees();
    return;
  }

  if (assigneesCache[selectedProjectId]) {
    setCurrentAssignees(assigneesCache[selectedProjectId]);
    renderAssignees();
    assigneesSettledFor = selectedProjectId;
    evaluateGates();
    return;
  }

  sendMessageToBackground(Popup_MessageTypes.REQUEST_ASSIGNEES, {
    projectId: selectedProjectId,
    project: selectedProject,
  });
}

/** Requests labels for the newly-committed project in the background, same
 * as assignees: unlike assignees there's no always-visible select to
 * populate, so this just warms `labelsCache` for whenever the user opens
 * the label picker. Skips the round trip entirely (mirroring the assignee
 * cache-hit path) when this project's labels are already warm from earlier
 * in the session, so the Labels button becomes visible immediately in that
 * case rather than waiting on a network response it doesn't need. */
function updateLabelsForSelectedProject() {
  if (!selectedProjectId) return;

  if (labelsCache[selectedProjectId]) {
    evaluateGates();
    return;
  }

  sendMessageToBackground(Popup_MessageTypes.REQUEST_LABELS, {
    projectId: selectedProjectId,
  });
}

function sendMessageToBackground(type, payload = {}) {
  browser.runtime.sendMessage({ type, ...payload });
}
