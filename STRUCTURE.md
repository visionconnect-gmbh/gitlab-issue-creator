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
│   └── Icon.svg
│   └── vc-icon-32px.png           # Firmenlogo für den Contributions-Footer in den Optionen
└── src/                           # Quellverzeichnis
    ├── theme.css                  # Globale Styles
    ├── emailContent.js            # Logik für das Parsen der E-Mail-Inhalte
    ├── Enums.js                   # Konstanten zum einheitlichen Handling
    ├── gitlab/                    # GitLab-bezogene Module
    │   ├── api.js                 # API-Wrapper für GitLab
    │   └── gitlab.js              # Logik für GitLab-Interaktionen
    ├── options/                   # Einstellungsseite
    │   ├── options.html           # Oberfläche für Nutzeroptionen
    │   └── options.js             # Logik zur Verarbeitung der Eingaben
    ├── popup/                     # Popup-Fenster zur Ticketerstellung
    │   ├── ticket_creator.html    # UI für das Ticket-Popup
    │   ├── main.js                # Einstiegspunkt für das Popup
    │   ├── logic/                 # Strukturierte Logik für das Popup
    │   │   ├── handler.js         # Event-Handler und Interaktionen
    │   │   ├── state.js           # Zustandsverwaltung des Formulars
    │   │   └── ui.js              # Funktionen zur UI-Manipulation
    │   └── easymde/               # Eingebundener Markdown-Editor (Drittanbieter)
    │       ├── easymde.min.css
    │       └── easymde.min.js
    └── utils/                     # Hilfsfunktionen
        ├── utils.js               # Allgemeine Utility-Funktionen
        └── cache.js               # Zwischenspeicher für API-Antworten
```