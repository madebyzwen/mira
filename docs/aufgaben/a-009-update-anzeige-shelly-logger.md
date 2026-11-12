# A-009 – Update-Anzeige auch für den Shelly-Logger

- Status: 📝 notiert
- Notiert: 2026-11-12
- Verwandt: [A-004](a-004-update-hinweis-benachrichtigungen.md) (Update-Prüfung für MIRA und MIRA-Agent),
  [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md) (Shelly-Logger als eigener Container)

## Ziel

Konfiguration › MIRA › Updates zeigt bisher MIRA und den MIRA-Agent (installiert, neueste Version,
„Update verfügbar“). Der **Shelly-Logger** soll dort genauso erscheinen; ist eine neuere Version
veröffentlicht, meldet MIRA das wie bei den anderen Komponenten in der Glocke – mit dem Hinweis,
wie der Logger-Stack aktualisiert wird.

## Kontext

- **Installierte Version:** kennt MIRA bereits – der Logger meldet sie über `/health`, sie wird
  unter Systeme › Shelly Plug angezeigt (höchstens alle 10 Minuten neu gelesen).
- **Neueste Version:** Die Update-Prüfung fragt bei GitHub das neueste Release ab
  (`releases/latest`). Das liefert nur die Versionen von MIRA und des Agent-Pakets. Für den
  Logger entsteht bei einem Tag `shelly-logger-vX.Y.Z` nur das Image, **kein GitHub-Release**.

## Lösungswege (zu prüfen)

1. **Tags abfragen:** zusätzlich die Tags `shelly-logger-v*` bei GitHub lesen und die höchste
   Version nehmen. Eine weitere Abfrage je Prüfung (GitHub-Limit ohne Anmeldung: 60 je Stunde).
2. **Logger-Version im MIRA-Release vermerken:** Die CI schreibt beim MIRA-Release die aktuelle
   Logger-Version mit hinein (z. B. als Datei im Release). Nur eine Abfrage, aber eine neue
   Logger-Version wird erst mit dem nächsten MIRA-Release sichtbar.
3. **Eigene GitHub-Releases für den Logger:** Vorsicht – `releases/latest` könnte dann das
   Logger-Release statt des MIRA-Releases liefern; die bestehende Prüfung müsste angepasst werden.

## Offene Fragen

- Welcher Lösungsweg? (Vorschlag: 1 – unabhängig von MIRA-Releases, passt zur getrennten Versionierung)
- Text des Hinweises in der Glocke (Update im Stack „mira-shelly-logger“, Version in `LOGGER_VERSION`).
