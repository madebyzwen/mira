import type { ApiErrorBody, ErrorCode } from '@mira/shared';

/** Fehler einer API-Antwort im einheitlichen MIRA-Format. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'network_error';
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: ApiError['code'], message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Wird ausgelöst, wenn eine Anfrage wegen fehlender/abgelaufener Anmeldung abgelehnt wurde. */
export const UNAUTHORIZED_EVENT = 'mira:unauthorized';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 401 nicht global melden (z. B. bei der Sessionprüfung und beim Login selbst) */
  silentUnauthorized?: boolean;
}

/**
 * Zentraler Zugriff auf die MIRA-API. Das Session-Cookie sendet der Browser
 * automatisch mit (gleiche Herkunft); das Frontend sieht das Token nie.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'MIRA ist nicht erreichbar.');
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const body = data as Partial<ApiErrorBody> | undefined;
    const err = new ApiError(
      res.status,
      body?.error?.code ?? 'internal_error',
      body?.error?.message ?? `Anfrage fehlgeschlagen (${res.status}).`,
      body?.error?.details,
    );
    if (res.status === 401 && !options.silentUnauthorized) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw err;
  }
  return data as T;
}
