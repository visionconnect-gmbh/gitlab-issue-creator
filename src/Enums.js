export const MessageTypes = Object.freeze({
  POPUP_READY: "popup-ready",
  PROJECT_LIST: "project-list",
  CREATE_GITLAB_ISSUE: "create-gitlab-issue",
  CLEAR_CACHE: "clear-cache",
  SETTINGS_UPDATED: "settings-updated",
  REQUEST_ASSIGNEES: "request-assignees",
  ASSIGNEES_LIST: "assignees-list",
});

export const CacheKeys = Object.freeze({
  PROJECTS: "projects",
  ASSIGNEES: "assignees",
});