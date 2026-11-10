import { z } from 'zod';
import type { UpdateCheckError } from '@mira/shared';
import { parseVersion } from './semver.ts';

/** Feste Adressen – bewusst nicht konfigurierbar. */
export const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/madebyzwen/mira/releases/latest';
export const GITHUB_RELEASES_PREFIX = 'https://github.com/madebyzwen/mira/releases/';
export const AGENT_GUIDE_URL = 'https://github.com/madebyzwen/mira/blob/main/agent/install/README.md';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const AGENT_PACKAGE = /^mira-agent-(\d+\.\d+\.\d+)\.tar\.gz$/;

export interface LatestRelease {
  /** z. B. `v0.5.2` */
  tag: string;
  /** Version von MIRA, z. B. `0.5.2` */
  version: string;
  /** Version des Agent-Pakets (KI-Server) im Release, `null` wenn keines enthalten ist */
  agentVersion: string | null;
  publishedAt: string;
  url: string;
}

export class UpdateCheckFailure extends Error {
  readonly code: UpdateCheckError;
  constructor(code: UpdateCheckError, message: string) {
    super(message);
    this.code = code;
  }
}

export type ReleaseFetcher = () => Promise<LatestRelease>;

const releaseSchema = z.object({
  tag_name: z.string().max(64),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.iso.datetime(),
  html_url: z.string().max(512),
  assets: z.array(z.object({ name: z.string().max(256) })).max(100),
});

/** Prüft die Antwort von GitHub und reduziert sie auf die benötigten Felder. */
export function parseRelease(body: unknown): LatestRelease {
  const parsed = releaseSchema.safeParse(body);
  if (!parsed.success) throw new UpdateCheckFailure('invalid_response', 'Antwort von GitHub hat ein unerwartetes Format');
  const r = parsed.data;
  if (r.draft || r.prerelease) throw new UpdateCheckFailure('invalid_response', 'Neuestes Release ist ein Entwurf bzw. eine Vorabversion');
  const version = /^v(\d+\.\d+\.\d+)$/.exec(r.tag_name)?.[1];
  if (!version || !parseVersion(version)) throw new UpdateCheckFailure('invalid_response', `Unerwarteter Tag „${r.tag_name}“`);
  if (!r.html_url.startsWith(GITHUB_RELEASES_PREFIX)) throw new UpdateCheckFailure('invalid_response', 'Link zum Release zeigt auf eine fremde Adresse');
  const agentVersion = r.assets.map((a) => AGENT_PACKAGE.exec(a.name)?.[1]).find((v) => v !== undefined) ?? null;
  return { tag: r.tag_name, version, agentVersion, publishedAt: r.published_at, url: r.html_url };
}

/** Fragt das neueste veröffentlichte Release bei GitHub ab (ohne Token, nur GET). */
export function createGithubFetcher(miraVersion: string): ReleaseFetcher {
  return async () => {
    let res: Response;
    try {
      res = await fetch(GITHUB_LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `MIRA/${miraVersion}` },
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new UpdateCheckFailure(timeout ? 'timeout' : 'unreachable', err instanceof Error ? err.message : String(err));
    }
    if (res.status === 403 || res.status === 429) throw new UpdateCheckFailure('rate_limited', `GitHub antwortet mit ${res.status}`);
    if (!res.ok) throw new UpdateCheckFailure('invalid_response', `GitHub antwortet mit ${res.status}`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new UpdateCheckFailure('invalid_response', 'Antwort zu groß');
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw new UpdateCheckFailure('unreachable', err instanceof Error ? err.message : String(err));
    }
    if (text.length > MAX_BODY_BYTES) throw new UpdateCheckFailure('invalid_response', 'Antwort zu groß');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new UpdateCheckFailure('invalid_response', 'Antwort ist kein JSON');
    }
    return parseRelease(body);
  };
}
