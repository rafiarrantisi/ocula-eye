import { resolveRepositories } from '../../../lib/server/repos.ts';
import { checkRateLimit } from '../../../lib/server/rateLimit.ts';
import { issueAnonymousSession, sessionCookieHeader } from '../../../lib/server/sessions.ts';

export const dynamic = 'force-dynamic';

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// POST /api/preview-session — mint a signed anonymous session behind the
// PREVIEW_TOKEN gate. No learner PII is collected.
export async function POST(req: Request): Promise<Response> {
  try {
    const limit = checkRateLimit(`preview-session:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(429, { error: 'rate_limited', message: 'Too many requests.' }, { 'Retry-After': String(limit.retryAfterSec) });
    }
    let presented: string | null = null;
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (typeof body['previewToken'] === 'string') presented = body['previewToken'];
    } catch {
      return json(400, { error: 'bad_request', message: 'Invalid JSON.' });
    }
    let issued;
    try {
      issued = issueAnonymousSession(presented);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        const e = err as { status: number; code: string; message: string };
        return json(e.status, { error: e.code, message: e.message });
      }
      throw err;
    }
    const repos = resolveRepositories();
    await repos.createSession(issued.sessionId, new Date(issued.expiresAtSec * 1000));
    return json(201, { sessionId: issued.sessionId }, { 'Set-Cookie': sessionCookieHeader(issued.token, issued.expiresAtSec) });
  } catch {
    return json(500, { error: 'internal', message: 'Internal error.' });
  }
}

// DELETE /api/preview-session — sign out (expire the session cookie).
export async function DELETE(): Promise<Response> {
  return json(200, { signedOut: true }, { 'Set-Cookie': 'imaging_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
}
