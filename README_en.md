# GitLab Issue Creator – Thunderbird Add-on

**Deutsche Version:** [README](./README.md)

A Thunderbird add-on that lets you create GitLab issues directly from emails – with one click, without ever leaving your inbox.

---

## Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Developer Guide](#developer-guide)
   - [Project Structure](#project-structure)
   - [Architecture Overview](#architecture-overview)
   - [Building](#building)
   - [Running Tests](#running-tests)
   - [Adding Translations](#adding-translations)
6. [Contributing](#contributing)
7. [License](#license)

---

## Features

| Feature | Details |
|---|---|
| **One-click issue creation** | Open the popup from any email and create a GitLab issue immediately. |
| **Auto-populated title** | The email subject becomes the issue title (editable). |
| **Full conversation context** | The entire email thread is rendered as Markdown in the issue description. |
| **Forwarded message support** | Forwarded messages are detected and included as a nested block. |
| **File attachments** | Select email attachments to upload to GitLab and link in the issue. |
| **Assignee selection** | Pick a GitLab project member to assign the issue to. |
| **Due date** | Set an optional issue due date from the popup. |
| **Watermark** | Optionally add a hidden HTML comment marking the issue as auto-generated. |
| **Caching** | Projects and assignees are cached locally to keep the popup fast. |
| **Multilingual** | Ships with English and German (`en` / `de`) localisations. |

---

## Installation

### From Thunderbird Add-ons (recommended)

1. Open Thunderbird.
2. Click the hamburger menu (☰) → **Add-ons and Themes**.
3. Search for **GitLab Issue Creator**.
4. Click **Add to Thunderbird** and confirm.

### From file

1. Download the latest `.xpi` from [addons.thunderbird.net](https://addons.thunderbird.net/thunderbird/addon/gitlab-issue-creator).
2. In Thunderbird: hamburger menu → **Add-ons and Themes** → gear icon (⚙️) → **Install Add-on From File…**
3. Select the downloaded file.

---

## Quick Start

1. Open an email.
2. Click the **GitLab Issue Creator** button in the toolbar.
3. On first use, enter your GitLab URL and a Personal Access Token in the Options page that opens automatically.
4. Back in the popup:
   - Search for and select a **project**.
   - Adjust the **title** and **description** if needed.
   - Optionally pick an **assignee**, a **due date**, and **attachments**.
5. Click **Create issue** – done!

---

## Configuration

Open **Add-ons and Themes → GitLab Issue Creator → Options** to configure the add-on.

### Required settings

| Setting | Description |
|---|---|
| **GitLab URL** | Base URL of your GitLab instance, e.g. `https://gitlab.example.com`. |
| **Personal Access Token** | Token with `api` scope. [How to create one →](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) |

### Optional settings

| Setting | Default | Description |
|---|---|---|
| Enable assignee loading | off | Fetch project members so you can assign issues. Adds one API call per project. |
| Watermark | on | Append `<!-- created with gitlab-issue-creator (vX.Y.Z) -->` to every issue description. |
| Disable caching | off | Skip local caching of API responses (useful for debugging or shared machines). |

### Cache management

The Options page provides buttons to clear individual caches (projects, assignees) or wipe all add-on data for a clean slate.

---

## Developer Guide

### Project Structure

```
thunderbird-gitlab-issue/
│
├── src/                          Main source code
│   ├── background/               Background script (persists for the add-on lifetime)
│   │   ├── backgroundState.js    In-memory state: popup window ID, email, projects, …
│   │   └── handler/
│   │       ├── messageHandler.js Dispatches incoming browser.runtime messages
│   │       └── popupHandler.js   Opens/closes the popup window, sends data to it
│   │
│   ├── email/                    Email parsing
│   │   ├── emailParser.js        Top-level parser; orchestrates the handlers below
│   │   └── handler/
│   │       ├── attachmentHandler.js  Finds MIME attachment parts
│   │       ├── dateAuthorHandler.js  Extracts and remaps "From / Date" header lines
│   │       ├── forwardedHandler.js   Detects and strips forwarded message blocks
│   │       └── textHandler.js        MIME part discovery, signature removal, quote splitting
│   │
│   ├── gitlab/                   GitLab integration
│   │   ├── api.js                Low-level HTTP client (fetch wrappers + error handling)
│   │   └── gitlab.js             High-level operations: projects, assignees, issues, uploads
│   │
│   ├── options/                  Options page
│   │   ├── options.html
│   │   ├── options.js            Entry point for the Options page
│   │   └── logic/handler/        Individual settings-page action handlers
│   │
│   ├── popup/                    Issue-creation popup
│   │   ├── issue_creator.html
│   │   ├── issue_creator.js      Entry point for the popup
│   │   ├── popup.css
│   │   └── logic/
│   │       ├── popupState.js     Shared mutable state and EasyMDE instance
│   │       ├── ui.js             DOM rendering helpers (project list, assignees, attachments)
│   │       └── handler/
│   │           ├── descriptionHandler.js  Builds the Markdown issue description
│   │           ├── issueHandler.js        Create-button handler, attachment upload flow
│   │           ├── projectHandler.js      Project search and selection
│   │           └── resetHandler.js        Resets popup state
│   │
│   └── utils/
│       ├── cache.js              browser.storage.local abstraction (settings + TTL cache)
│       ├── Enums.js              Frozen constant objects: message types, cache keys, i18n keys
│       ├── localize.js           Applies data-i18n attributes to the DOM
│       └── utils.js              Shared helpers: notifications, popup open/close, language
│
├── _locales/                     i18n message files
│   ├── en/                       English
│   └── de/                       German
│
├── tests/                        Unit tests (Jest)
│   ├── attachmentHandler.test.js
│   ├── cache.test.js
│   ├── dateAuthorHandler.test.js
│   ├── emailParser.test.js
│   ├── forwardedHandler.test.js
│   ├── gitlab.test.js
│   └── textHandler.test.js
│
├── scripts/                      Build and release scripts
│   ├── build.js                  Production build (rollup + zip)
│   ├── bump-version.js           Semver bumper for package.json + manifest.json
│   ├── pack-src.js               Packs the source into a zip (required by AMO)
│   └── publish.js                AMO upload helper
│
├── dist/                         Bundled output (generated, not committed)
├── icons/                        Extension icons (SVG + PNG at 16/32/48/64 px)
├── background.js                 Extension entry point (imports background/)
├── manifest.json                 WebExtension manifest (v2)
├── rollup.config.mjs             Rollup bundler configuration
├── jest.config.mjs               Jest test runner configuration
└── package.json
```

### Architecture Overview

The add-on follows the standard WebExtension background/popup split:

```
Thunderbird
  │
  ├─ Background script (background.js)      ← always running
  │    ├─ Listens for toolbar-button clicks
  │    ├─ Reads the selected email via messenger.mailTabs API
  │    └─ Opens the popup window
  │
  └─ Popup window (issue_creator.html)      ← opened on demand
       ├─ Sends POPUP_READY to background
       ├─ Receives INITIAL_DATA (email + cached projects)
       ├─ Lets the user edit title / description / attachments
       └─ Sends CREATE_GITLAB_ISSUE to background
            └─ Background calls GitLab API → shows notification
```

**Message flow** (all via `browser.runtime.sendMessage`):

| Direction | Message type | Payload |
|---|---|---|
| Popup → Background | `popup-ready` | `tabId` |
| Popup → Background | `request-initial-data` | — |
| Background → Popup | `initial-data` | `{ email, projects }` |
| Popup → Background | `request-assignees` | `projectId` |
| Background → Popup | `assignees-list` | `{ projectId, assignees }` |
| Popup → Background | `create-gitlab-issue` | `{ projectId, assignee, title, description, endDate }` |

**Caching strategy:**

| Data | TTL | Notes |
|---|---|---|
| Current user | 24 h | Rarely changes. |
| Projects | ~5 days | Incremental refresh: only projects newer than the highest cached ID are re-fetched. |
| Assignees | 9 h | Stored as a single map `{ [projectId]: [...] }` to minimise storage keys. |

### Building

```bash
# Install dependencies
npm install

# Development build (unminified, with source maps)
npm run build:dev

# Production build (minified, zipped)
npm run build

# Bump patch/minor/major version
npm run version:patch
npm run version:minor
npm run version:major
```

The production build writes the bundled files to `dist/` and creates a distributable `.zip` in `builds/`.

**Loading the add-on in Thunderbird for development:**

1. Run `npm run build:dev`.
2. Open Thunderbird → **Tools** → **Add-ons and Themes**.
3. Click the gear icon (⚙️) → **Debug Add-ons** → **Load Temporary Add-on…**
4. Select `manifest.json` in the project root.

### Running Tests

The test suite uses [Jest](https://jestjs.io/) with native ES module support.

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run a specific test file
npm test -- tests/cache.test.js

# Watch mode (re-run on file changes)
npm test -- --watch
```

> **Note:** Tests run in Node.js, not a browser. Browser APIs (`browser.storage`, `browser.messages`, etc.) are mocked inside each test file. The GitLab API client (`api.js`) is mocked in `gitlab.test.js` so no real network calls are made.

#### What is tested

| Test file | Module under test | Coverage focus |
|---|---|---|
| `textHandler.test.js` | `email/handler/textHandler.js` | MIME part discovery, signature stripping, quote splitting |
| `attachmentHandler.test.js` | `email/handler/attachmentHandler.js` | MIME tree traversal, type filtering |
| `dateAuthorHandler.test.js` | `email/handler/dateAuthorHandler.js` | Header line parsing and remapping |
| `forwardedHandler.test.js` | `email/handler/forwardedHandler.js` | Forwarded block extraction and cleaning |
| `emailParser.test.js` | `email/emailParser.js` | Full conversation parsing (integration of the handlers above) |
| `cache.test.js` | `utils/cache.js` | Settings CRUD, TTL-based cache, array merge, management helpers |
| `gitlab.test.js` | `gitlab/gitlab.js` | Settings validation, user/project/assignee fetch, issue creation |

### Adding Translations

1. Copy `_locales/en/` to `_locales/<locale_code>/`.
2. Translate the `message` values in each `.json` file (do **not** change the keys).
3. Add the new locale to the `browser_specific_settings` in `manifest.json` if required.
4. Test in Thunderbird by setting the display language to the new locale.

---

## Contributing

Pull requests are welcome. Please:

- Follow the existing code style (ES modules, JSDoc comments).
- Add or update tests for any changed logic in `src/email/` or `src/utils/`.
- Run `npm test` before submitting.
- Keep commits focused and write a clear commit message.

---

## License

ISC © kirchner@visionconnect.de
