import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ServiceError } from '../../../../../lib/server/attemptService.ts';
import {
  createBridgePostgresRepos,
  createBridgeServices,
} from '../../../../../lib/server/bridgeService.ts';
import { createDemoBridgeRepos } from '../../../../../lib/server/demoStore.ts';
import { getSql } from '../../../../../lib/server/db.ts';
import { isDemoStore, resolveRepositories } from '../../../../../lib/server/repos.ts';
import { readPublicManifest } from '../../../../../lib/server/packRepository.ts';
import { checkRateLimit } from '../../../../../lib/server/rateLimit.ts';
import { getSessionTokenFromCookie, verifySessionToken } from '../../../../../lib/server/sessions.ts';
import { DEMO_BRIDGE_RULES, DEMO_RULE_QUESTION } from '../../../../../content/bridges/demo-bridges.ts';
import { loadDrPack } from '../../../../../content/packs/dr-mechanism-0.1.0/load.ts';

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

function verifiedSessionId(req: Request): { sessionId: string; expiresAtSec: number } | Response {
  const token = getSessionTokenFromCookie(req.headers.get('cookie'));
  if (!token) return json(401, { error: 'unauthorized', message: 'Session required.' });
  try {
    const verified = verifySessionToken(token);
    if (!verified) return json(401, { error: 'unauthorized', message: 'Session invalid.' });
    return { sessionId: verified.sessionId, expiresAtSec: verified.expiresAtSec };
  } catch {
    return json(500, { error: 'internal', message: 'Internal error.' });
  }
}

function isDemoRelease(releaseId: string): boolean {
  return releaseId.startsWith('demo-synthetic-');
}

/** Follow-up candidates that actually exist. Demo reads the committed public
 * manifest; real releases use the configured public pack dir. Anything
 * unreadable yields no candidates (never invented). */
async function eligibleFollowups(releaseId: string, poolIds: string[]): Promise<{ caseId: string; releaseId: string }[]> {
  try {
    let caseIds: string[];
    if (isDemoRelease(releaseId)) {
      const raw = await readFile(path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json'), 'utf8');
      caseIds = ((JSON.parse(raw) as { cases?: { caseId?: unknown }[] }).cases ?? [])
        .map((c) => (typeof c?.caseId === 'string' ? c.caseId : ''))
        .filter(Boolean);
    } else {
      const manifest = (await readPublicManifest(releaseId)) as { cases?: { caseId?: unknown }[] };
      caseIds = (manifest.cases ?? [])
        .map((c) => (typeof c?.caseId === 'string' ? c.caseId : ''))
        .filter(Boolean);
    }
    const ids = new Set(caseIds);
    return poolIds.filter((pid) => ids.has(pid)).slice(0, 3).map((caseId) => ({ caseId, releaseId }));
  } catch {
    return [];
  }
}

async function questionForRule(ruleId: string): Promise<{ id: string; prompt: string; options: { id: string; text: string }[]; conceptId: string } | null> {
  const qid = DEMO_RULE_QUESTION[ruleId];
  if (!qid) return null;
  const pack = loadDrPack();
  const q = pack.questions.find((qq) => qq.id === qid);
  if (!q) return null;
  // correctOptionId is deliberately stripped: grading happens server-side.
  return { id: q.id, prompt: q.prompt, options: q.options.map((o) => ({ id: o.id, text: o.text })), conceptId: q.conceptId };
}

async function mechanismTexts(ids: string[]): Promise<{ id: string; description: string }[]> {
  const pack = loadDrPack();
  return ids
    .map((id) => pack.mechanisms.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ id: m.id, description: m.description }));
}

// GET /api/attempts/[id]/bridge — owner only (cross-session reads are an
// opaque 404 via the service). Bridge needs feedback_released + an unused
// session slot. Question ships WITHOUT the correct option.
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`bridge:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const verified = verifiedSessionId(req);
    if (verified instanceof Response) return verified;
    const { sessionId, expiresAtSec } = verified;
    let repos;
    try {
      repos = resolveRepositories();
    } catch {
      return json(503, { error: 'unavailable', message: 'Database not configured.' });
    }
    let bridgeRepos;
    try {
      bridgeRepos = isDemoStore() ? createDemoBridgeRepos() : createBridgePostgresRepos(getSql());
    } catch {
      return json(503, { error: 'unavailable', message: 'Database not configured.' });
    }
    const { id } = await resolveParams(context.params);
    const existingSession = await repos.getSession(sessionId);
    if (!existingSession) {
      await repos.createSession(sessionId, new Date(expiresAtSec * 1000));
    }
    const attempt = await repos.getAttempt(id);
    if (!attempt || attempt.sessionId !== sessionId) {
      return json(404, { error: 'not_found', message: 'Not found.' });
    }
    const rules = isDemoRelease(attempt.releaseId) ? DEMO_BRIDGE_RULES : [];
    const services = createBridgeServices(bridgeRepos, {
      rules,
      followupEligible: (poolIds) => eligibleFollowups(attempt.releaseId, poolIds),
    });
    const result = await services.getBridge({ sessionId, attemptId: id });
    if (!result.available) {
      return json(200, { available: false, reason: result.reason }, { 'Cache-Control': 'no-store' });
    }
    const [question, mechanisms] = await Promise.all([
      questionForRule(result.rule.id),
      mechanismTexts(result.rule.mechanismIds),
    ]);
    // PART06: per-attempt responses are never cached.
    return json(200, {
      available: true,
      ruleId: result.rule.id,
      approvedExplanationKey: result.rule.approvedExplanationKey,
      scenarioId: result.rule.scenarioId,
      mechanisms,
      question,
      followup: result.followup,
      resume: result.resume,
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// POST /api/attempts/[id]/bridge { questionId, optionId, progressId?, followupCaseId? }
// — grades server-side against the DR pack; client never sees the key.
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (foreignOrigin(req)) {
      return json(403, { error: 'forbidden', message: 'Foreign origin.' });
    }
    const limit = checkRateLimit(`bridge:${clientIp(req)}`);
    if (!limit.allowed) {
      return json(
        429,
        { error: 'rate_limited', message: 'Too many requests.' },
        { 'Retry-After': String(limit.retryAfterSec) },
      );
    }
    const verified = verifiedSessionId(req);
    if (verified instanceof Response) return verified;
    const { sessionId, expiresAtSec } = verified;
    let repos;
    try {
      repos = resolveRepositories();
    } catch {
      return json(503, { error: 'unavailable', message: 'Database not configured.' });
    }
    let bridgeRepos;
    try {
      bridgeRepos = isDemoStore() ? createDemoBridgeRepos() : createBridgePostgresRepos(getSql());
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
    const questionId = body['questionId'];
    const optionId = body['optionId'];
    const progressIdRaw = body['progressId'];
    const followupRaw = body['followupCaseId'];
    if (typeof questionId !== 'string' || questionId.length === 0) {
      return json(400, { error: 'bad_request', message: 'Body needs a questionId string.' });
    }
    if (typeof optionId !== 'string' || optionId.length === 0) {
      return json(400, { error: 'bad_request', message: 'Body needs an optionId string.' });
    }
    const existingSession = await repos.getSession(sessionId);
    if (!existingSession) {
      await repos.createSession(sessionId, new Date(expiresAtSec * 1000));
    }
    const attempt = await repos.getAttempt(id);
    if (!attempt || attempt.sessionId !== sessionId) {
      return json(404, { error: 'not_found', message: 'Not found.' });
    }
    const pack = loadDrPack();
    const question = pack.questions.find((q) => q.id === questionId);
    if (!question) {
      return json(422, { error: 'unknown_question', message: 'Unknown bridge question.' });
    }
    const correct = optionId === question.correctOptionId;
    const progressId =
      typeof progressIdRaw === 'string' && progressIdRaw.length > 0
        ? progressIdRaw
        : randomBytes(12).toString('base64url');
    const followupCaseId = typeof followupRaw === 'string' && followupRaw.length > 0 ? followupRaw : null;
    const services = createBridgeServices(bridgeRepos, {
      rules: isDemoRelease(attempt.releaseId) ? DEMO_BRIDGE_RULES : [],
      followupEligible: (poolIds) => eligibleFollowups(attempt.releaseId, poolIds),
    });
    const result = await services.answerBridgeQuestion({
      sessionId,
      progressId,
      correct,
      questionId,
      attemptId: id,
      releaseId: attempt.releaseId,
      followupCaseId,
    });
    return json(200, { completed: result.completed, correct, progressId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
