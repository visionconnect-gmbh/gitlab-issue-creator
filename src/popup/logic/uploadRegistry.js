/**
 * @fileoverview Reconciles locally-picked images and selected email
 * attachments with GitLab uploads, so both sources share one eager-upload /
 * placeholder / delete lifecycle instead of the two inconsistent paths this
 * replaces (eager-but-project-required image upload vs. lazy at-create-time
 * attachment upload, neither of which ever deleted anything).
 *
 * Deliberately DOM-free and fully dependency-injected: every side effect
 * (upload, delete, reading/replacing the description text, reporting state
 * to the background script) is a function passed in by the caller, so this
 * module is unit-testable without a jsdom document. See popupState.js for
 * the real wiring.
 *
 * Every entry, image or attachment, carries a Markdown "sentinel"
 * placeholder (`![name](pending-upload:<key>)`) that lives directly in the
 * description text; swapping it for the real upload (or back) is a single
 * substring replace via `replaceText`. Images get it inserted at the
 * cursor by the editor's image-picker flow; attachments get it appended by
 * the caller (`addAttachment` returns it) or placed by drag-and-drop, see
 * `ui.js`/`attachmentDragDrop.js`. Either way, once the placeholder is in
 * the text, both sources are reconciled identically: uploaded, migrated on
 * a project change, and deleted if their placeholder/resolved markdown is
 * removed from the text.
 *
 * The reconciler is a single debounced, serialized loop rather than
 * per-entry in-flight tracking with generation counters: every entry's
 * desired state (its own `projectId`/`upload`) is written synchronously
 * before any await, so a result that lands after the project changed again
 * is never committed "wrongly": it's committed truthfully for the project
 * it was actually uploaded to, and the loop (which re-runs whenever
 * something changed mid-flight) migrates it on the next pass. That makes
 * the reconciliation convergent instead of needing to reject stale results.
 */

const SENTINEL_PREFIX = "pending-upload:";

function sentinelUrl(key) {
  return `${SENTINEL_PREFIX}${key}`;
}

function markdownFor(name, url) {
  return `![${name}](${url})`;
}

/** The placeholder Markdown inserted for an image entry before it has a real
 * upload: this, not the bare sentinel URL, is what actually appears in the
 * description text. */
function placeholderMarkdown(entry) {
  return markdownFor(entry.name, sentinelUrl(entry.key));
}

/**
 * @param {object} deps
 * @param {(projectId: string|number, file: File) => Promise<{id?: number, url: string, markdown: string}|null>} deps.upload
 * @param {(projectId: string|number, upload: {id?: number}) => Promise<boolean>} deps.remove
 * @param {() => string|number|null} deps.getProjectId
 * @param {() => string} deps.getText - current full description text
 * @param {(search: string, replacement: string) => boolean} deps.replaceText
 * @param {(uploads: Array<{projectId: string|number, id: number}>) => void} [deps.reportUploads]
 * @param {number} [deps.debounceMs]
 */
export function createUploadRegistry({
  upload,
  remove,
  getProjectId,
  getText,
  replaceText,
  reportUploads = () => {},
  debounceMs = 800,
}) {
  /** @type {Map<string, { key: string, source: "image"|"attachment", name: string, getFile: () => Promise<File|null>, projectId: string|number|null, upload: object|null }>} */
  const entries = new Map();
  let imageCounter = 0;

  let timer = null;
  let running = null;
  let dirty = false;

  function report() {
    reportUploads(
      [...entries.values()]
        .filter((e) => e.upload?.id != null)
        .map((e) => ({ projectId: e.projectId, id: e.upload.id })),
    );
  }

  function scheduleSync() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void runSync(), debounceMs);
  }

  function runSync() {
    if (running) return running;
    running = (async () => {
      try {
        while (dirty) {
          dirty = false;
          await reconcileOnce();
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Cancels the pending debounce and runs reconciliation to completion now. */
  function flush() {
    clearTimeout(timer);
    dirty = true;
    return runSync();
  }

  async function reconcileOnce() {
    const projectId = getProjectId();

    pruneRemovedEntries();

    for (const entry of [...entries.values()]) {
      if (!textHasEntry(entry)) {
        // Detected as removed from the description text itself; dropped by
        // pruneRemovedEntries() above. Nothing left to reconcile for it.
        continue;
      }

      if (!entry.upload) {
        if (projectId) await resolveEntry(entry, projectId);
        continue;
      }

      if (entry.projectId !== projectId) {
        await migrateEntry(entry, projectId);
      }
    }

    report();
  }

  function textHasEntry(entry) {
    const text = getText();
    return text.includes(placeholderMarkdown(entry)) || (entry.upload && text.includes(entry.upload.markdown));
  }

  /** Drops any entry (image or attachment alike) whose placeholder/resolved
   * markdown is no longer present in the description text: the text is
   * the single source of truth for "is this still wanted." */
  function pruneRemovedEntries() {
    for (const entry of [...entries.values()]) {
      if (textHasEntry(entry)) continue;

      entries.delete(entry.key);
      if (entry.projectId && entry.upload) {
        const old = entry.upload;
        const oldProjectId = entry.projectId;
        void remove(oldProjectId, old);
      }
    }
  }

  async function resolveEntry(entry, projectId) {
    const file = await entry.getFile();
    if (!file) return;

    const result = await upload(projectId, file);
    if (!result) return;

    entry.projectId = projectId;
    entry.upload = result;
    replaceText(placeholderMarkdown(entry), result.markdown);
  }

  async function migrateEntry(entry, projectId) {
    const old = entry.upload;
    const oldProjectId = entry.projectId;
    entry.upload = null;
    entry.projectId = null;
    await remove(oldProjectId, old);

    // Revert to the placeholder first so there's always exactly one
    // reference to migrate from, whether or not a new project is set yet.
    replaceText(old.markdown, placeholderMarkdown(entry));

    if (projectId) await resolveEntry(entry, projectId);
  }

  /**
   * Registers a locally-picked image. Always returns a placeholder Markdown
   * image (`![name](pending-upload:<key>)`) synchronously: the editor needs
   * *something* to insert the instant the file is picked (see
   * popupState.js's onPickImage contract), and lets the debounced
   * reconciler perform the actual upload and swap it in, even when a project
   * is already selected. The resulting one-reconcile-cycle delay before the
   * placeholder resolves is invisible in practice (well under the debounce
   * window) and keeps this function's contract simple and uniform.
   *
   * @param {File} file
   * @param {string} name
   * @returns {string} Placeholder Markdown to insert into the description now.
   */
  function addImage(file, name) {
    const key = `img-${++imageCounter}`;
    const entry = {
      key,
      source: "image",
      name,
      getFile: async () => file,
      projectId: null,
      upload: null,
    };
    entries.set(key, entry);
    scheduleSync();
    return placeholderMarkdown(entry);
  }

  /**
   * Registers a selected email attachment and returns its placeholder
   * Markdown, exactly like `addImage`: the caller inserts this into the
   * description text wherever it belongs (end of text by default; a
   * specific offset when placed via drag-and-drop). `getFile` is a thunk
   * so the actual File is fetched lazily (and re-fetched on a project
   * migration) instead of being held in memory for the whole popup
   * session. Idempotent: calling this again for an already-registered
   * attachment just returns its existing placeholder/resolved markdown
   * without creating a second entry, used by drag-and-drop to "place" an
   * attachment that may or may not already be checked.
   *
   * @param {{ partName: string, name: string }} attachment
   * @param {() => Promise<File|null>} getFile
   * @returns {string} Markdown to insert into the description now.
   */
  function addAttachment(attachment, getFile) {
    const key = `att-${attachment.partName}`;
    const existing = entries.get(key);
    if (existing) return existing.upload?.markdown ?? placeholderMarkdown(existing);

    const entry = {
      key,
      source: "attachment",
      name: attachment.name,
      getFile,
      projectId: null,
      upload: null,
    };
    entries.set(key, entry);
    scheduleSync();
    return placeholderMarkdown(entry);
  }

  /** Unregisters an attachment by partName, deleting its upload if one
   * exists, and returns the markdown (placeholder or resolved) it was
   * last known by: the caller strips that exact string from the
   * description text. Returns null if the attachment wasn't registered. */
  function removeAttachment(partName) {
    const key = `att-${partName}`;
    const entry = entries.get(key);
    if (!entry) return null;
    entries.delete(key);
    const markdown = entry.upload?.markdown ?? placeholderMarkdown(entry);
    if (entry.projectId && entry.upload) {
      void remove(entry.projectId, entry.upload);
    }
    report();
    return markdown;
  }

  /** Whether an attachment (by partName) is currently registered, pending
   * or uploaded. Used to initialize the picker's checkbox state without
   * keeping a parallel "selected attachments" list. */
  function hasAttachment(partName) {
    return entries.has(`att-${partName}`);
  }

  /** True while any entry is unresolved (no upload yet) or uploaded under a
   * project other than the one currently selected, i.e. not safe to create
   * the issue yet. */
  function hasUnresolved() {
    const projectId = getProjectId();
    for (const entry of entries.values()) {
      if (!entry.upload || entry.projectId !== projectId) return true;
    }
    return false;
  }

  function listEntries(source) {
    return [...entries.values()].filter((e) => e.source === source && e.upload);
  }

  function reset() {
    clearTimeout(timer);
    dirty = false;
    entries.clear();
    imageCounter = 0;
  }

  return {
    addImage,
    addAttachment,
    removeAttachment,
    hasAttachment,
    scheduleSync,
    flush,
    hasUnresolved,
    entries: listEntries,
    reset,
  };
}
