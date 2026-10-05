/**
 * @fileoverview Unit tests for src/gitlab/api.js: the HTTP layer covering timeout
 * vs. caller cancellation, retry/backoff, 429 Retry-After, deduplication,
 * and the 304-aware apiGetPage().
 *
 * `global.fetch` is replaced with a jest.fn() per test; `browser.storage`
 * is wired the same way tests/gitlab.test.js does it (api.js reads the
 * GitLab URL via getSetting()). Backoff delays are real (not faked), but
 * kept tiny via a short RETRY_BASE_MS-equivalent (see jest.setTimeout
 * below); this suite is allowed a slightly longer per-test budget than the
 * default 5s because of that.
 */

import { jest } from "@jest/globals";

jest.setTimeout(15_000);

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
}

const mockDisplayLocalizedNotification = jest.fn();
const mockOpenOptionsPage = jest.fn();
const mockClosePopup = jest.fn();

jest.unstable_mockModule("../src/utils/utils.js", () => ({
  displayLocalizedNotification: mockDisplayLocalizedNotification,
  openOptionsPage: mockOpenOptionsPage,
  closePopup: mockClosePopup,
}));

const { doRequest, apiGet, apiGetPage, apiPost, invalidateBaseUrl, AuthError } =
  await import("../src/gitlab/api.js");

/** Builds a minimal fetch-like Response. */
function mockResponse({ ok = true, status = 200, headers = {}, body = {} } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok,
    status,
    statusText: String(status),
    headers: { get: (name) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
  jest.clearAllMocks();
  wireStorageMocks();
  _store["s:gitlab_settings"] = { url: "https://gitlab.example.com", token: "test-token" };
  invalidateBaseUrl();
  global.fetch = jest.fn();
});

// ---------------------------------------------------------------------------
// doRequest: success, timeout vs. abort, retries
// ---------------------------------------------------------------------------

describe("doRequest", () => {
  test("returns the response on success", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
    const response = await doRequest("/api/v4/user");
    expect(response.ok).toBe(true);
  });

  test("resolves with undefined when no GitLab URL is configured", async () => {
    delete _store["s:gitlab_settings"];
    const response = await doRequest("/api/v4/user");
    expect(response).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("a caller-triggered AbortSignal rejects as AbortError, not TimeoutError", async () => {
    const ctrl = new AbortController();
    global.fetch.mockImplementationOnce((url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });

    const promise = doRequest("/api/v4/user", { signal: ctrl.signal });
    ctrl.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  test("a request that never resolves times out as TimeoutError, not AbortError", async () => {
    global.fetch.mockImplementationOnce((url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });

    await expect(
      doRequest("/api/v4/user", { timeoutMs: 20, retry: false }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  test("retries a network failure (TypeError) and succeeds on the second attempt", async () => {
    global.fetch
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(mockResponse({ body: { ok: true } }));

    const response = await doRequest("/api/v4/user", { timeoutMs: 1000 });
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("retries 503 and succeeds", async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 503 }))
      .mockResolvedValueOnce(mockResponse({ body: { ok: true } }));

    const response = await doRequest("/api/v4/user");
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("honours Retry-After (seconds) on 429 before retrying", async () => {
    global.fetch
      .mockResolvedValueOnce(
        mockResponse({ ok: false, status: 429, headers: { "Retry-After": "0.05" } }),
      )
      .mockResolvedValueOnce(mockResponse({ body: { ok: true } }));

    const start = Date.now();
    const response = await doRequest("/api/v4/user");
    expect(response.ok).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40); // ~50ms, allow scheduler slack
  });

  test("honours Retry-After as an HTTP date", async () => {
    const retryAt = new Date(Date.now() + 30).toUTCString();
    global.fetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 429, headers: { "Retry-After": retryAt } }))
      .mockResolvedValueOnce(mockResponse({ body: { ok: true } }));

    const response = await doRequest("/api/v4/user");
    expect(response.ok).toBe(true);
  });

  test("exhausts retries and throws the final error", async () => {
    global.fetch.mockResolvedValue(mockResponse({ ok: false, status: 500, body: "boom" }));

    await expect(doRequest("/api/v4/user")).rejects.toThrow("boom");
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test("never retries a non-retryable 4xx", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 422, body: "bad request" }));

    await expect(doRequest("/api/v4/user")).rejects.toThrow("bad request");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a caller AbortSignal cancels a pending retry delay", async () => {
    const ctrl = new AbortController();
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 503 }));

    const promise = doRequest("/api/v4/user", { signal: ctrl.signal });
    // Give the first attempt a moment to fail and enter the backoff sleep, then abort.
    await new Promise((resolve) => setTimeout(resolve, 10));
    ctrl.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(global.fetch).toHaveBeenCalledTimes(1); // the retry never fired
  });

  test("401 throws AuthError, notifies, opens Options, and does NOT close the popup", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 401 }));

    await expect(doRequest("/api/v4/user")).rejects.toBeInstanceOf(AuthError);
    expect(mockDisplayLocalizedNotification).toHaveBeenCalled();
    expect(mockOpenOptionsPage).toHaveBeenCalled();
    expect(mockClosePopup).not.toHaveBeenCalled();
  });

  test("a 304 is returned as a response, not thrown as an error", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 304 }));
    const response = await doRequest("/api/v4/user");
    expect(response.status).toBe(304);
  });
});

// ---------------------------------------------------------------------------
// apiGet: deduplication
// ---------------------------------------------------------------------------

describe("apiGet deduplication", () => {
  test("two concurrent identical GETs produce exactly one network request", async () => {
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    global.fetch.mockImplementationOnce(() => pending);

    const p1 = apiGet("/api/v4/user");
    const p2 = apiGet("/api/v4/user");

    // Let both calls reach the point of actually calling fetch() before resolving;
    // the real call is behind a couple of awaited storage lookups.
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveFetch(mockResponse({ body: { id: 1 } }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ id: 1 });
    expect(r2).toEqual({ id: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a later, sequential GET is not deduplicated against a finished one", async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse({ body: { id: 1 } }))
      .mockResolvedValueOnce(mockResponse({ body: { id: 2 } }));

    const r1 = await apiGet("/api/v4/user");
    const r2 = await apiGet("/api/v4/user");

    expect(r1).toEqual({ id: 1 });
    expect(r2).toEqual({ id: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("throws on a malformed (non-JSON) response body", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => { throw new SyntaxError("Unexpected token"); },
      text: async () => "not json",
    });

    await expect(apiGet("/api/v4/user")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// apiGetPage: pagination + ETag headers
// ---------------------------------------------------------------------------

describe("apiGetPage", () => {
  test("reads X-Next-Page, X-Total, and ETag from the response", async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        body: [{ id: 1 }],
        headers: { "X-Next-Page": "2", "X-Total": "150", ETag: "W/\"abc\"" },
      }),
    );

    const result = await apiGetPage("/api/v4/projects");
    expect(result).toEqual({
      data: [{ id: 1 }],
      etag: "W/\"abc\"",
      notModified: false,
      nextPage: 2,
      total: 150,
    });
  });

  test("sends If-None-Match when an etag is supplied", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ body: [] }));
    await apiGetPage("/api/v4/projects", { etag: "W/\"abc\"" });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers["If-None-Match"]).toBe("W/\"abc\"");
  });

  test("a 304 response reports notModified without a data payload", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 304 }));

    const result = await apiGetPage("/api/v4/projects", { etag: "W/\"abc\"" });
    expect(result.notModified).toBe(true);
    expect(result.data).toBeNull();
  });

  test("missing pagination headers fall back to null (caller handles via data.length)", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ body: [{ id: 1 }] }));
    const result = await apiGetPage("/api/v4/projects");
    expect(result.nextPage).toBeNull();
    expect(result.total).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// apiPost
// ---------------------------------------------------------------------------

describe("apiPost", () => {
  test("serializes the body and does not let options.method override POST", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ body: { id: 1 } }));

    await apiPost("/api/v4/projects/1/issues", { title: "x" }, { method: "GET" });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe("POST"); // the options.method spread-order bug is fixed
    expect(JSON.parse(options.body)).toEqual({ title: "x" });
  });
});
