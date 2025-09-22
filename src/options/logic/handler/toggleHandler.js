import { setCache } from "../../../utils/cache.js";
import { CacheKeys, LocalizeKeys, MessageTypes } from "../../../utils/Enums.js";
import { alertMessage, handleError } from "./alertHandler.js";

/**
 * Saves assignee toggle.
 */
export const saveAssigneeToggle = async (isChecked) => {
  try {
    await setCache(CacheKeys.ASSIGNEES_LOADING, isChecked);
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
 * Saves watermark toggle.
 */
export const saveWatermarkToggle = async (isChecked) => {
  try {
    await setCache(CacheKeys.ENABLE_WATERMARK, isChecked);
    const msgKey = isChecked
      ? LocalizeKeys.OPTIONS.ALERTS.WATERMARK_ENABLED
      : LocalizeKeys.OPTIONS.ALERTS.WATERMARK_DISABLED;
    alertMessage(msgKey);
    browser.runtime.sendMessage({
      type: MessageTypes.SETTINGS_UPDATED,
      enableWatermark: isChecked,
    });
  } catch (error) {
    handleError(LocalizeKeys.NOTIFICATION.GENERIC_ERROR, error);
  }
};

/**
 * Saves disable cache toggle.
 */
export const saveDisableCacheSetting = async (isDisabled, domElements) => {
  if (isDisabled) {
    const message = browser.i18n.getMessage(
      LocalizeKeys.OPTIONS.ALERTS.DISABLE_CACHE
    );
    const confirmed = confirm(message);
    if (!confirmed) {
      domElements.cachingToggleBtn.checked = false;
      return;
    }
  }
  try {
    await setCache(CacheKeys.DISABLE_CACHE, isDisabled);
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
