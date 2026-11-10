# A-008 – Schnellaktion „In Windows starten“

- Status: 📝 notiert
- Notiert: 2026-11-10
- Einordnung: Teil von Stufe 5 (Energiesteuerung, „Neustart in Windows“); baut auf
  [Stufe 5a](../entwicklung/stufe-05a-schlafen-aufwecken-neustart.md) auf und könnte dort mit aufgenommen werden

## Ziel

Eine vierte Schnellaktion im Dashboard neben „schlafen legen“, „Dienste neu starten“ und
„neustarten“: **„In Windows starten“**. MIRA startet den KI-Server neu, und er bootet dabei
**einmalig** in Windows statt in Linux. Beim nächsten normalen Neustart startet wieder Linux.

## Kontext

- Der KI-Server ist ein Dual-Boot-Rechner (Linux und Windows).
- Ein normaler Neustart (Stufe 5a) läuft über logind und polkit ([ADR 0011](../adr/0011-energiesteuerung-polkit-und-direktes-wake-on-lan.md)).
  Für „einmalig Windows“ muss zusätzlich vor dem Neustart das Startziel gesetzt werden – das
  braucht root-Rechte und geht nicht über die logind-Freigabe allein.
- Unter Windows läuft kein MIRA-Agent: MIRA sieht den KI-Server dann als „nicht erreichbar“.

## Lösungswege (zu prüfen)

| Weg | Funktionsweise | Voraussetzung |
| --- | --- | --- |
| **UEFI `BootNext`** (bevorzugt) | `efibootmgr --bootnext <Windows-Eintrag>`, dann Neustart – die Firmware startet einmalig den Windows Boot Manager | UEFI-Systemstart, Windows-Eintrag in der UEFI-Bootliste; unabhängig von der GRUB-Konfiguration |
| **GRUB `grub-reboot`** | `grub-reboot "<Windows-Menüeintrag>"`, dann Neustart | `GRUB_DEFAULT=saved` in `/etc/default/grub`, Windows-Eintrag im GRUB-Menü (os-prober) |

In beiden Fällen ohne sudo und ohne die Härtung des Agents aufzuweichen:

- Ein fester, root-eigener **systemd-Dienst** `mira-reboot-windows.service` (oneshot) setzt das
  Startziel und löst den Neustart aus. Der Agent darf per **polkit** ausschließlich **diesen einen
  Dienst starten** (`org.freedesktop.systemd1.manage-units`, nur diese Unit, nur `start`).
- Agent: `POST /v1/power/reboot-windows` (bereits in der Planung des Agents vorgesehen).
- MIRA: Schnellaktion mit Sicherheitsabfrage, Audit-Log, Sperre wie bei den anderen Energieaktionen.

## Zustand „läuft unter Windows“

- Nach „In Windows starten“ zeigt MIRA den Zustand **„Windows“** statt „nicht erreichbar“, solange der
  Agent nicht antwortet und der Shelly Leistung misst (Rechner läuft) – vorgesehen ist der Zustand
  `windows` bereits im Datenmodell.
- Zurück nach Linux: durch einen normalen Neustart unter Windows (einmaliges Startziel ist dann
  verbraucht). Ein Knopf „zurück zu Linux“ aus MIRA heraus ginge nur mit einem Dienst unter
  Windows – vorerst nicht vorgesehen.

## Offene Fragen (vom Betreiber)

- Startet der KI-Server per UEFI? Ausgabe von `efibootmgr` (Einträge, z. B. „Windows Boot Manager“).
- Alternativ: Wie heißt der Windows-Eintrag im GRUB-Menü, und steht `GRUB_DEFAULT` auf `saved`?
- Liegen Linux und Windows auf getrennten Datenträgern?
- Soll A-008 gleich in Stufe 5a umgesetzt werden oder später mit Stufe 5?
