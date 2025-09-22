import { CacheKeys } from "./Enums";

const cachePrefix = "cache_";

async function isCachingDisabled() {
  return await browser.storage.local.get(CacheKeys.DISABLE_CACHE).then((res) => res.disableCaching || false);
}

export async function setCache(key, data) {
  if ((await isCachingDisabled())) return;
  const entry = { data, timestamp: Date.now() };
  await browser.storage.local.set({ [`${cachePrefix}${key}`]: entry });
}

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

export async function resetCache(key) {
  await browser.storage.local.remove(`${cachePrefix}${key}`);
}

export async function clearAllCache() {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((key) => key.startsWith(cachePrefix));
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
  console.log("Cache cleared successfully.");
}

export async function getCacheKeys() {
  const all = await browser.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(cachePrefix));
}

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
