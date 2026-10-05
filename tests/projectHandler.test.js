/** @jest-environment jsdom */
/**
 * @fileoverview Covers the UX-sweep fix: Labels/Assignee visibility is
 * gated on their data having actually settled for the committed project,
 * not merely on a project being selected: it closes the race where clicking
 * Labels (or glancing at the assignee select) right after picking a
 * project could show a false "empty" state before the real data arrived.
 *
 * `projectHandler.js` is tightly coupled to the real DOM (via
 * `popupState.js`'s module-level `elements`/`editor`/`uploadRegistry`), so
 * this loads the actual `issue_creator.html` into jsdom and drives it
 * through `issue_creator.js`'s real `init()`, the same technique used to
 * verify the gating changes earlier in this session, rather than trying
 * to unit-test `projectHandler.js` in isolation.
 */
import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POPUP_DIR = path.resolve(__dirname, "..", "src", "popup");

const html = fs
  .readFileSync(path.join(POPUP_DIR, "issue_creator.html"), "utf8")
  .replace(/<!DOCTYPE[^>]*>/i, "");

let incomingListener;

function setupBrowserMock() {
  global.browser = {
    ...global.browser,
    i18n: { getMessage: jest.fn((k) => k), getUILanguage: jest.fn(() => "en") },
    storage: {
      local: {
        get: jest.fn(async () => ({})),
        set: jest.fn(async () => {}),
        remove: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
      },
    },
    tabs: {
      getCurrent: jest.fn(async () => ({ id: 1, windowId: 1 })),
      query: jest.fn(async () => []),
      sendMessage: jest.fn(async () => {}),
      reload: jest.fn(async () => {}),
    },
    runtime: {
      sendMessage: jest.fn(async () => {}),
      onMessage: {
        addListener: jest.fn((fn) => {
          incomingListener = fn;
        }),
      },
      getManifest: jest.fn(() => ({ version: "1.0", default_locale: "en" })),
      getURL: jest.fn((p) => p),
      openOptionsPage: jest.fn(async () => {}),
    },
    notifications: { create: jest.fn(async () => "id"), onClicked: { addListener: jest.fn() } },
    windows: { create: jest.fn(async () => ({ id: 1 })), remove: jest.fn(async () => {}), onRemoved: { addListener: jest.fn() } },
    menus: { create: jest.fn(), onClicked: { addListener: jest.fn() } },
  };
}

/** Loads the real popup fresh: a new jsdom document body plus a fresh
 * dynamic import of every popup module (they hold module-level state, so
 * re-importing the same instance across tests would leak selection/cache
 * state between them). `jest.resetModules()` + a cache-busting query
 * param forces genuinely fresh module instances each call. */
async function loadPopup() {
  jest.resetModules();
  document.documentElement.innerHTML = html;
  setupBrowserMock();

  await import(`${path.join(POPUP_DIR, "issue_creator.js")}?t=${Date.now()}-${Math.random()}`);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
  await flush();
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function commitProject(project) {
  browser.runtime.sendMessage.mock.calls.length; // no-op, just documents intent
  incomingListener({ type: "project-list", projects: [project] });
  const search = document.getElementById("projectSearch");
  search.value = project.name_with_namespace;
  search.dispatchEvent(new Event("input", { bubbles: true }));
  const option = document.querySelector(".combobox-option[data-project-id]");
  option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

function sentTypes() {
  return browser.runtime.sendMessage.mock.calls.map((call) => call[0]?.type);
}

describe("project-dependent control visibility (Labels button, Assignee select)", () => {
  test("Labels button stays hidden until LABELS_LIST arrives, then appears", async () => {
    await loadPopup();
    const labelsBtn = document.getElementById("labelsButton");

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    expect(labelsBtn.hidden).toBe(true); // request sent, no reply yet

    incomingListener({ type: "labels-list", projectId: 1, labels: [{ id: 9, name: "bug" }], status: "ok" });
    await flush();
    expect(labelsBtn.hidden).toBe(false);
  });

  test("Labels button reappears immediately on a second selection of the same project, no second request", async () => {
    await loadPopup();
    const labelsBtn = document.getElementById("labelsButton");
    const project = { id: 1, name_with_namespace: "group/project" };

    commitProject(project);
    await flush();
    incomingListener({ type: "labels-list", projectId: 1, labels: [{ id: 9, name: "bug" }], status: "ok" });
    await flush();
    expect(labelsBtn.hidden).toBe(false);

    // Clear, then re-commit the same project within the same popup session.
    document.getElementById("projectSearch").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
    await flush();
    expect(labelsBtn.hidden).toBe(true);

    const requestsBefore = sentTypes().filter((t) => t === "request-labels").length;
    commitProject(project);
    await flush();

    expect(labelsBtn.hidden).toBe(false); // cache hit, visible without waiting
    const requestsAfter = sentTypes().filter((t) => t === "request-labels").length;
    expect(requestsAfter).toBe(requestsBefore); // no new request was sent
  });

  test("Labels button still becomes visible on a load error, so the error state is reachable", async () => {
    await loadPopup();
    const labelsBtn = document.getElementById("labelsButton");

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    incomingListener({ type: "labels-list", projectId: 1, labels: [], status: "error" });
    await flush();

    expect(labelsBtn.hidden).toBe(false);
  });

  test("Create button stays disabled until a project is selected, then enables", async () => {
    await loadPopup();
    const createBtn = document.getElementById("create");
    expect(createBtn.disabled).toBe(true);

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    expect(createBtn.disabled).toBe(false);
  });

  test("Create button disables again once the selection is cleared", async () => {
    await loadPopup();
    const createBtn = document.getElementById("create");

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    expect(createBtn.disabled).toBe(false);

    document.getElementById("projectSearch").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
    await flush();
    expect(createBtn.disabled).toBe(true);
  });

  test("Assignee select stays hidden until ASSIGNEES_LIST arrives, then appears", async () => {
    await loadPopup();
    const assigneeParent = document.getElementById("assigneeSelect").parentElement;

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    expect(assigneeParent.style.display).toBe("none");

    incomingListener({ type: "assignees-list", projectId: 1, assignees: [{ id: 5, name: "Bob" }], status: "ok" });
    await flush();
    expect(assigneeParent.style.display).toBe("block");
  });
});

describe("Attachments button visibility (gated on the email actually having attachments)", () => {
  test("stays hidden when the email has no attachments", async () => {
    await loadPopup();
    const attachmentsBtn = document.getElementById("attachmentsButton");
    expect(attachmentsBtn.hidden).toBe(true);

    incomingListener({ type: "initial-data", email: { subject: "x", attachments: [] } });
    await flush();
    expect(attachmentsBtn.hidden).toBe(true);
  });

  test("becomes visible once the email arrives with at least one attachment", async () => {
    await loadPopup();
    const attachmentsBtn = document.getElementById("attachmentsButton");

    incomingListener({
      type: "initial-data",
      email: { subject: "x", attachments: [{ partName: "1.2", name: "a.png" }] },
    });
    await flush();
    expect(attachmentsBtn.hidden).toBe(false);
  });
});

describe("GitLab-unreachable stale notice", () => {
  test("appears on PROJECTS_STALE and clears on the next successful PROJECT_LIST", async () => {
    await loadPopup();
    const notice = document.getElementById("projectsStaleNotice");
    expect(notice.hidden).toBe(true);

    incomingListener({ type: "projects-stale" });
    await flush();
    expect(notice.hidden).toBe(false);

    incomingListener({ type: "project-list", projects: [] });
    await flush();
    expect(notice.hidden).toBe(true);
  });
});

describe("inline create-issue error", () => {
  test("appears on ISSUE_CREATE_FAILED and clears on the next Create attempt", async () => {
    await loadPopup();
    const errorEl = document.getElementById("createError");
    expect(errorEl.hidden).toBe(true);

    incomingListener({ type: "issue-create-failed" });
    await flush();
    expect(errorEl.hidden).toBe(false);

    commitProject({ id: 1, name_with_namespace: "group/project" });
    await flush();
    document.getElementById("create").click();
    await flush();

    expect(errorEl.hidden).toBe(true);
  });
});
