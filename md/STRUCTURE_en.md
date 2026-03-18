# Architecture & Structure – GitLab Issue Creator

> **Deutsche Version:** [STRUCTURE.md](./STRUCTURE.md)

This document explains **how the add-on is built and why** — intended for developers who need to understand, extend, or debug it. For user-facing settings, see [OPTIONS_en.md](./OPTIONS_en.md).

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
  │    ├─ Manages project/assignee cache
  │    └─ Opens the popup window and communicates via runtime messages
  │
  └─ Popup window  (opened on demand, destroyed on close)
       ├─ Renders the issue-creation form
       ├─ Talks to background via sendMessage
       └─ Does NOT call GitLab API directly — delegates to background
```

**Message flow** (all via `browser.runtime.sendMessage`):

| Direction | Message type | Payload | Defined in |
|---|---|---|---|
| Popup → Background | `popup-ready` | `tabId` | `Enums.js → Popup_MessageTypes` |
| Popup → Background | `request-initial-data` | — | |
| Background → Popup | `initial-data` | `{ email, projects }` | `Enums.js → MessageTypes` |
| Popup → Background | `request-assignees` | `projectId` | |
| Background → Popup | `assignees-list` | `{ projectId, assignees }` | |
| Popup → Background | `create-gitlab-issue` | `{ projectId, assignee, title, description, endDate, attachments }` | |

> 📎 All message type strings are defined in `src/utils/Enums.js`. If you add a new message, add it there first — do not use raw strings.

---

## Directory structure

```
.
├── background.js                 Extension entry point — imports src/background/
├── manifest.json                 WebExtension manifest (v2)
├── rollup.config.mjs             Bundler config; also merges split _locales JSON files
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
│   │   └── gitlab.js             High-level ops: validate settings, fetch projects/assignees,
│   │                             create issues, upload attachments
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
│   │   └── logic/
│   │       ├── popupState.js     Shared mutable state + EasyMDE editor instance
│   │       ├── ui.js             DOM helpers: render project list, assignees, attachments
│   │       └── handler/
│   │           ├── descriptionHandler.js  Builds Markdown issue body from parsed email
│   │           ├── issueHandler.js        "Create issue" button: attachment upload + API call
│   │           ├── projectHandler.js      Project search input and selection
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
│   │   ├── messages.json         Generated — do not edit directly (see Localization below)
│   │   └── json/                 Source files; merged into messages.json at build time
│   │       ├── extension.json
│   │       ├── fallback.json
│   │       ├── notification.json
│   │       ├── options.json
│   │       └── popup.json
│   └── de/                       Same structure as en/
│
├── tests/                        Jest unit tests
│   ├── attachmentHandler.test.js
│   ├── cache.test.js
│   ├── dateAuthorHandler.test.js
│   ├── emailParser.test.js
│   ├── forwardedHandler.test.js
│   ├── gitlab.test.js
│   └── textHandler.test.js
│
├── scripts/
│   ├── build.js                  Production build: runs rollup, stages files, zips to builds/
│   ├── bump-version.js           Bumps version in package.json + manifest.json atomically
│   ├── pack-src.js               Packs source into a zip (required by addons.mozilla.org)
│   ├── publish.js                AMO upload helper
│   └── utils/utils.js            Shared helpers for the build scripts
│
├── dist/                         Bundled output — generated, not committed
│   ├── bundled-background.js     + .map
│   ├── bundled-issue_creator.js  + .map
│   ├── bundled-options.js        + .map
│   └── libs/                     easymde.min.js + easymde.min.css (copied by rollup)
│
├── builds/                       Distributable zips — generated, not committed
└── icons/                        Extension icons: SVG source + PNG at 16/32/48/64 px
```

---

## Key modules explained

### `src/utils/Enums.js`
The single source of truth for:
- **`MessageTypes`** — messages sent *from* the background to the popup
- **`Popup_MessageTypes`** — messages sent *from* the popup to the background
- **`CacheKeys`** — every key used in `browser.storage.local`
- **`LocalizeKeys`** — every i18n key referenced in JS code

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
High-level operations built on top of `api.js`. Each function is self-contained: validates settings, checks cache, calls the API, writes to cache. Returns `null` / `[]` on failure — **no throws reach the UI layer**.

### `src/email/emailParser.js`
Orchestrates the four email handlers into a single `parseEmail(message)` call.  
The output object is what gets sent to the popup as part of `initial-data`.

### `_locales` split-file convention
Translation strings live in per-feature JSON files under `_locales/<lang>/json/`. At build time, `rollup.config.mjs` merges them into a single `_locales/<lang>/messages.json` that the browser reads. **Never edit `messages.json` directly** — your changes will be overwritten on the next build.

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

Rollup bundles three entry points into `dist/`:

| Entry | Output |
|---|---|
| `background.js` | `dist/bundled-background.js` |
| `src/popup/issue_creator.js` | `dist/bundled-issue_creator.js` |
| `src/options/options.js` | `dist/bundled-options.js` |

The `mergeLocalesJSONPlugin` in `rollup.config.mjs` runs once per build and merges the split locale JSON files.

```bash
npm run build:dev   # Unminified, with source maps (for development)
npm run build       # Minified + zipped into builds/ (for release)
```

### Loading in Thunderbird for development

1. `npm run build:dev`
2. Thunderbird → **Tools** → **Add-ons and Themes** → gear ⚙️ → **Debug Add-ons** → **Load Temporary Add-on…**
3. Select `manifest.json` in the project root.

Reload the temporary add-on after each rebuild.

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
| `emailParser.test.js` | Full end-to-end email parsing |
| `cache.test.js` | Settings CRUD, TTL logic, array merge helpers |
| `gitlab.test.js` | Settings validation, project/assignee fetch, issue creation |

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
3. Run a build — the merged `messages.json` for the new locale will be generated automatically.
4. Test by setting Thunderbird's display language to the new locale.
