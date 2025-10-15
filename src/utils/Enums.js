// Message types for communication with background
export const MessageTypes = Object.freeze({
  INITIAL_DATA: "initial-data",
  PROJECT_LIST: "project-list",
  ASSIGNEES_LIST: "assignees-list",
  CLEAR_CACHE: "clear-cache",
  SETTINGS_UPDATED: "settings-updated",
  CLOSE_POPUP: "close-popup",
});

// Message types for communication between popup and background
// Popup sends these messages to the background script
export const Popup_MessageTypes = Object.freeze({
  POPUP_READY: "popup-ready",
  REQUEST_INITIAL_DATA: "request-initial-data",
  REQUEST_PROJECTS: "request-projects",
  REQUEST_ASSIGNEES: "request-assignees",
  CREATE_GITLAB_ISSUE: "create-gitlab-issue",
});

// Keys for storing data in browser.storage.local
export const CacheKeys = Object.freeze({
  DISABLE_CACHE: "disable_cache",
  GITLAB_SETTINGS: "gitlab_settings",
  PROJECTS: "projects",
  ASSIGNEES: "assignees_ALL",
  CURRENT_USER: "current_user",

  ASSIGNEES_LOADING: "enable_assignee_loading",
  ENABLE_WATERMARK: "enable_watermark",
});

// Keys for localization messages in _locales
export const LocalizeKeys = Object.freeze({
  EXTENSION: {
    NAME: "ExtensionName",
    DESCRIPTION: "ExtensionDescription",
  },

  BROWSER: {
    ACTION_TITLE: "BrowserActionTitle",
  },

  BUTTON: {
    SAVE: "ButtonSave",
    CLEAR_CACHE: "ButtonClearCache",
    EMPTY_PROJECTS: "OptionsButtonEmptyProjects",
    EMPTY_ASSIGNEES: "OptionsButtonEmptyAsignees",
    SUBMIT: "PopupButtonSubmit",
  },

  OPTIONS: {
    TITLE: "OptionsTitle",
    TABS_TITLE: "OptionsTabsTitle",
    LABELS: {
      GITLAB_URL: "OptionsLabelGitlabURL",
      GITLAB_TOKEN: "OptionsLabelGitlabToken",
      ENABLE_ASSIGNEE_LOADING: "OptionsLabelEnableAssigneeLoading",
    },
    TITLES: {
      TOKEN_LINK: "OptionsTitleTokenLink",
      ADDITIONAL_OPTIONS: "OptionsTitleAdditionalOptions",
      CLEANUP: "OptionsTitleCleanup",
    },
    TOOLTIPS: {
      TOKEN_LINK: "OptionsTooltipTokenLink",
      ENABLE_ASSIGNEE_LOADING: "OptionsTooltipEnableAssigneeLoading",
    },
    ALERTS: {
      ADD_GITLAB_URL: "OptionsAlertAddGitLabUrl",
      ADD_GITLAB_TOKEN: "OptionsAlertAddGitLabToken",
      CACHE_CLEARED: "OptionsAlertCacheCleared",
      PROJECTS_CLEARED: "OptionsAlertProjectsCleared",
      ASSIGNEES_CLEARED: "OptionsAlertAssigneesCleared",
      OPTIONS_SAVED: "OptionsAlertOptionsSaved",
      ASSIGNEES_ENABLED: "OptionsAlertAssigneesEnabled",
      ASSIGNEES_DISABLED: "OptionsAlertAssigneesDisabled",
      WATERMARK_ENABLED: "OptionsAlertWatermarkEnabled",
      WATERMARK_DISABLED: "OptionsAlertWatermarkDisabled",
      DISABLE_CACHE: "OptionsAlertDisableCache",
      CACHE_DISABLED: "OptionsAlertCacheDisabled",
      CACHE_ENABLED: "OptionsAlertCacheEnabled",
      CLEAR_CACHE: "OptionsAlertClearCache",
    },
    ERRORS: {
      ERROR_OPENING: "OptionsErrorOpening",
      INVALID_URL: "OptionsErrorInvalidUrl",
      UNREACHABLE_URL: "OptionsErrorUnreachableUrl",
      OPTIONS_LOADED: "OptionsErrorOptionsLoaded",
      OPTIONS_SAVED: "OptionsErrorOptionsSaved",
      ASSIGNEES_SAVED: "OptionsErrorAssigneesSaved",
      CACHE_CLEARED: "OptionsErrorCacheCleared",
      PROJECTS_CLEARED: "OptionsErrorProjectsCleared",
      ASSIGNEES_CLEARED: "OptionsErrorAssigneesCleared",
    },
    FOOTER: {
      MADE_BY: "OptionsMadeBy",
    },
  },

  POPUP: {
    TITLE: "PopupTitle",
    TABS_TITLE: "PopupTabsTitle",
    LABELS: {
      SELECT_PROJECT: "PopupLabelSelectProject",
      TITLE: "PopupLabelTitleOfProject",
      ATTACHMENTS_BUTTON: "PopupLabelAttachmentsButton",
      ASSIGNEE_SELECT: "PopupLabelAssigneeSelect",
      ISSUE_DESCRIPTION: "PopupLabelIssueDescription",
      ISSUE_END: "PopupLabelIssueEnd",
      FROM_AUTHOR: "PopupFromAuthor",
      DATE_RECEIVED: "PopupDateReceived",
      FORWARDED_MESSAGE: "PopupForwardedMessage",
    },
    PLACEHOLDERS: {
      SELECT_PROJECT: "PopupPlaceholderSelectProject",
    },
    SELECT: {
      FIRST_ASSIGNEE_ENTRY: "PopupAssigneeSelectFirstEntry",
    },
    MESSAGES: {
      NO_ASSIGNEES_FOUND: "PopupNoAssigneesFound",
      NO_ATTACHMENTS: "PopupNoAttachments",
    },
    ERRORS: {
      ERROR_CLOSING: "PopupErrorClosing"
    },
  },

  ISSUE: {
    ATTACHMENTS_TITLE: "IssueAttachmentsTitle",
    ATTACHMENT_PREVIEW_TEXT: "IssueAttachmentPreviewText",
    ATTACHMENT_PREVIEW_TEXT_DISCLAIMER: "IssueAttachmentPreviewTextDisclaimer",
    WATERMARK_TEXT: "IssueWatermarkText",
  },

  EMAIL: {
    NO_CONTENT: "EmailNoContentMessage",
  },

  NOTIFICATION: {
    GENERIC_ERROR: "NotificationGenericError",
    NO_MESSAGE_SELECTED: "NotificationNoMessageSelected",
    NO_EMAIL_CONTENT: "NotificationNoEmailContent",
    GITLAB_SETTINGS_MISSING: "NotificationGitlabSettingsMissing",
    GITLAB_URL_NOT_CONFIGURED: "NotificationGitLabUrlNotConfigured",
    GITLAB_TOKEN_NOT_CONFIGURED: "NotificationGitLabTokenNotConfigured",
    INVALID_GITLAB_TOKEN: "NotificationInvalidGitLabToken",
    NO_GITLAB_SETTINGS: "NotificationNoGitlabSettings",
    ISSUE_CREATED: "NotificationIssueCreated",
    NO_PROJECT_SELECTED: "NotificationNoProjectSelected",
    ATTACHMENT_NOT_FOUND: "NotificationAttachmentNotFound",
    UPLOAD_ATTACHMENT_ERROR: "NotificationUploadAttachmentError",
  },

  FALLBACK: {
    NO_DESCRIPTION: "FallbackNoDescription",
    NO_EMAIL_CONTENT: "FallbackNoEmailContent",
    NO_DATE_AVAILABLE: "FallbackNoDateAvailable",
    NO_PROJECT_NAME: "FallbackNoProjectName",
    UNKNOWN_ASSIGNEE: "FallbackUnknownAssignee",
    UNKNOWN_SENDER: "FallbackUnknownSender",
    NO_TRANSLATION: "FallbackNoTranslation",
  },
});
