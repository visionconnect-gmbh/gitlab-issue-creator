# Optionen des Add-ons: GitLab Ticket Creator

Diese Seite beschreibt die Konfigurationsmöglichkeiten des Thunderbird-Add-ons **GitLab Ticket Creator**. Die Einstellungen werden benötigt, damit das Add-on korrekt mit eurer GitLab-Instanz kommunizieren kann. Einige Optionen dienen zusätzlich der Optimierung des Nutzererlebnisses.

---

## GitLab URL

**Feld:** `GitLab URL`
**Typ:** Textfeld
**Beispiel:** `https://gitlab.visionconnect.de`

Hier tragt ihr die URL eurer GitLab-Instanz ein. Sie muss gültig und öffentlich erreichbar sein, sonst schlägt die Verbindung fehl.

**Hinweis:**
Falls ihr das Protokoll (`https://`) vergesst, wird es automatisch ergänzt. Ungültige Eingaben werden abgefangen und führen zu einem Hinweis.

---

## GitLab Access Token

**Feld:** `GitLab Token`
**Typ:** Passwortfeld (umschaltbar sichtbar)

Das Add-on benötigt einen persönlichen Access Token, um Tickets in eurem Namen anlegen zu können. Dieser Token wird **lokal gespeichert** und **nicht an Dritte übermittelt**.

**Benötigte Berechtigungen:**
Der Token muss mindestens folgende Rechte besitzen:

* `api` – für das Anlegen von Issues

**Token erstellen:**
Die Schaltfläche „Access Token erstellen“ erscheint automatisch, sobald eine gültige GitLab-URL eingetragen wurde, aber noch kein Token gesetzt ist. Sie verweist direkt zur passenden Seite des GitLabs.

---

## Assignee-Autovervollständigung

**Option:** `Assignees automatisch laden`
**Typ:** Checkbox

Ist diese Option aktiviert, lädt das Add-on automatisch die Liste möglicher Verantwortlicher aus dem jeweiligen GitLab-Projekt. Diese Funktion ist optional, aber hilfreich, wenn ihr Issues direkt mit einem zuständigen Entwickler versehen wollt.

**Beachtet:**
Diese Funktion kann bei sehr großen Gruppen zu längeren Ladezeiten führen.

---

## Aufräumen / Cache leeren

Diese Buttons sind vor allem für Entwickler oder beim Debuggen relevant. Sie löschen lokal gespeicherte Daten, ohne das GitLab selbst zu beeinflussen.

### „Cache leeren“

Leert sämtliche zwischengespeicherten Daten des Add-ons. Dazu gehören Projektlisten, Assignee-Daten und gespeicherte Metainformationen. Wird z. B. nötig, wenn sich Projekte geändert haben.

### „Projekte zurücksetzen“

Löscht ausschließlich den Cache der GitLab-Projektliste. Praktisch, wenn neue Projekte hinzugefügt wurden, die nicht erscheinen.

### „Zuständige zurücksetzen“

Löscht die lokal gespeicherte Liste der möglichen Assignees. Wird beim nächsten Öffnen neu geladen (wenn die Funktion aktiviert ist).

---

## Speicherort der Einstellungen

Alle Einstellungen werden lokal in Thunderbird gespeichert (`browser.storage.local`). Eine Synchronisation über mehrere Geräte hinweg erfolgt nicht automatisch.

---

## Fehlerbehandlung

Fehlermeldungen werden direkt im Add-on-Fenster über `alert()` ausgegeben. Bei Problemen mit der GitLab-Verbindung oder falscher Konfiguration gibt es klare Rückmeldungen, damit ihr nachvollziehen könnt, was fehlt oder falsch ist.

---

## Zusammenfassung

| Einstellung                        | Beschreibung                                         |
| ---------------------------------- | ---------------------------------------------------- |
| **GitLab URL**                     | URL zur GitLab-Instanz                               |
| **GitLab Token**                   | Persönlicher Access Token mit API-Rechten            |
| **Assignee-Autovervollständigung** | Aktiviert das automatische Nachladen von Zuständigen |
| **Cache leeren**                   | Löscht alle gespeicherten Metadaten                  |
| **Projekte zurücksetzen**          | Löscht nur die Projektliste                          |
| **Zuständige zurücksetzen**        | Löscht nur die Liste der Assignees                   |
