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
  ASSIGNEES: "assignees_ALL",
  CURRENT_USER: "current_user",
});

export const LocalizeKeys = Object.freeze({
  BROWSER: {
    ACTION_TITLE: 'BrowserActionTitle'
  },

  BUTTON: {
    SAVE: 'ButtonSave',
    CLEAR_CACHE: 'ButtonClearCache',
    EMPTY_PROJECTS: 'OptionsButtonEmptyProjects',
    EMPTY_ASSIGNEES: 'OptionsButtonEmptyAsignees',
    SUBMIT: 'PopupButtonSubmit'
  },

  OPTIONS: {
    TITLE: 'OptionsTitle',
    TABS_TITLE: 'OptionsTabsTitle',
    LABELS: {
      GITLAB_URL: 'OptionsLabelGitlabURL',
      GITLAB_TOKEN: 'OptionsLabelGitlabToken',
      ENABLE_ASSIGNEE_LOADING: 'OptionsLabelEnableAssigneeLoading'
    },
    TITLES: {
      TOKEN_LINK: 'OptionsTitleTokenLink',
      ADDITIONAL_OPTIONS: 'OptionsTitleAdditionalOptions',
      CLEANUP: 'OptionsTitleCleanup'
    },
    TOOLTIPS: {
      TOKEN_LINK: 'OptionsTooltipTokenLink',
      ENABLE_ASSIGNEE_LOADING: 'OptionsTooltipEnableAssigneeLoading'
    },
    ALERTS: {
      ADD_GITLAB_URL: 'OptionsAlertAddGitLabUrl',
      ADD_GITLAB_TOKEN: 'OptionsAlertAddGitLabToken',
      CACHE_CLEARED: 'OptionsAlertCacheCleared',
      PROJECTS_CLEARED: 'OptionsAlertProjectsCleared',
      ASSIGNEES_CLEARED: 'OptionsAlertAssigneesCleared',
      OPTIONS_SAVED: 'OptionsAlertOptionsSaved',
      ASSIGNEES_ENABLED: 'OptionsAlertAssigneesEnabled',
      ASSIGNEES_DISABLED: 'OptionsAlertAssigneesDisabled'
    },
    ERRORS: {
      INVALID_URL: 'OptionsErrorInvalidUrl',
      UNREACHABLE_URL: 'OptionsErrorUnreachableUrl',
      OPTIONS_LOADED: 'OptionsErrorOptionsLoaded',
      OPTIONS_SAVED: 'OptionsErrorOptionsSaved',
      ASSIGNEES_SAVED: 'OptionsErrorAssigneesSaved',
      CACHE_CLEARED: 'OptionsErrorCacheCleared',
      PROJECTS_CLEARED: 'OptionsErrorProjectsCleared',
      ASSIGNEES_CLEARED: 'OptionsErrorAssigneesCleared'
    },
    FOOTER: {
      MADE_BY: 'OptionsMadeBy'
    }
  },

  POPUP: {
    TITLE: 'PopupTitle',
    TABS_TITLE: 'PopupTabsTitle',
    LABELS: {
      SELECT_PROJECT: 'PopupLabelSelectProject',
      TITLE: 'PopupLabelTitleOfProject',
      ATTACHMENTS_CHECKBOX: 'PopupLabelAttachmentsCheckbox',
      ASSIGNEE_SELECT: 'PopupLabelAssigneeSelect',
      ISSUE_DESCRIPTION: 'PopupLabelIssueDescription',
      ISSUE_END: 'PopupLabelIssueEnd',
      FROM_AUTHOR: 'PopupFromAuthor',
      DATE_RECEIVED: 'PopupDateReceived',
      FORWARDED_MESSAGE: 'PopupForwardedMessage',
    },
    PLACEHOLDERS: {
      SELECT_PROJECT: 'PopupPlaceholderSelectProject'
    },
    SELECT: {
      FIRST_ASSIGNEE_ENTRY: 'PopupAssigneeSelectFirstEntry'
    },
    MESSAGES: {
      NO_ASSIGNEES_FOUND: 'PopupNoAssigneesFound'
    }
  },

  Issue: {
    ATTACHMENTS_TITLE: 'IssueAttachmentsTitle',
    ATTACHMENT_PREVIEW_TEXT: 'IssueAttachmentPreviewText',
    ATTACHMENT_PREVIEW_TEXT_DISCLAIMER: 'IssueAttachmentPreviewTextDisclaimer',
  },

  EMAIL: {
    NO_CONTENT: 'EmailNoContentMessage'
  },

  NOTIFICATION: {
    GENERIC_ERROR: 'NotificationGenericError',
    NO_MESSAGE_SELECTED: 'NotificationNoMessageSelected',
    NO_EMAIL_CONTENT: 'NotificationNoEmailContent',
    GITLAB_SETTINGS_MISSING: 'NotificationGitlabSettingsMissing',
    GITLAB_URL_NOT_CONFIGURED: 'NotificationGitLabUrlNotConfigured',
    GITLAB_TOKEN_NOT_CONFIGURED: 'NotificationGitLabTokenNotConfigured',
    INVALID_GITLAB_TOKEN: 'NotificationInvalidGitLabToken',
    NO_GITLAB_SETTINGS: 'NotificationNoGitlabSettings',
    ISSUE_CREATED: 'NotificationIssueCreated',
    NO_PROJECT_SELECTED: 'NotificationNoProjectSelected',
    ATTACHMENT_NOT_FOUND: 'NotificationAttachmentNotFound',
    UPLOAD_ATTACHMENT_ERROR: 'NotificationUploadAttachmentError',
  }
});
