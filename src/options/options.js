import { CacheKeys, LocalizeKeys, MessageTypes } from "../utils/Enums.js";
import { localizeHtmlPage } from "../utils/localize.js";
import { getSetting, setSetting } from "../utils/cache.js";
import { DOM } from "./logic/optionsState.js";
import { alertMessage, handleError } from "./logic/handler/alertHandler.js";
import {
  showTokenHelpLink,
  toggleTokenVisibility,
} from "./logic/handler/tokenHandler.js";
import {
  resetSpecificCache,
  clearCache,
  resetAddon,
} from "./logic/handler/cacheHandler.js";
import {
  saveAssigneeToggle,
  saveDisableCacheSetting,
  saveWatermarkToggle,
} from "./logic/handler/toggleHandler.js";
import { isUrlReachable, normalizeUrl } from "./logic/handler/urlHandler.js";
import { getGitLabSettings } from "../gitlab/gitlab.js";

document.addEventListener("DOMContentLoaded", async () => {
  const map = [
    ["urlInput", "gitlabUrl"],
    ["tokenInput", "gitlabToken"],
    ["eyeIcon", "eyeIcon"],
    ["toggleBtn", "toggleVisibility"],
    ["saveButton", "save"],
    ["assigneesToggleBtn", "enableAssigneeLoading"],
    ["watermarkToggleBtn", "enableWatermark"],
    ["cachingToggleBtn", "disableCache"],
    ["resetAddonBtn", "resetAddonBtn"],
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

    const gitlabSettings = await getGitLabSettings();
    DOM.tokenInput.value = gitlabSettings.token || "";
    DOM.urlInput.value = gitlabSettings.url || "";

    DOM.cachingToggleBtn.checked = await getSetting(
      CacheKeys.DISABLE_CACHE,
      false,
    );
    DOM.assigneesToggleBtn.checked = await getSetting(
      CacheKeys.ASSIGNEES_LOADING,
      true,
    );
    DOM.watermarkToggleBtn.checked = await getSetting(
      CacheKeys.ENABLE_WATERMARK,
      true,
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

  DOM.resetAddonBtn.addEventListener("click", async () => {
    const message = browser.i18n.getMessage(
      LocalizeKeys.OPTIONS.ALERTS.RESET_ADDON,
    );
    if (confirm(message)) {
      await resetAddon(
        LocalizeKeys.OPTIONS.ALERTS.RESET_ADDON,
        LocalizeKeys.OPTIONS.ERRORS.RESET_ADDON,
      );
    }
  });

  DOM.cacheClearButton.addEventListener("click", async () => {
    if (
      confirm(browser.i18n.getMessage(LocalizeKeys.OPTIONS.ALERTS.CLEAR_CACHE))
    ) {
      await clearCache();
    }
  });

  DOM.clearProjectsButton.addEventListener("click", async () =>
    resetSpecificCache(
      CacheKeys.PROJECTS,
      LocalizeKeys.OPTIONS.ALERTS.PROJECTS_CLEARED,
      LocalizeKeys.OPTIONS.ERRORS.PROJECTS_CLEARED,
    ),
  );

  DOM.clearAssigneesButton.addEventListener("click", async () =>
    resetSpecificCache(
      CacheKeys.ASSIGNEES,
      LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_CLEARED,
      LocalizeKeys.OPTIONS.ERRORS.ASSIGNEES_CLEARED,
    ),
  );

  DOM.assigneesToggleBtn.addEventListener("change", async (e) =>
    saveAssigneeToggle(e.target.checked),
  );

  DOM.watermarkToggleBtn.addEventListener("change", async (e) =>
    saveWatermarkToggle(e.target.checked),
  );

  DOM.cachingToggleBtn.addEventListener("change", async (e) =>
    saveDisableCacheSetting(e.target.checked, DOM),
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sends a SETTINGS_UPDATED message to the background script.
 *
 * Silently absorbs the "Receiving end does not exist" rejection that occurs
 * when the background script has no active listener (e.g. the popup is closed
 * or the extension is idle). Any other error is re-thrown.
 *
 * @param {object} [payload={}] - Extra fields merged into the message object.
 * @returns {Promise<void>}
 */
async function notifyBackground(payload = {}) {
  try {
    await browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      ...payload,
    });
  } catch (err) {
    if (!/Receiving end does not exist/i.test(err?.message ?? "")) {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Save handler
// ---------------------------------------------------------------------------

/**
 * Validates and saves the GitLab URL + token, notifies the background script,
 * then closes the options tab.
 *
 * The background notification is awaited before calling window.close().
 * Closing the window first destroys the extension context while the message's
 * Promise is still in flight, which produces:
 *   "Actor 'Conduits' destroyed before query 'RuntimeMessage' was resolved"
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
    await setSetting(CacheKeys.GITLAB_SETTINGS, { url: normalizedUrl, token });
    showTokenHelpLink(normalizedUrl, token);
    alertMessage(LocalizeKeys.OPTIONS.ALERTS.OPTIONS_SAVED);
    await notifyBackground({ url: normalizedUrl });
    window.close();
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.OPTIONS_SAVED, error);
  }
};
