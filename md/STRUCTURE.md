# Projektstruktur – *GitLab Ticket Creator*
**ENGLISH VERSION:** [STRUCTURE_en](./STRUCTURE_en.md)

Dieses Projekt ist eine Thunderbird-Erweiterung, die es ermöglicht, GitLab-Issues direkt aus E-Mails zu erstellen. Die folgende Übersicht beschreibt den Aufbau des Projekts.

---

## Projektkonfiguration

```text
├── manifest.json
├── package.json
├── rollup.config.mjs
├── readme.md
├── OPTIONS.md
├── STRUCTURE.md
```

* **manifest.json** – Zentrale Metadaten und Konfiguration für das Add-on.
* **package.json** – Node.js-Projektdefinition mit Abhängigkeiten und Scripts.
* **rollup.config.mjs** – Konfiguration für den Modul-Bundler Rollup.
* **readme.md** – Dokumentation und Einstieg in das Projekt.
* **OPTIONS.md** – Erläuterung aller Benutzeroptionen und Konfigurationsmöglichkeiten.
* **STRUCTURE.md** – Diese Strukturübersicht.

---

## Lokalisierung

```text
├── _locales/
│   ├── en/messages.json
│   └── de/messages.json
```

* Übersetzte UI-Texte im WebExtension-Format.
* Zugriff erfolgt über `localize.js`.

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

* **scripts/** – Automatisierung (Build, Versions-Management)
* **dist/** – Vom Rollup erzeugte, gebündelte Dateien inkl. Source Maps.
* **builds/** – Veröffentlichungs-Archive (z. B. für Thunderbird).

---

## Assets

```text
├── icons/
│   ├── icon-16x.png
│   ├── icon-64x.png
│   ├── Icon.svg
│   └── vc-icon-32px.png
```

* Add-on- und Toolbar-Icons in verschiedenen Auflösungen.
* `vc-icon-32px.png`: Firmenlogo für die UI.

---

## Quellcode (`src/`)

```text
├── src/
│   ├── theme.css
│   ├── Enums.js
│   ├── localize.js
│   ├── background.js
```

* **theme.css** – Zentrales UI-Styling.
* **Enums.js** – Konstanten und Aufzählungen für z. B. Prioritäten.
* **localize.js** – Zugriff auf übersetzte Texte.
* **background.js** – Hauptlogik des Hintergrundprozesses (Listener, Init etc.)

---

### GitLab-Integration

```text
├── src/gitlab/
│   ├── api.js
│   └── gitlab.js
```

* **api.js** – Kommunikation mit der GitLab-API (Tokens, Requests).
* **gitlab.js** – Verarbeitung von API-Daten, Ticketerstellung etc.

---

### E-Mail-Verarbeitung

```text
├── src/email/
│   ├── emailContent.js
│   └── emailParser.js
```

* **emailContent.js** – Extraktion und Formatierung von E-Mail-Daten.
* **emailParser.js** – Zerlegung von Headern, Absendern etc.

---

### Einstellungsseite

```text
├── src/options/
│   ├── options.html
│   └── options.js
```

* HTML- und JS-Dateien für die Konfigurationsseite des Add-ons.

---

### Popup zur Ticketerstellung

```text
├── src/popup/
│   ├── ticket_creator.html
│   ├── ticket_creator.js
│   ├── logic/
│   │   ├── handler.js
│   │   ├── state.js
│   │   └── ui.js
```

* **ticket\_creator.html** – Die Benutzeroberfläche.
* **ticket\_creator.js** – Einstiegspunkt und Setup.
* **logic/** – Modularisierte Logik:

  * `handler.js`: Event-Logik.
  * `state.js`: Zustandsverwaltung.
  * `ui.js`: Sichtbarkeiten, Fehlermeldungen, Validierungen.

---

### Eingebundene Drittanbieter-Bibliotheken

```text
├── src/libs/
│   ├── easymde/
│   │   ├── easymde.min.js
│   │   └── easymde.min.css
│   └── VENDORS.md
```

* **easymde/** – Minifizierte JS- und CSS-Dateien des Markdown-Editors \[*EasyMDE*].
* **VENDORS.md** – Quelle, Version und Herkunftsnachweis für minifizierte Bibliotheken (zur Prüfung durch Mozilla).

---

### Hilfsfunktionen

```text
├── src/utils/
│   ├── utils.js
│   └── cache.js
```

* **utils.js** – Allgemeine Hilfsfunktionen (String-Handling, URL-Checks etc.)
* **cache.js** – Einfaches Caching (z. B. für Projekt- oder Label-Listen)

---

## Gesamtstruktur im Überblick

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