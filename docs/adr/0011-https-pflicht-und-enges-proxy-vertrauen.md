# 0011 – HTTPS-Pflicht über `MIRA_PUBLIC_URL` und enges Proxy-Vertrauen

- Status: angenommen
- Datum: 2026-11-12
- Ergänzt: [ADR 0004](0004-anmeldung-sessions-erstes-konto.md) (Anmeldung, Sessions)

## Kontext

MIRA hat über das macvlan-Netz eine eigene Adresse im Server-Netz – vor allem für die Verbindungen
von MIRA zum KI-Server. HTTPS stellt der Reverse Proxy bereit. Anmeldungen sollen ausschließlich
über diesen HTTPS-Zugang laufen.

Rahmenbedingungen:

- Ein normales Update darf MIRA nicht ohne Vorwarnung unerreichbar machen.
- Fastify bindet genau eine Adresse, und die Adresse im Proxy-Netz vergibt Docker dynamisch.
- Verkehr im selben VLAN läuft nicht über die Firewall.

## Entscheidung

- Neue Variable `MIRA_PUBLIC_URL` (öffentliche HTTPS-Adresse). Gesetzt = **HTTPS-Pflicht**:
  - Seiten über HTTP → `308` auf die HTTPS-Adresse.
  - API über HTTP → `403 https_required`.
  - Cookie immer `Secure`, dazu HSTS.
  - Origin-Prüfung exakt gegen die öffentliche Herkunft.
  - `/health` bleibt offen.
- HTTPS erkennt MIRA an `X-Forwarded-Proto` von Absendern in `MIRA_TRUST_PROXY`. Mit
  HTTPS-Pflicht ist `MIRA_TRUST_PROXY` Pflicht, `true` nicht erlaubt. Einträge werden geprüft; bei
  großen Netzen gibt MIRA einen Hinweis aus. Empfohlen ist die feste Adresse des Proxys oder ein
  kleines, eigenes Proxy-Netz.
- Ohne `MIRA_PUBLIC_URL` bleibt das bisherige Verhalten, mit einem Hinweis beim Start und in der
  Glocke, bis der Betreiber die Variable setzt.

## Alternativen

- **Nur an das Proxy-Netz binden:** Die Adresse ist dynamisch, mehrere Adressen kann Fastify nicht
  binden – das wäre nicht robust.
- **Regel in der Firewall:** greift im selben VLAN nicht.
- **`Secure`-Cookie immer erzwingen, unabhängig von der Konfiguration:** Über HTTP wäre dann keine
  Anmeldung mehr möglich, ohne Vorwarnung nach einem normalen Update.
- **Eigener TLS-Listener in MIRA:** doppelte Zertifikatsverwaltung neben dem Proxy, kein Mehrwert im Heimnetz.

## Konsequenzen

- Mit gesetzter Variable werden Anmeldeformular und Session-Cookie nur über HTTPS ausgeliefert.
- Ein falscher Wert in `MIRA_TRUST_PROXY` verhindert die Anmeldung über den Proxy (`https_required`).
  Rückweg: `MIRA_PUBLIC_URL` leeren.
- Das Einschalten ist ein bewusster Schritt des Betreibers ([Deployment](../entwicklung/security-hardening-review.md#deployment)).
