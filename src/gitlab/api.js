/**
 * @fileoverview Low-level GitLab HTTP client.
 *
 * Provides thin wrappers around `fetch` that:
 *  - resolve the base URL from stored settings on the first call,
 *  - apply a request timeout independent of any caller-supplied AbortSignal,
 *  - retry transient failures (429/5xx/network) with backoff, honouring
 *    `Retry-After` and the caller's AbortSignal,
 *  - deduplicate concurrent identical GETs into a single network request,
 *  - handle 401 Unauthorized by notifying and opening Options (without
 *    closing the popup, so in-progress work is never discarded),
 *  - parse successful JSON responses and surface error bodies as thrown
 *    Errors.
 *
 * All public functions throw on non-OK responses (except a 304 passed
 * through to `apiGetPage`) so callers can use try/catch.
 */

import { getSetting } from "../utils/cache.js";
import { LocalizeKeys, CacheKeys } from "../utils/Enums.js";
import {
  closePopup,
  displayLocalizedNotification,
  openOptionsPage,
} from "../utils/utils.js";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 10_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Typed errors: lets callers branch on `error.name` without string matching.
// ---------------------------------------------------------------------------

/** Thrown when GitLab responds 401. The caller's popup/draft is left intact;
 * the notification + Options redirect already happened here. */
export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Module-level base URL (resolved once and reused across calls)
// ---------------------------------------------------------------------------

/** @type {string|null} */
let _apiBaseUrl = null;

/**
 * Resets the cached base URL so the next request re-reads it from storage.
 * Call this whenever the user changes the GitLab URL in settings.
 */
export function invalidateBaseUrl() {
  _apiBaseUrl = null;
}

// ---------------------------------------------------------------------------
// In-flight GET deduplication
// ---------------------------------------------------------------------------

/** @type {Map<string, Promise<unknown>>} */
const inflightGET = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the GitLab base URL from storage (cached in module scope).
 * Opens the Options page and closes the popup if no URL is configured:
 * unlike a 401, there's nothing the popup can usefully do without a URL.
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

/**
 * Parses a `Retry-After` header value (seconds, or an HTTP date) into a
 * millisecond delay. Returns null when absent or unparsable.
 *
 * @param {string|null} header
 * @returns {number|null}
 */
function parseRetryAfterMs(header) {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return null;
}

/**
 * Exponential backoff with jitter, capped at RETRY_CEILING_MS.
 * @param {number} attempt - 0-indexed retry attempt.
 */
function computeBackoffMs(attempt) {
  const base = RETRY_BASE_MS * 2 ** attempt;
  const jitter = Math.random() * base * 0.3;
  return Math.min(base + jitter, RETRY_CEILING_MS);
}

/**
 * Abortable sleep: resolves after `ms`, or rejects immediately/early if
 * `signal` is or becomes aborted.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `fetch` with a timeout that is distinct from the caller's own
 * AbortSignal: a caller cancellation rejects as `AbortError`, while our own
 * timeout rejects as `TimeoutError`, so retry logic and error reporting can
 * tell them apart.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @param {AbortSignal} [callerSignal]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs, callerSignal) {
  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  const forwardAbort = () => ctrl.abort(callerSignal.reason);
  callerSignal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Performs a raw HTTP request to the GitLab API, with timeout + retry.
 *
 * Handles common error cases:
 * - 401 → notifies, opens Options, throws `AuthError` (popup/draft untouched).
 * - 429/5xx/network failure → retried up to MAX_RETRIES times with backoff,
 *   honouring `Retry-After` when present.
 * - A 304 response is returned as-is (not treated as an error) so
 *   `apiGetPage` can surface `notModified`.
 * - Other non-OK → throws with the response body as the error message.
 *
 * @param {string}      endpoint              - Path relative to the GitLab base URL.
 * @param {RequestInit & { timeoutMs?: number, retry?: boolean }} [options]
 * @param {boolean}     [addContentType=true] - Injects `Content-Type: application/json`.
 *                                               Set false for multipart/form-data uploads.
 * @returns {Promise<Response|undefined>} The raw Response, or undefined if the base URL is not set.
 */
export async function doRequest(endpoint, options = {}, addContentType = true) {
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) return;

  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry = true,
    headers: optionHeaders,
    ...fetchOptions
  } = options;

  const headers = {
    ...(addContentType ? { "Content-Type": "application/json" } : {}),
    ...(optionHeaders ?? {}),
  };

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let response;

    try {
      response = await fetchWithTimeout(
        `${baseUrl}${endpoint}`,
        { ...fetchOptions, headers },
        timeoutMs,
        signal,
      );
    } catch (err) {
      if (err?.name === "AbortError") throw err; // caller cancellation, never retried, never mislabeled

      const isTimeout = err?.name === "TimeoutError";
      const canRetry = retry && attempt < MAX_RETRIES;

      if (!canRetry) {
        if (isTimeout) {
          const timeoutErr = new Error("GitLab request timed out");
          timeoutErr.name = "TimeoutError";
          throw timeoutErr;
        }
        throw err;
      }

      await sleep(computeBackoffMs(attempt), signal);
      attempt++;
      continue;
    }

    if (response.status === 304 || response.ok) return response;

    if (response.status === 401) {
      displayLocalizedNotification(LocalizeKeys.NOTIFICATION.INVALID_GITLAB_TOKEN);
      openOptionsPage();
      throw new AuthError();
    }

    const canRetryStatus =
      retry && RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES;

    if (canRetryStatus) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      await sleep(retryAfterMs ?? computeBackoffMs(attempt), signal);
      attempt++;
      continue;
    }

    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }
}

/**
 * Performs a GET request and parses the JSON response.
 * Concurrent identical GETs (same endpoint + headers) are deduplicated into
 * a single network request; every caller gets the same resolved value.
 *
 * @param {string}      endpoint  - GitLab API path.
 * @param {RequestInit} [options] - Additional fetch options (e.g. custom headers).
 * @returns {Promise<unknown>} Parsed JSON body.
 */
export async function apiGet(endpoint, options = {}) {
  const dedupeKey = `${endpoint}|${JSON.stringify(options.headers ?? {})}`;

  const existing = inflightGET.get(dedupeKey);
  if (existing) return existing;

  const promise = (async () => {
    const response = await doRequest(endpoint, { ...options, method: "GET" });
    return parseJson(response);
  })();

  inflightGET.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inflightGET.delete(dedupeKey);
  }
}

/**
 * Performs a GET request against a paginated/conditional GitLab endpoint and
 * surfaces the headers callers need for cache-first + revalidate flows:
 * `ETag` (for `If-None-Match` on the next call), `X-Next-Page`/`X-Total`
 * (for pagination). A `304` is reported as `notModified: true` rather than
 * thrown as an error.
 *
 * Not deduplicated against plain `apiGet` calls: callers that need
 * revalidation should go through this consistently for a given endpoint.
 *
 * @param {string} endpoint
 * @param {RequestInit & { etag?: string }} [options] - Pass a previously
 *   seen `etag` to send `If-None-Match`.
 * @returns {Promise<{ data: unknown, etag: string|null, notModified: boolean, nextPage: number|null, total: number|null }>}
 */
export async function apiGetPage(endpoint, options = {}) {
  const { etag, headers: optionHeaders, ...rest } = options;
  const headers = { ...(optionHeaders ?? {}) };
  if (etag) headers["If-None-Match"] = etag;

  const response = await doRequest(endpoint, { ...rest, method: "GET", headers });

  if (!response) {
    return { data: null, etag: null, notModified: false, nextPage: null, total: null };
  }

  if (response.status === 304) {
    return { data: null, etag, notModified: true, nextPage: null, total: null };
  }

  const data = await parseJson(response);
  const nextPageHeader = response.headers.get("x-next-page");
  const totalHeader = response.headers.get("x-total");

  return {
    data,
    etag: response.headers.get("etag"),
    notModified: false,
    nextPage: nextPageHeader ? Number(nextPageHeader) : null,
    total: totalHeader ? Number(totalHeader) : null,
  };
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
    ...options,
    method: "POST",
    body: JSON.stringify(data),
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
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });
  return parseJson(response);
}
