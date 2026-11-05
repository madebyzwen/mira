import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { errorBody } from '../errors.ts';

/**
 * Liefert die gebaute Weboberfläche aus und beantwortet alle unbekannten
 * Nicht-API-Pfade mit `index.html` (Single-Page-App, React Router).
 * Ohne `staticDir` (z. B. in der Entwicklung mit Vite) gibt es nur die API.
 */
export async function registerFrontend(app: FastifyInstance, staticDir: string | undefined): Promise<void> {
  const hasFrontend = staticDir !== undefined && fs.existsSync(path.join(staticDir, 'index.html'));

  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
      index: false,
      setHeaders(reply, filePath) {
        reply.header(
          'Cache-Control',
          filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.url.split('?')[0];
    const isApi = url.startsWith('/api/') || url === '/api' || url === '/health';
    if (!isApi && hasFrontend && (request.method === 'GET' || request.method === 'HEAD')) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.status(404).send(errorBody('not_found', 'Nicht gefunden.'));
  });
}
