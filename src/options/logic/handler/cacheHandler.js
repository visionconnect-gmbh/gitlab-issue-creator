import { clearAllCache, resetCache } from "../../../utils/cache.js";
import { alertMessage, handleError } from "./alertHandler.js";

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
