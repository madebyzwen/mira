/**
 * Gemeinsame API-Verträge von MIRA.
 *
 * Diese Schemas sind die einzige Definition der Daten, die zwischen Frontend,
 * Backend und (ab Stufe 2) der Odin-API ausgetauscht werden. Das Backend
 * validiert eingehende Daten damit, das Frontend nutzt die abgeleiteten Typen.
 */
export * from './errors.ts';
export * from './auth.ts';
export * from './health.ts';
export * from './odin.ts';
export * from './systems.ts';
export * from './notifications.ts';
