/**
 * @fileoverview Low-level GitLab HTTP client.
 *
 * Provides thin wrappers around `fetch` that:
 *  - resolve the base URL from stored settings on the first call,
 *  - handle 401 Unauthorized by showing a notification and redirecting to Options,
 *  - parse successful JSON responses and surface error bodies as thrown Errors.
 *
 * All public functions throw on non-OK responses so callers can use try/catch.
 */

import { getSetting } from "../utils/cache.js";
import { LocalizeKeys, CacheKeys } from "../utils/Enums.js";
import {
  closePopup,
  displayLocalizedNotification,
  openOptionsPage,
} from "../utils/utils.js";

// ---------------------------------------------------------------------------
// Module-level base URL (resolved once and reused across calls)
// ---------------------------------------------------------------------------

/** @type {string|null} */
let _apiBaseUrl = null;

/**
 * Resets the cached base URL so the next request re-reads it from storage.
 * Useful in tests or when the user changes the GitLab URL in settings.
 */
export function invalidateBaseUrl() {
  _apiBaseUrl = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the GitLab base URL from storage (cached in module scope).
 * Opens the Options page and closes the popup if no URL is configured.
 *
 * @returns {Promise<string|null>} The base URL, or null when unconfigured.
 */
async function resolveBaseUrl() {
  if (_apiBaseUrl) return _apiBaseUrl;

  const settings = await getSetting(CacheKeys.GITLAB_SETTINGS, {});
  _apiBaseUrl = settings.url || null;

  if (!_apiBaseUrl) {
    displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.GITLAB_URL_NOT_CONFIGURED,
    );
    openOptionsPage();
    closePopup();
  }

  return _apiBaseUrl;
}

/**
 * Parses a fetch Response as JSON.
 * Returns null for a null/undefined response (e.g. early-return from doRequest).
 *
 * @param {Response|null} response
 * @returns {Promise<unknown|null>}
 */
async function parseJson(response) {
  if (!response) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Performs a raw HTTP request to the GitLab API.
 *
 * Handles common error cases:
 * - 401 → shows invalid-token notification, opens Options, closes popup.
 * - Other non-OK → throws with the response body as the error message.
 *
 * @param {string}  endpoint        - Path relative to the GitLab base URL (e.g. `/api/v4/user`).
 * @param {RequestInit} [options]   - Standard `fetch` options (method, body, headers, ...).
 * @param {boolean} [addContentType=true] - When true, injects `Content-Type: application/json`.
 *                                          Set to false for multipart/form-data uploads.
 * @returns {Promise<Response|undefined>} The raw Response, or undefined if the base URL is not set.
 */
export async function doRequest(endpoint, options = {}, addContentType = true) {
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) return;

  const headers = {
    ...(addContentType ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      displayLocalizedNotification(
        LocalizeKeys.NOTIFICATION.INVALID_GITLAB_TOKEN,
      );
      openOptionsPage();
      closePopup();
      return;
    }
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  return response;
}

/**
 * Performs a GET request and parses the JSON response.
 *
 * @param {string}      endpoint  - GitLab API path.
 * @param {RequestInit} [options] - Additional fetch options (e.g. custom headers).
 * @returns {Promise<unknown>} Parsed JSON body.
 */
export async function apiGet(endpoint, options = {}) {
  const response = await doRequest(endpoint, { method: "GET", ...options });
  return parseJson(response);
}

/**
 * Performs a POST request with a JSON body and parses the response.
 *
 * @param {string}      endpoint  - GitLab API path.
 * @param {object}      data      - Request payload (will be JSON-serialised).
 * @param {RequestInit} [options] - Additional fetch options.
 * @returns {Promise<unknown>} Parsed JSON body.
 */
export async function apiPost(endpoint, data, options = {}) {
  const response = await doRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });
  return parseJson(response);
}

/**
 * Performs a PUT request with a JSON body and parses the response.
 *
 * @param {string}      endpoint  - GitLab API path.
 * @param {object}      data      - Request payload (will be JSON-serialised).
 * @param {RequestInit} [options] - Additional fetch options.
 * @returns {Promise<unknown>} Parsed JSON body.
 */
export async function apiPut(endpoint, data, options = {}) {
  const response = await doRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
    ...options,
  });
  return parseJson(response);
}

/**
 * Performs a DELETE request and parses the (potentially empty) JSON response.
 *
 * @param {string}      endpoint  - GitLab API path.
 * @param {RequestInit} [options] - Additional fetch options.
 * @returns {Promise<unknown>} Parsed JSON body.
 */
export async function apiDelete(endpoint, options = {}) {
  const response = await doRequest(endpoint, { method: "DELETE", ...options });
  return parseJson(response);
}
