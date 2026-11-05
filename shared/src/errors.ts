import { z } from 'zod';

/** Fehlercodes der API. Neue Codes werden hier ergänzt, nie frei im Code erfunden. */
export const ERROR_CODES = [
  'validation_error',
  'unauthorized',
  'invalid_credentials',
  'rate_limited',
  'forbidden_origin',
  'not_found',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Einheitliches Fehlerformat aller API-Antworten mit Status ≥ 400. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
