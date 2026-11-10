/**
 * Gemeinsame API-Verträge von MIRA.
 *
 * Diese Schemas sind die einzige Definition der Daten, die zwischen Frontend,
 * Backend, dem MIRA-Agent auf dem KI-Server und dem Shelly-Logger ausgetauscht werden. Das Backend
 * validiert eingehende Daten damit, das Frontend nutzt die abgeleiteten Typen.
 */
export * from './errors.ts';
export * from './auth.ts';
export * from './health.ts';
export * from './agent.ts';
export * from './systems.ts';
export * from './notifications.ts';
export * from './shellyLogger.ts';
