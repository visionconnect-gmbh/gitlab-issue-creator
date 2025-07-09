# GitLab Ticket Creator | Thunderbird Add-on

Dieses kleine Thunderbird Add-on ermöglicht, **GitLab-Issues direkt aus E-Mails zu erstellen**.

## Was kann es?

  * **Direkt aus der Mail:** Erstellt GitLab-Issues, während ihr noch in der E-Mail seid.
  * **Titel-Automatik:** Der E-Mail-Betreff wird direkt zum Ticket-Titel\!
  * **Voller Kontext:** Der gesamte E-Mail-Verlauf landet automatisch in der Ticketbeschreibung. So ist immer klar, worum es geht.
  * **Projekt schnell finden:** Eine einfache Suche hilft euch, das richtige GitLab-Projekt auszuwählen.
  * **Anpassbar:** Ihr könnt den Titel und die Beschreibung vor dem Absenden natürlich noch anpassen oder Infos hinzufügen.

## Installation

### Für alle Kollegen

**TO BE ANNOUNCED**

### Für die Entwickler (zum Testen)

Wenn ihr am Add-on schraubt oder es testen wollt:

1.  Klonen des Repos: `git clone https://gitlab.visionconnect.de/kirchner/thunderbird-gitlab-issue.git`
2.  In den Ordner wechseln: `cd thunderbird-gitlab-issue` (oder wie immer der Ordner bei euch heißt)
3.  Abhängigkeiten installieren: `npm install`
4.  Build starten: `npm run build` (das erzeugt den `dist/` Ordner mit dem gebündelten Code)
5.  Thunderbird öffnen.
6.  Geht zu `Extras` \> `Add-ons und Themes`.
7.  Klickt auf das Zahnrad-Symbol (⚙️) und wählt `Temporäres Add-on laden...`.
8.  Navigiert zum Ordner eures geklonten Repos und wählt die Datei `manifest.json` aus.

## So funktioniert's

1.  **E-Mail aufmachen:** Sucht die E-Mail, aus der ihr ein Ticket machen wollt.
2.  **Add-on klicken:** In der Thunderbird-Symbolleiste (meist oben rechts) findet den Add-on-Button. Draufklicken, um das kleine Fenster zu öffnen.
3.  **Projekt wählen:** Tippt im Suchfeld, um euer GitLab-Projekt zu finden, und wählt es aus der Liste.
4.  **Titel & Beschreibung checken:** Der Titel kommt vom E-Mail-Betreff, die Beschreibung ist der E-Mail-Verlauf. Passt beides an, wenn nötig.
5.  **Ticket erstellen:** Klickt auf "Ticket erstellen". Das Add-on schickt alles an unser GitLab und zack – das Issue ist da\!

## Konfiguration 

Vor der ersten Verwendung werdet ihr aufgefordert die Gitlab URL, sowie einen persönlichen Access Tocken zu hinterlegen.
Diesen könnt ihr hier erstellen: [Access Token generieren](https://gitlab.visionconnect.de/-/user_settings/personal_access_tokens)
- Wichtig: Dieser Token benötigt Rechte für die API

### Aufbau des Projekts

```
├── manifest.json                  # Die "Identitätskarte" des Add-ons
├── background.js                  # Einstiegspunkt für den Hintergrundprozess (Logik)
├── package.json                   # Node.js-Konfiguration und Abhängigkeiten
├── rollup.config.mjs              # Rollup-Bundler-Konfiguration
├── readme.md                      # Projektbeschreibung und Hinweise
├── dist/                          # Ausgabeordner für gebündelte Skripte (wird von Git ignoriert!)
│   ├── bundled-background.js
│   └── bundled-background.js.map
├── icons/                         # Icons für verschiedene Auflösungen
│   ├── icon-16x.png
│   ├── [...]
│   ├── icon-64x.png
│   └── Ixon.svg
└── src/                           # Quellverzeichnis
    ├── theme.css                  # Globale Styles
    ├── gitlab/                    # GitLab-bezogene Module
    │   ├── api.js                 # API-Wrapper für GitLab
    │   └── gitlab.js             # Logik für GitLab-Interaktionen
    ├── options/                   # Einstellungsseite
    │   ├── options.html           # Oberfläche für Nutzeroptionen
    │   └── options.js             # Logik zur Verarbeitung der Eingaben
    ├── popup/                     # Popup-Fenster zur Ticketerstellung
    │   ├── ticket_creator.html    # UI für das Ticket-Popup
    │   ├── ticket_creator.js      # JS-Logik für Projektauswahl & Co.
    │   └── easymde/               # Eingebundener Markdown-Editor (Drittanbieter)
    │       ├── easymde.min.css
    │       └── easymde.min.js
    └── utils/                     # Hilfsfunktionen
        ├── utils.js               # Allgemeine Utility-Funktionen
        └── cache.js               # Zwischenspeicher für API-Antworten
```

### Build-Befehle

  * **Abhängigkeiten installieren:** `npm install`
  * **Projekt bauen:** `npm run build`
  * **Automatisch bauen bei Änderungen:** `npm run watch`