import { clearAllCache, resetCache, resetAddonCache } from "../../../utils/cache.js";
import { alertMessage, handleError } from "./alertHandler.js";

/**
 * Resets all addon-related cache entries.
 * This is used when the user wants to reset the addon to a clean state.
 * @param {string} successMsg - Localization key for success message.
 * @param {string} errorMsg - Localization key for error message.
 * @returns {void}
 */
export const resetAddon = async (successMsg, errorMsg) => {
  try {
    await resetAddonCache();
    alertMessage(successMsg || "OPTIONS.ALERTS.RESET_ADDON");
  } catch (error) {
    handleError(errorMsg || "OPTIONS.ERRORS.ADDON_RESET", error);
  }
};

/**
 * Clears all extension cache.
 */
export const clearCache = async () => {
  try {
    await clearAllCache();
    alertMessage("OPTIONS.ALERTS.CACHE_CLEARED");
  } catch (error) {
    handleError("OPTIONS.ERRORS.CACHE_CLEARED", error);
  }
};

/**
 * Clears a specific cache key.
 * @param {string} key
 * @param {string} successMsg
 * @param {string} errorMsg
 */
export const resetSpecificCache = async (key, successMsg, errorMsg) => {
  try {
    await resetCache(key);
    alertMessage(successMsg);
  } catch (error) {
    handleError(errorMsg, error);
  }
};
