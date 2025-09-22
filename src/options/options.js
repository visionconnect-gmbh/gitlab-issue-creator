import { CacheKeys, LocalizeKeys, MessageTypes } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
import { getCache, setCache } from "../utils/cache.js";
import { DOM } from "./logic/optionsState.js";
import { alertMessage, handleError } from "./logic/handler/alertHandler.js";
import {
  showTokenHelpLink,
  toggleTokenVisibility,
} from "./logic/handler/tokenHandler.js";
import {
  resetSpecificCache,
  clearCache,
} from "./logic/handler/cacheHandler.js";
import {
  saveAssigneeToggle,
  saveDisableCacheSetting,
  saveWatermarkToggle,
} from "./logic/handler/toggleHandler.js";
import { isUrlReachable, normalizeUrl } from "./logic/handler/urlHandler.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Map DOM elements
  const map = [
    ["urlInput", "gitlabUrl"],
    ["tokenInput", "gitlabToken"],
    ["eyeIcon", "eyeIcon"],
    ["toggleBtn", "toggleVisibility"],
    ["saveButton", "save"],
    ["assigneesToggleBtn", "enableAssigneeLoading"],
    ["watermarkToggleBtn", "enableWatermark"],
    ["cachingToggleBtn", "disableCache"],
    ["cacheClearButton", "clearCacheBtn"],
    ["clearProjectsButton", "clearProjectsBtn"],
    ["clearAssigneesButton", "clearAssigneesBtn"],
    ["tokenHelpLink", "tokenHelpLink"],
  ];
  map.forEach(([key, id]) => (DOM[key] = document.getElementById(id)));

  await loadInitialSettings();
  setupEventListeners();
});

/**
 * Loads initial values from storage and updates the UI.
 */
export const loadInitialSettings = async () => {
  try {
    localizeHtmlPage();

    const gitlabSettings = await getCache(
      CacheKeys.GITLAB_SETTINGS,
      undefined,
      {}
    );
    DOM.tokenInput.value = gitlabSettings.token || "";
    DOM.urlInput.value = gitlabSettings.url || "";

    DOM.cachingToggleBtn.checked = await getCache(
      CacheKeys.DISABLE_CACHE,
      undefined,
      false
    );
    DOM.assigneesToggleBtn.checked = await getCache(
      CacheKeys.ASSIGNEES_LOADING,
      undefined,
      false
    );
    DOM.watermarkToggleBtn.checked = await getCache(
      CacheKeys.ENABLE_WATERMARK,
      undefined,
      true
    );

    showTokenHelpLink(gitlabSettings.url, gitlabSettings.token);
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.OPTIONS_LOADED, error);
  }
};

/**
 * Attaches all event listeners to the DOM elements.
 */
export const setupEventListeners = () => {
  DOM.toggleBtn.addEventListener("click", toggleTokenVisibility);
  DOM.saveButton.addEventListener("click", saveGitlabOptions);

  DOM.cacheClearButton.addEventListener("click", clearCache);

  DOM.clearProjectsButton.addEventListener(
    "click",
    async () =>
      await resetSpecificCache(
        CacheKeys.PROJECTS,
        LocalizeKeys.OPTIONS.ALERTS.PROJECTS_CLEARED,
        LocalizeKeys.OPTIONS.ERRORS.PROJECTS_CLEARED
      )
  );

  DOM.clearAssigneesButton.addEventListener(
    "click",
    async () =>
      await resetSpecificCache(
        CacheKeys.ASSIGNEES,
        LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_CLEARED,
        LocalizeKeys.OPTIONS.ERRORS.ASSIGNEES_CLEARED
      )
  );

  DOM.assigneesToggleBtn.addEventListener(
    "change",
    async (e) => await saveAssigneeToggle(e.target.checked)
  );

  DOM.watermarkToggleBtn.addEventListener(
    "change",
    async (e) => await saveWatermarkToggle(e.target.checked)
  );

  DOM.cachingToggleBtn.addEventListener(
    "change",
    async (e) => await saveDisableCacheSetting(e.target.checked, DOM)
  );
};

/** * Saves GitLab URL and token to local storage. */
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
    await setCache(CacheKeys.GITLAB_SETTINGS, { url: normalizedUrl, token });
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
