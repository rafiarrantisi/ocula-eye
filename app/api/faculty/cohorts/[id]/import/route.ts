import { FacultyError, resolveFacultyRepos, resolveFacultySubject } from '../../../../../../lib/server/faculty/auth.ts';
import { demoSubject } from '../../../../../../lib/server/demoAuth.ts';
import { createCohortService, fallbackParseCsv } from '../../../../../../lib/server/faculty/cohortService.ts';
import { checkRateLimit } from '../../../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

const MAX_JSON_BYTES = 512 * 1024;

// POST /api/faculty/cohorts/[id]/import — validate a learner CSV and return a
// preview plus an idempotent import token. Pure validation: NO side effects
// (no users, memberships, or invitations are created here).
//
// Auth boundary (no managed auth provider exists): unless tests explicitly
// set ALLOW_TEST_SUBJECT=1, this route returns 503 `auth-not-configured`.
// Under that flag the `x-faculty-subject` test header selects the subject and
// the faculty gate still enforces a real 'faculty' membership row for the
// cohort's institution. Production must bind a managed AuthProvider.
function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof FacultyError) {
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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`faculty-import:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const subject = demoSubject(req) ?? resolveFacultySubject(req);
    let repos;
    try {
      repos = resolveFacultyRepos();
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
    const csv = body['csv'];
    if (typeof csv !== 'string') {
      return json(400, { error: 'bad_request', message: 'csv is required.' });
    }
    const service = createCohortService(repos);
    const preview = await service.previewImport({
      authSubject: subject,
      cohortId: id,
      csvText: csv,
      parseCsv: fallbackParseCsv,
    });
    return json(200, preview);
  } catch (err) {
    return toErrorResponse(err);
  }
}
