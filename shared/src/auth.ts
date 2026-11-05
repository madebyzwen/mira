import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Benutzername fehlt').max(64),
  password: z.string().min(1, 'Passwort fehlt').max(1024),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  displayName: z.string(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Antwort von `POST /api/v1/auth/login` und `GET /api/v1/auth/session`. */
export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
