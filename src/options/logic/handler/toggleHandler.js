/**
 * @fileoverview Options page toggle handlers.
 *
 * Each handler saves its setting to storage, shows a confirmation alert,
 * then notifies the background script so it can react without a page reload.
 *
 * `notifyBackground` absorbs the "Receiving end does not exist" rejection that
 * fires when no background listener is active — this is expected whenever the
 * popup is closed or the background script is idle.
 */

import { setSetting } from "../../../utils/cache.js";
import { CacheKeys, LocalizeKeys, MessageTypes } from "../../../utils/Enums.js";
import { alertMessage, handleError } from "./alertHandler.js";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Sends a SETTINGS_UPDATED message to the background script and silently
 * swallows the "Receiving end does not exist" rejection.  Any other error
 * propagates to the caller.
 *
 * @param {object} [payload={}]
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
// Exported handlers
// ---------------------------------------------------------------------------

/**
 * Persists the assignee-loading toggle and notifies the background script.
 *
 * @param {boolean} isChecked
 */
export const saveAssigneeToggle = async (isChecked) => {
  try {
    await setSetting(CacheKeys.ASSIGNEES_LOADING, isChecked);
    alertMessage(
      isChecked
        ? LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_ENABLED
        : LocalizeKeys.OPTIONS.ALERTS.ASSIGNEES_DISABLED,
    );
    await notifyBackground({ enableAssigneeLoading: isChecked });
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.ASSIGNEES_SAVED, error);
  }
};

/**
 * Persists the watermark toggle and notifies the background script.
 *
 * @param {boolean} isChecked
 */
export const saveWatermarkToggle = async (isChecked) => {
  try {
    await setSetting(CacheKeys.ENABLE_WATERMARK, isChecked);
    alertMessage(
      isChecked
        ? LocalizeKeys.OPTIONS.ALERTS.WATERMARK_ENABLED
        : LocalizeKeys.OPTIONS.ALERTS.WATERMARK_DISABLED,
    );
    await notifyBackground({ enableWatermark: isChecked });
  } catch (error) {
    handleError(LocalizeKeys.NOTIFICATION.GENERIC_ERROR, error);
  }
};

/**
 * Persists the disable-cache setting and notifies the background script.
 * Prompts for confirmation before disabling, and reverts the checkbox if the
 * user cancels.
 *
 * @param {boolean} isDisabled
 * @param {{ cachingToggleBtn: HTMLInputElement }} domElements
 */
export const saveDisableCacheSetting = async (isDisabled, domElements) => {
  if (isDisabled) {
    const message = browser.i18n.getMessage(
      LocalizeKeys.OPTIONS.ALERTS.DISABLE_CACHE,
    );
    if (!confirm(message)) {
      domElements.cachingToggleBtn.checked = false;
      return;
    }
  }
  try {
    await setSetting(CacheKeys.DISABLE_CACHE, isDisabled);
    alertMessage(
      isDisabled
        ? LocalizeKeys.OPTIONS.ALERTS.CACHE_DISABLED
        : LocalizeKeys.OPTIONS.ALERTS.CACHE_ENABLED,
    );
    await notifyBackground({ disableCache: isDisabled });
  } catch (error) {
    handleError(LocalizeKeys.OPTIONS.ERRORS.CACHE_UPDATE, error);
  }
};
