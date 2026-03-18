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
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Per-test in-memory storage.
// global.browser is seeded by tests/jest.setup.js; we override the four
// storage methods here with _store-backed implementations.
// ---------------------------------------------------------------------------

const _store = {};

/** Wires the four storage methods to the shared _store object.
 * Called in beforeEach so that jest.clearAllMocks() — which resets
 * mockImplementation — doesn't leave the storage stubs non-functional. */
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
    Object.assign(_store, obj)
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

// Mock the low-level HTTP client so no real network calls are made.
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockDoRequest = jest.fn();

jest.unstable_mockModule("../src/gitlab/api.js", () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  doRequest: mockDoRequest,
}));

// Mock notification helpers so they don't try to call browser.notifications.
const mockDisplayLocalizedNotification = jest.fn();
const mockOpenOptionsPage = jest.fn();

jest.unstable_mockModule("../src/utils/utils.js", () => ({
  displayLocalizedNotification: mockDisplayLocalizedNotification,
  openOptionsPage: mockOpenOptionsPage,
}));

// ---------------------------------------------------------------------------
// Dynamic imports – must come AFTER unstable_mockModule() calls.
// ---------------------------------------------------------------------------

const { getGitLabSettings, getCurrentUser, getProjects, getAssignees, createGitLabIssue } =
  await import("../src/gitlab/gitlab.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
  jest.clearAllMocks();
  // Re-wire storage after clearAllMocks() has reset all implementations.
  wireStorageMocks();
});

/** Writes valid GitLab settings directly into the mock store. */
function seedSettings(overrides = {}) {
  _store["gitlab_settings"] = {
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
    _store["gitlab_settings"] = { url: "https://gitlab.example.com" };
    const result = await getGitLabSettings();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });

  test("returns null and notifies when url is missing", async () => {
    _store["gitlab_settings"] = { token: "abc" };
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
    mockApiGet.mockResolvedValueOnce(mockUser);

    const user = await getCurrentUser();
    expect(user).toEqual(mockUser);
    expect(mockApiGet).toHaveBeenCalledWith("/api/v4/user", expect.any(Object));
  });

  test("returns cached user without calling the API again", async () => {
    seedSettings();
    mockApiGet.mockResolvedValueOnce({ id: 1, name: "Alice" });

    await getCurrentUser(); // fills cache
    await getCurrentUser(); // should use cache

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  test("returns null when settings are missing", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  test("returns null and notifies on API error", async () => {
    seedSettings();
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    const result = await getCurrentUser();
    expect(result).toBeNull();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getProjects
// ---------------------------------------------------------------------------

describe("getProjects", () => {
  test("fetches all projects via paginated GET", async () => {
    seedSettings();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 101 }, { id: 102 }];
    mockApiGet.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const projects = await getProjects();
    expect(projects).toHaveLength(102);
  });

  test("calls onUpdate callback with results", async () => {
    seedSettings();
    mockApiGet.mockResolvedValueOnce([{ id: 1 }]);

    const onUpdate = jest.fn();
    await getProjects(onUpdate);
    expect(onUpdate).toHaveBeenCalledWith(expect.arrayContaining([{ id: 1 }]));
  });

  test("returns undefined and does not throw when settings are missing", async () => {
    expect(await getProjects()).toBeUndefined();
  });

  test("notifies on API error", async () => {
    seedSettings();
    mockApiGet.mockRejectedValueOnce(new Error("Timeout"));

    await getProjects();
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
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
    mockApiGet.mockResolvedValueOnce(mockAssignees);

    expect(await getAssignees(42)).toEqual(mockAssignees);
  });

  test("caches assignees per projectId", async () => {
    seedSettings();
    mockApiGet.mockResolvedValueOnce([{ id: 10 }]);

    await getAssignees(42);
    await getAssignees(42); // second call – should use cache

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  test("calls onUpdate with assignees", async () => {
    seedSettings();
    mockApiGet.mockResolvedValueOnce([{ id: 10 }]);

    const onUpdate = jest.fn();
    await getAssignees(42, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith([{ id: 10 }]);
  });

  test("returns empty array on API error", async () => {
    seedSettings();
    mockApiGet.mockRejectedValueOnce(new Error("500"));

    expect(await getAssignees(99)).toEqual([]);
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
      expect.any(Object)
    );
  });

  test("defaults due_date to null when omitted", async () => {
    seedSettings();
    mockApiPost.mockResolvedValueOnce({ web_url: "" });

    await createGitLabIssue(7, 3, "Title", "Desc");

    expect(mockApiPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ due_date: null }),
      expect.any(Object)
    );
  });

  test("does nothing and does not throw when settings are missing", async () => {
    await expect(createGitLabIssue(7, 3, "T", "D")).resolves.toBeUndefined();
  });

  test("notifies on API error", async () => {
    seedSettings();
    mockApiPost.mockRejectedValueOnce(new Error("422 Unprocessable"));

    await createGitLabIssue(7, 3, "T", "D");
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
  });
});
