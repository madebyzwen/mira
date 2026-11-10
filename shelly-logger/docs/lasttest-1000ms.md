# Lasttest Shelly-Logger

| | |
| --- | --- |
| Datum | 2026-11-10T17:01:30.534Z |
| Shelly | simuliert (Gen3 Plug PM) |
| Dauer | 240 s |
| Abfrageintervall | 1000 ms |
| API-Last | Live 1×/s, Verbrauch + Verlauf alle 10 s |
| Rechner | unknown (10 Kerne), Node v22.23.4 |
| Logger | gebaut (dist, wie im Container) |

## Abfrage am Shelly (letzte 60 s)

| Kennzahl | Wert |
| --- | --- |
| Tatsächliche Frequenz | 0.995 Hz (Soll 1.00 Hz) |
| Abfragen / Fehler | 60 / 0 (höchstens 0 Fehler in einer Minute) |
| Antwortzeit Shelly p50 / p95 / max | 4 / 7 / 8 ms |

## Logger-Prozess

| Kennzahl | Wert |
| --- | --- |
| CPU Mittel / max | 0.84 % / 2.70 % (eines Kerns) |
| RAM (RSS) Start / Ende / max | 93.6 / 87.5 / 93.6 MB |
| Geordnetes Beenden | 17 ms, Exit-Code 0 |

## API

| Kennzahl | Wert |
| --- | --- |
| Live p50 / p95 / max | 5.48 / 7.93 / 14.85 ms (238 Anfragen) |
| Verbrauch/Verlauf p50 / p95 / max | 3.57 / 7.64 / 8.38 ms (72 Anfragen) |
| Fehler | 0 |

## SQLite

| Kennzahl | Wert |
| --- | --- |
| Schreibvorgänge im Test | 7 Intervalle (≈ 105 je Stunde – eine Transaktion je 30 s) |
| Dateigröße nach dem Test | 24.0 KiB (überwiegend Grundbedarf der Datei) |
| Wachstum (30 Tage synthetisch) | 86400 Intervalle → 6.8 MiB, ≈ 82 Byte je Intervall |
| Hochrechnung | ≈ 82 MiB je Jahr (2 880 Intervalle je Tag, ohne Löschung) |
| Verlauf 30 Tage aus 86 400 Intervallen | 28.3 ms |
