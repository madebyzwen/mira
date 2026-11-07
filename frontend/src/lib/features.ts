/**
 * Schalter für Bereiche der Oberfläche, die vorhanden, aber (noch) nicht freigegeben sind.
 * Der Code bleibt erhalten; zum Einschalten genügt es, den Wert auf `true` zu setzen.
 */
export const features = {
  /** Agents (Stufe 10) – zurückgestellt am 2026-11-07: Menü, Seite, Dashboard-Widget, Konfiguration. */
  agents: false,
} as const;
