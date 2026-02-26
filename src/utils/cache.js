import { CacheKeys } from "./Enums";

const cachePrefix = "cache_";

// --- PERSISTENT SETTINGS (Bypass Caching Logic) ---

/** * Saves a persistent user setting.
 * @param {string} key The setting key.
 * @param {*} value The value to store.
 */
export async function setSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
}

/** * Retrieves a persistent user setting.
 * @param {string} key The setting key.
 * @param {*} fallback Value if setting is missing.
 */
export async function getSetting(key, fallback = null) {
  const res = await browser.storage.local.get(key);
  return res[key] !== undefined ? res[key] : fallback;
}

// --- TEMPORARY CACHE (API Data) ---

/** * Checks if caching is disabled in the settings.
 * @returns {Promise<boolean>}
 */
async function isCachingDisabled() {
  // We use getSetting here so it doesn't check the cache for the cache status
  return await getSetting(CacheKeys.DISABLE_CACHE, false);
}

/** * Sets a cache entry.
 * @param {string} key The cache key.
 * @param {*} data The data to cache.
 */
export async function setCache(key, data) {
  // Logic: If caching is disabled, we ONLY allow Gitlab Settings (credentials) to be saved.
  if ((await isCachingDisabled())) {
    return;
  }

  const entry = { 
    data, 
    timestamp: Date.now() 
  };
  
  await browser.storage.local.set({ 
    [`${cachePrefix}${key}`]: entry 
  });
}

/** * Gets a cache entry.
 * @param {string} key The cache key.
 * @param {number|null} ttlMs Time to live in ms.
 * @param {*} fallback Fallback value.
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
 * @param {Array} newItems The new items to add.
 * @param {string} uniqueKey The unique key to identify items.
 * @param {number|null} ttlMs Time to live in milliseconds.
 */
export async function addToCacheArray(key, newItems, uniqueKey = "id", ttlMs = 32400000) {
  const existing = await getCache(key, ttlMs); 

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
 * Resets a specific cache entry.
 * @param {string} key The cache key.
 */
export async function resetCache(key) {
  await browser.storage.local.remove(`${cachePrefix}${key}`);
}

/** * Clears all entries that start with the cache prefix.
 */
export async function clearAllCache() {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((key) => key.startsWith(cachePrefix));
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
  console.warn("Cache cleared successfully.");
}

/** * Gets all keys currently in the cache.
 * @returns {Promise<string[]>}
 */
export async function getCacheKeys() {
  const all = await browser.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(cachePrefix));
}

/** * Gets the raw cache object.
 * @returns {Promise<Object>}
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