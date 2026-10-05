/**
 * @fileoverview Unit tests for src/gitlab/gitlab.js
 *
 * jest.mock() uses require() internally and does not work with native ESM.
 * The ESM-compatible approach is jest.unstable_mockModule(), which must be
 * called before the modules under test are imported via dynamic import().
 *
 * Module load order:
 *   1. jest.setup.js seeds global.browser (via setupFiles in jest.config.mjs)
 *   2. jest.unstable_mockModule() registers the module factories synchronously
 *   3. Dynamic import() resolves after the factories are in place
 *   4. Tests run with the mock implementations wired up
 *
 * gitlab.js now talks to api.js exclusively through `apiGetPage` (for cache-
 * first + ETag revalidation) and `apiPost`/`doRequest` (writes), so those are
 * what's mocked here: there is no `apiGet` call left in gitlab.js to mock.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Per-test in-memory storage.
// global.browser is seeded by tests/jest.setup.js; we override the four
// storage methods here with _store-backed implementations.
// ---------------------------------------------------------------------------

const _store = {};

/** Wires the four storage methods to the shared _store object.
 * Called in beforeEach so that jest.clearAllMocks(), which resets
 * mockImplementation, doesn't leave the storage stubs non-functional. */
function wireStorageMocks() {
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
  browser.storage.local.set.mockImplementation(async (obj) =>
    Object.assign(_store, obj),
  );
  browser.storage.local.remove.mockImplementation(async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete _store[k];
  });
  browser.storage.local.clear.mockImplementation(async () => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  });
}

// ---------------------------------------------------------------------------
// ESM-compatible module mocks.
// jest.unstable_mockModule() must be called before the dynamic import() below.
// ---------------------------------------------------------------------------

const mockApiGetPage = jest.fn();
const mockApiPost = jest.fn();
const mockDoRequest = jest.fn();

jest.unstable_mockModule("../src/gitlab/api.js", () => ({
  apiGetPage: mockApiGetPage,
  apiPost: mockApiPost,
  doRequest: mockDoRequest,
  invalidateBaseUrl: jest.fn(),
}));

const mockDisplayLocalizedNotification = jest.fn();
const mockOpenOptionsPage = jest.fn();

jest.unstable_mockModule("../src/utils/utils.js", () => ({
  displayLocalizedNotification: mockDisplayLocalizedNotification,
  openOptionsPage: mockOpenOptionsPage,
  closePopup: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports – must come AFTER unstable_mockModule() calls.
// ---------------------------------------------------------------------------

const {
  getGitLabSettings,
  getCurrentUser,
  getProjects,
  searchProjects,
  getRecentProjects,
  recordRecentProject,
  dropProjectFromCache,
  getAssignees,
  getLabels,
  createGitLabIssue,
  uploadAttachmentToGitLab,
  uploadFileOrNotify,
  deleteUploadOrNotify,
  resetDeleteFailureNotification,
  resetIssueNotificationListener,
  clearSearchCache,
} = await import("../src/gitlab/gitlab.js");

const { invalidateCachingDisabledFlag, getCache } = await import("../src/utils/cache.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flushes microtasks so unawaited background revalidation (`void
 * revalidateX(...)`) has a chance to run before a test inspects its effects. */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Builds a mock apiGetPage result. */
function page(data, { etag = null, notModified = false, nextPage = null, total = null } = {}) {
  return { data, etag, notModified, nextPage, total };
}

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);

  // mockReset() (not clearAllMocks/mockClear) because several tests here
  // queue multi-call sequences (cold fetch + background revalidation,
  // paginated assignee fetches): clearAllMocks only resets call history,
  // it leaves any unconsumed mockResolvedValueOnce() queue entries in
  // place, which then silently leak into the NEXT test's first call.
  mockApiGetPage.mockReset();
  mockApiPost.mockReset();
  mockDoRequest.mockReset();
  mockDisplayLocalizedNotification.mockReset();
  mockOpenOptionsPage.mockReset();
  browser.notifications.onClicked.addListener.mockClear();
  browser.storage.local.get.mockReset();
  browser.storage.local.set.mockReset();
  browser.storage.local.remove.mockReset();
  browser.storage.local.clear.mockReset();

  wireStorageMocks();
  invalidateCachingDisabledFlag();
  resetDeleteFailureNotification();
  resetIssueNotificationListener();
  clearSearchCache();
});

/** Lets any unawaited background work from the test spawn and settle before
 * the next test starts, so it can never write into the next test's _store. */
afterEach(flushMicrotasks);

/** Writes valid GitLab settings directly into the mock store. */
function seedSettings(overrides = {}) {
  _store["s:gitlab_settings"] = {
    url: "https://gitlab.example.com",
    token: "test-token",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getGitLabSettings
// ---------------------------------------------------------------------------

describe("getGitLabSettings", () => {
  test("returns settings when both url and token are present", async () => {
    seedSettings();
    const settings = await getGitLabSettings();
    expect(settings).toMatchObject({
      url: "https://gitlab.example.com",
      token: "test-token",
    });
  });

  test("returns null and notifies when token is missing", async () => {
    _store["s:gitlab_settings"] = { url: "https://gitlab.example.com" };
    const result = await getGitLabSettings();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });

  test("returns null and notifies when url is missing", async () => {
    _store["s:gitlab_settings"] = { token: "abc" };
    const result = await getGitLabSettings();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });

  test("returns null when settings are entirely absent", async () => {
    expect(await getGitLabSettings()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser
// ---------------------------------------------------------------------------

describe("getCurrentUser", () => {
  test("fetches and caches the user on first call", async () => {
    seedSettings();
    const mockUser = { id: 1, name: "Alice" };
    mockApiGetPage.mockResolvedValueOnce(page(mockUser, { etag: "W/\"u1\"" }));

    const user = await getCurrentUser();
    expect(user).toEqual(mockUser);
    expect(mockApiGetPage).toHaveBeenCalledWith("/api/v4/user", expect.any(Object));
  });

  test("returns cached user immediately without waiting on a network call", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page({ id: 1, name: "Alice" }, { etag: "W/\"u1\"" }));
    await getCurrentUser(); // fills cache

    mockApiGetPage.mockClear();
    // Revalidation below is a 304 (no change), so no onUpdate call.
    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));

    const onUpdate = jest.fn();
    const user = await getCurrentUser(onUpdate);
    expect(user).toEqual({ id: 1, name: "Alice" });
    expect(onUpdate).toHaveBeenCalledWith({ id: 1, name: "Alice" });

    await flushMicrotasks();
    expect(onUpdate).toHaveBeenCalledTimes(1); // not called again, 304, nothing changed
  });

  test("background revalidation sends the cached ETag as If-None-Match", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page({ id: 1 }, { etag: "W/\"abc\"" }));
    await getCurrentUser();

    mockApiGetPage.mockClear();
    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));
    await getCurrentUser();
    await flushMicrotasks();

    expect(mockApiGetPage).toHaveBeenCalledWith(
      "/api/v4/user",
      expect.objectContaining({ etag: "W/\"abc\"" }),
    );
  });

  test("returns null when settings are missing", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  test("returns null and notifies on API error", async () => {
    seedSettings();
    mockApiGetPage.mockRejectedValueOnce(new Error("Network error"));

    const result = await getCurrentUser();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });

  test("does not show a redundant notification for an AuthError (api.js already notified)", async () => {
    seedSettings();
    const authError = new Error("Unauthorized");
    authError.name = "AuthError";
    mockApiGetPage.mockRejectedValueOnce(authError);

    const result = await getCurrentUser();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getProjects
// ---------------------------------------------------------------------------

describe("getProjects", () => {
  test("fetches a single page of projects (cold cache)", async () => {
    const projects = Array.from({ length: 42 }, (_, i) => ({ id: i + 1, name: `p${i}` }));
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page(projects, { etag: "W/\"p1\"" }));

    const result = await getProjects();
    expect(result).toEqual(projects);
    expect(mockApiGetPage).toHaveBeenCalledTimes(1);
    expect(mockApiGetPage).toHaveBeenCalledWith(
      expect.stringContaining("per_page=100"),
      expect.any(Object),
    );
    expect(mockApiGetPage).toHaveBeenCalledWith(
      expect.stringContaining("order_by=last_activity_at"),
      expect.any(Object),
    );
  });

  test("cache-first: returns cached data before the revalidation call resolves", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }], { etag: "W/\"a\"" }));
    await getProjects();

    mockApiGetPage.mockClear();
    let resolveRevalidation;
    mockApiGetPage.mockReturnValueOnce(
      new Promise((resolve) => { resolveRevalidation = resolve; }),
    );

    const result = await getProjects(); // must not hang waiting on the pending revalidation
    expect(result).toEqual([{ id: 1 }]);

    resolveRevalidation(page(null, { notModified: true })); // let the background call settle
    await flushMicrotasks();
  });

  test("a 304 revalidation leaves the cache untouched and does not call onUpdate again", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1, name: "a" }], { etag: "W/\"a\"" }));
    await getProjects();

    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));
    const onUpdate = jest.fn();
    await getProjects(onUpdate);
    await flushMicrotasks();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith([{ id: 1, name: "a" }]);
  });

  test("a changed revalidation calls onUpdate a second time with the fresh list", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1, name: "a" }], { etag: "W/\"a\"" }));
    const onUpdate = jest.fn();
    await getProjects(onUpdate);

    mockApiGetPage.mockResolvedValueOnce(
      page([{ id: 1, name: "a" }, { id: 2, name: "b" }], { etag: "W/\"b\"" }),
    );
    await getProjects(onUpdate);
    await flushMicrotasks();

    // Cache-first calls onUpdate immediately with the (still-stale) cached
    // data, then again once the background revalidation actually changes
    // something: three calls total, the cold fetch, the warm-path
    // immediate render, and the post-revalidation update.
    expect(onUpdate).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenLastCalledWith([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  });

  test("a failed revalidation leaves stale data intact and usable", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }], { etag: "W/\"a\"" }));
    await getProjects();

    mockApiGetPage.mockRejectedValueOnce(new Error("GitLab unreachable"));
    const result = await getProjects();
    await flushMicrotasks();

    expect(result).toEqual([{ id: 1 }]); // still served from cache
    expect(mockDisplayLocalizedNotification).not.toHaveBeenCalled(); // revalidation failures are silent
  });

  test("calls onStale when a background revalidation fails for a non-auth reason", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }], { etag: "W/\"a\"" }));
    const onStale = jest.fn();
    await getProjects(undefined, onStale);

    mockApiGetPage.mockRejectedValueOnce(new Error("GitLab unreachable"));
    await getProjects(undefined, onStale);
    await flushMicrotasks();

    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test("does not call onStale when the revalidation succeeds", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }], { etag: "W/\"a\"" }));
    const onStale = jest.fn();
    await getProjects(undefined, onStale);

    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));
    await getProjects(undefined, onStale);
    await flushMicrotasks();

    expect(onStale).not.toHaveBeenCalled();
  });

  test("does not call onStale for an AuthError (api.js already notified)", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }], { etag: "W/\"a\"" }));
    const onStale = jest.fn();
    await getProjects(undefined, onStale);

    const authError = new Error("Unauthorized");
    authError.name = "AuthError";
    mockApiGetPage.mockRejectedValueOnce(authError);
    await getProjects(undefined, onStale);
    await flushMicrotasks();

    expect(onStale).not.toHaveBeenCalled();
  });

  test("returns an empty array without throwing when settings are missing", async () => {
    expect(await getProjects()).toEqual([]);
  });

  test("notifies on a cold-cache API error", async () => {
    seedSettings();
    mockApiGetPage.mockRejectedValueOnce(new Error("Timeout"));

    const result = await getProjects();
    expect(result).toEqual([]);
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// searchProjects
// ---------------------------------------------------------------------------

describe("searchProjects", () => {
  test("returns an empty array for queries shorter than 2 characters, without a request", async () => {
    seedSettings();
    expect(await searchProjects("a")).toEqual([]);
    expect(await searchProjects(" ")).toEqual([]);
    expect(mockApiGetPage).not.toHaveBeenCalled();
  });

  test("hits the server-side search parameter", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 9, name: "found" }]));

    const results = await searchProjects("found");
    expect(results).toEqual([{ id: 9, name: "found" }]);
    expect(mockApiGetPage).toHaveBeenCalledWith(
      expect.stringContaining("search=found"),
      expect.any(Object),
    );
  });

  test("caches identical queries in memory for a short window, without re-requesting", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }]));

    await searchProjects("widget");
    await searchProjects("widget"); // same query, should hit the memory cache

    expect(mockApiGetPage).toHaveBeenCalledTimes(1);
  });

  test("never persists search results to browser.storage.local", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }]));
    await searchProjects("widget");

    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  test("propagates AbortError without swallowing it", async () => {
    seedSettings();
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockApiGetPage.mockRejectedValueOnce(abortError);

    await expect(searchProjects("widget")).rejects.toThrow("Aborted");
  });
});

// ---------------------------------------------------------------------------
// recordRecentProject / getRecentProjects / dropProjectFromCache
// ---------------------------------------------------------------------------

describe("recentProjects", () => {
  test("records and retrieves recently-used projects, most recent first", async () => {
    await recordRecentProject({ id: 1, name: "one" });
    await recordRecentProject({ id: 2, name: "two" });

    expect(await getRecentProjects()).toEqual([
      { id: 2, name: "two" },
      { id: 1, name: "one" },
    ]);
  });

  test("re-recording an existing project moves it to the front without duplicating it", async () => {
    await recordRecentProject({ id: 1, name: "one" });
    await recordRecentProject({ id: 2, name: "two" });
    await recordRecentProject({ id: 1, name: "one" });

    const recent = await getRecentProjects();
    expect(recent).toHaveLength(2);
    expect(recent[0]).toEqual({ id: 1, name: "one" });
  });

  test("stays bounded to the most recent 10 picks", async () => {
    for (let i = 0; i < 15; i++) {
      await recordRecentProject({ id: i, name: `p${i}` });
    }
    expect(await getRecentProjects()).toHaveLength(10);
  });
});

describe("dropProjectFromCache", () => {
  test("removes the project from both the cached page and the recent list", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1 }, { id: 2 }]));
    await getProjects();
    await recordRecentProject({ id: 1 });

    await dropProjectFromCache(1);

    expect(await getCache("projects", null)).toEqual([{ id: 2 }]);
    expect(await getRecentProjects()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAssignees
// ---------------------------------------------------------------------------

describe("getAssignees", () => {
  test("returns empty array when projectId is falsy", async () => {
    expect(await getAssignees(null)).toEqual([]);
    expect(await getAssignees(undefined)).toEqual([]);
  });

  test("fetches assignees for a project", async () => {
    seedSettings();
    const mockAssignees = [{ id: 10, name: "Bob" }];
    mockApiGetPage.mockResolvedValueOnce(page(mockAssignees));

    expect(await getAssignees(42)).toEqual(mockAssignees);
  });

  test("paginates past GitLab's default page size (the truncation regression)", async () => {
    seedSettings();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const page2 = Array.from({ length: 25 }, (_, i) => ({ id: i + 101 }));
    mockApiGetPage
      .mockResolvedValueOnce(page(page1, { nextPage: 2 }))
      .mockResolvedValueOnce(page(page2, { nextPage: null }));

    const result = await getAssignees(42);
    expect(result).toHaveLength(125);
    expect(mockApiGetPage).toHaveBeenCalledTimes(2);
  });

  test("cache-first: returns cached assignees immediately", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 10 }]));
    await getAssignees(42);

    mockApiGetPage.mockClear();
    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));
    const result = await getAssignees(42);

    expect(result).toEqual([{ id: 10 }]);
  });

  test("calls onUpdate with assignees", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 10 }]));

    const onUpdate = jest.fn();
    await getAssignees(42, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith([{ id: 10 }]);
  });

  test("throws on a cold-cache API failure instead of silently returning an empty list", async () => {
    seedSettings();
    mockApiGetPage.mockRejectedValueOnce(new Error("500"));

    await expect(getAssignees(99)).rejects.toThrow("500");
  });

  test("a failed background revalidation leaves cached assignees intact", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 10 }]));
    await getAssignees(42);

    mockApiGetPage.mockRejectedValueOnce(new Error("503"));
    const result = await getAssignees(42);
    await flushMicrotasks();

    expect(result).toEqual([{ id: 10 }]);
  });
});

// ---------------------------------------------------------------------------
// getLabels: structurally identical to getAssignees (cache-first, ETag
// revalidation, pagination, throws on a cold-cache failure).
// ---------------------------------------------------------------------------

describe("getLabels", () => {
  test("returns empty array when projectId is falsy", async () => {
    expect(await getLabels(null)).toEqual([]);
    expect(await getLabels(undefined)).toEqual([]);
  });

  test("fetches labels for a project", async () => {
    seedSettings();
    const mockLabels = [{ id: 1, name: "bug", color: "#d9534f" }];
    mockApiGetPage.mockResolvedValueOnce(page(mockLabels));

    expect(await getLabels(42)).toEqual(mockLabels);
    expect(mockApiGetPage).toHaveBeenCalledWith(
      expect.stringContaining("/api/v4/projects/42/labels"),
      expect.any(Object),
    );
  });

  test("paginates past GitLab's default page size", async () => {
    seedSettings();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `l${i}` }));
    const page2 = Array.from({ length: 10 }, (_, i) => ({ id: i + 101, name: `l${i + 100}` }));
    mockApiGetPage
      .mockResolvedValueOnce(page(page1, { nextPage: 2 }))
      .mockResolvedValueOnce(page(page2, { nextPage: null }));

    const result = await getLabels(42);
    expect(result).toHaveLength(110);
    expect(mockApiGetPage).toHaveBeenCalledTimes(2);
  });

  test("cache-first: returns cached labels immediately", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1, name: "bug" }]));
    await getLabels(42);

    mockApiGetPage.mockClear();
    mockApiGetPage.mockResolvedValueOnce(page(null, { notModified: true }));
    const result = await getLabels(42);

    expect(result).toEqual([{ id: 1, name: "bug" }]);
  });

  test("calls onUpdate with labels", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1, name: "bug" }]));

    const onUpdate = jest.fn();
    await getLabels(42, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith([{ id: 1, name: "bug" }]);
  });

  test("throws on a cold-cache API failure instead of silently returning an empty list", async () => {
    seedSettings();
    mockApiGetPage.mockRejectedValueOnce(new Error("500"));

    await expect(getLabels(99)).rejects.toThrow("500");
  });

  test("a failed background revalidation leaves cached labels intact", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 1, name: "bug" }]));
    await getLabels(42);

    mockApiGetPage.mockRejectedValueOnce(new Error("503"));
    const result = await getLabels(42);
    await flushMicrotasks();

    expect(result).toEqual([{ id: 1, name: "bug" }]);
  });
});

// ---------------------------------------------------------------------------
// createGitLabIssue
// ---------------------------------------------------------------------------

describe("createGitLabIssue", () => {
  test("posts to the issues endpoint with correct payload", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({
      web_url: "https://gitlab.example.com/issues/1",
    });

    await createGitLabIssue(7, 3, "Bug title", "Bug description", "2024-12-31");

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/v4/projects/7/issues",
      {
        title: "Bug title",
        description: "Bug description",
        assignee_ids: [3],
        due_date: "2024-12-31",
      },
      expect.any(Object),
    );
  });

  test("includes labels as a comma-separated string when provided", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({ web_url: "" });

    await createGitLabIssue(7, 3, "T", "D", null, ["bug", "urgent"]);

    expect(mockApiPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ labels: "bug,urgent" }),
      expect.any(Object),
    );
  });

  test("omits the labels field entirely when none are selected", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({ web_url: "" });

    await createGitLabIssue(7, 3, "T", "D");

    const [, payload] = mockApiPost.mock.calls[0];
    expect(payload).not.toHaveProperty("labels");
  });

  test("defaults due_date to null when omitted", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({ web_url: "" });

    await createGitLabIssue(7, 3, "Title", "Desc");

    expect(mockApiPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ due_date: null }),
      expect.any(Object),
    );
  });

  test("returns true on success", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({ web_url: "" });
    await expect(createGitLabIssue(7, 3, "T", "D")).resolves.toBe(true);
  });

  test("returns false, without throwing, when settings are missing", async () => {
    await expect(createGitLabIssue(7, 3, "T", "D")).resolves.toBe(false);
  });

  test("returns false and notifies on API error", async () => {
    seedSettings();
    mockApiPost.mockRejectedValueOnce(new Error("422 Unprocessable"));

    await expect(createGitLabIssue(7, 3, "T", "D")).resolves.toBe(false);
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });

  test("on a 404, drops the project from the cached page", async () => {
    seedSettings();
    mockApiGetPage.mockResolvedValueOnce(page([{ id: 7 }, { id: 8 }]));
    await getProjects();

    mockApiPost.mockRejectedValueOnce(new Error("404 Project Not Found"));
    await createGitLabIssue(7, 3, "T", "D");

    expect(await getCache("projects", null)).toEqual([{ id: 8 }]);
  });

  test("registers exactly one notification-click listener regardless of how many issues are created", async () => {
    seedSettings();
    mockApiPost.mockResolvedValue({ web_url: "https://gitlab.example.com/issues/1" });

    await createGitLabIssue(7, 3, "First", "D");
    await createGitLabIssue(7, 3, "Second", "D");
    await createGitLabIssue(7, 3, "Third", "D");

    expect(browser.notifications.onClicked.addListener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// uploadAttachmentToGitLab / uploadFileOrNotify
// ---------------------------------------------------------------------------

describe("uploadAttachmentToGitLab", () => {
  test("builds multipart FormData and posts to the uploads endpoint", async () => {
    seedSettings();
    mockDoRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "/uploads/abc/pic.png", markdown: "![pic.png](/uploads/abc/pic.png)" }),
    });

    const file = new File(["content"], "pic.png", { type: "image/png" });
    const result = await uploadAttachmentToGitLab(7, file);

    expect(result).toEqual({ url: "/uploads/abc/pic.png", markdown: "![pic.png](/uploads/abc/pic.png)" });
    expect(mockDoRequest).toHaveBeenCalledWith(
      "/api/v4/projects/7/uploads",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
        headers: { "PRIVATE-TOKEN": "test-token" },
      }),
      false,
    );
  });

  test("rejects a non-File argument", async () => {
    seedSettings();
    await expect(uploadAttachmentToGitLab(7, { not: "a file" })).rejects.toThrow(
      "invalid file argument",
    );
  });

  test("rejects an empty file", async () => {
    seedSettings();
    const emptyFile = new File([], "empty.png", { type: "image/png" });
    await expect(uploadAttachmentToGitLab(7, emptyFile)).rejects.toThrow(
      "attachment content is empty",
    );
  });

  test("throws when the response is not ok", async () => {
    seedSettings();
    mockDoRequest.mockResolvedValueOnce({
      ok: false,
      status: 413,
      text: async () => "Payload too large",
    });

    const file = new File(["content"], "pic.png", { type: "image/png" });
    await expect(uploadAttachmentToGitLab(7, file)).rejects.toThrow("413");
  });

  test("throws when GitLab settings are unavailable", async () => {
    const file = new File(["content"], "pic.png", { type: "image/png" });
    await expect(uploadAttachmentToGitLab(7, file)).rejects.toThrow("GitLab settings unavailable");
  });
});

describe("uploadFileOrNotify", () => {
  test("returns the upload result on success", async () => {
    seedSettings();
    mockDoRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "/uploads/abc/pic.png", markdown: "![pic.png](/uploads/abc/pic.png)" }),
    });

    const file = new File(["content"], "pic.png", { type: "image/png" });
    const result = await uploadFileOrNotify(7, file);

    expect(result).toEqual({ url: "/uploads/abc/pic.png", markdown: "![pic.png](/uploads/abc/pic.png)" });
    expect(mockDisplayLocalizedNotification).not.toHaveBeenCalled();
  });

  test("notifies and returns null on failure, instead of throwing", async () => {
    seedSettings();
    mockDoRequest.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server error" });

    const file = new File(["content"], "pic.png", { type: "image/png" });
    await expect(uploadFileOrNotify(7, file)).resolves.toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteUploadOrNotify
// ---------------------------------------------------------------------------

describe("deleteUploadOrNotify", () => {
  test("deletes by upload id with the auth header", async () => {
    seedSettings();
    mockDoRequest.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await deleteUploadOrNotify(7, { id: 42 });

    expect(result).toBe(true);
    expect(mockDoRequest).toHaveBeenCalledWith(
      "/api/v4/projects/7/uploads/42",
      expect.objectContaining({
        method: "DELETE",
        headers: { "PRIVATE-TOKEN": "test-token" },
      }),
    );
  });

  test("is a no-op when the upload has no id (pre-17.3 instance)", async () => {
    seedSettings();
    const result = await deleteUploadOrNotify(7, { url: "/uploads/abc/pic.png" });

    expect(result).toBe(false);
    expect(mockDoRequest).not.toHaveBeenCalled();
  });

  test("returns false without a request when settings are missing", async () => {
    const result = await deleteUploadOrNotify(7, { id: 42 });

    expect(result).toBe(false);
    expect(mockDoRequest).not.toHaveBeenCalled();
  });

  test("on failure (e.g. 403 for a non-Maintainer token), warns, notifies once, and never throws", async () => {
    seedSettings();
    mockDoRequest.mockRejectedValue(new Error("403 Forbidden"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const first = await deleteUploadOrNotify(7, { id: 1 });
    const second = await deleteUploadOrNotify(7, { id: 2 });

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(mockDisplayLocalizedNotification).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
