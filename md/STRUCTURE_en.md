# Project Structure – *GitLab Ticket Creator*

This project is a Thunderbird extension that allows creating GitLab issues directly from emails. The following overview describes the structure of the project.

---

## Project Configuration

```text
├── manifest.json
├── package.json
├── rollup.config.mjs
├── readme.md
├── OPTIONS.md
├── STRUCTURE.md
```

* **manifest.json** – Central metadata and configuration file for the add-on.
* **package.json** – Node.js project definition including dependencies and scripts.
* **rollup.config.mjs** – Configuration for the Rollup module bundler.
* **readme.md** – Documentation and introduction to the project.
* **OPTIONS.md** – Description of all user options and configuration features.
* **STRUCTURE.md** – This structural overview.

---

## Localization

```text
├── _locales/
│   ├── en/messages.json
│   └── de/messages.json
```

* Translated UI strings in the WebExtension format.
* Accessed via `localize.js`.

---

## Build & Release

```text
├── scripts/
│   ├── build.js
│   ├── bump-version.js
│   └── build-version.js
├── dist/
│   ├── bundled-background.js
│   ├── bundled-options.js
│   ├── bundled-ticket_creator.js
│   └── *.map
├── builds/
│   └── gitlab-ticket-creator-x.y.z.zip
```

* **scripts/** – Automation scripts (build process, version management).
* **dist/** – Rollup-bundled output files including source maps.
* **builds/** – Final release archives (e.g., for Thunderbird submission).

---

## Assets

```text
├── icons/
│   ├── icon-16x.png
│   ├── icon-64x.png
│   ├── Icon.svg
│   └── vc-icon-32px.png
```

* Add-on and toolbar icons in various sizes.
* `vc-icon-32px.png`: Company logo used in the UI.

---

## Source Code (`src/`)

```text
├── src/
│   ├── theme.css
│   ├── Enums.js
│   ├── localize.js
│   ├── background.js
```

* **theme.css** – Central UI styling.
* **Enums.js** – Constants and enumerations (e.g., for priorities).
* **localize.js** – Access layer for translated strings.
* **background.js** – Main logic of the background process (listeners, init, etc.)

---

### GitLab Integration

```text
├── src/gitlab/
│   ├── api.js
│   └── gitlab.js
```

* **api.js** – Communication with the GitLab API (tokens, requests).
* **gitlab.js** – Processing API data, creating issues, etc.

---

### Email Processing

```text
├── src/email/
│   ├── emailContent.js
│   └── emailParser.js
```

* **emailContent.js** – Extraction and formatting of email data.
* **emailParser.js** – Parsing headers, sender details, and more.

---

### Options Page

```text
├── src/options/
│   ├── options.html
│   └── options.js
```

* HTML and JavaScript for the add-on’s configuration UI.

---

### Ticket Creation Popup

```text
├── src/popup/
│   ├── ticket_creator.html
│   ├── ticket_creator.js
│   ├── logic/
│   │   ├── handler.js
│   │   ├── state.js
│   │   └── ui.js
```

* **ticket\_creator.html** – The user interface.
* **ticket\_creator.js** – Entry point and setup.
* **logic/** – Modularized logic:

  * `handler.js`: Event logic.
  * `state.js`: State management.
  * `ui.js`: Visibility toggling, error messages, validation.

---

### Included Third-Party Libraries

```text
├── src/libs/
│   ├── easymde/
│   │   ├── easymde.min.js
│   │   └── easymde.min.css
│   └── VENDORS.md
```

* **easymde/** – Minified JS and CSS files for the Markdown editor \[*EasyMDE*].
* **VENDORS.md** – Source, version, and provenance details for minified libraries (for Mozilla review purposes).

---

### Utility Functions

```text
├── src/utils/
│   ├── utils.js
│   └── cache.js
```

* **utils.js** – General-purpose helper functions (string handling, URL checks, etc.)
* **cache.js** – Simple caching (e.g., for project or label lists)

---

## Full Structure Overview

```text
├── manifest.json
├── background.js
├── package.json
├── rollup.config.mjs
├── README.md
├── STRUCTURE.md
├── OPTIONS.md
├── _locales/
│   ├── de/messages.json
│   └── en/messages.json
├── dist/
│   └── *.js + *.map
├── builds/
│   └── gitlab-ticket-creator-x.y.z.zip
├── icons/
│   ├── *.png
│   └── Icon.svg
├── scripts/
│   ├── build.js
│   ├── bump-version.js
│   └── build-version.js
└── src/
    ├── theme.css
    ├── Enums.js
    ├── localize.js
    ├── background.js
    ├── gitlab/
    │   ├── api.js
    │   └── gitlab.js
    ├── email/
    │   ├── emailContent.js
    │   └── emailParser.js
    ├── options/
    │   ├── options.html
    │   └── options.js
    ├── popup/
    │   ├── ticket_creator.html
    │   ├── ticket_creator.js
    │   └── logic/
    │       ├── handler.js
    │       ├── state.js
    │       └── ui.js
    ├── libs/
    │   ├── easymde/
    │   │   ├── easymde.min.js
    │   │   └── easymde.min.css
    │   └── VENDORS.md
    └── utils/
        ├── utils.js
        └── cache.js
```