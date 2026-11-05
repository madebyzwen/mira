import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { ApiErrorBody, ErrorCode } from '@mira/shared';

/** Fachlicher Fehler mit festem Code und HTTP-Status. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorBody(code: ErrorCode, message: string, details?: Record<string, unknown>): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/** Einheitliche Fehlerbehandlung: jede Fehlerantwort hat das Format `{ error: { code, message, details? } }`. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(
        errorBody('validation_error', 'Ungültige Eingabe.', {
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }),
      );
    }
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 400 && status < 500) {
      // z. B. ungültiges JSON oder zu großer Body – von Fastify erkannt
      return reply.status(status).send(errorBody('validation_error', 'Ungültige Anfrage.'));
    }
    request.log.error({ err }, 'Unerwarteter Fehler');
    return reply.status(500).send(errorBody('internal_error', 'Interner Fehler.'));
  });
}
