# Gerätefotos

MIRA zeigt Fotos aus diesem Ordner anstelle der mitgelieferten SVG-Grafiken an,
sofern eine passende Datei vorhanden ist:

| Datei                                   | Verwendet auf                         |
| --------------------------------------- | ------------------------------------- |
| `shelly-plug.png` / `.webp` / `.jpg`    | Systeme › Shelly Plug                 |
| `ki-server.png` / `.webp` / `.jpg`      | Systeme › KI-Server, Dashboard        |

Empfehlung: PNG oder WebP mit **transparentem Hintergrund**, ca. 400–600 px.

Versioniert wird derzeit nur `shelly-plug.png`; alle übrigen Dateien in diesem
Ordner sind per `.gitignore` ausgenommen und bleiben lokal. Nach dem Ablegen
genügt ein Neuladen (`npm run dev`) bzw. ein neuer Docker-Build.
