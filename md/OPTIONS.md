# Optionen – GitLab Issue Creator

> **English version:** [OPTIONS_en.md](./OPTIONS_en.md)

Diese Seite beschreibt alle Einstellungen der **Options**-Seite (`Add-ons und Themes → GitLab Issue Creator → Options`).  
Alle Werte werden lokal in `browser.storage.local` gespeichert – eine automatische Synchronisation über mehrere Geräte findet nicht statt.

---

## Pflichtfelder

Diese beiden Felder müssen ausgefüllt sein, bevor das Add-on funktioniert.

### GitLab URL

| | |
|---|---|
| **Storage-Key** | `gitlab_settings.url` |
| **Typ** | Textfeld |
| **Beispiel** | `https://gitlab.example.com` |

Die Basis-URL eurer GitLab-Instanz.  
Das Protokoll `https://` wird automatisch ergänzt, wenn es fehlt. Ungültige oder nicht erreichbare URLs werden beim Speichern abgefangen und als Fehlermeldung angezeigt.

> ℹ️ Self-hosted-Instanzen funktionieren genauso wie gitlab.com – einfach die eigene Domain eintragen.

---

### Personal Access Token

| | |
|---|---|
| **Storage-Key** | `gitlab_settings.token` |
| **Typ** | Passwortfeld (Auge-Icon schaltet Sichtbarkeit um) |
| **Benötigter Scope** | `api` |

Der Token für die Authentifizierung aller API-Aufrufe.  
Er wird lokal gespeichert und ausschließlich an eure eigene GitLab-Instanz übertragen.

**Token erstellen:**  
Die Schaltfläche **„Access Token erstellen"** erscheint automatisch, sobald eine gültige GitLab-URL gespeichert ist, aber noch kein Token vorhanden ist. Sie öffnet direkt die Token-Seite eures GitLabs.  
Alternativ direkt aufrufen: `<eure-gitlab-url>/-/user_settings/personal_access_tokens`

> ⚠️ Nur der Scope `api` ist erforderlich. Vergebt nicht mehr Rechte als nötig.

---

## Optionale Einstellungen

Standardmäßig deaktiviert. Jede Checkbox speichert sich einzeln beim Umschalten – es gibt keinen separaten Speichern-Button für Checkboxen.

### Zuständige automatisch laden

| | |
|---|---|
| **Storage-Key** | `enable_assignee_loading` |
| **Standard** | `false` (aus) |

Wenn aktiviert, lädt das Popup die Mitgliederliste des ausgewählten GitLab-Projekts, damit ein Issue direkt zugewiesen werden kann.  
Dies erzeugt einen zusätzlichen API-Aufruf pro Projekt beim ersten Aufruf. Ergebnisse werden gecacht (~9 h TTL), sodass spätere Öffnungen sofort laden.

> ℹ️ Bei sehr großen Gruppen (hunderte Mitglieder) oder wenn Zuweisung nicht benötigt wird, lieber deaktiviert lassen.

---

### Wasserzeichen

| | |
|---|---|
| **Storage-Key** | `enable_watermark` |
| **Standard** | `true` (an) |

Hängt jedem Issue-Beschreibungstext einen unsichtbaren HTML-Kommentar an:

```
<!-- created with gitlab-issue-creator (vX.Y.Z) -->
```

In GitLabs gerendertem Markdown nicht sichtbar, ermöglicht aber das Filtern von Issues, die mit diesem Add-on erstellt wurden.

---

### Cache deaktivieren

| | |
|---|---|
| **Storage-Key** | `disable_cache` |
| **Standard** | `false` (aus) |

Zwingt alle API-Aufrufe, den lokalen Cache zu ignorieren und immer frische Daten zu laden.

> ⚠️ Nur zum Debuggen oder bei veralteten Daten aktivieren. Macht jedes Popup-Öffnen spürbar langsamer.

---

## Cache-Verwaltungs-Buttons

Diese Buttons löschen lokal gespeicherte Daten. GitLab selbst wird **nicht** verändert.

| Button | Was wird gelöscht | Wann sinnvoll |
|---|---|---|
| **Cache leeren** | Alle gecachten API-Antworten (Projekte + Zuständige + User) | Vollständiger Reset |
| **Projekte leeren** | Nur die gecachte Projektliste | Ein neues Projekt erscheint nicht |
| **Zuständige leeren** | Nur den gecachten Assignee-Map | Ein neues Teammitglied erscheint nicht |
| **Add-on zurücksetzen** | Alles inklusive Einstellungen | Neustart / GitLab-Instanz wechseln |

> ℹ️ Nach dem Leeren wird beim nächsten Popup-Öffnen alles neu von GitLab geladen. Das kann wenige Sekunden länger dauern.

---

## Storage-Referenz

Alle Einstellungen liegen in Thunderbirds `browser.storage.local`. Verwendete Keys:

| Key | Inhalt |
|---|---|
| `gitlab_settings` | `{ url, token }`-Objekt |
| `enable_assignee_loading` | boolean |
| `enable_watermark` | boolean |
| `disable_cache` | boolean |
| `cache_projects` | `{ data, timestamp }` – Projektlisten-Cache |
| `cache_assignees_ALL` | `{ data, timestamp }` – Assignee-Map-Cache |
| `cache_current_user` | `{ data, timestamp }` – Authentifizierter-User-Cache |

> 📎 Key-Namen sind in `src/utils/Enums.js → CacheKeys` definiert. Diese Datei ist die maßgebliche Quelle bei Abweichungen.

---

## Fehlermeldungen-Referenz

| Meldung | Ursache | Lösung |
|---|---|---|
| *„Bitte eine gültige GitLab-URL eingeben"* | URL-Feld leer oder falsch | Vollständige URL eingeben, z.B. `https://gitlab.example.com` |
| *„Bitte einen gültigen GitLab-Token eingeben"* | Token-Feld leer | Token mit `api`-Scope erstellen und einfügen |
| *„GitLab-URL nicht erreichbar"* | Server antwortet nicht | Netzwerk / VPN prüfen |
| *„Ungültiger GitLab-Token"* | 401 von der API | Token abgelaufen, widerrufen oder ohne `api`-Scope |
| *„GitLab-Einstellungen fehlen"* | Token oder URL nicht gesetzt | Options öffnen und beide Felder ausfüllen |
