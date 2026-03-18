# Architektur & Struktur – GitLab Issue Creator

> **English version:** [STRUCTURE_en.md](./STRUCTURE_en.md)

Dieses Dokument erklärt **wie das Add-on aufgebaut ist und warum** – für Entwickler, die es verstehen, erweitern oder debuggen wollen. Für Nutzereinstellungen siehe [OPTIONS.md](./OPTIONS.md).

---

## Was es ist

Eine Thunderbird-WebExtension (Manifest v2), die GitLab-Issues aus E-Mails erstellt. Eine E-Mail öffnen, auf den Toolbar-Button klicken – das Add-on befüllt ein Popup mit Betreff, Inhalt und Anhängen der E-Mail, sodass ein GitLab-Issue direkt erstellt werden kann.

---

## Grundlegende Architektur

Das Add-on folgt dem Standard-WebExtension-Muster mit Background/Popup-Trennung:

```
Thunderbird
  │
  ├─ Background-Skript  (läuft immer, eine Instanz)
  │    ├─ Liest ausgewählte E-Mail via messenger.mailTabs API
  │    ├─ Parst E-Mail-Inhalt
  │    ├─ Verwaltet Projekt-/Assignee-Cache
  │    └─ Öffnet Popup und kommuniziert via Runtime-Messages
  │
  └─ Popup-Fenster  (bei Bedarf geöffnet, bei Schließen zerstört)
       ├─ Rendert das Issue-Erstellungs-Formular
       ├─ Kommuniziert mit Background via sendMessage
       └─ Ruft GitLab-API NICHT direkt auf — delegiert an Background
```

**Message-Flow** (alles via `browser.runtime.sendMessage`):

| Richtung | Message-Typ | Payload | Definiert in |
|---|---|---|---|
| Popup → Background | `popup-ready` | `tabId` | `Enums.js → Popup_MessageTypes` |
| Popup → Background | `request-initial-data` | — | |
| Background → Popup | `initial-data` | `{ email, projects }` | `Enums.js → MessageTypes` |
| Popup → Background | `request-assignees` | `projectId` | |
| Background → Popup | `assignees-list` | `{ projectId, assignees }` | |
| Popup → Background | `create-gitlab-issue` | `{ projectId, assignee, title, description, endDate, attachments }` | |

> 📎 Alle Message-Typ-Strings sind in `src/utils/Enums.js` definiert. Bei neuen Messages dort zuerst eintragen — keine Raw-Strings verwenden.

---

## Verzeichnisstruktur

```
.
├── background.js                 Einstiegspunkt der Extension — importiert src/background/
├── manifest.json                 WebExtension-Manifest (v2)
├── rollup.config.mjs             Bundler-Konfiguration; merged auch die geteilten _locales-JSONs
├── jest.config.mjs               Test-Runner-Konfiguration
├── package.json
│
├── src/
│   ├── background/
│   │   ├── backgroundState.js    In-Memory-State (Popup-Fenster-ID, E-Mail, Projekte…)
│   │   └── handler/
│   │       ├── messageHandler.js Verteilt eingehende browser.runtime-Messages nach Typ
│   │       └── popupHandler.js   Öffnet/fokussiert/schließt das Popup-Fenster
│   │
│   ├── email/
│   │   ├── emailParser.js        Übergeordneter Orchestrator; ruft Handler der Reihe nach auf
│   │   └── handler/
│   │       ├── attachmentHandler.js  Traversiert MIME-Baum zur Anhang-Erkennung
│   │       ├── dateAuthorHandler.js  Extrahiert und mappt From/Date-Header-Zeilen
│   │       ├── forwardedHandler.js   Erkennt und extrahiert weitergeleitete Nachrichten
│   │       └── textHandler.js        MIME-Part-Erkennung, Signatur-Entfernung, Quote-Splitting
│   │
│   ├── gitlab/
│   │   ├── api.js                Low-Level HTTP-Client (fetch-Wrapper, 401-Handling)
│   │   └── gitlab.js             High-Level-Operationen: Einstellungen prüfen,
│   │                             Projekte/Assignees laden, Issues erstellen, Uploads
│   │
│   ├── options/
│   │   ├── options.html          Options-Seite Markup
│   │   ├── options.js            Einstiegspunkt; verdrahtet Handler
│   │   └── logic/handler/
│   │       ├── alertHandler.js   Zeigt Inline-Statusmeldungen
│   │       ├── cacheHandler.js   Cache-Leeren-Button-Logik
│   │       ├── toggleHandler.js  Checkbox-Logik (Wasserzeichen, Assignees, Cache)
│   │       ├── tokenHandler.js   Token-Feld + „Token erstellen"-Button-Logik
│   │       └── urlHandler.js     GitLab-URL-Validierung und Speichern
│   │
│   ├── popup/
│   │   ├── issue_creator.html    Popup-Markup
│   │   ├── issue_creator.js      Einstiegspunkt; sendet popup-ready, verdrahtet Handler
│   │   ├── popup.css
│   │   └── logic/
│   │       ├── popupState.js     Gemeinsamer State + EasyMDE-Editor-Instanz
│   │       ├── ui.js             DOM-Helfer: Projektliste, Assignees, Anhänge rendern
│   │       └── handler/
│   │           ├── descriptionHandler.js  Erstellt Markdown-Issue-Body aus geparster E-Mail
│   │           ├── issueHandler.js        „Issue erstellen"-Button: Upload + API-Aufruf
│   │           ├── projectHandler.js      Projektsuche und Auswahl
│   │           └── resetHandler.js        Setzt Popup-Formular zurück
│   │
│   └── utils/
│       ├── cache.js              browser.storage.local-Abstraktion (Einstellungen + TTL-Cache)
│       ├── Enums.js              Alle Konstanten: Message-Typen, Storage-Keys, i18n-Keys
│       ├── localize.js           Wendet data-i18n-Attribute zur Laufzeit auf das DOM an
│       └── utils.js              Hilfsfunktionen: Benachrichtigungen, Popup-Steuerung, Sprache
│
├── _locales/
│   ├── en/
│   │   ├── messages.json         Generiert — nicht direkt bearbeiten (siehe Lokalisierung)
│   │   └── json/                 Quelldateien; werden beim Build zu messages.json zusammengeführt
│   │       ├── extension.json
│   │       ├── fallback.json
│   │       ├── notification.json
│   │       ├── options.json
│   │       └── popup.json
│   └── de/                       Gleiche Struktur wie en/
│
├── tests/                        Jest-Unit-Tests
│   ├── attachmentHandler.test.js
│   ├── cache.test.js
│   ├── dateAuthorHandler.test.js
│   ├── emailParser.test.js
│   ├── forwardedHandler.test.js
│   ├── gitlab.test.js
│   └── textHandler.test.js
│
├── scripts/
│   ├── build.js                  Produktion-Build: Rollup ausführen, Dateien staging, zip → builds/
│   ├── bump-version.js           Version in package.json + manifest.json atomar erhöhen
│   ├── pack-src.js               Quellcode als Zip verpacken (AMO-Anforderung)
│   ├── publish.js                AMO-Upload-Helfer
│   └── utils/utils.js            Hilfsfunktionen für Build-Skripte
│
├── dist/                         Bundled Output — generiert, nicht committed
│   ├── bundled-background.js     + .map
│   ├── bundled-issue_creator.js  + .map
│   ├── bundled-options.js        + .map
│   └── libs/                     easymde.min.js + easymde.min.css (von Rollup kopiert)
│
├── builds/                       Distribuierbare Zips — generiert, nicht committed
└── icons/                        Extension-Icons: SVG-Quelle + PNG in 16/32/48/64 px
```

---

## Wichtige Module erklärt

### `src/utils/Enums.js`
Die einzige Quelle der Wahrheit für:
- **`MessageTypes`** — Messages vom Background *zum* Popup
- **`Popup_MessageTypes`** — Messages vom Popup *zum* Background
- **`CacheKeys`** — Alle Keys in `browser.storage.local`
- **`LocalizeKeys`** — Alle in JS referenzierten i18n-Keys

Bei neuen Features mit Messaging, Storage oder i18n: hier zuerst Konstanten eintragen.

### `src/utils/cache.js`
Zwei Schichten über `browser.storage.local`:

| Schicht | Funktionen | TTL | Verwendung |
|---|---|---|---|
| **Settings** (persistent) | `getSetting` / `setSetting` | keiner | Zugangsdaten, Nutzereinstellungen |
| **Cache** (TTL-bewusst) | `getCache` / `setCache` | konfigurierbar | API-Antworten |

Cache-Einträge werden mit `cache_`-Präfix und einem `{ data, timestamp }`-Envelope gespeichert. Wenn „Cache deaktivieren" aktiv ist, wird `setCache` zum No-op — Lesevorgänge liefern immer `null` und erzwingen einen frischen API-Aufruf.

### `src/gitlab/api.js`
Einfache `fetch`-Wrapper. Aufgaben:
- Löst die Base-URL einmalig aus dem Storage auf und speichert sie im Modul-Scope (`_apiBaseUrl`)
- Behandelt 401 mit Benachrichtigung + Options-Seite öffnen
- `doRequest` → `apiGet` / `apiPost` / `apiPut` / `apiDelete` sind die vier öffentlichen Helfer

### `src/gitlab/gitlab.js`
High-Level-Operationen auf Basis von `api.js`. Jede Funktion ist eigenständig: Einstellungen prüfen, Cache checken, API aufrufen, in Cache schreiben. Gibt `null` / `[]` bei Fehler zurück — **keine Exceptions erreichen die UI-Schicht**.

### `_locales`-Split-File-Konvention
Übersetzungsstrings liegen in Feature-spezifischen JSONs unter `_locales/<lang>/json/`. Beim Build führt `rollup.config.mjs` diese zu einer einzelnen `_locales/<lang>/messages.json` zusammen. **`messages.json` niemals direkt bearbeiten** — Änderungen werden beim nächsten Build überschrieben.

---

## Caching-Strategie

| Daten | TTL | Hinweise |
|---|---|---|
| Aktueller User | 24 h | Profil ändert sich selten |
| Projekte | ~5 Tage (TTL_9H × 13,5) | Inkrementelles Refresh: nur Projekte mit ID neuer als der höchste gecachte Wert werden nachgeladen |
| Assignees | 9 h | Als `{ [projectId]: [...members] }` gespeichert, um Storage-Keys zu minimieren |

TTL-Konstanten sind am Anfang von `src/gitlab/gitlab.js` definiert (`TTL_9H_MS`, `TTL_24H_MS`, `TTL_PROJECT_MS`).

---

## Build-System

Rollup bündelt drei Einstiegspunkte in `dist/`:

| Einstieg | Ausgabe |
|---|---|
| `background.js` | `dist/bundled-background.js` |
| `src/popup/issue_creator.js` | `dist/bundled-issue_creator.js` |
| `src/options/options.js` | `dist/bundled-options.js` |

Das `mergeLocalesJSONPlugin` in `rollup.config.mjs` läuft einmal pro Build und führt die geteilten Locale-JSONs zusammen.

```bash
npm run build:dev   # Unkomprimiert, mit Source-Maps (für Entwicklung)
npm run build       # Minifiziert + gezippt in builds/ (für Release)
```

### Lokales Laden in Thunderbird

1. `npm run build:dev`
2. Thunderbird → **Extras** → **Add-ons und Themes** → Zahnrad ⚙️ → **Add-ons debuggen** → **Temporäres Add-on laden…**
3. `manifest.json` im Projektstamm auswählen.

Nach jedem Rebuild das temporäre Add-on neu laden.

### Versionierung

```bash
npm run version:patch   # 7.0.0 → 7.0.1
npm run version:minor   # 7.0.0 → 7.1.0
npm run version:major   # 7.0.0 → 8.0.0
```

`scripts/bump-version.js` aktualisiert `package.json` und `manifest.json` atomar.

---

## Tests

```bash
npm test                          # Alle Tests ausführen
npm run test:coverage             # Mit Coverage-Report
npm test -- tests/cache.test.js   # Einzelne Datei
npm test -- --watch               # Watch-Modus
```

Browser-APIs (`browser.storage`, `browser.messages` etc.) werden in jeder Testdatei gemockt. Keine echten Netzwerkaufrufe.

| Testdatei | Was getestet wird |
|---|---|
| `textHandler.test.js` | MIME-Part-Erkennung, Signatur-Entfernung, Quote-Splitting |
| `attachmentHandler.test.js` | MIME-Baum-Traversierung, Typ-Filterung |
| `dateAuthorHandler.test.js` | From/Date-Header-Parsing und Remapping |
| `forwardedHandler.test.js` | Weiterleitungs-Block-Extraktion |
| `emailParser.test.js` | Vollständiges End-to-End-E-Mail-Parsen |
| `cache.test.js` | Settings-CRUD, TTL-Logik, Array-Merge-Helfer |
| `gitlab.test.js` | Einstellungs-Validierung, Projekt-/Assignee-Abruf, Issue-Erstellung |

---

## Neue Option hinzufügen

1. Key-Konstante zu `CacheKeys` in `src/utils/Enums.js` hinzufügen.
2. HTML-Control zu `src/options/options.html` hinzufügen.
3. Handler in `src/options/logic/handler/` anlegen oder bestehenden erweitern.
4. i18n-Strings zu `_locales/en/json/options.json` und `_locales/de/json/options.json` hinzufügen.
5. Passende Keys zu `LocalizeKeys.OPTIONS` in `Enums.js` hinzufügen.
6. In `md/OPTIONS_en.md` und `md/OPTIONS.md` dokumentieren.

## Neuen Message-Typ hinzufügen

1. String-Konstante zum passenden Enum in `Enums.js` hinzufügen (`MessageTypes` oder `Popup_MessageTypes`).
2. Case zu `messageHandler.js` hinzufügen.
3. Message-Flow-Tabelle in diesem Dokument aktualisieren.

## Übersetzung hinzufügen

1. `_locales/en/json/` nach `_locales/<locale_code>/json/` kopieren.
2. `message`-Werte übersetzen (Keys **nicht** ändern).
3. Build ausführen — die zusammengeführte `messages.json` für das neue Locale wird automatisch generiert.
4. In Thunderbird testen, indem die Anzeigesprache auf das neue Locale gesetzt wird.
