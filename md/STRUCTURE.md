# **STRUCTURE.md**

**ENGLISH VERSION:** [STRUCTURE_en](./STRUCTURE_en.md)

# Projektstruktur – *GitLab Issue Creator*

Dieses Projekt ist eine Thunderbird-Erweiterung, mit der GitLab-Issues direkt aus E-Mails erstellt werden können. Die folgende Übersicht beschreibt die Struktur des Projekts.

---

## Projektkonfiguration

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

* **manifest.json** – Zentrale Metadaten- und Konfigurationsdatei für das Add-on.
* **package.json** – Node.js Projektdefinition inkl. Abhängigkeiten und Skripten.
* **package-lock.json** – Gesperrter Abhängigkeitsbaum für reproduzierbare Builds.
* **rollup.config.mjs** – Konfiguration des Rollup-Modul-Bundlers.
* **README.md / README\_en.md** – Projektbeschreibung und Einführung.
* **md/OPTIONS*.md*\* – Beschreibung aller Benutzeroptionen und Konfigurationsmöglichkeiten.
* **md/STRUCTURE*.md*\* – Strukturübersicht des Projekts.

---

## Lokalisierung

```text
├── _locales/
│   ├── en/
│   └── de/
```

* Übersetzte UI-Texte im WebExtension-Format.
* Zugriff über `localize.js`.

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

* **scripts/** – Automatisierungsskripte (Build-Prozess, Versionsmanagement).
* **dist/** – Rollup-bündelte Ausgabedateien inkl. Source Maps.
* **builds/** – Fertige Release-Archive (z.B. für Thunderbird-Einreichung).

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

* Add-on- und Toolbar-Icons in verschiedenen Größen.
* `vc-icon-32px.png`: Firmenlogo, das in der UI verwendet wird.

---

## Quellcode (`src/`)

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

* **theme.css** – Zentrale UI-Styling-Datei.
* **background/** – Hintergrundlogik.
* **email/** – E-Mail Parsing und Inhaltsverarbeitung.
* **gitlab/** – GitLab API Kommunikation und Issue-Erstellung.
* **options/** – Konfigurationsseite UI-Logik.
* **popup/** – Issue-Erstellungs-Popup und Logik.
* **utils/** – Hilfsfunktionen und Caching.

---

### Vollständige Verzeichnisstruktur

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