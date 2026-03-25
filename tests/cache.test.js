/**
 * @fileoverview Unit tests for src/utils/cache.js
 *
 * The module uses `browser.storage.local`, which doesn't exist in Node.
 * We provide a minimal in-memory mock before importing the module under test.
 *
 * Key conventions used by the module under test:
 *   - Settings are stored under the `s:` prefix  (e.g. `s:my_key`)
 *   - Cache entries are stored under the `c:` prefix (e.g. `c:projects`)
 *
 * Tests that need to inspect raw store contents must use these prefixed keys.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Per-test in-memory storage that mirrors browser.storage.local behaviour.
// ---------------------------------------------------------------------------

const _store = {};

beforeAll(() => {
  browser.storage.local.get.mockImplementation(async (keys) => {
    if (keys === null) return { ..._store };
    if (typeof keys === "string") {
      return _store[keys] !== undefined ? { [keys]: _store[keys] } : {};
    }
    const result = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      if (_store[k] !== undefined) result[k] = _store[k];
    }
    return result;
  });

  browser.storage.local.set.mockImplementation(async (obj) => {
    Object.assign(_store, obj);
  });

  browser.storage.local.remove.mockImplementation(async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete _store[k];
  });

  browser.storage.local.clear.mockImplementation(async () => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  });
});

// ---------------------------------------------------------------------------
// Import module under test (after mock is in place)
// ---------------------------------------------------------------------------

import {
  setSetting,
  getSetting,
  setCache,
  getCache,
  addToCacheArray,
  resetCache,
  clearAllCache,
  getCacheKeys,
  resetAddonCache,
  invalidateCachingDisabledFlag,
} from "../src/utils/cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clears the in-memory store and resets module-level state between tests. */
beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
  // Reset the in-memory caching-disabled flag so tests are fully isolated.
  // Without this, a test that disables caching would bleed into subsequent tests.
  invalidateCachingDisabledFlag();
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("setSetting / getSetting", () => {
  test("stores and retrieves a setting", async () => {
    await setSetting("my_key", { token: "abc" });
    expect(await getSetting("my_key")).toEqual({ token: "abc" });
  });

  test("stores under the s: prefix internally", async () => {
    await setSetting("my_key", 42);
    expect(_store["s:my_key"]).toBe(42);
    expect(_store["my_key"]).toBeUndefined();
  });

  test("returns the fallback when key is absent", async () => {
    expect(await getSetting("nonexistent", "default")).toBe("default");
  });

  test("returns null as default fallback", async () => {
    expect(await getSetting("nonexistent")).toBeNull();
  });

  test("throws when called with a cache-prefixed key", async () => {
    await expect(setSetting("c:oops", 1)).rejects.toThrow(/cache-prefixed/);
  });
});

// ---------------------------------------------------------------------------
// Cache - basic get/set
// ---------------------------------------------------------------------------

describe("setCache / getCache", () => {
  test("stores and retrieves a cache entry within TTL", async () => {
    await setCache("projects", [1, 2, 3]);
    const result = await getCache("projects", 60_000);
    expect(result).toEqual([1, 2, 3]);
  });

  test("stores under the c: prefix internally", async () => {
    await setCache("projects", [1]);
    expect(_store["c:projects"]).toBeDefined();
    expect(_store["projects"]).toBeUndefined();
    expect(_store["cache_projects"]).toBeUndefined();
  });

  test("returns fallback when key is absent", async () => {
    expect(await getCache("missing", 60_000, [])).toEqual([]);
  });

  test("returns fallback when entry is stale", async () => {
    await setCache("stale_key", "value");

    // Backdate the timestamp using the c: prefix
    const raw = _store["c:stale_key"];
    raw.timestamp = Date.now() - 100_000;

    expect(await getCache("stale_key", 1_000, "fallback")).toBe("fallback");
  });

  test("returns data when ttlMs is null (no freshness check)", async () => {
    await setCache("no_ttl", "data");
    const raw = _store["c:no_ttl"];
    raw.timestamp = 0; // very old
    expect(await getCache("no_ttl", null)).toBe("data");
  });

  test("throws when called with a settings-prefixed key", async () => {
    await expect(setCache("s:oops", "value")).rejects.toThrow(
      /settings-prefixed/,
    );
  });
});

// ---------------------------------------------------------------------------
// Cache - disabled caching
// ---------------------------------------------------------------------------

describe("setCache with caching disabled", () => {
  test("does not write to storage when caching is disabled", async () => {
    // setSetting writes s:disable_cache; getSetting(CacheKeys.DISABLE_CACHE) reads it back.
    await setSetting("disable_cache", true);
    invalidateCachingDisabledFlag();

    await setCache("should_not_exist", "value");
    expect(await getCache("should_not_exist", null, "missing")).toBe("missing");
  });
});

// ---------------------------------------------------------------------------
// addToCacheArray
// ---------------------------------------------------------------------------

describe("addToCacheArray", () => {
  test("creates a new entry when none exists", async () => {
    await addToCacheArray("items", [{ id: 1 }], "id");
    expect(await getCache("items", null)).toEqual([{ id: 1 }]);
  });

  test("appends new items to existing cache", async () => {
    await setCache("items", [{ id: 1 }]);
    await addToCacheArray("items", [{ id: 2 }], "id");
    expect(await getCache("items", null)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("does not add duplicate items", async () => {
    await setCache("items", [{ id: 1 }]);
    await addToCacheArray("items", [{ id: 1 }], "id");
    expect(await getCache("items", null)).toHaveLength(1);
  });

  test("replaces non-array cache entry with new items", async () => {
    await setCache("bad_cache", "not_an_array");
    await addToCacheArray("bad_cache", [{ id: 1 }], "id");
    expect(await getCache("bad_cache", null)).toEqual([{ id: 1 }]);
  });

  test("returns result metadata", async () => {
    const result = await addToCacheArray("items", [{ id: 1 }, { id: 2 }], "id");
    expect(result).toMatchObject({
      ok: true,
      trimmed: false,
      storedCount: 2,
      droppedCount: 0,
    });
  });

  test("reports dropped duplicates in result metadata", async () => {
    await setCache("items", [{ id: 1 }]);
    const result = await addToCacheArray("items", [{ id: 1 }, { id: 2 }], "id");
    expect(result).toMatchObject({
      ok: true,
      trimmed: false,
      storedCount: 2,
      droppedCount: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

describe("resetCache", () => {
  test("removes a single cache entry", async () => {
    await setCache("temp", "data");
    await resetCache("temp");
    expect(await getCache("temp", null)).toBeNull();
  });

  test("does not affect other cache entries", async () => {
    await setCache("keep", "data");
    await setCache("remove_me", "data");
    await resetCache("remove_me");
    expect(await getCache("keep", null)).toBe("data");
  });
});

describe("clearAllCache", () => {
  test("removes all cache entries but leaves settings intact", async () => {
    await setSetting("gitlab_settings", { url: "https://gitlab.example.com" });
    await setCache("projects", [1, 2]);
    await setCache("users", [3, 4]);

    await clearAllCache();

    expect(await getCache("projects", null)).toBeNull();
    expect(await getCache("users", null)).toBeNull();
    expect(await getSetting("gitlab_settings")).toEqual({
      url: "https://gitlab.example.com",
    });
  });

  test("is a no-op when the cache is already empty", async () => {
    await expect(clearAllCache()).resolves.not.toThrow();
  });
});

describe("getCacheKeys", () => {
  test("returns logical keys (without prefix) for cache entries only", async () => {
    await setSetting("setting_a", 1);
    await setCache("alpha", "x");
    await setCache("beta", "y");

    const keys = await getCacheKeys();

    // getCacheKeys() strips the c: prefix — callers receive logical names
    expect(keys).toContain("alpha");
    expect(keys).toContain("beta");
    // Settings must not leak through
    expect(keys).not.toContain("setting_a");
    expect(keys).not.toContain("s:setting_a");
    // Raw prefixed keys must not appear either
    expect(keys).not.toContain("c:alpha");
  });
});

describe("resetAddonCache", () => {
  test("clears all storage including settings", async () => {
    await setSetting("token", "abc");
    await setCache("projects", []);

    await resetAddonCache();

    expect(await getSetting("token")).toBeNull();
    expect(await getCache("projects", null)).toBeNull();
  });
});
