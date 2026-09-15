import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Reads the COMPILED pack outputs from disk (see scripts/content/compile.mjs).
// PUBLIC_PACK_DIR holds public-manifest.json files; PRIVATE_PACK_DIR holds
// private-pack.json files. Route handlers only ever touch the public side;
// the service layer loads private truth via readPrivatePack. Path traversal
// is rejected: release ids are allowlisted and resolved paths must stay
// inside the configured base dir. Private files are never served over HTTP.

const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function publicPackDir(): string {
  const dir = process.env.PUBLIC_PACK_DIR;
  if (!dir) {
    throw Object.assign(new Error('PUBLIC_PACK_DIR is not configured.'), {
      status: 503,
      code: 'unavailable',
    });
  }
  return dir;
}

function privatePackDir(): string {
  const dir = process.env.PRIVATE_PACK_DIR;
  if (!dir) {
    throw Object.assign(new Error('PRIVATE_PACK_DIR is not configured.'), {
      status: 503,
      code: 'unavailable',
    });
  }
  return dir;
}

function resolveInside(baseDir: string, releaseId: string, fileName: string): string {
  if (!RELEASE_ID_RE.test(releaseId) || releaseId.includes('..')) {
    throw Object.assign(new Error('Unknown release.'), { status: 404, code: 'not_found' });
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, releaseId, fileName);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw Object.assign(new Error('Unknown release.'), { status: 404, code: 'not_found' });
  }
  if (path.basename(resolved) !== fileName) {
    throw Object.assign(new Error('Unknown release.'), { status: 404, code: 'not_found' });
  }
  return resolved;
}

async function readJsonFile(resolved: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(resolved, 'utf8');
  } catch {
    throw Object.assign(new Error('Unknown release.'), { status: 404, code: 'not_found' });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw Object.assign(new Error('Release is corrupt.'), { status: 503, code: 'unavailable' });
  }
}

/** Public manifest only — safe to serialize to the client. Never includes
 * answers, masks, truth, or diagnostic filenames (enforced at compile time). */
export async function readPublicManifest(releaseId: string): Promise<unknown> {
  return readJsonFile(resolveInside(publicPackDir(), releaseId, 'public-manifest.json'));
}

/** Private truth for server-side scoring only. Must never leave the server. */
export async function readPrivatePack(releaseId: string): Promise<unknown> {
  return readJsonFile(resolveInside(privatePackDir(), releaseId, 'private-pack.json'));
}

export async function listPublicReleases(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(path.resolve(publicPackDir()));
  } catch {
    throw Object.assign(new Error('PUBLIC_PACK_DIR is not readable.'), {
      status: 503,
      code: 'unavailable',
    });
  }
  return entries.filter((e) => RELEASE_ID_RE.test(e));
}
