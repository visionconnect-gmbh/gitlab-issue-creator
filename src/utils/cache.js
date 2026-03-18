/**
 * @fileoverview Browser storage abstraction for settings and API response caching.
 *
 * Two distinct layers are provided:
 *
 * **Settings** (persistent, no TTL)
 *   Stored directly under their key, e.g. `"gitlab_settings"`.
 *   Use `getSetting` / `setSetting` for credentials and user preferences.
 *
 * **Cache** (temporary, TTL-aware)
 *   Stored under a `cache_` prefix, e.g. `"cache_projects"`.
 *   Each entry is a `{ data, timestamp }` envelope so callers can request a
 *   maximum age via `ttlMs`.  When caching is disabled in settings, `setCache`
 *   is a no-op so the UI still works but nothing is persisted.
 *
 * All functions are async because `browser.storage.local` is async.
 */

import { CacheKeys } from "./Enums.js";

/** Prefix prepended to every cache key to separate cache from settings. */
const CACHE_PREFIX = "cache_";

// ---------------------------------------------------------------------------
// Settings (persistent, no TTL)
// ---------------------------------------------------------------------------

/**
 * Saves a persistent user setting to `browser.storage.local`.
 *
 * @param {string} key   - Storage key (use a value from `CacheKeys`).
 * @param {*}      value - Any JSON-serialisable value.
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
}

/**
 * Retrieves a persistent user setting from `browser.storage.local`.
 *
 * @param {string} key            - Storage key.
 * @param {*}      [fallback=null] - Returned when the key is absent.
 * @returns {Promise<*>}
 */
export async function getSetting(key, fallback = null) {
  const result = await browser.storage.local.get(key);
  return result[key] !== undefined ? result[key] : fallback;
}

// ---------------------------------------------------------------------------
// Cache (temporary, TTL-aware)
// ---------------------------------------------------------------------------

/**
 * Returns true when the user has disabled API response caching in settings.
 *
 * @returns {Promise<boolean>}
 */
async function isCachingDisabled() {
  // Use getSetting (not getCache) to avoid a circular dependency.
  return getSetting(CacheKeys.DISABLE_CACHE, false);
}

/**
 * Writes a value to the temporary cache.
 * When caching is disabled, this is a no-op (the value is simply not stored).
 *
 * @param {string} key  - Cache key (without the `cache_` prefix).
 * @param {*}      data - Any JSON-serialisable value.
 * @returns {Promise<void>}
 */
export async function setCache(key, data) {
  if (await isCachingDisabled()) return;

  const entry = { data, timestamp: Date.now() };
  await browser.storage.local.set({ [`${CACHE_PREFIX}${key}`]: entry });
}

/**
 * Reads a value from the temporary cache.
 *
 * @param {string}      key           - Cache key (without the `cache_` prefix).
 * @param {number|null} [ttlMs]       - Maximum acceptable age in milliseconds.
 *                                      Pass `null` or omit to skip freshness check.
 * @param {*}           [fallback=null] - Returned when the key is absent or stale.
 * @returns {Promise<*>} Cached data, or `fallback` when missing/stale.
 */
export async function getCache(key, ttlMs, fallback = null) {
  const raw = await browser.storage.local.get(`${CACHE_PREFIX}${key}`);
  const entry = raw[`${CACHE_PREFIX}${key}`];

  if (!entry) return fallback;

  if (ttlMs != null) {
    const isStale = Date.now() - entry.timestamp >= ttlMs;
    if (isStale) return fallback;
  }

  return entry.data;
}

/**
 * Appends new items to a cached array, deduplicating by `uniqueKey`.
 * If the cache is empty or expired, the new items become the entire cache entry.
 *
 * @param {string}   key                   - Cache key.
 * @param {object[]} newItems              - Items to merge in.
 * @param {string}   [uniqueKey="id"]      - Property used to detect duplicates.
 * @param {number}   [ttlMs=TTL_9H_MS]     - TTL used when reading the existing cache.
 * @returns {Promise<void>}
 */
export async function addToCacheArray(key, newItems, uniqueKey = "id", ttlMs = 9 * 60 * 60 * 1000) {
  const existing = await getCache(key, ttlMs);

  if (!Array.isArray(existing)) {
    await setCache(key, newItems);
    return;
  }

  const existingIds = new Set(existing.map((item) => item[uniqueKey]));
  const deduped = newItems.filter((item) => !existingIds.has(item[uniqueKey]));

  if (deduped.length > 0) {
    await setCache(key, [...existing, ...deduped]);
  }
}

// ---------------------------------------------------------------------------
// Cache management utilities
// ---------------------------------------------------------------------------

/**
 * Removes a single cache entry.
 *
 * @param {string} key - Cache key (without the `cache_` prefix).
 * @returns {Promise<void>}
 */
export async function resetCache(key) {
  await browser.storage.local.remove(`${CACHE_PREFIX}${key}`);
}

/**
 * Removes all cache entries (keys that start with `cache_`).
 * Settings stored without the prefix are unaffected.
 *
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
  const all = await browser.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (cacheKeys.length > 0) {
    await browser.storage.local.remove(cacheKeys);
  }
  console.warn("Cache cleared.");
}

/**
 * Returns the storage keys of all current cache entries.
 *
 * @returns {Promise<string[]>}
 */
export async function getCacheKeys() {
  const all = await browser.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
}

/**
 * Returns the raw cache object (all entries with their `{ data, timestamp }` envelopes).
 *
 * @returns {Promise<Record<string, { data: unknown, timestamp: number }>>}
 */
export async function getRawCache() {
  const all = await browser.storage.local.get(null);
  return Object.fromEntries(
    Object.entries(all).filter(([k]) => k.startsWith(CACHE_PREFIX))
  );
}

/**
 * Wipes **all** add-on data from storage, including settings.
 * Use only for a full factory reset.
 *
 * @returns {Promise<void>}
 */
export async function resetAddonCache() {
  await browser.storage.local.clear();
  console.warn("Add-on data and settings wiped.");
}
