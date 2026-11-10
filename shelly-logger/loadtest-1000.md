# Lasttest Shelly-Logger

| | |
| --- | --- |
| Datum | 2026-11-10T16:57:45.366Z |
| Shelly | simuliert (Gen3 Plug PM) |
| Dauer | 150 s |
| Abfrageintervall | 1000 ms |
| API-Last | Live 1×/s, Verbrauch + Verlauf alle 10 s |
| Rechner | unknown (10 Kerne), Node v22.23.4 |

## Abfrage am Shelly (letzte 60 s)

| Kennzahl | Wert |
| --- | --- |
| Tatsächliche Frequenz | 0.996 Hz (Soll 1.00 Hz) |
| Abfragen / Fehler | 60 / 0 (höchstens 0 Fehler in einer Minute) |
| Antwortzeit Shelly p50 / p95 / max | 4 / 7 / 7 ms |

## Logger-Prozess

| Kennzahl | Wert |
| --- | --- |
| CPU Mittel / max | 0.91 % / 3.25 % (eines Kerns) |
| RAM (RSS) Start / Ende / max | 126.1 / 118.8 / 126.1 MB |
| Geordnetes Beenden | 17 ms, Exit-Code 0 |

## API

| Kennzahl | Wert |
| --- | --- |
| Live p50 / p95 / max | 5.45 / 8.48 / 18.40 ms (149 Anfragen) |
| Verbrauch/Verlauf p50 / p95 / max | 3.98 / 7.90 / 8.52 ms (45 Anfragen) |
| Fehler | 0 |

## SQLite

| Kennzahl | Wert |
| --- | --- |
| Geschriebene 30-s-Intervalle | 4 (≈ 96 je Stunde, 1 Schreibvorgang je 30 s) |
| Dateigröße am Ende | 24.0 KiB (≈ 6144 Byte je Intervall inkl. Tabellen-Grundbedarf) |
| Hochrechnung | ≈ 6159 MiB je Jahr bei 2 880 Intervallen/Tag |
