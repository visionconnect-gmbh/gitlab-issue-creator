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
       ├─ Kommuniziert mit Background via sendMessage für Projekte,
       │  Projektsuche, Assignees und Issue-Erstellung
       └─ Ruft die GitLab-API direkt auf für aktuellen User und
          Anhang-Upload/-Löschung, die brauchen den geteilten
          In-Memory-Cache des Background-Skripts nicht
```

**Message-Flow** (alles via `browser.runtime.sendMessage`):

| Richtung | Message-Typ | Payload | Definiert in |
|---|---|---|---|
| Popup → Background | `popup-ready` | `tabId` | `Enums.js → Popup_MessageTypes` |
| Popup → Background | `request-initial-data` | keine | |
| Background → Popup | `initial-data` | `{ email, projects }` | `Enums.js → MessageTypes` |
| Popup → Background | `request-assignees` | `projectId` | |
| Background → Popup | `assignees-list` | `{ projectId, assignees, status }` | |
| Popup → Background | `request-labels` | `projectId` | |
| Background → Popup | `labels-list` | `{ projectId, labels, status }` | |
| Popup → Background | `create-gitlab-issue` | `{ projectId, assignee, title, description, endDate, labels }` | |

> 📎 Alle Message-Typ-Strings sind in `src/utils/Enums.js` definiert. Bei neuen Messages dort zuerst eintragen: keine Raw-Strings verwenden.

---

## Verzeichnisstruktur

```
.
├── background.js                 Einstiegspunkt der Extension; importiert src/background/
├── background.html               Lädt background.js als Modul (manifest "background.page")
├── manifest.json                 WebExtension-Manifest (v2)
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
│   │                             Projekte/Assignees/Labels laden, Issues erstellen, Uploads
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
│   │   ├── editor.css            Styles für den nativen Markdown-Editor (editor/ unten)
│   │   └── logic/
│   │       ├── popupState.js     Gemeinsamer State + die Editor-/uploadRegistry-/
│   │       │                     pickerModal-Instanzen
│   │       ├── uploadRegistry.js DOM-freier Reconciler: lädt Editor-Bilder UND E-Mail-Anhänge
│   │       │                     eager hoch (identischer Lifecycle für beide, jeder trägt
│   │       │                     einen Text-Platzhalter), ersetzt Platzhalter durch echte
│   │       │                     Links, löscht bei Entfernen/Projektwechsel von GitLab.
│   │       │                     Vollständig per Dependency-Injection, daher das einzige
│   │       │                     popup/-Modul mit echten Unit-Tests.
│   │       ├── pickerModal.js    Geteiltes Such-Multiselect-Modal für Anhang- und Label-Picker,
│   │       │                     konfigurationsgetrieben, Drag-and-Drop optional
│   │       ├── attachmentDragDrop.js  Drop-Ziel auf dem Beschreibungs-Textarea: platziert
│   │       │                     einen Anhang exakt an der gedroppten Pixelposition
│   │       ├── ui.js             DOM-Helfer: Projekt-Combobox, Assignees, beide Picker rendern
│   │       ├── editor/           Hausgemachter Markdown-Editor (ersetzt EasyMDE)
│   │       │   ├── editor.js     DOM-Adapter: Toolbar, Shortcuts, Preview, Autosave.
│   │       │   │                 Bietet dasselbe `.value()`-Get/Set wie zuvor EasyMDE.
│   │       │   ├── commands.js   Reine Funktionen: (text, selStart, selEnd) -> Ersetzung.
│   │       │   │                 Kein DOM; das wird direkt unit-getestet.
│   │       │   ├── markdown.js   Kleiner Markdown-Subset-Parser nur für die Vorschau,
│   │       │   │                 bewusst keine vollständige CommonMark-Implementierung.
│   │       │   ├── preview.js    Rendert geparste Blöcke via createElement/textContent
│   │       │   │                 (kein innerHTML): die eigentliche Sicherheitsgrenze.
│   │       │   └── caretPosition.js  Mappt die Drop-Pixelposition auf einen Zeichen-Offset
│   │       │                     im Textarea (Mirror-Div + caretPositionFromPoint)
│   │       └── handler/
│   │           ├── descriptionHandler.js  Erstellt den Basis-Markdown-Issue-Body aus der E-Mail
│   │           ├── issueHandler.js        „Issue erstellen"-Button: wartet offene Uploads ab + API-Aufruf
│   │           ├── projectHandler.js      Projekt-Combobox: Filtern, Tastaturnavigation, Auswahl
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
│   │   ├── messages.json         Generiert; nicht direkt bearbeiten (siehe Lokalisierung)
│   │   └── json/                 Quelldateien; werden beim Build zu messages.json zusammengeführt
│   │       ├── extension.json
│   │       ├── fallback.json
│   │       ├── notification.json
│   │       ├── options.json
│   │       └── popup.json
│   └── de/                       Gleiche Struktur wie en/
│
├── tests/                        Jest-Unit-Tests
│   ├── api.test.js               HTTP-Schicht: Timeout, Retry/Backoff, Dedup, 304 (node env)
│   ├── attachmentHandler.test.js
│   ├── cache.test.js
│   ├── changelog.test.js
│   ├── dateAuthorHandler.test.js
│   ├── editorCommands.test.js    Reine Editor-Befehlsfunktionen (node env)
│   ├── editorDom.test.js         Toolbar/Shortcuts/Preview (jsdom env)
│   ├── emailParser.test.js
│   ├── emailParser.regression.test.js
│   ├── forwardedHandler.test.js
│   ├── gitlab.test.js
│   ├── htmlHandler.test.js
│   ├── markdown.test.js          Der Markdown-Subset-Parser der Vorschau
│   ├── pickerModal.test.js       Geteiltes Anhang-/Label-Picker-Modal (jsdom)
│   ├── requestCount.test.js      Gemessene Request-Zahlen gegen das GitLab-Probe-Fixture
│   ├── transformToMarkdown.test.js
│   ├── textHandler.test.js
│   └── uploadRegistry.test.js    Eager-Upload/Platzhalter/Lösch-Reconciler (node env, kein DOM)
│
├── scripts/
│   ├── probe-gitlab.mjs          Prüft Pagination/ETag/Rate-Limit-Verhalten einer echten
│   │                             GitLab-Instanz; schreibt ein Fixture nach tests/fixtures/gitlab/
│   ├── build.js                  Produktion-Build: Locales mergen, Allowlist kopieren,
│   │                             zip → builds/; kein Bundler
│   ├── merge-locales.js          Führt _locales/<lang>/json/*.json zu messages.json zusammen
│   ├── bump-version.js           Version in package.json + manifest.json atomar erhöhen
│   ├── pack-src.js               Quellcode als Zip verpacken (auf Anfrage verfügbar; nicht
│   │                             mehr erforderlich, da die XPI bereits ungebündelten
│   │                             Quellcode enthält)
│   ├── publish.js                ATN-Upload-Helfer (addons.thunderbird.net)
│   └── utils/
│       ├── utils.js              Hilfsfunktionen für Build-Skripte
│       ├── atn.js                ATN-API-Client (v4 Signing-Endpoint)
│       └── changelog.js          CHANGELOG.md-Parsing + ATN-HTML-Renderer
│
├── builds/                       Distribuierbare XPIs; generiert, nicht committed
├── REVIEWERS.md                  Testanleitung für addons.thunderbird.net-Reviewer
└── icons/                        Extension-Icons: SVG-Quelle + PNG in 16/32/48/64 px
```

Es gibt kein `dist/` und keinen Bundler: Die XPI enthält die handgeschriebenen
ES-Module unter `src/` direkt (`manifest.json`s `background.page` zeigt auf
`background.html`, das `background.js` als ES-Modul lädt; Popup- und
Options-Seite laden ihre Einstiegspunkte genauso). Dadurch ist jede
ausgelieferte Datei ohne separate Source-Einreichung lesbar.

---

## Wichtige Module erklärt

### `src/utils/Enums.js`
Die einzige Quelle der Wahrheit für:
- **`MessageTypes`**: Messages vom Background *zum* Popup
- **`Popup_MessageTypes`**: Messages vom Popup *zum* Background
- **`CacheKeys`**: Alle Keys in `browser.storage.local`
- **`LocalizeKeys`**: Alle in JS referenzierten i18n-Keys

Bei neuen Features mit Messaging, Storage oder i18n: hier zuerst Konstanten eintragen.

### `src/utils/cache.js`
Zwei Schichten über `browser.storage.local`:

| Schicht | Funktionen | TTL | Verwendung |
|---|---|---|---|
| **Settings** (persistent) | `getSetting` / `setSetting` | keiner | Zugangsdaten, Nutzereinstellungen |
| **Cache** (TTL-bewusst) | `getCache` / `setCache` | konfigurierbar | API-Antworten |

Cache-Einträge werden mit `cache_`-Präfix und einem `{ data, timestamp }`-Envelope gespeichert. Wenn „Cache deaktivieren" aktiv ist, wird `setCache` zum No-op: Lesevorgänge liefern immer `null` und erzwingen einen frischen API-Aufruf.

### `src/gitlab/api.js`
Einfache `fetch`-Wrapper. Aufgaben:
- Löst die Base-URL einmalig aus dem Storage auf und speichert sie im Modul-Scope (`_apiBaseUrl`)
- Behandelt 401 mit Benachrichtigung + Options-Seite öffnen
- `doRequest` → `apiGet` / `apiPost` / `apiPut` / `apiDelete` sind die vier öffentlichen Helfer

### `src/gitlab/gitlab.js`
High-Level-Operationen auf Basis von `api.js`. Jede Funktion ist eigenständig: Einstellungen prüfen, Cache checken, API aufrufen, in Cache schreiben. Gibt `null` / `[]` bei Fehler zurück: **keine Exceptions erreichen die UI-Schicht**.

### `src/popup/logic/editor/`
Ersetzt die Drittanbieter-Abhängigkeit EasyMDE (CodeMirror 5) durch ein
natives `<textarea>` plus eine kleine Toolbar. Bewusst kein allgemeiner
Rich-Text-Editor: Das Beschreibungsfeld war schon immer Markdown-*Quelltext*,
der als Markdown-String an die GitLab-Issue-API geht; auf diesem Pfad gibt
es nirgends HTML. `commands.js` ist rein funktional und wird direkt getestet;
`editor.js` ist das einzige Modul, das für die Bearbeitung das DOM anfasst
(Toolbar aufbauen, `Strg+B`/`Strg+I`/`Strg+K` verdrahten, Änderungen via
`execCommand("insertText")` anwenden, damit die native Undo-Funktion
funktioniert); `markdown.js` + `preview.js` rendern ein bewusst kleines
Markdown-Subset für die optionale Vorschau, keine CommonMark-Implementierung
und soll auch keine werden.

### `_locales`-Split-File-Konvention
Übersetzungsstrings liegen in Feature-spezifischen JSONs unter `_locales/<lang>/json/`. Beim Build führt `scripts/merge-locales.js` diese zu einer einzelnen `_locales/<lang>/messages.json` zusammen. **`messages.json` niemals direkt bearbeiten**: Änderungen werden beim nächsten Build überschrieben.

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

Kein Bundler. Die XPI besteht aus den Repository-Dateien unter `src/` plus
`background.js`, `background.html`, `manifest.json`, `icons/` und der
zusammengeführten `_locales/<lang>/messages.json`, von `scripts/build.js`
anhand einer expliziten Allowlist (`INCLUDE_PATHS`) kopiert, nicht per
Denylist herausgefiltert. Nichts wird minifiziert oder transpiliert.

```bash
npm run build:dev   # Führt nur die Locale-JSONs zusammen: zum Laden als entpacktes Add-on
npm run build       # Merged Locales, kopiert die Allowlist, zippt nach builds/
npm run lint        # Baut und prüft die XPI anschließend mit addons-linter
```

### Lokales Laden in Thunderbird

1. `npm run build:dev`
2. Thunderbird → **Extras** → **Add-ons und Themes** → Zahnrad ⚙️ → **Add-ons debuggen** → **Temporäres Add-on laden…**
3. `manifest.json` im Projektstamm auswählen.

Nach jeder Änderung das temporäre Add-on neu laden, wie zuvor, nur ohne
Rebuild-Wartezeit davor: `src/`-Dateien werden direkt geladen, vor dem
Neuladen ist höchstens `npm run build:dev` (bei einer Locale-Änderung) nötig.

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
| `htmlHandler.test.js` | HTML-Body → quotierter Text |
| `emailParser.test.js` | Vollständiges End-to-End-E-Mail-Parsen |
| `emailParser.regression.test.js` | Fixierte Regressionsfälle für frühere Parser-Bugs |
| `cache.test.js` | Settings-CRUD, TTL/ETag-Freshness-Metadaten, stale-aber-nicht-gelöschte Reads, Array-Merge-Helfer |
| `gitlab.test.js` | Einstellungs-Validierung, cache-first Projekt-/Assignee-/Label-Abruf + ETag-Revalidierung, Pagination, serverseitige Suche, zuletzt verwendete Projekte, Issue-Erstellung (inkl. `labels`-Feld), Upload-Löschung |
| `api.test.js` | HTTP-Schicht: Timeout vs. Caller-Abbruch, Retry/Backoff, `Retry-After`, GET-Deduplizierung, paginierte/bedingte (`304`) Requests |
| `requestCount.test.js` | Gemessene GitLab-Request-Zahlen für Kaltstart, Warmstart, Suche und Assignee-Laden gegen das aufgezeichnete Probe-Fixture |
| `uploadRegistry.test.js` | Eager-Upload/Platzhalter-Ersetzung/Lösch-Reconciliation (Bilder UND Anhänge, gleicher Lifecycle), Projektmigration, Konvergenz bei schnellen Änderungen |
| `pickerModal.test.js` | Geteiltes Anhang-/Label-Picker-Modal: Suchfilter, Checkbox-Toggle, Drag-Attribut je Konfiguration, Schließen-Pfade (jsdom) |
| `changelog.test.js` | CHANGELOG.md-Parsing und der ATN-HTML-Renderer |
| `editorCommands.test.js` | Reine Markdown-Editierbefehle (fett/Liste/Link/…) |
| `editorDom.test.js` | Toolbar, Shortcuts, Vorschau-Umschaltung (jsdom) |
| `markdown.test.js` | Markdown-Subset-Parser der Vorschau, inkl. unsicherer URLs |
| `transformToMarkdown.test.js` | `<br>`-Einfügung überspringt Codeblöcke, Tabellen, Listen |

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
3. Build ausführen: die zusammengeführte `messages.json` für das neue Locale wird automatisch generiert.
4. In Thunderbird testen, indem die Anzeigesprache auf das neue Locale gesetzt wird.
