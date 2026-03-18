/**
 * @fileoverview Unit tests for src/utils/cache.js
 *
 * The module uses `browser.storage.local`, which doesn't exist in Node.
 * We provide a minimal in-memory mock before importing the module under test.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Per-test in-memory storage that mirrors browser.storage.local behaviour.
// The global.browser stub is seeded by tests/jest.setup.js; here we just
// replace the four storage methods with implementations backed by _store.
// ---------------------------------------------------------------------------

const _store = {};

// Wire up the in-memory store to the global mock functions.
// This runs before any describe/test block but after jest.setup.js has
// already created global.browser, so the properties exist.
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
} from "../src/utils/cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clears the in-memory store between tests. */
beforeEach(() => Object.keys(_store).forEach((k) => delete _store[k]));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("setSetting / getSetting", () => {
  test("stores and retrieves a setting", async () => {
    await setSetting("my_key", { token: "abc" });
    expect(await getSetting("my_key")).toEqual({ token: "abc" });
  });

  test("returns the fallback when key is absent", async () => {
    expect(await getSetting("nonexistent", "default")).toBe("default");
  });

  test("returns null as default fallback", async () => {
    expect(await getSetting("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cache – basic get/set
// ---------------------------------------------------------------------------

describe("setCache / getCache", () => {
  test("stores and retrieves a cache entry within TTL", async () => {
    await setCache("projects", [1, 2, 3]);
    const result = await getCache("projects", 60_000);
    expect(result).toEqual([1, 2, 3]);
  });

  test("returns fallback when key is absent", async () => {
    expect(await getCache("missing", 60_000, [])).toEqual([]);
  });

  test("returns fallback when entry is stale", async () => {
    await setCache("stale_key", "value");

    // Manually backdate the timestamp
    const raw = _store["cache_stale_key"];
    raw.timestamp = Date.now() - 100_000;

    expect(await getCache("stale_key", 1_000, "fallback")).toBe("fallback");
  });

  test("returns data when ttlMs is null (no freshness check)", async () => {
    await setCache("no_ttl", "data");
    const raw = _store["cache_no_ttl"];
    raw.timestamp = 0; // very old
    expect(await getCache("no_ttl", null)).toBe("data");
  });
});

// ---------------------------------------------------------------------------
// Cache – disabled caching
// ---------------------------------------------------------------------------

describe("setCache with caching disabled", () => {
  test("does not write to storage when caching is disabled", async () => {
    // Simulate the user having disabled the cache
    await setSetting("disable_cache", true);

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
    const result = await getCache("items", null);
    expect(result).toEqual([{ id: 1 }]);
  });

  test("appends new items to existing cache", async () => {
    await setCache("items", [{ id: 1 }]);
    await addToCacheArray("items", [{ id: 2 }], "id");
    const result = await getCache("items", null);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("does not add duplicate items", async () => {
    await setCache("items", [{ id: 1 }]);
    await addToCacheArray("items", [{ id: 1 }], "id");
    const result = await getCache("items", null);
    expect(result).toHaveLength(1);
  });

  test("replaces non-array cache entry with new items", async () => {
    await setCache("bad_cache", "not_an_array");
    await addToCacheArray("bad_cache", [{ id: 1 }], "id");
    expect(await getCache("bad_cache", null)).toEqual([{ id: 1 }]);
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
});

describe("clearAllCache", () => {
  test("removes all cache_ prefixed entries but leaves settings", async () => {
    await setSetting("gitlab_settings", { url: "https://gitlab.example.com" });
    await setCache("projects", [1, 2]);
    await setCache("users", [3, 4]);

    await clearAllCache();

    expect(await getCache("projects", null)).toBeNull();
    expect(await getCache("users", null)).toBeNull();
    // Settings should survive
    expect(await getSetting("gitlab_settings")).toEqual({ url: "https://gitlab.example.com" });
  });
});

describe("getCacheKeys", () => {
  test("returns only keys with the cache_ prefix", async () => {
    await setSetting("setting_a", 1);
    await setCache("alpha", "x");
    await setCache("beta", "y");

    const keys = await getCacheKeys();
    expect(keys).toContain("cache_alpha");
    expect(keys).toContain("cache_beta");
    expect(keys).not.toContain("setting_a");
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
