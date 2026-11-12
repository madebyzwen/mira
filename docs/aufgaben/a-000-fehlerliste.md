# A-000 – Fehlerliste

- Status: 📝 laufend gepflegt
- Angelegt: 2026-11-12

Sammelliste für gefundene Fehler, die später behoben werden. Jeder Eintrag erhält eine
fortlaufende Nummer und bleibt nach der Behebung mit Datum und Version stehen.

| Nr. | Bereich | Fehler | Gefunden | Status |
| --- | --- | --- | --- | --- |
| 1 | Systeme › KI-Server | Wird der KI-Server schlafen gelegt, zeigt MIRA ihn nicht sofort als „offline“ an | 2026-11-12 | 📝 offen |
| 2 | Konfiguration › MIRA › Konto | Das Feld „Aktuelles Passwort“ ist beim Öffnen bereits ausgefüllt (als Punkte) | 2026-11-12 | 📝 offen |

Status: 📝 offen · 🔎 in Klärung · 🚧 in Arbeit · ✅ behoben

## 1 – KI-Server erscheint nach dem Schlafenlegen nicht sofort als „offline“

**Beobachtung:** Nach dem Schlafenlegen des KI-Servers zeigt MIRA ihn noch eine Weile als „online“.

**Erste Einschätzung (zu prüfen):**

- MIRA wertet den KI-Server erst als „offline“, wenn `MIRA_AI_SERVER_OFFLINE_SECONDS`
  (Standard 10 s) lang keine Antwort kam. Eine Abfrage wartet bis zu 5 s auf eine Antwort.
- Die Oberfläche fragt den Zustand selbst nur in festen Abständen ab, was die Anzeige zusätzlich verzögert.
- Die Verbindung zum Agent bleibt offen (Keep-Alive). Ein schlafender Rechner beendet sie nicht
  sauber, daher läuft jede Anfrage bis zur Zeitüberschreitung.
- Zu klären: wie lange die Verzögerung tatsächlich ist, und ob ein eigener Zustand „schläft“
  vorgesehen wird, sobald MIRA das Schlafenlegen selbst auslöst (Stufe 5).

## 2 – Feld „Aktuelles Passwort“ ist vorbelegt

**Beobachtung:** Unter Konfiguration › MIRA › Konto steht im Feld „Aktuelles Passwort“ beim Öffnen
bereits ein (verdecktes) Passwort.

**Erwartet:** Das Feld ist immer leer; das aktuelle Passwort muss bei jeder Änderung eingetippt werden.

**Erste Einschätzung (zu prüfen):** MIRA setzt das Feld leer auf. Vermutlich füllt der Browser bzw.
Passwort-Manager es automatisch aus (`autocomplete="current-password"` und ein verstecktes Feld
mit dem Benutzernamen im Formular). Lösung z. B. über einen anderen `autocomplete`-Wert bzw. ein
Formular, das der Browser nicht als Anmeldung erkennt; in Chrome, Safari und Firefox prüfen.
