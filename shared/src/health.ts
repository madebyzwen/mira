import { z } from 'zod';

/** Antwort von `GET /health` (öffentlich, ohne Anmeldung). */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  database: z.enum(['ok', 'error']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
