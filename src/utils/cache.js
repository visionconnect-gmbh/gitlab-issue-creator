/**
 * @fileoverview Browser storage abstraction for settings and API response caching.
 *
 * Two distinct layers share `browser.storage.local` but are partitioned by prefix:
 *
 * **Settings** (`s:` prefix) — persistent, never evicted, never trimmed.
 *   Use `getSetting` / `setSetting` for credentials and user preferences.
 *   Eviction logic is structurally incapable of seeing `s:` keys.
 *
 * **Cache** (`c:` prefix) — temporary, TTL-aware, evictable.
 *   Each entry is a `{ data, timestamp, ttlMs, label }` envelope.
 *   Eviction (LRU, stale sweep, size trimming) only operates on `c:` keys.
 *   When caching is disabled in settings, `setCache` is a no-op.
 *
 * Partition safety is enforced at two levels:
 *   1. `getCacheEntries()` / `getSettingsEntries()` filter by prefix centrally —
 *      all bulk operations flow through these, so cross-contamination is impossible.
 *   2. `setSetting` / `setCache` throw on wrong-prefix writes as a second line of defence.
 *
 * All public functions are async because `browser.storage.local` is async.
 */

import { CacheKeys } from "./Enums.js";

// ---------------------------------------------------------------------------
// Prefix constants — the only place these strings are defined
// ---------------------------------------------------------------------------

const SETTINGS_PREFIX = "s:";
const CACHE_PREFIX = "c:";

/** Soft size ceiling for a single cache array key before trimming oldest entries. */
const MAX_KEY_BYTES = 1_000_000; // 1 MB per key

// ---------------------------------------------------------------------------
// Write queue — serialises read-modify-write ops per key to prevent races
// ---------------------------------------------------------------------------

/** @type {Map<string, Promise<any>>} */
const writeQueue = new Map();

/**
 * Enqueues `fn` behind any pending operation for `key`.
 * Guarantees sequential execution without blocking unrelated keys.
 *
 * @param {string}            key
 * @param {() => Promise<*>}  fn
 * @returns {Promise<*>}
 */
function enqueue(key, fn) {
  const prev = writeQueue.get(key) ?? Promise.resolve();
  const next = prev.then(fn).finally(() => {
    if (writeQueue.get(key) === next) writeQueue.delete(key);
  });
  writeQueue.set(key, next);
  return next;
}

// ---------------------------------------------------------------------------
// Low-level storage helpers with error handling
// ---------------------------------------------------------------------------

/**
 * @param {string|string[]|null} key  Pass `null` to get everything.
 * @returns {Promise<Record<string, *>>}
 */
async function storageGet(key) {
  try {
    return await browser.storage.local.get(key);
  } catch (err) {
    console.error(`[storage] get(${JSON.stringify(key)}) failed:`, err);
    return {};
  }
}

/**
 * @param {Record<string, *>} record
 * @returns {Promise<boolean>}
 */
async function storageSet(record) {
  try {
    await browser.storage.local.set(record);
    return true;
  } catch (err) {
    if (err.name === "QuotaExceededError" || err.message?.includes("quota")) {
      console.warn(
        "[storage] Quota exceeded — running LRU eviction and retrying",
      );
      const needed = JSON.stringify(record).length * 2;
      const freed = await evictLRU(needed);

      if (freed === 0) {
        console.error(
          "[storage] Quota hit but nothing evictable — dropping write",
        );
        return false;
      }

      try {
        await browser.storage.local.set(record);
        return true;
      } catch (retryErr) {
        console.error(
          "[storage] set() still failing after LRU eviction:",
          retryErr,
        );
        return false;
      }
    }

    console.error("[storage] set() failed:", err);
    return false;
  }
}

/**
 * @param {string|string[]} keys
 * @returns {Promise<boolean>}
 */
async function storageRemove(keys) {
  try {
    await browser.storage.local.remove(keys);
    return true;
  } catch (err) {
    console.error("[storage] remove() failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Partition helpers — ALL bulk access flows through these two functions.
// Settings keys can never appear in cache operations and vice-versa.
// ---------------------------------------------------------------------------

/**
 * Returns all cache entries as `[prefixedKey, entry]` pairs.
 * This is the single chokepoint for every bulk cache operation.
 *
 * @returns {Promise<Array<[string, { data: *, timestamp: number, ttlMs: number|null, label: string }]>>}
 */
async function getCacheEntries() {
  const all = await storageGet(null);
  return Object.entries(all).filter(([k]) => k.startsWith(CACHE_PREFIX));
}

/**
 * Returns all settings entries as `[prefixedKey, value]` pairs.
 *
 * @returns {Promise<Array<[string, *]>>}
 */
async function getSettingsEntries() {
  const all = await storageGet(null);
  return Object.entries(all).filter(([k]) => k.startsWith(SETTINGS_PREFIX));
}

// ---------------------------------------------------------------------------
// Settings (persistent, no TTL, never evicted)
// ---------------------------------------------------------------------------

/**
 * Saves a persistent user setting.
 * Throws if `key` looks like a cache key — likely a call-site mistake.
 *
 * @param {string} key   - Logical key (without prefix); use a value from `CacheKeys`.
 * @param {*}      value - Any JSON-serialisable value.
 * @returns {Promise<boolean>}
 */
export async function setSetting(key, value) {
  if (key.startsWith(CACHE_PREFIX)) {
    throw new Error(
      `[storage] setSetting() received a cache-prefixed key: "${key}". Use setCache() instead.`,
    );
  }
  return storageSet({ [`${SETTINGS_PREFIX}${key}`]: value });
}

/**
 * Retrieves a persistent user setting.
 *
 * @param {string} key              - Logical key (without prefix).
 * @param {*}      [fallback=null]  - Returned when the key is absent.
 * @returns {Promise<*>}
 */
export async function getSetting(key, fallback = null) {
  const prefixed = `${SETTINGS_PREFIX}${key}`;
  const result = await storageGet(prefixed);
  return result[prefixed] !== undefined ? result[prefixed] : fallback;
}

/**
 * Verifies that all known settings keys are present in storage.
 * Dispatches `storage:settings-corrupted` if any are missing so the UI can react.
 *
 * @param {string[]} expectedKeys - Logical keys to verify (values from `CacheKeys`).
 * @returns {Promise<boolean>} `true` when all keys are intact.
 */
export async function verifySettingsIntegrity(expectedKeys) {
  const missing = [];

  for (const key of expectedKeys) {
    const val = await getSetting(key);
    if (val === null) missing.push(key);
  }

  if (missing.length > 0) {
    console.error("[storage] Settings keys missing:", missing);
    window.dispatchEvent(
      new CustomEvent("storage:settings-corrupted", { detail: { missing } }),
    );
  }

  return missing.length === 0;
}

// ---------------------------------------------------------------------------
// Cache (temporary, TTL-aware, evictable)
// ---------------------------------------------------------------------------

/**
 * In-memory flag so `isCachingDisabled()` doesn't cost a storage round-trip
 * on every `setCache()` call.
 * Reset via `invalidateCachingDisabledFlag()` when the user changes the setting.
 *
 * @type {boolean|null}
 */
let _cachingDisabled = null;

/** @returns {Promise<boolean>} */
async function isCachingDisabled() {
  if (_cachingDisabled === null) {
    _cachingDisabled = await getSetting(CacheKeys.DISABLE_CACHE, false);
  }
  return _cachingDisabled;
}

/**
 * Call this whenever the user toggles the "disable cache" setting so the
 * in-memory flag is re-read from storage on the next `setCache()`.
 */
export function invalidateCachingDisabledFlag() {
  _cachingDisabled = null;
}

/**
 * Writes a value to the cache.
 * No-op when caching is disabled.
 * Throws if `key` looks like a settings key — likely a call-site mistake.
 *
 * @param {string} key          - Logical key (without prefix).
 * @param {*}      data         - Any JSON-serialisable value.
 * @param {object} [meta={}]
 * @param {number|null} [meta.ttlMs]  - TTL stored with the entry for eviction.
 * @param {string}      [meta.label]  - Human-readable label for debugging.
 * @returns {Promise<boolean>}
 */
export async function setCache(key, data, meta = {}) {
  if (key.startsWith(SETTINGS_PREFIX)) {
    throw new Error(
      `[storage] setCache() received a settings-prefixed key: "${key}". Use setSetting() instead.`,
    );
  }
  if (await isCachingDisabled()) return false;

  const entry = {
    data,
    timestamp: Date.now(),
    ttlMs: meta.ttlMs ?? null,
    label: meta.label ?? key,
  };

  return storageSet({ [`${CACHE_PREFIX}${key}`]: entry });
}

/**
 * Reads a value from the cache.
 * Proactively removes the entry (fire-and-forget) when it is stale.
 *
 * @param {string}      key             - Logical key (without prefix).
 * @param {number|null} [ttlMs]         - Max acceptable age in ms.
 *                                        Falls back to the TTL stored in the entry.
 *                                        Pass `null` to skip freshness check entirely.
 * @param {*}           [fallback=null] - Returned when absent or stale.
 * @returns {Promise<*>}
 */
export async function getCache(key, ttlMs, fallback = null) {
  const prefixed = `${CACHE_PREFIX}${key}`;
  const raw = await storageGet(prefixed);
  const entry = raw[prefixed];

  if (!entry) return fallback;

  const effectiveTtl = ttlMs ?? entry.ttlMs ?? null;

  if (effectiveTtl !== null && Date.now() - entry.timestamp >= effectiveTtl) {
    storageRemove(prefixed); // proactive eviction, fire-and-forget
    return fallback;
  }

  return entry.data;
}

/**
 * Appends new items to a cached array, deduplicating by `uniqueKey`.
 * If the cache is empty or expired the new items become the entire entry.
 * Concurrent calls for the same key are serialised via the write queue.
 *
 * @param {string}   key               - Logical cache key.
 * @param {object[]} newItems          - Items to merge in.
 * @param {string}   [uniqueKey="id"]  - Property used to detect duplicates.
 * @param {number}   [ttlMs]           - TTL for the cache entry (default 9 h).
 * @returns {Promise<{ ok: boolean, trimmed: boolean, storedCount: number, droppedCount: number }>}
 */
export async function addToCacheArray(
  key,
  newItems,
  uniqueKey = "id",
  ttlMs = 9 * 60 * 60 * 1000,
) {
  return enqueue(key, async () => {
    const existing = await getCache(key, ttlMs);
    const base = Array.isArray(existing) ? existing : [];
    const existingIds = new Set(base.map((item) => item[uniqueKey]));
    const deduped = newItems.filter(
      (item) => !existingIds.has(item[uniqueKey]),
    );
    const dropped = newItems.length - deduped.length;

    if (deduped.length === 0) {
      return {
        ok: true,
        trimmed: false,
        storedCount: base.length,
        droppedCount: dropped,
      };
    }

    const merged = [...base, ...deduped];
    let trimmed = false;

    const approxBytes = JSON.stringify(merged).length * 2;
    if (approxBytes > MAX_KEY_BYTES) {
      console.warn(
        `[storage] "${key}" is ~${(approxBytes / 1024).toFixed(1)} KB — trimming oldest entries to fit`,
      );
      // Remove oldest entries one-by-one until we fit, rather than slicing by half
      while (
        JSON.stringify(merged).length * 2 > MAX_KEY_BYTES &&
        merged.length > 0
      ) {
        merged.shift();
        trimmed = true;
      }

      if (merged.length === 0) {
        console.error(
          `[storage] "${key}" — single payload exceeds MAX_KEY_BYTES, dropping write`,
        );
        return {
          ok: false,
          trimmed: true,
          storedCount: 0,
          droppedCount: newItems.length,
        };
      }
    }

    const ok = await setCache(key, merged, { ttlMs });
    return { ok, trimmed, storedCount: merged.length, droppedCount: dropped };
  });
}

// ---------------------------------------------------------------------------
// Eviction strategies (cache keys only — settings are structurally unreachable)
// ---------------------------------------------------------------------------

/**
 * Removes cache entries whose stored TTL has expired.
 * Called automatically at module load and on quota errors.
 *
 * @returns {Promise<number>} Number of entries removed.
 */
async function evictStaleEntries() {
  try {
    const entries = await getCacheEntries(); // only c: keys
    const now = Date.now();
    const toRemove = entries
      .filter(([, v]) => v?.ttlMs != null && now - v.timestamp >= v.ttlMs)
      .map(([k]) => k);

    if (toRemove.length > 0) {
      await storageRemove(toRemove);
      console.info(`[storage] Evicted ${toRemove.length} stale cache entries`);
    }

    return toRemove.length;
  } catch (err) {
    console.error("[storage] Stale eviction scan failed:", err);
    return 0;
  }
}

/**
 * Evicts least-recently-used cache entries until `requiredBytes` have been freed
 * (or all evictable entries are gone).
 *
 * @param {number} [requiredBytes=0]  Stop once this many bytes are freed.
 *                                    Pass 0 to evict everything possible.
 * @returns {Promise<number>} Approximate bytes freed.
 */
async function evictLRU(requiredBytes = 0) {
  try {
    const entries = await getCacheEntries(); // only c: keys — settings safe

    // Sort oldest-first by timestamp
    entries.sort(([, a], [, b]) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0));

    let freed = 0;
    const remove = [];

    for (const [k, v] of entries) {
      if (requiredBytes > 0 && freed >= requiredBytes) break;
      remove.push(k);
      freed += JSON.stringify(v).length * 2;
    }

    if (remove.length > 0) {
      await storageRemove(remove);
      console.warn(
        `[storage] LRU evicted ${remove.length} cache entries, freed ~${(freed / 1024).toFixed(1)} KB`,
      );
    }

    return freed;
  } catch (err) {
    console.error("[storage] LRU eviction failed:", err);
    return 0;
  }
}

// Run stale eviction once at module load — non-blocking
evictStaleEntries();

// ---------------------------------------------------------------------------
// Cache management utilities
// ---------------------------------------------------------------------------

/**
 * Removes a single cache entry.
 *
 * @param {string} key - Logical cache key (without prefix).
 * @returns {Promise<boolean>}
 */
export async function resetCache(key) {
  return storageRemove(`${CACHE_PREFIX}${key}`);
}

/**
 * Removes all cache entries. Settings are unaffected.
 *
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
  const entries = await getCacheEntries(); // only c: keys
  const keys = entries.map(([k]) => k);
  if (keys.length > 0) await storageRemove(keys);
  console.warn(`[storage] Cleared ${keys.length} cache entries.`);
}

/**
 * Returns the logical cache keys (without prefix) of all current cache entries.
 *
 * @returns {Promise<string[]>}
 */
export async function getCacheKeys() {
  const entries = await getCacheEntries();
  return entries.map(([k]) => k.slice(CACHE_PREFIX.length));
}

/**
 * Returns the raw cache object (all entries with their `{ data, timestamp, ttlMs, label }` envelopes).
 * Keys are returned without the `c:` prefix.
 *
 * @returns {Promise<Record<string, { data: *, timestamp: number, ttlMs: number|null, label: string }>>}
 */
export async function getRawCache() {
  const entries = await getCacheEntries();
  return Object.fromEntries(
    entries.map(([k, v]) => [k.slice(CACHE_PREFIX.length), v]),
  );
}

/**
 * Wipes ALL add-on data from storage, including settings.
 * Use only for a full factory reset.
 *
 * @returns {Promise<boolean>}
 */
export async function resetAddonCache() {
  try {
    await browser.storage.local.clear();
    _cachingDisabled = null;
    console.warn("[storage] All add-on data and settings wiped.");
    return true;
  } catch (err) {
    console.error("[storage] Full reset failed:", err);
    return false;
  }
}
