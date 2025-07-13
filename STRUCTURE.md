# Projektstruktur – _GitLab Ticket Creator_

Dieses Projekt ist eine Thunderbird-Erweiterung, die es ermöglicht, GitLab-Issues direkt aus E-Mails zu erstellen. Die folgende Strukturübersicht erklärt die wichtigsten Dateien und Verzeichnisse.

---

## Projektkonfiguration

```text
├── manifest.json
├── package.json
├── rollup.config.mjs
├── readme.md
```

- **manifest.json** – "Steckbrief" des Add-ons: definiert Name, Version, Icons, Berechtigungen, Hintergrundskripte etc.
- **package.json** – Konfiguration für Node.js, mit Metadaten, Abhängigkeiten und Scripts.
- **rollup.config.mjs** – Einstellungen für den Modul-Bundler _Rollup_, der alle Skripte zusammenführt.
- **readme.md** – Projektbeschreibung, Setup-Anleitung und technische Hinweise.

---

## Lokalisierung

```text
├── _locales/
│   ├── en/messages.json
│   └── de/messages.json
```

- Enthält mehrsprachige UI-Texte (Englisch & Deutsch) im [WebExtension-Format](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization).
- Zugriff auf Texte erfolgt programmatisch via `localize.js`.

---

## Build & Release

```text
├── scripts/
│   ├── build.js
│   └── bump-version.js
├── dist/
│   └── (generierte Bundle-Dateien)
├── builds/
│   └── gitlab-ticket-creator-x.y.z.zip
```

- **scripts/** – Hilfsskripte:

  - `build.js` führt den Rollup-Build aus
  - `bump-version.js` erhöht Versionsnummern automatisch

- **dist/** – vom Build erzeugte, gebündelte JS-Dateien inklusive Source Maps (nicht versioniert)
- **builds/** – ZIP-Dateien zur Veröffentlichung (z. B. für Thunderbird-Upload)

---

## Assets

```text
├── icons/
│   ├── icon-16x.png
│   ├── icon-64x.png
│   ├── Icon.svg
│   └── vc-icon-32px.png
```

- Browser- und Add-on-Icons in verschiedenen Auflösungen
- `vc-icon-32px.png`: Firmenlogo für die Einstellungsseite (optional)

---

## Quellcode (`src/`)

```text
├── src/
│
│   theme.css
│   Enums.js
│   localize.js
```

- **theme.css** – Zentrales Stylesheet für Add-on-UI (Popup & Optionen)
- **Enums.js** – Konstante Werte für z. B. Ticketstatus, Prioritäten
- **localize.js** – Hilfsfunktionen zum Laden übersetzter Texte aus `_locales/`

---

### Hintergrund-Logik

```text
├── background.js
```

- Zentrale Steuerung im Hintergrundkontext: Listener, Nachrichtenempfang, Init-Logik

---

### E-Mail-Verarbeitung

```text
├── src/email/
│   ├── emailContent.js
│   └── emailParser.js
```

- **emailContent.js** – Extrahiert und formatiert Inhalte aus E-Mails
- **emailParser.js** – Zerlegt Header, Betreff, Body etc. in strukturierte Daten

---

### GitLab-Integration

```text
├── src/gitlab/
│   ├── api.js
│   └── gitlab.js
```

- **api.js** – GitLab-API-Wrapper (Tokens, Requests, Fehlerbehandlung)
- **gitlab.js** – Business-Logik: Ticketerstellung, Nutzerzuordnung, Labels etc.

---

### Einstellungsseite

```text
├── src/options/
│   ├── options.html
│   └── options.js
```

- Konfigurationsoberfläche für Benutzer (API-URL, Token, Projekt-ID etc.)
- Wird in `manifest.json` als `options_ui` eingebunden

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
│   └── easymde/
│       ├── easymde.min.js
│       └── easymde.min.css
```

- **ticket_creator.html** – UI, die beim Klick auf das Add-on erscheint
- **ticket_creator.js** – Einstiegspunkt: Initialisierung & Logikbindung
- **logic/** – Strukturierte Aufteilung:

  - `handler.js`: Events, z. B. Buttonklicks
  - `state.js`: Formularzustand, z. B. eingegebene Daten
  - `ui.js`: Anzeigen/Verstecken von Elementen, Validierung

- **easymde/** – Eingebundener Markdown-Editor (_EasyMDE_): ermöglicht formatierte Ticketbeschreibung

---

### Utilities

```text
├── src/utils/
│   ├── utils.js
│   └── cache.js
```

- **utils.js** – Wiederverwendbare Funktionen (String-Formatierung, Validierung etc.)
- **cache.js** – Einfaches In-Memory-Caching für API-Antworten (z. B. Projektliste, Labels)

---

#### Gesamte Projektstruktur

```text
├── manifest.json                       # Die "Identitätskarte" des Add-ons: definiert Name, Version, Berechtigungen, Hintergrundskripte, Icons etc.
├── background.js                       # Einstiegspunkt für den Hintergrundprozess: steuert zentrale Logik wie Listener und Add-on-Ereignisse
├── package.json                        # Node.js-Konfiguration, enthält Metadaten und Abhängigkeiten (z. B. für Build-Skripte)
├── rollup.config.mjs                   # Konfiguration für Rollup, den Modul-Bundler für JavaScript-Dateien
├── readme.md                           # Projektbeschreibung, Installationsanleitung und technische Hinweise
├── _locales/                           # Lokalisierungsverzeichnis für mehrsprachige Add-on-Texte
│   ├── de/                             # Deutsche Sprachdateien
│   │   └── messages.json               # Enthält übersetzte UI-Texte und Nachrichten (Deutsch)
│   └── en/                             # Englische Sprachdateien
│       └── messages.json               # Enthält übersetzte UI-Texte und Nachrichten (Englisch)
├── dist/                               # Ausgabeordner für gebündelte Skripte (wird automatisch generiert und nicht eingecheckt)
│   ├── bundled-background.js           # Bündel des Hintergrundskripts
│   ├── bundled-background.js.map       # Source Map für Debugging des Hintergrundskripts
│   ├── bundled-options.js              # Gebündeltes JavaScript für die Optionen-Seite
│   ├── bundled-options.js.map          # Source Map für die Optionen-Seite
│   ├── bundled-ticket_creator.js       # Gebündeltes JavaScript für das Ticket-Popup
│   └── bundled-ticket_creator.js.map   # Source Map für das Ticket-Popup
├── builds/                             # Manuell oder automatisch erzeugte ZIP-Pakete für Release/Distribution
│   └── gitlab-ticket-creator-x.y.z.zip # Gebündeltes Add-on zur Veröffentlichung oder Installation
├── icons/                              # Icons für Browser-UI und Add-on-Repräsentation
│   ├── icon-16x.png                    # Icon in 16×16 für Toolbar etc.
│   ├── [...]                           # Weitere Icons in unterschiedlichen Größen
│   ├── icon-64x.png                    # Hochauflösendes Icon für Add-on-Seite
│   ├── Icon.svg                        # Vektorversion des Icons
│   └── vc-icon-32px.png                # Firmenlogo für den Footer in der Einstellungsseite
├── scripts/                            # Build- und Hilfsskripte für die Entwicklung
│   ├── build.js                        # Führt den Build-Prozess mit Rollup aus
│   └── bump-version.js                 # Erhöht Versionsnummern in manifest.json und package.json
└── src/                                # Quellverzeichnis mit modularer Struktur
    ├── theme.css                       # Globale CSS-Definitionen für Popup und Optionen
    ├── Enums.js                        # Vordefinierte Konstanten und Enumerationen für Status, Priorität etc.
    ├── localize.js                     # Hilfsfunktionen zur Handhabung von Lokalisierung via messages.json
    ├── gitlab/                         # GitLab-bezogene Module
    │   ├── api.js                      # API-Wrapper für REST-Kommunikation mit GitLab
    │   └── gitlab.js                   # Verbindet E-Mail-Inhalte mit der GitLab-API (z. B. Erstellung von Issues)
    ├── options/                        # Quellcode für die Einstellungsseite des Add-ons
    │   ├── options.html                # HTML-Oberfläche für benutzerdefinierte Einstellungen
    │   └── options.js                  # Logik zur Initialisierung und Speicherung von Optionen
    ├── email/                          # Verarbeitung von E-Mail-Inhalten
    │   ├── emailContent.js             # Extraktion und Aufbereitung von Inhalten aus E-Mails
    │   └── emailParser.js              # Zerlegt E-Mail-Header und -Body, z. B. Betreff, Absender, Textkörper
    ├── popup/                          # Ticketerstellungs-Popup (erscheint bei Klick aufs Add-on)
    │   ├── ticket_creator.html         # UI zur Eingabe von Ticketdetails
    │   ├── ticket_creator.js           # Einstiegspunkt und zentrale Steuerung für das Ticket-Popup
    │   ├── logic/                      # Modular organisierte Logik fürs Popup
    │   │   ├── handler.js              # Event-Handler z. B. für Button-Klicks oder Eingaben
    │   │   ├── state.js                # Zustandsverwaltung für das Formular (z. B. gespeicherte Inhalte)
    │   │   └── ui.js                   # UI-Logik wie Anzeigen, Ausblenden, Validieren von Elementen
    │   └── easymde/                    # Eingebundener Markdown-Editor als Drittanbieter-Bibliothek
    │       ├── easymde.min.css         # CSS-Datei des Editors
    │       └── easymde.min.js          # JS-Datei des Editors
    └── utils/                          # Hilfsfunktionen, die mehrfach verwendet werden
        ├── utils.js                    # Allgemeine Utility-Funktionen (z. B. String-Formatierung, Validierungen)
        └── cache.js                    # Einfacher Caching-Mechanismus für API-Antworten zur Reduzierung von Requests
```
