# 0011 – HTTPS-Pflicht über `MIRA_PUBLIC_URL` und enges Proxy-Vertrauen

- Status: angenommen
- Datum: 2026-11-12
- Ergänzt: [ADR 0004](0004-anmeldung-sessions-erstes-konto.md) (Anmeldung, Sessions)

## Kontext

MIRA hat über das macvlan-Netz eine eigene Adresse im Server-Netz und lauscht dort auf Port 80 –
nötig vor allem für die Verbindungen von MIRA zum KI-Server. HTTPS stellt der Reverse Proxy bereit.
Über `http://<MIRA_IP>` konnten Benutzername, Passwort und Session-Cookie unverschlüsselt übertragen
werden. `Secure` am Cookie hing davon ab, ob MIRA HTTPS über die Header des Proxys erkannte. Die
Anleitung empfahl, dem ganzen Proxy-Subnetz zu vertrauen.

Rahmenbedingungen:

- Ein normales Update darf MIRA nicht ohne Vorwarnung unerreichbar machen.
- Fastify bindet genau eine Adresse, und die Adresse im Proxy-Netz vergibt Docker dynamisch.
- Verkehr im selben VLAN läuft nicht über die OPNsense.

## Entscheidung

- Neue Variable `MIRA_PUBLIC_URL` (öffentliche HTTPS-Adresse). Gesetzt = **HTTPS-Pflicht**:
  - Seiten über HTTP → `308` auf die HTTPS-Adresse.
  - API über HTTP → `403 https_required`, bevor der Body gelesen wird.
  - Cookie immer `Secure`, dazu HSTS.
  - Origin-Prüfung exakt gegen die öffentliche Herkunft.
  - `/health` bleibt offen.
- HTTPS erkennt MIRA nur an `X-Forwarded-Proto` von Absendern in `MIRA_TRUST_PROXY`. Mit
  HTTPS-Pflicht ist `MIRA_TRUST_PROXY` Pflicht, `true` verboten. Einträge werden geprüft, große Netze
  erzeugen eine Warnung. Empfohlen ist die feste Adresse des Proxys oder ein kleines, eigenes Proxy-Netz.
- Ohne `MIRA_PUBLIC_URL` bleibt das bisherige Verhalten. Dazu gibt es eine Warnung beim Start und
  eine Meldung in der Glocke, bis der Betreiber die Variable setzt.

## Alternativen

- **Nur an das Proxy-Netz binden:** Die Adresse ist dynamisch, mehrere Adressen kann Fastify nicht
  binden – das wäre nicht robust.
- **Netzregel in der OPNsense:** greift im selben VLAN nicht.
- **`Secure`-Cookie immer erzwingen, unabhängig von der Konfiguration:** Über HTTP wäre dann keine
  Anmeldung mehr möglich, ohne Vorwarnung nach einem normalen Update.
- **Eigener TLS-Listener in MIRA:** doppelte Zertifikatsverwaltung neben dem Proxy, kein Mehrwert im Heimnetz.

## Konsequenzen

- Mit gesetzter Variable kommen Anmeldeformular und Session-Cookie nie über HTTP. Ein Client, der
  Zugangsdaten ohne Seitenaufruf direkt per HTTP sendet, überträgt sie weiterhin im Klartext; MIRA
  lehnt ab und protokolliert (`auth.insecure_transport`).
- Ein falscher Wert in `MIRA_TRUST_PROXY` sperrt die Anmeldung über den Proxy (`https_required`).
  Rückweg: `MIRA_PUBLIC_URL` leeren.
- Das Einschalten ist ein bewusster Schritt des Betreibers ([Deployment](../entwicklung/security-hardening-review.md#deployment)).
