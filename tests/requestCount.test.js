/**
 * @fileoverview Measures exact GitLab request counts for the workflows this
 * audit targeted, against a counting `apiGetPage` mock fed from the recorded
 * probe fixture (tests/fixtures/gitlab/probe-gitlab.visionconnect.de.json):
 * 1,105 projects across 12 pages on that instance. This is the evidence
 * behind the before/after table in GITLAB_API_AUDIT_REPORT.md section F.
 *
 * "Before" counts are derived from the OLD implementation's logic (not run,
 * that code no longer exists in the tree) and stated as a documented
 * calculation in the comments, not measured here. "After" counts are
 * measured by actually calling the current gitlab.js against this mock.
 */

import { jest } from "@jest/globals";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const PROBE = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "gitlab",
      "probe-gitlab.visionconnect.de.json",
    ),
    "utf8",
  ),
);

const _store = {};

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
  browser.storage.local.set.mockImplementation(async (obj) => Object.assign(_store, obj));
  browser.storage.local.remove.mockImplementation(async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete _store[k];
  });
  browser.storage.local.clear.mockImplementation(async () => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  });
}

const mockApiGetPage = jest.fn();
const mockApiPost = jest.fn();
const mockDoRequest = jest.fn();

jest.unstable_mockModule("../src/gitlab/api.js", () => ({
  apiGetPage: mockApiGetPage,
  apiPost: mockApiPost,
  doRequest: mockDoRequest,
  invalidateBaseUrl: jest.fn(),
}));

jest.unstable_mockModule("../src/utils/utils.js", () => ({
  displayLocalizedNotification: jest.fn(),
  openOptionsPage: jest.fn(),
  closePopup: jest.fn(),
}));

const {
  getProjects,
  getCurrentUser,
  getAssignees,
  searchProjects,
  invalidateCachingDisabledFlag: resetCachingFlag,
  clearSearchCache,
} = { ...(await import("../src/gitlab/gitlab.js")), ...(await import("../src/utils/cache.js")) };

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
  mockApiGetPage.mockReset();
  mockApiPost.mockReset();
  mockDoRequest.mockReset();
  browser.storage.local.get.mockReset();
  browser.storage.local.set.mockReset();
  browser.storage.local.remove.mockReset();
  browser.storage.local.clear.mockReset();
  wireStorageMocks();
  resetCachingFlag();
  clearSearchCache();
  _store["s:gitlab_settings"] = { url: "https://gitlab.example.com", token: "test-token" };
});

afterEach(flushMicrotasks);

/** One page response shaped like the real probe: a fixed-size project page
 * with the probe's measured payload size attached for reference. */
function projectsPageResponse({ count = 100, etag = 'W/"page1"' } = {}) {
  return {
    data: Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `project-${i + 1}` })),
    etag,
    notModified: false,
    nextPage: null,
    total: PROBE.projectsPage.pagination["x-total"],
  };
}

describe("popup startup: cold cache", () => {
  test("fetches exactly 2 requests (user + one project page), not one page per 100 projects", async () => {
    mockApiGetPage
      .mockResolvedValueOnce({ data: { id: 1, username: "me" }, etag: "W/\"u\"", notModified: false, nextPage: null, total: null })
      .mockResolvedValueOnce(projectsPageResponse());

    await getCurrentUser();
    await getProjects();

    // BEFORE (removed code, documented not measured here): fetchAllProjects()
    // paginated per_page=100 until a short page; on this instance that was
    // ceil(1105 / 100) = 12 requests, plus 1 for the user = 13 total.
    expect(mockApiGetPage).toHaveBeenCalledTimes(2);
  });
});

describe("popup startup: warm cache (same session, data already fetched once)", () => {
  test("renders from cache with zero blocking requests; one background revalidation follows", async () => {
    mockApiGetPage.mockResolvedValueOnce(projectsPageResponse());
    await getProjects(); // cold fetch, fills the cache

    mockApiGetPage.mockClear();
    mockApiGetPage.mockResolvedValueOnce({ data: null, etag: 'W/"page1"', notModified: true, nextPage: null, total: null });

    const result = await getProjects(); // warm path: must not wait on the network call below
    expect(result).toHaveLength(100); // served from cache synchronously

    await flushMicrotasks(); // let the background revalidation's 304 settle
    expect(mockApiGetPage).toHaveBeenCalledTimes(1); // the revalidation: a 304, 0 bytes per the probe
  });
});

describe("project search: a project outside the cached page", () => {
  test("costs exactly one server-side search request instead of walking every page", async () => {
    mockApiGetPage.mockResolvedValueOnce({
      data: [{ id: 9999, name: "deep-project" }],
      etag: null,
      notModified: false,
      nextPage: null,
      total: 1,
    });

    const results = await searchProjects("deep-project");
    expect(results).toHaveLength(1);
    expect(mockApiGetPage).toHaveBeenCalledTimes(1);
  });
});

describe("assignee loading", () => {
  test("a project with 19 members (the probe's sample project) costs exactly one request", async () => {
    mockApiGetPage.mockResolvedValueOnce({
      data: Array.from({ length: PROBE.sampleProjectUsers.total }, (_, i) => ({ id: i + 1 })),
      etag: null,
      notModified: false,
      nextPage: null,
      total: PROBE.sampleProjectUsers.total,
    });

    const result = await getAssignees(PROBE.sampleProjectUsers.projectId);
    expect(result).toHaveLength(19);
    expect(mockApiGetPage).toHaveBeenCalledTimes(1);
  });

  test("a project with more than 20 members is not truncated (the pre-fix bug): it paginates", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const page2 = Array.from({ length: 30 }, (_, i) => ({ id: i + 101 }));
    mockApiGetPage
      .mockResolvedValueOnce({ data: page1, etag: null, notModified: false, nextPage: 2, total: 130 })
      .mockResolvedValueOnce({ data: page2, etag: null, notModified: false, nextPage: null, total: 130 });

    const result = await getAssignees(555);
    expect(result).toHaveLength(130); // old implementation would have returned 20
    expect(mockApiGetPage).toHaveBeenCalledTimes(2);
  });
});
