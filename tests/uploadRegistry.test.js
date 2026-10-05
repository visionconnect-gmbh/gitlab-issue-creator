/**
 * @fileoverview Unit tests for src/popup/logic/uploadRegistry.js.
 *
 * The registry is DOM-free and fully dependency-injected, so it's tested
 * directly with fake `upload`/`remove`/text functions, no jsdom needed.
 * `getText`/`replaceText` are backed by a single mutable `let text` to
 * exercise real substring swapping, same as the editor does in practice.
 */
import { jest } from "@jest/globals";
import { createUploadRegistry } from "../src/popup/logic/uploadRegistry.js";

function makeHarness({ projectId = null } = {}) {
  let text = "";
  let currentProjectId = projectId;
  const uploadCalls = [];
  const removeCalls = [];
  const reportCalls = [];
  let nextId = 1;

  const upload = jest.fn(async (pid, file) => {
    const id = nextId++;
    uploadCalls.push({ projectId: pid, file });
    return {
      id,
      url: `/uploads/${id}/${file.name}`,
      markdown: `![${file.name}](/uploads/${id}/${file.name})`,
    };
  });

  /** For a test that needs to hold one upload call open: returns a promise
   * plus a `resolveWith()` to settle it, still drawn from the same id
   * sequence as every other call so a later real upload can't collide. */
  function pendingUpload() {
    const id = nextId++;
    const result = { id, url: `/uploads/${id}/pic.png`, markdown: `![pic.png](/uploads/${id}/pic.png)` };
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { result, promise, resolveWith: () => resolve(result) };
  }

  const remove = jest.fn(async (pid, upload) => {
    removeCalls.push({ projectId: pid, upload });
    return true;
  });

  const registry = createUploadRegistry({
    upload,
    remove,
    getProjectId: () => currentProjectId,
    getText: () => text,
    replaceText: (search, replacement) => {
      if (!text.includes(search)) return false;
      text = text.replace(search, replacement);
      return true;
    },
    reportUploads: (uploads) => reportCalls.push(uploads),
  });

  return {
    registry,
    upload,
    remove,
    uploadCalls,
    removeCalls,
    reportCalls,
    pendingUpload,
    getText: () => text,
    setText: (v) => { text = v; },
    setProjectId: (id) => { currentProjectId = id; },
  };
}

function file(name = "pic.png") {
  return new File(["data"], name, { type: "image/png" });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("uploadRegistry: image entries", () => {
  test("stays a sentinel and never uploads when no project is selected", async () => {
    const h = makeHarness({ projectId: null });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(`before ${sentinel} after`);

    await h.registry.flush();

    expect(h.upload).not.toHaveBeenCalled();
    expect(h.getText()).toBe(`before ${sentinel} after`);
  });

  test("uploads and swaps the sentinel for the real markdown once a project is set", async () => {
    const h = makeHarness({ projectId: null });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(`before ${sentinel} after`);

    h.setProjectId(7);
    await h.registry.flush();

    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.upload).toHaveBeenCalledWith(7, expect.any(File));
    expect(h.getText()).toBe("before ![pic.png](/uploads/1/pic.png) after");
  });

  test("coalesces several scheduleSync calls inside the debounce window into one reconcile", async () => {
    const h = makeHarness({ projectId: 7 });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);

    h.registry.scheduleSync();
    h.registry.scheduleSync();
    h.registry.scheduleSync();

    await jest.advanceTimersByTimeAsync(800);

    expect(h.upload).toHaveBeenCalledTimes(1);
  });
});

describe("uploadRegistry: project migration", () => {
  test("A to B: deletes the old upload, uploads to the new project, and rewrites the markdown", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    expect(h.getText()).toBe("![pic.png](/uploads/1/pic.png)");

    h.setProjectId("B");
    await h.registry.flush();

    expect(h.removeCalls).toEqual([
      { projectId: "A", upload: expect.objectContaining({ id: 1 }) },
    ]);
    expect(h.upload).toHaveBeenNthCalledWith(2, "B", expect.any(File));
    expect(h.getText()).toBe("![pic.png](/uploads/2/pic.png)");

    // delete-before-upload ordering
    expect(h.remove.mock.invocationCallOrder[0]).toBeLessThan(
      h.upload.mock.invocationCallOrder[1],
    );
  });

  test("project cleared: deletes the upload and reverts the text to the sentinel", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    h.setProjectId(null);
    await h.registry.flush();

    expect(h.removeCalls).toHaveLength(1);
    expect(h.getText()).toBe(sentinel);
  });

  test("converges when the project changes again while an upload is still in flight", async () => {
    const h = makeHarness({ projectId: "A" });
    const pending = h.pendingUpload();
    h.upload.mockImplementationOnce(() => pending.promise);

    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    const flushPromise = h.registry.flush();

    // `flush()` only runs synchronously up to the entry's `getFile()` await;
    // let that microtask settle so `upload()` is actually invoked before we
    // touch the project id.
    await Promise.resolve();
    await Promise.resolve();

    // Project changes to B before the in-flight upload (to A) resolves.
    h.setProjectId("B");
    h.registry.scheduleSync();

    pending.resolveWith();
    await flushPromise;
    // One more reconcile pass migrates the now-stale A upload to B.
    await h.registry.flush();

    expect(h.removeCalls).toEqual([
      { projectId: "A", upload: expect.objectContaining({ id: pending.result.id }) },
    ]);
    // Migrated to a fresh upload under B, not the one deleted from A.
    const [migrated] = h.reportCalls.at(-1);
    expect(migrated.projectId).toBe("B");
    expect(migrated.id).not.toBe(pending.result.id);
    expect(h.getText()).toContain(`/uploads/${migrated.id}/`);
    expect(h.getText()).not.toContain(pending.result.markdown);
  });

  test("does not delete the same upload twice across overlapping syncs", async () => {
    const h = makeHarness({ projectId: "A" });
    let resolveRemove;
    h.remove.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRemove = () => resolve(true); }),
    );

    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    h.setProjectId("B");
    const flushPromise = h.registry.flush(); // starts the slow remove()
    h.registry.scheduleSync(); // a second sync request while remove() is pending

    resolveRemove();
    await flushPromise;
    await h.registry.flush();

    expect(h.remove).toHaveBeenCalledTimes(1);
  });
});

describe("uploadRegistry: image removal detected from text", () => {
  test("deletes the upload when its markdown is removed from the description", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    h.setText("the image was deleted by the user");
    await h.registry.flush();

    expect(h.removeCalls).toHaveLength(1);
  });

  test("deletes a still-pending (never-uploaded) entry when its sentinel is removed", async () => {
    const h = makeHarness({ projectId: null });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    h.setText("sentinel gone");
    h.setProjectId("A");
    await h.registry.flush();

    // Never uploaded, so nothing to delete, and no upload should fire for
    // an entry the user already removed before a project was ever picked.
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.removeCalls).toHaveLength(0);
  });
});

describe("uploadRegistry: attachments", () => {
  function attachment(partName = "1.2", name = "report.pdf") {
    return { partName, name };
  }

  test("addAttachment returns a placeholder, exactly like addImage", () => {
    const h = makeHarness({ projectId: null });
    const placeholder = h.registry.addAttachment(attachment(), jest.fn());
    expect(placeholder).toBe("![report.pdf](pending-upload:att-1.2)");
  });

  test("stays a placeholder and never uploads when no project is selected", async () => {
    const h = makeHarness({ projectId: null });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment(), getFile);
    h.setText(`before ${placeholder} after`);

    await h.registry.flush();

    expect(h.upload).not.toHaveBeenCalled();
    expect(h.getText()).toBe(`before ${placeholder} after`);
  });

  test("uploads on add, re-invoking the getFile thunk rather than holding a File, once placed in the text", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment(), getFile);
    h.setText(placeholder);

    await h.registry.flush();

    expect(getFile).toHaveBeenCalledTimes(1);
    expect(h.upload).toHaveBeenCalledWith("A", expect.any(File));
    expect(h.getText()).toBe("![report.pdf](/uploads/1/report.pdf)");
  });

  test("addAttachment is idempotent: calling it again for the same partName returns the existing markdown without re-registering", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const first = h.registry.addAttachment(attachment(), getFile);
    h.setText(first);
    await h.registry.flush();

    const second = h.registry.addAttachment(attachment(), jest.fn());

    expect(second).toBe(first.replace("pending-upload:att-1.2", "/uploads/1/report.pdf"));
    expect(h.upload).toHaveBeenCalledTimes(1); // no second upload triggered
  });

  test("removeAttachment returns the current markdown to strip, and deletes the upload", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment(), getFile);
    h.setText(placeholder);
    await h.registry.flush();

    const markdown = h.registry.removeAttachment("1.2");

    expect(markdown).toBe("![report.pdf](/uploads/1/report.pdf)");
    expect(h.removeCalls).toHaveLength(1);
  });

  test("removeAttachment returns null for an attachment that was never registered", () => {
    const h = makeHarness({ projectId: "A" });
    expect(h.registry.removeAttachment("never-added")).toBeNull();
  });

  test("hasAttachment reflects registration regardless of upload state", async () => {
    const h = makeHarness({ projectId: null });
    expect(h.registry.hasAttachment("1.2")).toBe(false);

    const placeholder = h.registry.addAttachment(attachment(), jest.fn());
    h.setText(placeholder);
    expect(h.registry.hasAttachment("1.2")).toBe(true);

    h.registry.removeAttachment("1.2");
    expect(h.registry.hasAttachment("1.2")).toBe(false);
  });

  test("migrates to a new project by re-fetching the file via the thunk", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment(), getFile);
    h.setText(placeholder);
    await h.registry.flush();

    h.setProjectId("B");
    await h.registry.flush();

    expect(getFile).toHaveBeenCalledTimes(2);
    expect(h.upload).toHaveBeenNthCalledWith(2, "B", expect.any(File));
  });

  test("is pruned (and its upload deleted) when its markdown is removed from the description text, same as an image", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment(), getFile);
    h.setText(placeholder);
    await h.registry.flush();

    h.setText("the attachment markdown was deleted from the description");
    await h.registry.flush();

    expect(h.removeCalls).toHaveLength(1);
    expect(h.registry.entries("attachment")).toHaveLength(0);
  });

  test("entries('attachment') exposes the markdown shape the final issue body needs", async () => {
    const h = makeHarness({ projectId: "A" });
    const getFile = jest.fn(async () => file("report.pdf"));
    const placeholder = h.registry.addAttachment(attachment("1.2", "report.pdf"), getFile);
    h.setText(placeholder);
    await h.registry.flush();

    const [entry] = h.registry.entries("attachment");
    expect(entry.name).toBe("report.pdf");
    expect(entry.upload.markdown).toBe("![report.pdf](/uploads/1/report.pdf)");
  });
});

describe("uploadRegistry: hasUnresolved", () => {
  test("true while an image is still a pending sentinel", () => {
    const h = makeHarness({ projectId: null });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);

    expect(h.registry.hasUnresolved()).toBe(true);
  });

  test("false once every entry is uploaded under the current project", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    expect(h.registry.hasUnresolved()).toBe(false);
  });

  test("true again immediately after the project changes (migration not yet run)", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    h.setProjectId("B");
    expect(h.registry.hasUnresolved()).toBe(true);
  });
});

describe("uploadRegistry: reportUploads", () => {
  test("reports the full {projectId, id} list after a reconcile", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);
    await h.registry.flush();

    const last = h.reportCalls.at(-1);
    expect(last).toEqual([{ projectId: "A", id: 1 }]);
  });
});

describe("uploadRegistry: reset", () => {
  test("clears all entries and cancels a pending debounce", async () => {
    const h = makeHarness({ projectId: "A" });
    const sentinel = h.registry.addImage(file(), "pic.png");
    h.setText(sentinel);

    h.registry.reset();
    await jest.advanceTimersByTimeAsync(1000);

    expect(h.upload).not.toHaveBeenCalled();
    expect(h.registry.hasUnresolved()).toBe(false);
  });
});
