import { FacultyError, resolveFacultyRepos, resolveFacultySubject } from '../../../../../../lib/server/faculty/auth.ts';
import { demoSubject } from '../../../../../../lib/server/demoAuth.ts';
import {
  buildAssignmentExport,
  createAssignmentService,
} from '../../../../../../lib/server/faculty/assignmentService.ts';
import { checkRateLimit } from '../../../../../../lib/server/rateLimit.ts';

export const dynamic = 'force-dynamic';

// GET /api/faculty/assignments/[id]/export — the assignment report as
// formula-safe CSV (cells starting with =, +, -, @, tab, or CR are
// single-quote-escaped). Served with no-store headers.
//
// Auth boundary (no managed auth provider exists): unless tests explicitly
// set ALLOW_TEST_SUBJECT=1, this route returns 503 `auth-not-configured`.
// Under that flag the `x-faculty-subject` test header selects the subject and
// the faculty gate still enforces a real 'faculty' membership row for the
// cohort's institution. Production must bind a managed AuthProvider.
function toErrorResponse(err: unknown): Response {
  const body = (status: number, code: string, message: string): Response =>
    Response.json({ error: code, message }, { status });
  if (err instanceof FacultyError) {
    return body(err.status, err.code, err.message);
  }
  if (err && typeof err === 'object' && 'status' in err) {
    const e = err as { status: number; code: string; message: string };
    return body(e.status, e.code, e.message);
  }
  return body(500, 'internal', 'Internal error.');
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
      return Response.json({ error: 'forbidden', message: 'Foreign origin.' }, { status: 403 });
    }
    const limit = checkRateLimit(`faculty-export:${clientIp(req)}`);
    if (!limit.allowed) {
      return Response.json({ error: 'rate_limited', message: 'Too many requests.' }, {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSec) },
      });
    }
    const subject = demoSubject(req) ?? resolveFacultySubject(req);
    let repos;
    try {
      repos = resolveFacultyRepos();
    } catch {
      return Response.json({ error: 'unavailable', message: 'Database not configured.' }, {
        status: 503,
      });
    }
    const { id } = await resolveParams(context.params);
    const service = createAssignmentService(repos);
    const report = await service.getReport({ authSubject: subject, assignmentId: id });
    const csv = buildAssignmentExport(report);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="assignment-${id}-report.csv"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
