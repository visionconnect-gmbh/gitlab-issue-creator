import { createEditor } from "./editor/editor.js";
import { createUploadRegistry } from "./uploadRegistry.js";
import { createPickerModal } from "./pickerModal.js";
import { CacheKeys, Popup_MessageTypes } from "../../utils/Enums.js";
import { uploadFileOrNotify, deleteUploadOrNotify } from "../../gitlab/gitlab.js";

let isAssigneeLoadingEnabled = false;
let assigneesCache = {};
let currentAssignees = [];
/** @type {Record<string, { labels: object[], status: "ok"|"error" }>} */
let labelsCache = {};
let selectedLabels = [];
let projects = [];
let filteredProjects = [];
let messageData = null;
let selectedProjectId = null;
let selectedAssigneeId = null;
let issueEndDate = null;

const elements = {
  projectSearch: document.getElementById("projectSearch"),
  projectSuggestions: document.getElementById("projectSuggestions"),
  projectSelectedState: document.getElementById("projectSelectedState"),
  projectsStaleNotice: document.getElementById("projectsStaleNotice"),
  issueTitle: document.getElementById("issueTitle"),
  issueDescription: document.getElementById("issueDescription"),
  assigneeSelect: document.getElementById("assigneeSelect"),
  issueEnd: document.getElementById("issueEnd"),
  attachmentsButton: document.getElementById("attachmentsButton"),
  labelsButton: document.getElementById("labelsButton"),
  createBtn: document.getElementById("create"),
  createError: document.getElementById("createError"),

  pickerBackdrop: document.getElementById("picker-backdrop"),
  pickerContainer: document.getElementById("picker-container"),
  pickerTitle: document.getElementById("picker-title"),
  pickerSearch: document.getElementById("picker-search"),
  pickerHint: document.getElementById("picker-hint"),
  pickerList: document.getElementById("picker-list"),
  pickerClose: document.getElementById("picker-close"),
  pickerAction: document.getElementById("picker-action"),
};

const pickerModal = createPickerModal({
  backdrop: elements.pickerBackdrop,
  titleEl: elements.pickerTitle,
  searchInput: elements.pickerSearch,
  hintEl: elements.pickerHint,
  list: elements.pickerList,
  closeBtn: elements.pickerClose,
  actionBtn: elements.pickerAction,
});

/** Registers a locally-picked image with the upload registry and returns a
 * placeholder Markdown image for the editor to insert immediately. GitLab's
 * /uploads endpoint is project-scoped, not issue-scoped, so the upload
 * itself is valid before any issue exists, but it may not happen right
 * away if no project is selected yet; the registry's reconciler uploads it
 * (and swaps the placeholder for the real link) once one is. */
function handlePickImage(file) {
  return { markdown: uploadRegistry.addImage(file, file.name) };
}

const editor = createEditor(document.getElementById("issueDescription"), {
  draftCacheKey: CacheKeys.DESCRIPTION_DRAFT,
  onPickImage: handlePickImage,
  // The editor's inline `@`-mention dropdown filters this same list
  // (already loaded for the assignee select, see projectHandler.js) as the
  // user types, instead of a separate picker-modal round trip.
  getMentionCandidates: () => currentAssignees,
  onUserInput: () => uploadRegistry.scheduleSync(),
});

const uploadRegistry = createUploadRegistry({
  upload: uploadFileOrNotify,
  remove: deleteUploadOrNotify,
  getProjectId: () => selectedProjectId,
  getText: () => editor.value(),
  replaceText: (search, replacement) => editor.replace(search, replacement),
  reportUploads: (uploads) =>
    browser.runtime.sendMessage({ type: Popup_MessageTypes.REPORT_UPLOADS, uploads }),
});

export {
  isAssigneeLoadingEnabled,
  assigneesCache,
  currentAssignees,
  labelsCache,
  selectedLabels,
  projects,
  filteredProjects,
  messageData,
  selectedProjectId,
  selectedAssigneeId,
  issueEndDate,
  elements,
  editor,
  uploadRegistry,
  pickerModal,
};

export function setIsAssigneeLoadingEnabled(value) {
  isAssigneeLoadingEnabled = value;
}

export function setAssigneesCache(projectId, assignees) {
  assigneesCache[projectId] = assignees;
}

export function setCurrentAssignees(assignees) {
  currentAssignees = assignees;
}

export function setLabelsCache(projectId, labels, status = "ok") {
  labelsCache[projectId] = { labels, status };
}

export function setSelectedLabels(labels) {
  selectedLabels = labels;
}

export function setProjects(newProjects) {
  projects = newProjects;
}

export function setFilteredProjects(newFilteredProjects) {
  filteredProjects = newFilteredProjects;
}

export function setMessageData(data) {
  messageData = data;
}

export function setSelectedProjectId(id) {
  selectedProjectId = id;
  uploadRegistry.scheduleSync();
}

export function setSelectedAssigneeId(id) {
  selectedAssigneeId = id;
}

export function setIssueEndDate(date) {
  const newDate = date ? date.toISOString().split("T")[0] : null;
  elements.issueEnd.value = newDate;
  issueEndDate = newDate;
}

export function resetState() {
  editor.value("");
  editor.clearDraft();
  uploadRegistry.reset();
  pickerModal.close();
  elements.issueTitle.value = "";
  elements.issueEnd.value = null;
  selectedProjectId = null;
  currentAssignees = [];
  filteredProjects = [];
  projects = [];
  assigneesCache = {};
  labelsCache = {};
  selectedLabels = [];
  selectedAssigneeId = null;
  issueEndDate = null;
  elements.projectSearch.value = "";
  elements.projectSuggestions.replaceChildren();
  elements.projectsStaleNotice.hidden = true;
  elements.createError.hidden = true;
  elements.projectSearch.focus();
  elements.projectSearch.select();
}
