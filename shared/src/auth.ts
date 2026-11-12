import { z } from 'zod';

/** Mindestlänge für Passwörter (Startpasswort und Passwortänderung). */
export const PASSWORD_MIN_LENGTH = 12;
/** Obergrenze (Schutz vor sehr großen Eingaben für scrypt) */
export const PASSWORD_MAX_LENGTH = 1024;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Benutzername fehlt').max(64),
  password: z.string().min(1, 'Passwort fehlt').max(PASSWORD_MAX_LENGTH),
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

/** `POST /api/v1/auth/password` – Passwort des angemeldeten Benutzers ändern. */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Aktuelles Passwort fehlt').max(PASSWORD_MAX_LENGTH),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Das neue Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`)
      .max(PASSWORD_MAX_LENGTH)
      .refine((v) => v.trim().length > 0, 'Das neue Passwort darf nicht nur aus Leerzeichen bestehen'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, { message: 'Das neue Passwort muss sich vom bisherigen unterscheiden', path: ['newPassword'] });

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
