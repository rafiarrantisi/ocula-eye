import { FacultyError, resolveFacultyRepos, resolveFacultySubject } from '../../../../lib/server/faculty/auth.ts';
import { demoSubject } from '../../../../lib/server/demoAuth.ts';
import { createAssignmentService } from '../../../../lib/server/faculty/assignmentService.ts';
import { checkRateLimit } from '../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

const MAX_JSON_BYTES = 64 * 1024;

// POST /api/faculty/assignments — create an assignment in a cohort. Validates
// the open/due window (due must be after open) and pins the release manifest
// version snapshot. Truth freezes once attempts exist against the release.
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

export async function POST(req: Request): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`faculty-assignments:${clientIp(req)}`);
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
    const cohortId = body['cohortId'];
    const releaseId = body['releaseId'];
    const mode = body['mode'];
    const revealPolicy = body['revealPolicy'];
    if (
      typeof cohortId !== 'string' ||
      typeof releaseId !== 'string' ||
      typeof mode !== 'string' ||
      typeof revealPolicy !== 'string'
    ) {
      return json(400, {
        error: 'bad_request',
        message: 'cohortId, releaseId, mode, and revealPolicy are required.',
      });
    }
    const service = createAssignmentService(repos);
    const assignment = await service.createAssignment({
      authSubject: subject,
      cohortId,
      releaseId,
      pathway: typeof body['pathway'] === 'string' ? (body['pathway'] as string) : undefined,
      mode,
      openAt: body['openAt'],
      dueAt: body['dueAt'],
      revealPolicy,
    });
    return json(
      201,
      {
        assignmentId: assignment.id,
        cohortId: assignment.cohortId,
        releaseId: assignment.releaseId,
        releaseVersion: assignment.releaseVersion,
        mode: assignment.mode,
        openAt: assignment.openAt.toISOString(),
        dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
        revealPolicy: assignment.revealPolicy,
      },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
