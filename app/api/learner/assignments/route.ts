import { createDemoFacultyRepos } from '../../../../lib/server/demoFaculty.ts';
import { demoSubject } from '../../../../lib/server/demoAuth.ts';
import { checkRateLimit } from '../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// GET /api/learner/assignments — cohorts + assignments for the calling
// learner. Demo mode only (subject from the demo header); otherwise 503
// because learner identity requires the managed auth provider.
export async function GET(req: Request): Promise<Response> {
  try {
    const limit = checkRateLimit(`learner-assignments:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(429, { error: 'rate_limited', message: 'Too many requests.' }, { 'Retry-After': String(limit.retryAfterSec) });
    }
    const subject = demoSubject(req);
    if (!subject) {
      return json(503, { error: 'unavailable', message: 'Learner sign-in needs managed auth; demo mode only.' });
    }
    const repos = createDemoFacultyRepos();
    const user = await repos.getUserByAuthSubject(subject);
    if (!user) return json(401, { error: 'unauthorized', message: 'Unknown learner. Seed the demo first.' });
    const { readDemoDb } = await import('../../../../lib/server/demoStore.ts');
    const db = readDemoDb().faculty;
    const memberRows = Object.values(db.members).filter((m) => m.userId === user.id);
    const cohorts = memberRows
      .map((m) => db.cohorts[m.cohortId])
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, institutionId: c.institutionId, name: c.name }));
    const assignments = Object.values(db.assignments)
      .filter((a) => cohorts.some((c) => c.id === a.cohortId))
      .map((a) => ({
        id: a.id, cohortId: a.cohortId, releaseId: a.releaseId, pathway: a.pathway,
        mode: a.mode, openAt: a.openAt, dueAt: a.dueAt, revealPolicy: a.revealPolicy,
        releaseVersion: a.releaseVersion,
      }));
    return json(200, { subject, displayName: user.displayName, cohorts, assignments });
  } catch {
    return json(500, { error: 'internal', message: 'Internal error.' });
  }
}
