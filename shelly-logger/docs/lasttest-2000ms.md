# Lasttest Shelly-Logger

| | |
| --- | --- |
| Datum | 2026-11-10T17:05:31.576Z |
| Shelly | simuliert (Gen3 Plug PM) |
| Dauer | 120 s |
| Abfrageintervall | 2000 ms |
| API-Last | Live 1×/s, Verbrauch + Verlauf alle 10 s |
| Rechner | unknown (10 Kerne), Node v22.23.4 |
| Logger | gebaut (dist, wie im Container) |

## Abfrage am Shelly (letzte 60 s)

| Kennzahl | Wert |
| --- | --- |
| Tatsächliche Frequenz | 0.499 Hz (Soll 0.50 Hz) |
| Abfragen / Fehler | 29 / 0 (höchstens 0 Fehler in einer Minute) |
| Antwortzeit Shelly p50 / p95 / max | 4 / 7 / 7 ms |

## Logger-Prozess

| Kennzahl | Wert |
| --- | --- |
| CPU Mittel / max | 0.68 % / 2.43 % (eines Kerns) |
| RAM (RSS) Start / Ende / max | 91.8 / 85.2 / 91.8 MB |
| Geordnetes Beenden | 19 ms, Exit-Code 0 |

## API

| Kennzahl | Wert |
| --- | --- |
| Live p50 / p95 / max | 5.67 / 8.41 / 14.68 ms (119 Anfragen) |
| Verbrauch/Verlauf p50 / p95 / max | 3.95 / 7.80 / 8.47 ms (36 Anfragen) |
| Fehler | 0 |

## SQLite

| Kennzahl | Wert |
| --- | --- |
| Schreibvorgänge im Test | 3 Intervalle (≈ 90 je Stunde – eine Transaktion je 30 s) |
| Dateigröße nach dem Test | 24.0 KiB (überwiegend Grundbedarf der Datei) |
| Wachstum (30 Tage synthetisch) | 86400 Intervalle → 6.8 MiB, ≈ 82 Byte je Intervall |
| Hochrechnung | ≈ 82 MiB je Jahr (2 880 Intervalle je Tag, ohne Löschung) |
| Verlauf 30 Tage aus 86 400 Intervallen | 28.0 ms |
