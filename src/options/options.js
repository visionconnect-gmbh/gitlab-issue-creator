import { MessageTypes, CacheKeys } from "../Enums.js";
import { clearAllCache, resetCache } from "../utils/cache.js";

const SVG_PATH = {
  EYE_OPEN:
    "M2.1 3.51L1 4.62l4.02 4.02C3.43 10.18 2.07 11.96 1 14c2.73 3.89 7 7.5 11 7.5 2.13 0 4.25-.7 6.09-1.9l3.29 3.29 1.11-1.11L2.1 3.51zM12 18c-3.03 0-5.5-2.47-5.5-5.5 0-.72.14-1.41.39-2.04l1.52 1.52a3.5 3.5 0 004.62 4.62l1.51 1.51A5.49 5.49 0 0112 18zm6.3-2.3l-2.17-2.17a5.5 5.5 0 00-6.66-6.66L7.3 5.7A13.9 13.9 0 0112 4.5c5 0 9.27 3.61 11 7.5-1.03 2.3-2.61 4.27-4.7 5.7z",
  EYE_CLOSED:
    "M12 4.5C7 4.5 2.73 8.11 1 12c1.73 3.89 6 7.5 11 7.5s9.27-3.61 11-7.5c-1.73-3.89-6-7.5-11-7.5zm0 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9z",
};

const DOM = {}; // Object to hold references to DOM elements

// --- State Variables ---
let isTokenVisible = false;

/**
 * Displays an alert message to the user.
 * @param {string} message - The message to display.
 */
function showAlert(messageKey) {
  const message = browser.i18n.getMessage(messageKey);
  if (!message) {
    console.warn(`No localized message found for ID: ${messageKey}`);
    return;
  }
  alert(message);
}

/**
 * Handles errors gracefully, logging to console and alerting the user.
 * @param {string} contextMessage - A message describing where the error occurred.
 * @param {Error} error - The error object.
 */
function handleError(messageKey, error) {
  const message = browser.i18n.getMessage(messageKey);
  if (!message) {
    console.warn(`No localized message found for ID: ${messageKey}`);
    return;
  }
  console.error(`${message}:`, error);
  alert(`${message}\n${error.message}`);
}

/**
 * Validates a given URL string.
 * @param {string} url - The URL string to validate.
 * @returns {boolean} True if the URL is valid, false otherwise.
 */
function isValidUrl(url) {
  const trimmedUrl = url.trim();

  // Regex: (optional protocol) (hostname with at least one dot) (optional port) (optional path)
  // The hostname regex `([\w-]+(\.[\w-]+)+)` ensures at least two parts separated by a dot.
  const urlPattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/;

  if (!urlPattern.test(trimmedUrl)) {
    return false;
  }

  let urlToParse = trimmedUrl;
  // Prepend a default protocol if missing to ensure proper URL object parsing.
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    urlToParse = `https://${trimmedUrl}`;
  }

  try {
    const urlObj = new URL(urlToParse);

    // Ensure the protocol is explicitly http or https
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return false;
    }

    // Ensure a hostname exists
    if (!urlObj.hostname) {
      return false;
    }

    return true;
  } catch (error) {
    // The URL constructor throws an error for malformed URLs
    console.error("URL parsing error:", error);
    return false;
  }
}

function showTokenHelpLink(gitlabUrl, gitlabToken) {
  if (gitlabUrl && !gitlabToken) {
    // show the token help link if a URL is set

    // Access anchoer element and set its href attribute
    const anchor = DOM.tokenHelpLink.querySelector("a");
    if (!anchor) {
      console.error("Token help link anchor element not found.");
      return;
    }
    if (!gitlabUrl.endsWith("/")) {
      gitlabUrl += "/";
    }
    anchor.href = `${gitlabUrl}-/user_settings/personal_access_tokens`;
    DOM.tokenHelpLink.hidden = false;
  } else {
    // hide the token help link if no URL is set
    DOM.tokenHelpLink.hidden = true;
  }
}

/**
 * Toggles the visibility of the GitLab token input field.
 */
function toggleTokenVisibility() {
  isTokenVisible = !isTokenVisible;
  DOM.tokenInput.type = isTokenVisible ? "text" : "password";
  DOM.eyeIcon.setAttribute(
    "d",
    isTokenVisible ? SVG_PATH.EYE_OPEN : SVG_PATH.EYE_CLOSED
  );
}

/**
 * Saves the GitLab token and URL to local storage.
 * @param {Object} data - An object containing 'token' and 'url'.
 */
async function saveOptions(data) {
  const trimmedToken = data.token.trim();
  const trimmedUrl = data.url.trim();

  if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
    showAlert("OptionsAlertAddGitLabUrl");
    return;
  }

  if (!trimmedToken) {
    showAlert("OptionsAlertAddGitLabToken");
    showTokenHelpLink(trimmedUrl, trimmedToken);
    return;
  }

  try {
    await browser.storage.local.set({
      gitlabToken: trimmedToken,
      gitlabUrl: trimmedUrl,
    });
    showTokenHelpLink(trimmedUrl, trimmedToken);
    showAlert("OptionsAlertOptionsSaved");
    // Notify background script or other parts of the extension about the update
    browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      url: trimmedUrl,
    });
    window.close(); // Close the options page
  } catch (error) {
    handleError("OptionsErrorOptionsSaved", error);
  }
}

/**
 * Clears the extension's cache by sending a message to the background script.
 */
async function clearCache() {
  try {
    clearAllCache();
    showAlert("OptionsAlertCacheCleared");
  } catch (error) {
    handleError("OptionsErrorCacheCleared", error);
  }
}

/**
 * Fetches initial settings from browser storage and populates the UI.
 */
async function loadInitialSettings() {
  try {
    const { gitlabToken } = await browser.storage.local.get("gitlabToken");
    DOM.tokenInput.value = gitlabToken || "";

    const { gitlabUrl } = await browser.storage.local.get("gitlabUrl");
    DOM.urlInput.value = gitlabUrl || "";

    const { enableAssigneeLoading } = await browser.storage.local.get(
      "enableAssigneeLoading"
    );
    DOM.assigneesToggleBtn.checked = enableAssigneeLoading || false;

    showTokenHelpLink(gitlabUrl, gitlabToken);
  } catch (error) {
    handleError("OptionsErrorOptionsLoaded", error);
  }
}

/**
 * Binds event listeners to UI elements.
 */
function setupEventListeners() {
  DOM.toggleBtn.addEventListener("click", toggleTokenVisibility);
  DOM.saveButton.addEventListener("click", () =>
    saveOptions({ token: DOM.tokenInput.value, url: DOM.urlInput.value })
  );
  DOM.cacheClearButton.addEventListener("click", clearCache);
  DOM.clearProjectsButton.addEventListener("click", async () => {
    try {
      resetCache(CacheKeys.PROJECTS); // Clear the projects cache
      showAlert("OptionsAlertProjectsCleared");
    } catch (error) {
      handleError("OptionsErrorProjectsCleared", error);
    }
  });
  DOM.clearAssigneesButton.addEventListener("click", async () => {
    try {
      resetCache(CacheKeys.ASSIGNEES); // Clear the assignees cache

      showAlert("OptionsAlertAssigneesCleared");
    } catch (error) {
      handleError("OptionsErrorAssigneesCleared", error);
    }
  });

  DOM.assigneesToggleBtn.addEventListener("change", async (event) => {
    const isChecked = event.target.checked;
    try {
      await browser.storage.local.set({
        enableAssigneeLoading: isChecked,
      });

      // Show alert based on the language and state;
      const messageKey = isChecked
        ? "OptionsAlertAssigneesEnabled"
        : "OptionsAlertAssigneesDisabled";

      showAlert(messageKey);

      // Notify background script or other parts of the extension about the update
      browser.runtime.sendMessage({
        type: MessageTypes.SETTINGS_UPDATED,
        enableAssigneeLoading: isChecked,
      });
    } catch (error) {
      handleError("OptionsErrorAssigneesSaved", error);
    }
  });
}

/**
 * Initializes the settings user interface.
 * - Gets references to DOM elements.
 * - Loads existing settings.
 * - Sets up event listeners.
 */
async function initSettingsUI() {
  // Get DOM references once
  DOM.urlInput = document.getElementById("gitlabUrl");
  DOM.tokenInput = document.getElementById("gitlabToken");
  DOM.eyeIcon = document.getElementById("eyeIcon");
  DOM.toggleBtn = document.getElementById("toggleVisibility");
  DOM.saveButton = document.getElementById("save");

  DOM.assigneesToggleBtn = document.getElementById("enableAssigneeLoading"); // Checkbox to enable/disable assignee loading

  // Cache clear buttons
  DOM.cacheClearButton = document.getElementById("clearCacheBtn");
  DOM.clearProjectsButton = document.getElementById("clearProjectsBtn");
  DOM.clearAssigneesButton = document.getElementById("clearAssigneesBtn");

  DOM.tokenHelpLink = document.getElementById("tokenHelpLink");

  await loadInitialSettings();
  setupEventListeners();
}

// Ensure the DOM is fully loaded before initializing the UI
document.addEventListener("DOMContentLoaded", initSettingsUI);
