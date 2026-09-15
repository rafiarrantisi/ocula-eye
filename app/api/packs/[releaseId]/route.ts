import { resolveRepositories } from '../../../../lib/server/repos.ts';
import { readPublicManifest } from '../../../../lib/server/packRepository.ts';
import { checkRateLimit } from '../../../../lib/server/rateLimit.ts';
import { getSessionTokenFromCookie, verifySessionToken } from '../../../../lib/server/sessions.ts';

export const dynamic = 'force-dynamic';

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function toErrorResponse(err: unknown): Response {
  if (err && typeof err === 'object' && 'status' in err) {
    const e = err as { status: number; code: string; message: string };
    return json(e.status, { error: e.code, message: e.message });
  }
  return json(500, { error: 'internal', message: 'Internal error.' });
}

function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  return host !== '' && originHost !== host;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function resolveParams(
  params: unknown,
): Promise<{ releaseId: string }> {
  const p =
    params && typeof (params as Promise<unknown>).then === 'function'
      ? await (params as Promise<{ releaseId: string }>)
      : (params as { releaseId: string });
  return { releaseId: String(p?.releaseId ?? '') };
}

// GET /api/packs/[releaseId] — public manifest only (tasks/media metadata +
// attribution). Truth is never read here; private files are never served.
export async function GET(
  req: Request,
  context: { params: Promise<{ releaseId: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`packs:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const token = getSessionTokenFromCookie(req.headers.get('cookie'));
    if (!token) return json(401, { error: 'unauthorized', message: 'Session required.' });
    let sessionId: string;
    let expiresAtSec: number;
    try {
      const verified = verifySessionToken(token);
      if (!verified) return json(401, { error: 'unauthorized', message: 'Session invalid.' });
      sessionId = verified.sessionId;
      expiresAtSec = verified.expiresAtSec;
    } catch {
      return json(500, { error: 'internal', message: 'Internal error.' });
    }
    let repos;
    try {
      repos = resolveRepositories();
    } catch {
      return json(503, { error: 'unavailable', message: 'Database not configured.' });
    }

    const existing = await repos.getSession(sessionId);
    if (!existing) {
      await repos.createSession(sessionId, new Date(expiresAtSec * 1000));
    }
    const { releaseId } = await resolveParams(context.params);
    const manifest = await readPublicManifest(releaseId);
    return json(200, { releaseId, manifest });
  } catch (err) {
    return toErrorResponse(err);
  }
}
