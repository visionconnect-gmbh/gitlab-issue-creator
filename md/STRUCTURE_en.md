# **STRUCTURE_en.md**

**GERMAN VERSION:** [STRUCTURE](./STRUCTURE.md)

# Project Structure – *GitLab Issue Creator*

This project is a Thunderbird extension that allows creating GitLab issues directly from emails. The following overview describes the structure of the project.

---

## Project Configuration

```text
├── manifest.json
├── package.json
├── package-lock.json
├── rollup.config.mjs
├── README.md
├── README_en.md
├── md/OPTIONS.md
├── md/OPTIONS_en.md
├── md/STRUCTURE.md
├── md/STRUCTURE_en.md
```

* **manifest.json** – Central metadata and configuration file for the add-on.
* **package.json** – Node.js project definition including dependencies and scripts.
* **package-lock.json** – Locked dependency tree for reproducible builds.
* **rollup.config.mjs** – Configuration for the Rollup module bundler.
* **README.md / README\_en.md** – Documentation and introduction to the project.
* **md/OPTIONS*.md*\* – Description of all user options and configuration features.
* **md/STRUCTURE*.md*\* – Structural overview of the project.

---

## Localization

```text
├── _locales/
│   ├── en/
│   └── de/
```

* Translated UI strings in the WebExtension format.
* Accessed via `localize.js`.

---

## Build & Release

```text
├── scripts/
│   ├── build.js
│   ├── bump-version.js
│   ├── pack-src.js
│   ├── publish.js
│   └── utils/
├── dist/
│   ├── bundled-background.js
│   ├── bundled-background.js.map
│   ├── bundled-issue_creator.js
│   ├── bundled-issue_creator.js.map
│   ├── bundled-options.js
│   ├── bundled-options.js.map
│   └── libs/
├── builds/
│   └── gitlab-issue-creator-6.0.1.zip
```

* **scripts/** – Automation scripts (build process, version management).
* **dist/** – Rollup-bundled output files including source maps.
* **builds/** – Final release archives (e.g., for Thunderbird submission).

---

## Assets

```text
├── icons/
│   ├── icon-16px.png
│   ├── icon-32px.png
│   ├── icon-48px.png
│   ├── icon-64px.png
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
│   ├── background/
│   ├── email/
│   ├── gitlab/
│   ├── options/
│   ├── popup/
│   └── utils/
```

* **theme.css** – Central UI styling.
* **background/** – Background script logic.
* **email/** – Email parsing and content handling.
* **gitlab/** – GitLab API communication and issue creation.
* **options/** – Configuration page UI logic.
* **popup/** – Issue creation popup and logic.
* **utils/** – Utility functions and caching.

---

### Full Directory Tree

```text
.
├── background.js
├── manifest.json
├── rollup.config.mjs
├── package.json
├── package-lock.json
├── README_en.md
├── README.md
├── builds/
│   └── gitlab-issue-creator-6.0.1.zip
├── dist/
│   ├── bundled-background.js
│   ├── bundled-background.js.map
│   ├── bundled-issue_creator.js
│   ├── bundled-issue_creator.js.map
│   ├── bundled-options.js
│   ├── bundled-options.js.map
│   └── libs/
├── icons/
│   ├── icon-16px.png
│   ├── icon-32px.png
│   ├── icon-48px.png
│   ├── icon-64px.png
│   ├── Icon.svg
│   └── vc-icon-32px.png
├── _locales/
│   ├── de/
│   └── en/
├── md/
│   ├── OPTIONS_en.md
│   ├── OPTIONS.md
│   ├── STRUCTURE_en.md
│   └── STRUCTURE.md
├── scripts/
│   ├── build.js
│   ├── bump-version.js
│   ├── pack-src.js
│   ├── publish.js
│   └── utils/
└── src/
    ├── background/
    ├── email/
    ├── gitlab/
    ├── options/
    ├── popup/
    ├── theme.css
    └── utils/
```