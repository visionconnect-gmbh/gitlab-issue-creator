const cachePrefix = "cache_";
let memoryCache = {};
let cachingDisabled = false;

export async function initCache() {
  const all = await browser.storage.local.get(null);
  memoryCache = all;
  cachingDisabled = all.disableCache || false;
}

function isCachingDisabled() {
  return cachingDisabled;
}

export function setCache(key, data) {
  if (isCachingDisabled()) return;
  const entry = { data, timestamp: Date.now() };
  memoryCache[`${cachePrefix}${key}`] = entry;
  browser.storage.local.set({ [`${cachePrefix}${key}`]: entry }); // async fire-and-forget
}

export function getCache(key, ttlMs) {
  const entry = memoryCache[`${cachePrefix}${key}`];
  if (!entry) return null;
  const isFresh = Date.now() - entry.timestamp < ttlMs;
  return isFresh ? entry.data : null;
}

export function addToCacheArray(key, newItems, uniqueKey = "id") {
  const existing = getCache(key, 9 * 60 * 60 * 1000); // 9h TTL

  if (!Array.isArray(existing)) {
    setCache(key, newItems);
    return;
  }

  const existingIds = new Set(existing.map((item) => item[uniqueKey]));
  const filtered = newItems.filter((item) => !existingIds.has(item[uniqueKey]));

  if (filtered.length > 0) {
    setCache(key, [...existing, ...filtered]);
  }
}

export function resetCache(key) {
  delete memoryCache[`${cachePrefix}${key}`];
  browser.storage.local.remove(`${cachePrefix}${key}`);
}

export function clearAllCache() {
  for (const key of Object.keys(memoryCache)) {
    if (key.startsWith(cachePrefix)) {
      delete memoryCache[key];
    }
  }
  browser.storage.local.clear();
  console.log("Cache cleared successfully.");
}

export function getCacheKeys() {
  return Object.keys(memoryCache).filter((key) => key.startsWith(cachePrefix));
}

export function getRawCache() {
  const cache = {};
  for (const key of Object.keys(memoryCache)) {
    if (key.startsWith(cachePrefix)) {
      cache[key] = memoryCache[key];
    }
  }
  return cache;
}
