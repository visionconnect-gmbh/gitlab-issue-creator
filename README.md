# GitLab Ticket Creator | Thunderbird Add-on
**ENGLISH VERSION:** [README_en](./README_en.md)

Dieses kleine Thunderbird Add-on ermöglicht, **GitLab-Issues direkt aus E-Mails zu erstellen**.

## Was kann es?

  * **Direkt aus der Mail:** Erstellt GitLab-Issues, während ihr noch in der E-Mail seid.
  * **Titel-Automatik:** Der E-Mail-Betreff wird direkt zum Ticket-Titel\!
  * **Voller Kontext:** Der gesamte E-Mail-Verlauf landet automatisch in der Ticketbeschreibung. So ist immer klar, worum es geht.
  * **Projekt schnell finden:** Eine einfache Suche hilft euch, das richtige GitLab-Projekt auszuwählen.
  * **Anpassbar:** Ihr könnt den Titel und die Beschreibung vor dem Absenden natürlich noch anpassen oder Infos hinzufügen.

## Installation

### Hauptweg: Direkt in Thunderbird

1. Thunderbird öffnen.
2. Oben rechts das Hamburger-Menü öffnen.
3. „Add-ons und Themes“ auswählen.
4. Im Suchfeld **GitLab Issue Creator** eingeben.
5. Den Treffer **GitLab Issue Creator** öffnen.
6. Auf **Zu Thunderbird hinzufügen** klicken.
7. Hinzufügen bestätigen

### Alternative: Installation aus Datei

1. Add-on-Seite öffnen: [GitLab Issue Creator](https://addons.thunderbird.net/de/thunderbird/addon/gitlab-issue-creator)
2. Die Datei herunterladen.
3. In Thunderbird oben rechts das Hamburger-Menü öffnen.
4. „Add-ons und Themes“ auswählen.
5. Das Zahnrad-Symbol (⚙️) anklicken.
6. **Add-on aus Datei installieren** wählen.
7. Die heruntergeladene Datei auswählen und installieren.
8. Thunderbird neu starten, falls danach gefragt wird.

### Für die Entwickler (zum Testen)

Wenn ihr am Add-on schraubt oder es testen wollt:

1.  Klonen des Repos: `git clone https://gitlab.visionconnect.de/kirchner/thunderbird-gitlab-issue.git`
2.  In den Ordner wechseln: `cd thunderbird-gitlab-issue` (oder wie immer der Ordner bei euch heißt)
3.  Abhängigkeiten installieren: `npm install`
4.  Build starten: `npm run build:dev` (das erzeugt den `dist/` Ordner mit dem gebündelten Code)
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

Vor der ersten Verwendung werdet ihr aufgefordert die Gitlab URL, sowie einen persönlichen Access Token zu hinterlegen.
- Diesen könnt ihr hier erstellen: [Access Token generieren](https://gitlab.visionconnect.de/-/user_settings/personal_access_tokens)
  - **Wichtig:** Dieser Token benötigt Rechte für die API

[Mehr Infos zu den Optionen](./md/OPTIONS.md)

### Aufbau des Projekts

[Struktur](./md/STRUCTURE.md)

### Build-Befehle

  * **Abhängigkeiten installieren:** `npm install`
  * **Projekt bauen:** `npm run build`
