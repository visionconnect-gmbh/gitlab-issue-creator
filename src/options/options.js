import { MessageTypes, CacheKeys, LocalizeKeys } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
import { clearAllCache, resetCache, getCache, setCache } from "../utils/cache.js";

/**
 * SVG path data for eye icons.
 * @readonly
 * @enum {string}
 */
const SVG_PATH = {
  EYE_OPEN:
    "M2.1 3.51L1 4.62l4.02 4.02C3.43 10.18 2.07 11.96 1 14c2.73 3.89 7 7.5 11 7.5 2.13 0 4.25-.7 6.09-1.9l3.29 3.29 1.11-1.11L2.1 3.51zM12 18c-3.03 0-5.5-2.47-5.5-5.5 0-.72.14-1.41.39-2.04l1.52 1.52a3.5 3.5 0 004.62 4.62l1.51 1.51A5.49 5.49 0 0112 18zm6.3-2.3l-2.17-2.17a5.5 5.5 0 00-6.66-6.66L7.3 5.7A13.9 13.9 0 0112 4.5c5 0 9.27 3.61 11 7.5-1.03 2.3-2.61 4.27-4.7 5.7z",
  EYE_CLOSED:
    "M12 4.5C7 4.5 2.73 8.11 1 12c1.73 3.89 6 7.5 11 7.5s9.27-3.61 11-7.5c-1.73-3.89-6-7.5-11-7.5zm0 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9z",
};

/**
 * Object storing DOM element references.
 * @type {Object<string, HTMLElement>}
 */
const DOM = {};

/**
 * State variables for the options page.
 * @type {Object<string, boolean>}
 */
const state = {
  isTokenVisible: false,
};

/**
 * Shows an alert message with localization support.
 * @param {string} [messageKey] - Localization key for the message.
 */
const alertMessage = (messageKey) => {
  const message = browser.i18n.getMessage(
    messageKey || LocalizeKeys.NOTIFICATION.GENERIC_ERROR
  );
  if (!message)
    console.warn(`No localized message found for ID: ${messageKey}`);
  else alert(message);
};

/**
 * Logs an error to console and shows a user alert.
 * @param {string} messageKey - Localization key for the error message.
 * @param {Error} error - The error object.
 */
const handleError = (messageKey, error) => {
  const message = browser.i18n.getMessage(messageKey);
  console.error(message || "Error:", error);
  alert(`${message || "Error"}\n${error?.message || ""}`);
};

/**
 * Validates and normalizes a URL string.
 * If no protocol is given, defaults to https://
 * @param {string} url
 * @returns {string|false} Normalized URL if valid, false otherwise.
 */
const normalizeUrl = (url) => {
  const trimmed = url.trim();
  const pattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/;

  if (!pattern.test(trimmed)) return false;

  try {
    const parsed = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    if (["http:", "https:"].includes(parsed.protocol) && !!parsed.hostname) {
      return parsed.href.replace(/\/$/, ""); // normalized, no trailing slash
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Checks if a URL's origin is reachable by loading its favicon.
 * @param {string} url - The URL to check.
 * @returns {Promise<boolean>} Resolves true if reachable, false otherwise.
 */
const isUrlReachable = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = "";
      resolve(false);
    }, 3000);
    img.onload = img.onerror = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    try {
      const origin = new URL(url).origin;
      img.src = `${origin}/favicon.ico`;
    } catch {
      resolve(false);
    }
  });

/**
 * Shows or hides the token help link based on URL and token.
 * @param {string} gitlabUrl
 * @param {string} gitlabToken
 */
const showTokenHelpLink = (gitlabUrl, gitlabToken) => {
  const anchor = DOM.tokenHelpLink.querySelector("a");
  if (!anchor) return console.error("Token help link anchor missing.");
  if (gitlabUrl && !gitlabToken) {
    if (!gitlabUrl.endsWith("/")) gitlabUrl += "/";
    anchor.href = `${gitlabUrl}-/user_settings/personal_access_tokens`;
    DOM.tokenHelpLink.hidden = false;
    localizeHtmlPage();
  } else {
    DOM.tokenHelpLink.hidden = true;
  }
};

/**
 * Toggles GitLab token input visibility and updates the eye icon.
 */
const toggleTokenVisibility = () => {
  state.isTokenVisible = !state.isTokenVisible;
  DOM.tokenInput.type = state.isTokenVisible ? "text" : "password";
  DOM.eyeIcon.setAttribute(
    "d",
    state.isTokenVisible ? SVG_PATH.EYE_OPEN : SVG_PATH.EYE_CLOSED
  );
};

/**
 * Saves GitLab URL and token to local storage.
 */
const saveGitlabOptions = async () => {
  const token = DOM.tokenInput.value.trim();
  const normalizedUrl = normalizeUrl(DOM.urlInput.value);

  if (!normalizedUrl)
    return alertMessage(LocalizeKeys.OPTIONS.ERRORS.INVALID_URL);

  if (!(await isUrlReachable(normalizedUrl)))
    return alertMessage(LocalizeKeys.OPTIONS.ERRORS.UNREACHABLE_URL);

  if (!token) {
    showTokenHelpLink(normalizedUrl, token);
    return alertMessage(LocalizeKeys.OPTIONS.ALERTS.ADD_GITLAB_TOKEN);
  }

  try {
    setCache(CacheKeys.GITLAB_SETTINGS, { url: normalizedUrl, token });
    showTokenHelpLink(normalizedUrl, token);
    alertMessage(LocalizeKeys.OPTIONS.ALERTS.OPTIONS_SAVED);
    browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      url: normalizedUrl,
    });
    window.close();
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.OPTIONS_SAVED, error);
  }
};

/**
 * Clears all extension cache.
 */
const clearCache = async () => {
  try {
    clearAllCache();
    alertMessage(LocalizeKeys.OPTIONS.ALERTS.CACHE_CLEARED);
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.CACHE_CLEARED, error);
  }
};

/**
 * Clears specific cache key.
 * @param {string} key - Cache key.
 * @param {string} successMsg - Localization key for success alert.
 * @param {string} errorMsg - Localization key for error alert.
 */
const resetSpecificCache = async (key, successMsg, errorMsg) => {
  try {
    resetCache(key);
    alertMessage(successMsg);
  } catch (error) {
    handleError(errorMsg, error);
  }
};

/**
 * Saves disable cache setting to storage.
 * @param {boolean} isDisabled
 */
const saveDisableCacheSetting = async (isDisabled) => {
  if (isDisabled) {
    const message = browser.i18n.getMessage(
      LocalizeKeys.OPTIONS.ALERTS.DISABLE_CACHE
    );
    const confirmed = confirm(message);
    if (!confirmed) {
      DOM.cachingToggleBtn.checked = false;
      return;
    }
  }
  try {
    setCache(CacheKeys.USE_CACHE, !isDisabled);
    alertMessage(
      isDisabled
        ? LocalizeKeys.OPTIONS.ALERTS.CACHE_DISABLED
        : LocalizeKeys.OPTIONS.ALERTS.CACHE_ENABLED
    );
    browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      disableCache: isDisabled,
    });
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.CACHE_UPDATE, error);
  }
};

/**
 * Saves the assignee toggle setting.
 * @param {boolean} isChecked
 */
const saveAssigneeToggle = async (isChecked) => {
  try {
    setCache(CacheKeys.ASSIGNEES, isChecked);
    const msgKey = isChecked
      ? LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_ENABLED
      : LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_DISABLED;
    alertMessage(msgKey);
    browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      enableAssigneeLoading: isChecked,
    });
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.ASSIGNEES_SAVED, error);
  }
};

/**
 * Loads initial values from storage and updates the UI.
 */
const loadInitialSettings = async () => {
  try {
    localizeHtmlPage();
    const gitlabSettings = getCache(CacheKeys.GITLAB_SETTINGS, 24 * 60 * 60 * 1000); // 24h TTL
    DOM.tokenInput.value = gitlabSettings.token || "";
    DOM.urlInput.value = gitlabSettings.url || "";

    const useCache = getCache(CacheKeys.USE_CACHE, 24 * 60 * 60 * 1000); // 24h TTL
    DOM.cachingToggleBtn.checked = useCache === undefined ? true : useCache;

    const enableAssigneeLoading = getCache(CacheKeys.ASSIGNEES_LOADING, 24 * 60 * 60 * 1000); // 24h TTL
    DOM.assigneesToggleBtn.checked = enableAssigneeLoading || false;
    showTokenHelpLink(gitlabSettings.url, gitlabSettings.token);
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.OPTIONS_LOADED, error);
  }
};

/**
 * Attaches all event listeners to the DOM elements.
 */
const setupEventListeners = () => {
  DOM.toggleBtn.addEventListener("click", toggleTokenVisibility);
  DOM.saveButton.addEventListener("click", saveGitlabOptions);
  DOM.cacheClearButton.addEventListener("click", clearCache);
  DOM.clearProjectsButton.addEventListener("click", () =>
    resetSpecificCache(
      CacheKeys.PROJECTS,
      LocalizeKeys.OPTIONS.ALERTS.PROJECTS_CLEARED,
      LocalizeKeys.OPTIONS.ERRORS.PROJECTS_CLEARED
    )
  );
  DOM.clearAssigneesButton.addEventListener("click", () =>
    resetSpecificCache(
      CacheKeys.ASSIGNEES,
      LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_CLEARED,
      LocalizeKeys.OPTIONS.ERRORS.ASSIGNEES_CLEARED
    )
  );
  DOM.assigneesToggleBtn.addEventListener("change", (e) =>
    saveAssigneeToggle(e.target.checked)
  );
  DOM.cachingToggleBtn.addEventListener("change", (e) =>
    saveDisableCacheSetting(e.target.checked)
  );
};

/**
 * Initializes the options UI by mapping DOM elements, loading settings, and attaching listeners.
 */
const initSettingsUI = async () => {
  const map = [
    ["urlInput", "gitlabUrl"],
    ["tokenInput", "gitlabToken"],
    ["eyeIcon", "eyeIcon"],
    ["toggleBtn", "toggleVisibility"],
    ["saveButton", "save"],
    ["assigneesToggleBtn", "enableAssigneeLoading"],
    ["cachingToggleBtn", "disableCache"],
    ["cacheClearButton", "clearCacheBtn"],
    ["clearProjectsButton", "clearProjectsBtn"],
    ["clearAssigneesButton", "clearAssigneesBtn"],
    ["tokenHelpLink", "tokenHelpLink"],
  ];
  map.forEach(([key, id]) => (DOM[key] = document.getElementById(id)));
  await loadInitialSettings();
  setupEventListeners();
};

document.addEventListener("DOMContentLoaded", initSettingsUI);
