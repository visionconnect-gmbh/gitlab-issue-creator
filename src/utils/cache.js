import { CacheKeys } from "./Enums";

const cachePrefix = "cache_";

/** Checks if caching is disabled in the settings.
 * @returns {Promise<boolean>} True if caching is disabled in settings, false otherwise
 */
async function isCachingDisabled() {
  return await browser.storage.local.get(CacheKeys.DISABLE_CACHE).then((res) => res.disableCaching || false);
}

/** Checks if the given key is for Gitlab Settings.
 * Gitlab Settings should always be cached, even if caching is disabled.
 * @param {string} key The cache key to check.
 * @returns {boolean} True if the key is for Gitlab Settings, false otherwise.
 */
function isGitlabSettingsCacheKey(key) {
  return key === `${CacheKeys.GITLAB_SETTINGS}`;
}

/** Sets a cache entry.
 * @param {string} key The cache key.
 * @param {*} data The data to cache.
 * @returns {Promise<void>}
 */
export async function setCache(key, data) {
  if (await isCachingDisabled() && !isGitlabSettingsCacheKey(key)) return;

  const entry = { data, timestamp: Date.now() };
  await browser.storage.local.set({ [`${cachePrefix}${key}`]: entry });
}

/** Gets a cache entry.
 * @param {string} key The cache key.
 * @param {number|null} ttlMs Time to live in milliseconds. If null, no expiration is checked.
 * @param {*} fallback Value to return if the cache is missing or expired. Default is null.
 * @returns {Promise<*>} The cached data or the fallback value.
 */
export async function getCache(key, ttlMs, fallback = null) {
  const entryObj = await browser.storage.local.get(`${cachePrefix}${key}`);
  const entry = entryObj[`${cachePrefix}${key}`];
  if (!entry) return fallback;

  if (ttlMs) {
    const isFresh = Date.now() - entry.timestamp < ttlMs;
    return isFresh ? entry.data : fallback;
  }

  return entry.data;
}

/**
 * Adds new items to a cached array.
 * @param {string} key The cache key.
 * @param {*} newItems The new items to add.
 * @param {string} uniqueKey The unique key to identify items.
 * @param {number|null} ttlMs Time to live in milliseconds. If null, no expiration is checked.
 * @returns {Promise<void>}
 */
export async function addToCacheArray(key, newItems, uniqueKey = "id", ttlMs = 9 * 60 * 60 * 1000) {
  const existing = await getCache(key, ttlMs); // Default: 9h TTL

  if (!Array.isArray(existing)) {
    await setCache(key, newItems);
    return;
  }

  const existingIds = new Set(existing.map((item) => item[uniqueKey]));
  const filtered = newItems.filter((item) => !existingIds.has(item[uniqueKey]));

  if (filtered.length > 0) {
    await setCache(key, [...existing, ...filtered]);
  }
}

/**
 * Resets a cache entry.
 * @param {string} key The cache key.
 */
export async function resetCache(key) {
  await browser.storage.local.remove(`${cachePrefix}${key}`);
}

/** Clears all cache entries. This includes Gitlab Settings
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((key) => key.startsWith(cachePrefix));
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
  console.warn("Cache cleared successfully.");
}

/** Gets all cache keys.
 * @returns {Promise<string[]>} An array of all cache keys.
 */
export async function getCacheKeys() {
  const all = await browser.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(cachePrefix));
}

/** Gets the raw cache object from storage.
 * @returns {Promise<Object>} An object with all cache entries.
 */
export async function getRawCache() {
  const all = await browser.storage.local.get(null);
  const cache = {};
  for (const key of Object.keys(all)) {
    if (key.startsWith(cachePrefix)) {
      cache[key] = all[key];
    }
  }
  return cache;
}
