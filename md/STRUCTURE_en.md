# Architecture & Structure – GitLab Issue Creator

> **Deutsche Version:** [STRUCTURE.md](./STRUCTURE.md)

This document explains **how the add-on is built and why**, intended for developers who need to understand, extend, or debug it. For user-facing settings, see [OPTIONS_en.md](./OPTIONS_en.md).

---

## What it is

A Thunderbird WebExtension (Manifest v2) that creates GitLab issues from emails. You open an email, click the toolbar button, and the add-on pre-fills a popup with the email's subject, body, and attachments so you can submit it directly as a GitLab issue.

---

## High-level architecture

The add-on follows the standard WebExtension background/popup split:

```
Thunderbird
  │
  ├─ Background script  (always running, one instance)
  │    ├─ Reads selected email via messenger.mailTabs API
  │    ├─ Parses email content
  │    ├─ Manages project/assignee/label cache
  │    └─ Opens the popup window and communicates via runtime messages
  │
  └─ Popup window  (opened on demand, destroyed on close)
       ├─ Renders the issue-creation form
       ├─ Talks to background via sendMessage for projects, project search,
       │  assignees, and issue creation
       └─ Calls the GitLab API directly for the current user and
          attachment upload/delete, since those don't need background's
          cross-popup in-memory cache
```

**Message flow** (all via `browser.runtime.sendMessage`):

| Direction | Message type | Payload | Defined in |
|---|---|---|---|
| Popup → Background | `popup-ready` | `tabId` | `Enums.js → Popup_MessageTypes` |
| Popup → Background | `request-initial-data` | none | |
| Background → Popup | `initial-data` | `{ email, projects }` | `Enums.js → MessageTypes` |
| Popup → Background | `request-assignees` | `projectId` | |
| Background → Popup | `assignees-list` | `{ projectId, assignees, status }` | |
| Popup → Background | `request-labels` | `projectId` | |
| Background → Popup | `labels-list` | `{ projectId, labels, status }` | |
| Popup → Background | `create-gitlab-issue` | `{ projectId, assignee, title, description, endDate, labels }` | |

> 📎 All message type strings are defined in `src/utils/Enums.js`. If you add a new message, add it there first: do not use raw strings.

---

## Directory structure

```
.
├── background.js                 Extension entry point; imports src/background/
├── background.html               Loads background.js as a module (manifest's background.page)
├── manifest.json                 WebExtension manifest (v2)
├── jest.config.mjs               Test runner config
├── package.json
│
├── src/
│   ├── background/
│   │   ├── backgroundState.js    In-memory state (popup window ID, cached email, projects…)
│   │   └── handler/
│   │       ├── messageHandler.js Dispatches incoming browser.runtime messages by type
│   │       └── popupHandler.js   Opens/focuses/closes the popup window
│   │
│   ├── email/
│   │   ├── emailParser.js        Top-level orchestrator; calls the handlers below in order
│   │   └── handler/
│   │       ├── attachmentHandler.js  Traverses MIME tree to find attachments
│   │       ├── dateAuthorHandler.js  Extracts and remaps From/Date header lines
│   │       ├── forwardedHandler.js   Detects and extracts forwarded message blocks
│   │       └── textHandler.js        MIME part discovery, signature stripping, quote splitting
│   │
│   ├── gitlab/
│   │   ├── api.js                Low-level HTTP client (fetch wrappers, 401 handling)
│   │   └── gitlab.js             High-level ops: validate settings, fetch projects/assignees/
│   │                             labels, create issues, upload attachments
│   │
│   ├── options/
│   │   ├── options.html          Options page markup
│   │   ├── options.js            Entry point; wires up handlers
│   │   └── logic/handler/
│   │       ├── alertHandler.js   Shows inline status messages
│   │       ├── cacheHandler.js   Cache-clear button logic
│   │       ├── toggleHandler.js  Checkbox toggle logic (watermark, assignees, cache)
│   │       ├── tokenHandler.js   Token field + "Create Token" button logic
│   │       └── urlHandler.js     GitLab URL field validation and save
│   │
│   ├── popup/
│   │   ├── issue_creator.html    Popup markup
│   │   ├── issue_creator.js      Entry point; sends popup-ready, wires up handlers
│   │   ├── popup.css
│   │   ├── editor.css            Styles for the native Markdown editor (editor/ below)
│   │   └── logic/
│   │       ├── popupState.js     Shared mutable state + the editor/uploadRegistry/pickerModal
│   │       │                     instances
│   │       ├── uploadRegistry.js DOM-free reconciler: eager-uploads editor images AND email
│   │       │                     attachments (same lifecycle for both, each carries a text
│   │       │                     placeholder), swaps placeholders for real links, deletes from
│   │       │                     GitLab on removal/project change. Fully dependency-injected,
│   │       │                     so this is the one popup/ module with real unit tests.
│   │       ├── pickerModal.js    Shared searchable-multiselect modal behind the attachment and
│   │       │                     label pickers; configuration-driven, drag-and-drop optional
│   │       ├── attachmentDragDrop.js  Drop target on the description textarea: places an
│   │       │                     attachment at the exact pixel dropped, via editor/caretPosition.js
│   │       ├── ui.js             DOM helpers: render project combobox, assignees, the two pickers
│   │       ├── editor/           In-house Markdown editor (replaces the old EasyMDE dependency)
│   │       │   ├── editor.js     DOM adapter: toolbar, keyboard shortcuts, preview wiring,
│   │       │   │                 autosave. Exposes the same `.value()` get/set the rest of
│   │       │   │                 the app uses: this is the whole seam.
│   │       │   ├── commands.js   Pure functions: (text, selStart, selEnd) -> replacement.
│   │       │   │                 No DOM; this is what's unit-tested directly.
│   │       │   ├── markdown.js   Small Markdown-subset parser for the preview pane only,
│   │       │   │                 not CommonMark, deliberately. Also exports `isSafeUrl`.
│   │       │   ├── preview.js    Renders parsed blocks to DOM via createElement/textContent
│   │       │   │                 only (no innerHTML): the one real security boundary here.
│   │       │   └── caretPosition.js  Maps a drop's pixel position to a character offset in
│   │       │                     the textarea (mirror-div + caretPositionFromPoint)
│   │       └── handler/
│   │           ├── descriptionHandler.js  Builds the base Markdown issue body from parsed email
│   │           ├── issueHandler.js        "Create issue" button: flushes pending uploads + API call
│   │           ├── projectHandler.js      Project combobox: filtering, keyboard nav, selection
│   │           └── resetHandler.js        Resets popup form state
│   │
│   └── utils/
│       ├── cache.js              browser.storage.local abstraction (settings + TTL cache)
│       ├── Enums.js              All constants: message types, storage keys, i18n keys
│       ├── localize.js           Applies data-i18n attributes to the DOM at runtime
│       └── utils.js              Shared helpers: notifications, popup control, language
│
├── _locales/
│   ├── en/
│   │   ├── messages.json         Generated; do not edit directly (see Localization below)
│   │   └── json/                 Source files; merged into messages.json at build time
│   │       ├── extension.json
│   │       ├── fallback.json
│   │       ├── notification.json
│   │       ├── options.json
│   │       └── popup.json
│   └── de/                       Same structure as en/
│
├── tests/                        Jest unit tests
│   ├── api.test.js               HTTP layer: timeout, retry/backoff, dedup, 304 (node env)
│   ├── attachmentHandler.test.js
│   ├── cache.test.js
│   ├── changelog.test.js
│   ├── dateAuthorHandler.test.js
│   ├── editorCommands.test.js    Pure editor command functions (node env)
│   ├── editorDom.test.js         Toolbar/keyboard/preview wiring (jsdom env)
│   ├── emailParser.test.js
│   ├── emailParser.regression.test.js
│   ├── forwardedHandler.test.js
│   ├── gitlab.test.js
│   ├── htmlHandler.test.js
│   ├── markdown.test.js          The preview's Markdown-subset parser
│   ├── pickerModal.test.js       Shared attachment/label picker (jsdom)
│   ├── requestCount.test.js      Measured request counts against the GitLab probe fixture
│   ├── transformToMarkdown.test.js
│   ├── textHandler.test.js
│   └── uploadRegistry.test.js    Eager-upload/placeholder/delete reconciler (node env, no DOM)
│
├── scripts/
│   ├── probe-gitlab.mjs          Probes pagination/ETag/rate-limit behavior of a real
│   │                             GitLab instance; writes a fixture to tests/fixtures/gitlab/
│   ├── build.js                  Production build: merges locales, copies an explicit
│   │                             allowlist of files, zips to builds/; no bundler
│   ├── merge-locales.js          Merges _locales/<lang>/json/*.json into messages.json
│   ├── bump-version.js           Bumps version in package.json + manifest.json atomically
│   ├── pack-src.js               Packs source into a zip (kept available on request; no
│   │                             longer required since the XPI ships unbundled source)
│   ├── publish.js                ATN upload helper (addons.thunderbird.net)
│   └── utils/
│       ├── utils.js              Shared helpers for the build scripts
│       ├── atn.js                ATN API client (v4 signing endpoint)
│       └── changelog.js          CHANGELOG.md parsing + ATN HTML renderer
│
├── builds/                       Distributable XPIs; generated, not committed
├── REVIEWERS.md                  Testing instructions for addons.thunderbird.net reviewers
└── icons/                        Extension icons: SVG source + PNG at 16/32/48/64 px
```

There is no `dist/` and no bundler: the XPI ships the hand-written ES modules
under `src/` directly (`manifest.json`'s `background.page` points at
`background.html`, which loads `background.js` as an ES module; the popup
and options pages load their entry scripts the same way). This keeps every
shipped file readable without a separate source submission.

---

## Key modules explained

### `src/utils/Enums.js`
The single source of truth for:
- **`MessageTypes`**: messages sent *from* the background to the popup
- **`Popup_MessageTypes`**: messages sent *from* the popup to the background
- **`CacheKeys`**: every key used in `browser.storage.local`
- **`LocalizeKeys`**: every i18n key referenced in JS code

When you add a new feature that involves messaging, storage, or i18n, add constants here first.

### `src/utils/cache.js`
Two distinct layers over `browser.storage.local`:

| Layer | Functions | TTL | Use for |
|---|---|---|---|
| **Settings** (persistent) | `getSetting` / `setSetting` | none | Credentials, user preferences |
| **Cache** (TTL-aware) | `getCache` / `setCache` | configurable | API responses |

Cache entries are stored with a `cache_` prefix and a `{ data, timestamp }` envelope. When the user enables "Disable cache", `setCache` becomes a no-op but reads still work (they just always return stale/null, forcing a fresh fetch).

### `src/gitlab/api.js`
Thin `fetch` wrappers. Responsibilities:
- Resolves the base URL from storage once and reuses it (module-level variable `_apiBaseUrl`)
- Handles 401 by showing a notification and opening the Options page
- `doRequest` → `apiGet` / `apiPost` / `apiPut` / `apiDelete` are the four public helpers

### `src/gitlab/gitlab.js`
High-level operations built on top of `api.js`. Each function is self-contained: validates settings, checks cache, calls the API, writes to cache. Returns `null` / `[]` on failure: **no throws reach the UI layer**.

### `src/email/emailParser.js`
Orchestrates the five email handlers (including `htmlHandler.js`, which
flattens an HTML body into `>`-quoted text before parsing; it never renders
HTML back into the UI) into a single `getEmailContent(message)` call.
The output object is what gets sent to the popup as part of `initial-data`.

### `src/popup/logic/editor/`
Replaces the third-party EasyMDE (CodeMirror 5) dependency with a native
`<textarea>` plus a small toolbar. Deliberately not a general rich-text
editor: the description field was always Markdown *source*, consumed as a
Markdown string by GitLab's issue API, so there is no HTML anywhere on this
path. `commands.js` is pure and unit-tested directly; `editor.js` is the only
module that touches the DOM for editing (building the toolbar, wiring
`Ctrl+B`/`Ctrl+I`/`Ctrl+K`, applying edits via `execCommand("insertText")` so
the browser's native undo keeps working); `markdown.js` + `preview.js` render
an optional, intentionally small Markdown subset for the preview toggle,
not a CommonMark implementation, and not meant to become one.

### `_locales` split-file convention
Translation strings live in per-feature JSON files under `_locales/<lang>/json/`. At build time, `scripts/merge-locales.js` merges them into a single `_locales/<lang>/messages.json` that the browser reads. **Never edit `messages.json` directly**: your changes will be overwritten on the next build.

---

## Caching strategy

| Data | TTL | Notes |
|---|---|---|
| Current user | 24 h | Profile rarely changes |
| Projects | ~5 days (TTL_9H × 13.5) | Incremental refresh: only projects with an ID newer than the highest cached ID are re-fetched |
| Assignees | 9 h | Stored as `{ [projectId]: [...members] }` to minimise storage keys |

TTL constants are defined at the top of `src/gitlab/gitlab.js` (`TTL_9H_MS`, `TTL_24H_MS`, `TTL_PROJECT_MS`).

---

## Build system

No bundler. The XPI is the repository's `src/` files plus `background.js`,
`background.html`, `manifest.json`, `icons/`, and the merged
`_locales/<lang>/messages.json`, copied verbatim by `scripts/build.js` from
an explicit allowlist (`INCLUDE_PATHS`), not filtered out of everything via
a denylist. Nothing is minified or transpiled.

```bash
npm run build:dev   # Just merges locale JSON: for loading unpacked in Thunderbird
npm run build       # Merges locales, stages the allowlist, zips into builds/
npm run lint        # Builds, then runs addons-linter against the XPI
```

### Loading in Thunderbird for development

1. `npm run build:dev`
2. Thunderbird → **Tools** → **Add-ons and Themes** → gear ⚙️ → **Debug Add-ons** → **Load Temporary Add-on…**
3. Select `manifest.json` in the project root.

Reload the temporary add-on after each change, same as before, but there is
no rebuild step to wait on first: `src/` files are loaded directly, so only
`npm run build:dev` (for a locale edit) or nothing at all needs to run
before reloading.

### Versioning

```bash
npm run version:patch   # 7.0.0 → 7.0.1
npm run version:minor   # 7.0.0 → 7.1.0
npm run version:major   # 7.0.0 → 8.0.0
```

`scripts/bump-version.js` updates both `package.json` and `manifest.json` atomically.

---

## Tests

The suite uses [Jest](https://jestjs.io/) with native ES module support.

```bash
npm test                          # Run all tests
npm run test:coverage             # With coverage report
npm test -- tests/cache.test.js   # Single file
npm test -- --watch               # Watch mode
```

Browser APIs (`browser.storage`, `browser.messages`, etc.) are mocked inside each test file. No real network calls are made.

| Test file | What it covers |
|---|---|
| `textHandler.test.js` | MIME part discovery, signature stripping, quote splitting |
| `attachmentHandler.test.js` | MIME tree traversal, type filtering |
| `dateAuthorHandler.test.js` | From/Date header parsing and remapping |
| `forwardedHandler.test.js` | Forwarded block extraction |
| `htmlHandler.test.js` | HTML body → quoted-text flattening |
| `emailParser.test.js` | Full end-to-end email parsing |
| `emailParser.regression.test.js` | Fixed-fixture regression cases for past parser bugs |
| `cache.test.js` | Settings CRUD, TTL/ETag freshness metadata, stale-but-not-deleted reads, array merge helpers |
| `gitlab.test.js` | Settings validation, cache-first project/assignee/label fetch + ETag revalidation, pagination, server-side search, recently-used projects, issue creation (incl. the `labels` payload field), upload delete |
| `api.test.js` | HTTP layer: timeout vs. caller cancellation, retry/backoff, `Retry-After`, GET deduplication, paginated/conditional (`304`) requests |
| `requestCount.test.js` | Measured GitLab request counts for cold start, warm start, search, and assignee loading against the recorded probe fixture |
| `uploadRegistry.test.js` | Eager-upload/placeholder-swap/delete reconciliation (images AND attachments, same lifecycle), project migration, convergence under churn |
| `pickerModal.test.js` | Shared attachment/label picker modal: search filter, checkbox toggle, draggable-per-config, close paths (jsdom) |
| `changelog.test.js` | CHANGELOG.md parsing and the ATN-safe HTML renderer |
| `editorCommands.test.js` | Pure Markdown editing commands (bold/list/link/…) |
| `editorDom.test.js` | Toolbar, keyboard shortcuts, preview toggle (jsdom) |
| `markdown.test.js` | The preview's Markdown-subset parser, incl. unsafe-URL rejection |
| `transformToMarkdown.test.js` | `<br>` insertion skips code fences, tables, and lists |

---

## Adding a new option

1. Add a key constant to `CacheKeys` in `src/utils/Enums.js`.
2. Add the HTML for the control to `src/options/options.html`.
3. Add a handler in `src/options/logic/handler/` (or extend an existing one like `toggleHandler.js`).
4. Add the i18n strings to `_locales/en/json/options.json` and `_locales/de/json/options.json`.
5. Add matching keys to `LocalizeKeys.OPTIONS` in `Enums.js`.
6. Document it in `md/OPTIONS_en.md` and `md/OPTIONS.md`.

## Adding a new message type

1. Add the string constant to the appropriate enum in `Enums.js` (`MessageTypes` or `Popup_MessageTypes`).
2. Add a case to `messageHandler.js`.
3. Update this doc's message-flow table.

## Adding a translation

1. Copy `_locales/en/json/` to `_locales/<locale_code>/json/`.
2. Translate the `message` values (do **not** change the keys).
3. Run a build: the merged `messages.json` for the new locale will be generated automatically.
4. Test by setting Thunderbird's display language to the new locale.
