import {
  FacultyError,
  requireFaculty,
  resolveFacultyRepos,
  resolveFacultySubject,
} from '../../../../../../lib/server/faculty/auth.ts';
import { demoSubject } from '../../../../../../lib/server/demoAuth.ts';
import { checkRateLimit } from '../../../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

// GET /api/faculty/assignments/[id]/reveal — reveal state for an assignment
// (faculty of the owning cohort only). POST stamps revealed_at (idempotent),
// unlocking linked manual/scheduled-reveal attempts. Same auth boundary as
// the other faculty routes: 503 `auth-not-configured` without a provider,
// demo subject header accepted only under LAB_DEMO_STORE=1.
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

async function gatedAssignment(req: Request, id: string) {
  const subject = demoSubject(req) ?? resolveFacultySubject(req);
  let repos;
  try {
    repos = resolveFacultyRepos();
  } catch {
    throw new FacultyError(503, 'unavailable', 'Database not configured.');
  }
  const assignment = await repos.getAssignment(id);
  if (!assignment) throw new FacultyError(404, 'not_found', 'Assignment not found.');
  const cohort = await repos.getCohort(assignment.cohortId);
  if (!cohort) throw new FacultyError(404, 'not_found', 'Cohort not found.');
  await requireFaculty(repos, subject, cohort.institutionId);
  return { repos, assignment };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`faculty-reveal:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const { id } = await resolveParams(context.params);
    const { assignment } = await gatedAssignment(req, id);
    return json(200, {
      assignmentId: assignment.id,
      revealPolicy: assignment.revealPolicy,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      revealedAt: assignment.revealedAt ? assignment.revealedAt.toISOString() : null,
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`faculty-reveal:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const { id } = await resolveParams(context.params);
    const { repos, assignment } = await gatedAssignment(req, id);
    if (typeof repos.setAssignmentRevealed !== 'function') {
      return json(503, { error: 'unavailable', message: 'Reveal not supported by this store.' });
    }
    const now = new Date();
    await repos.setAssignmentRevealed(assignment.id, now);
    return json(200, {
      assignmentId: assignment.id,
      revealedAt: now.toISOString(),
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return toErrorResponse(err);
  }
}
