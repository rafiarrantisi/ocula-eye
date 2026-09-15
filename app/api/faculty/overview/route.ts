import { requireFaculty } from '../../../../lib/server/faculty/auth.ts';
import { createDemoFacultyRepos } from '../../../../lib/server/demoFaculty.ts';
import { demoSubject } from '../../../../lib/server/demoAuth.ts';
import { resolveFacultySubject } from '../../../../lib/server/faculty/auth.ts';
import { checkRateLimit } from '../../../../lib/server/rateLimit.ts';

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

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// GET /api/faculty/overview?institutionId= — demo-mode cohort/assignment
// listing for the faculty home page. Real mode: 503 (listing needs a managed
// session index that does not exist yet).
export async function GET(req: Request): Promise<Response> {
  try {
    const limit = checkRateLimit(`faculty-overview:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(429, { error: 'rate_limited', message: 'Too many requests.' }, { 'Retry-After': String(limit.retryAfterSec) });
    }
    const subject = demoSubject(req) ?? resolveFacultySubject(req);
    const url = new URL(req.url);
    const institutionId = url.searchParams.get('institutionId') ?? '';
    if (!institutionId) return json(400, { error: 'bad_request', message: 'institutionId is required.' });
    if (process.env.LAB_DEMO_STORE !== '1') {
      return json(503, { error: 'unavailable', message: 'Overview listing needs managed auth; demo mode only.' });
    }
    const repos = createDemoFacultyRepos();
    await requireFaculty(repos, subject, institutionId);
    const { readDemoDb } = await import('../../../../lib/server/demoStore.ts');
    const db = readDemoDb().faculty;
    const cohorts = Object.values(db.cohorts).filter((c) => c.institutionId === institutionId);
    const assignments = Object.values(db.assignments).filter((a) => cohorts.some((c) => c.id === a.cohortId));
    return json(200, { institutionId, cohorts, assignments });
  } catch (err) {
    return toErrorResponse(err);
  }
}
