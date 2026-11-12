# A-005 – Sperrfrist für „Jetzt prüfen“ nach der Entwicklungsphase wieder aktivieren

- Status: ✅ erledigt (2026-11-12, MIRA 0.9.0, [Wartung W1](../entwicklung/security-hardening-review.md#b-02--sperrfrist-jetzt-prüfen))
- Notiert: 2026-11-07
- Verwandt: [A-004](a-004-update-hinweis-benachrichtigungen.md) (Update-Hinweis und Benachrichtigungen)

## Ziel

Der Knopf „Jetzt prüfen“ (Konfiguration › MIRA › Updates) soll nach der Entwicklungsphase
wieder höchstens **eine Prüfung je Stunde** auslösen – wie in A-004 festgelegt.

## Kontext

Während der Entwicklung prüft **jeder Klick** sofort bei GitHub, unabhängig von der Regel
(Entscheidung 2026-11-07). Die Sperrfrist ist dafür nur ausgeschaltet, nicht entfernt:
Logik, Anzeige („Erneut prüfen ab … Uhr möglich“) und Tests sind vorhanden.

Die automatischen Prüfungen (täglich 04:00, erster Aufruf am Tag) sind davon nicht betroffen.

Hinweis: GitHub erlaubt ohne Token 60 Abfragen je Stunde und Adresse. Wird das Limit durch
häufiges Klicken erreicht, zeigt MIRA „GitHub hat die Anfrage vorübergehend abgelehnt (Abfragelimit)“.

## Umsetzung (wenn es so weit ist)

1. In `backend/core/updates/updateService.ts` die Konstante
   `MANUAL_CHECK_INTERVAL_MS = 0` auf `MANUAL_CHECK_LOCK_MS` (1 Stunde) zurücksetzen und den
   Kommentar „ENTWICKLUNGSPHASE“ entfernen.
2. In `backend/test/updates.test.ts` den Test „Entwicklungsphase (A-005) …“ entfernen bzw. so
   umstellen, dass die Sperrfrist ohne `manualCheckIntervalMs` gilt.
3. A-004 (Abschnitt „Umsetzung“) und diese Aufgabe als erledigt markieren; Release erstellen.

## Ergebnis (2026-11-12)

Umgesetzt in der [Wartung W1](../entwicklung/security-hardening-review.md) (Befund B-02 des Code-Reviews):
`MANUAL_CHECK_INTERVAL_MS = MANUAL_CHECK_LOCK_MS` (1 Stunde), Kommentar „ENTWICKLUNGSPHASE“ entfernt,
der Test der Entwicklungsphase ersetzt durch Tests für die Sperrfrist ab Werk, gleichzeitige Klicks
(genau eine Abfrage), fehlgeschlagene Prüfungen (starten die Sperrfrist, Audit „failure“) und eine
zurückgestellte Uhr.
