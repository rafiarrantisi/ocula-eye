import { createServices, ServiceError } from '../../../lib/server/attemptService.ts';
import { resolveRepositories } from '../../../lib/server/repos.ts';
import { toCaseTruth } from '../../../lib/server/truthMapping.ts';
import { readPrivatePack, readPublicManifest } from '../../../lib/server/packRepository.ts';
import { checkRateLimit } from '../../../lib/server/rateLimit.ts';
import { getSessionTokenFromCookie, verifySessionToken } from '../../../lib/server/sessions.ts';

export const dynamic = 'force-dynamic';

const MAX_JSON_BYTES = 256 * 1024;

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ServiceError) {
    return json(err.status, { error: err.code, message: err.message });
  }
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

async function readCappedJson(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: json(400, { error: 'bad_request', message: 'Unreadable body.' }) };
  }
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) {
    return { ok: false, response: json(413, { error: 'payload_too_large', message: 'Body too large.' }) };
  }
  try {
    return { ok: true, value: text ? (JSON.parse(text) as unknown) : {} };
  } catch {
    return { ok: false, response: json(400, { error: 'bad_request', message: 'Invalid JSON.' }) };
  }
}

// POST /api/attempts — create an attempt (validates release/case, returns the
// attempt id; never returns answers or truth).
export async function POST(req: Request): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`attempts:${clientIp(req)}`);
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
    const parsed = await readCappedJson(req);
    if (!parsed.ok) return parsed.response;
    const body = (parsed.value ?? {}) as Record<string, unknown>;
    const releaseId = body['releaseId'];
    const caseId = body['caseId'];
    const mode = body['mode'] === 'assessment' ? 'assessment' : 'practice';
    const headerKey = req.headers.get('idempotency-key');
    const idempotencyKey =
      typeof headerKey === 'string' && headerKey.length > 0
        ? headerKey
        : typeof body['idempotencyKey'] === 'string'
          ? (body['idempotencyKey'] as string)
          : undefined;
    if (typeof releaseId !== 'string' || typeof caseId !== 'string') {
      return json(400, { error: 'bad_request', message: 'releaseId and caseId are required.' });
    }
    const existingSession = await repos.getSession(sessionId);
    if (!existingSession) {
      await repos.createSession(sessionId, new Date(expiresAtSec * 1000));
    }
    // Bridge the on-disk compiled manifest into the releases table so the
    // service can validate task/release without ever touching private truth.
    if (!(await repos.getRelease(releaseId))) {
      const manifest = await readPublicManifest(releaseId);
      await repos.upsertRelease(releaseId, manifest);
    }
    const services = createServices(repos, {
      truthProvider: async (relId: string, cId: string) => {
        const pack = (await readPrivatePack(relId)) as { cases?: unknown };
        const found = Array.isArray(pack?.cases) ? pack.cases.find((c) => (c as { caseId?: unknown })?.caseId === cId) : undefined;
        return toCaseTruth(found);
      },
    });
    const created = await services.createAttempt({ sessionId, releaseId, caseId, mode, idempotencyKey });
    return json(201, { attemptId: created.attemptId, revision: created.revision, status: created.status });
  } catch (err) {
    return toErrorResponse(err);
  }
}
