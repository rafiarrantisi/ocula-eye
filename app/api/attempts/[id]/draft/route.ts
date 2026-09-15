import { createServices, ServiceError } from '../../../../../lib/server/attemptService.ts';
import { resolveRepositories } from '../../../../../lib/server/repos.ts';
import { readPrivatePack } from '../../../../../lib/server/packRepository.ts';
import { checkRateLimit } from '../../../../../lib/server/rateLimit.ts';
import { getSessionTokenFromCookie, verifySessionToken } from '../../../../../lib/server/sessions.ts';

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

async function resolveParams(params: unknown): Promise<{ id: string }> {
  const p =
    params && typeof (params as Promise<unknown>).then === 'function'
      ? await (params as Promise<{ id: string }>)
      : (params as { id: string });
  return { id: String(p?.id ?? '') };
}

// PUT /api/attempts/[id]/draft — bounded save with optimistic concurrency
// (expectedRevision must match; mismatch is a 409).
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`draft:${clientIp(req)}`);
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
    let text: string;
    try {
      text = await req.text();
    } catch {
      return json(400, { error: 'bad_request', message: 'Unreadable body.' });
    }
    if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) {
      return json(413, { error: 'payload_too_large', message: 'Body too large.' });
    }
    let body: Record<string, unknown>;
    try {
      body = (text ? (JSON.parse(text) as unknown) : {}) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'bad_request', message: 'Invalid JSON.' });
    }
    const { id } = await resolveParams(context.params);

    const existingSession = await repos.getSession(sessionId);
    if (!existingSession) {
      await repos.createSession(sessionId, new Date(expiresAtSec * 1000));
    }
    const services = createServices(repos, {
      truthProvider: async (relId: string, cId: string) => {
        const pack = (await readPrivatePack(relId)) as {
          cases?: Array<{ caseId?: string; answers?: Record<string, string> }>;
        };
        const found = pack?.cases?.find((c) => c?.caseId === cId);
        if (!found || !found.answers || typeof found.answers !== 'object') return null;
        return { answers: found.answers };
      },
    });
    const saved = await services.saveDraft({
      sessionId,
      attemptId: id,
      payload: body['payload'],
      expectedRevision: body['expectedRevision'] as number,
    });
    return json(200, { attemptId: id, revision: saved.revision });
  } catch (err) {
    return toErrorResponse(err);
  }
}
