import { FacultyError, resolveFacultyRepos, resolveFacultySubject } from '../../../../../../lib/server/faculty/auth.ts';
import { demoSubject } from '../../../../../../lib/server/demoAuth.ts';
import { createAssignmentService } from '../../../../../../lib/server/faculty/assignmentService.ts';
import { checkRateLimit } from '../../../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

// GET /api/faculty/assignments/[id]/report — attempt-derived metrics with
// explicit denominators (learners, release cases, attempts).
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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`faculty-report:${clientIp(req)}`);
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
    const { id } = await resolveParams(context.params);
    const service = createAssignmentService(repos);
    const report = await service.getReport({ authSubject: subject, assignmentId: id });
    return json(200, report, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return toErrorResponse(err);
  }
}
