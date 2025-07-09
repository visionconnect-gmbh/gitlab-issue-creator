const cachePrefix = "cache_";

/**
 * Sets or updates a cache entry.
 * @param {string} key
 * @param {*} data
 */
export function setCache(key, data) {
  localStorage.setItem(
    `${cachePrefix}${key}`,
    JSON.stringify({ data, timestamp: Date.now() })
  );
}

/**
 * Returns the cached data for a key if not stale.
 * @param {string} key
 * @param {number} ttlMs
 * @returns {*|null}
 */
export function getCache(key, ttlMs) {
  const raw = localStorage.getItem(`${cachePrefix}${key}`);
  if (!raw) return null;

  try {
    const entry = JSON.parse(raw);
    const isFresh = Date.now() - entry.timestamp < ttlMs;
    return isFresh ? entry.data : null;
  } catch (e) {
    console.warn("Corrupted cache entry:", key);
    return null;
  }
}

/**
 * Adds new items to an array-based cache without duplicating existing ones.
 * Uses the specified key (e.g., "id") for comparison.
 * @param {string} key - Cache key
 * @param {Array} newItems - Items to add
 * @param {string} uniqueKey - Property name to identify uniqueness
 */
export function addToCacheArray(key, newItems, uniqueKey = "id") {
  const existing = getCache(key, 9 * 60 * 60 * 1000); // 9 hours TTL

  if (!Array.isArray(existing)) {
    setCache(key, newItems);
    return;
  }

  const existingIds = new Set(existing.map((item) => item[uniqueKey]));
  const filtered = newItems.filter((item) => !existingIds.has(item[uniqueKey]));

  if (filtered.length > 0) {
    const updatedData = [...existing, ...filtered];
    setCache(key, updatedData);
  }
}

/**
 * Clears a specific cache key.
 * @param {string} key
 */
export function resetCache(key) {
  localStorage.removeItem(`${cachePrefix}${key}`);
}

/**
 * Clears the entire cache.
 */
export function clearAllCache() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(cachePrefix)) {
      localStorage.removeItem(key);
    }
  });
  console.log("Cache cleared successfully.");
}

/**
 * Returns all cache keys that start with the cache prefix.
 * @returns {string[]}
 */
export function getCacheKeys() {
  return Object.keys(localStorage).filter((key) => key.startsWith(cachePrefix));
}

/**
 * Returns all raw cache entries (for debugging).
 */
export function getRawCache() {
  const cache = {};
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(cachePrefix)) {
      try {
        cache[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        cache[key] = "INVALID_JSON";
      }
    }
  });
  return cache;
}
