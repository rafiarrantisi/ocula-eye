import { randomBytes } from 'node:crypto';
import type { Repositories } from './attemptRepository.ts';
import { pointInPolygon } from '../domain/imaging/matching.ts';
import { scoreLocalizationTask } from './localizationScoring.ts';

// Domain service for the PART03 imaging slice. Constructor-injected repos via
// createServices(repos): routes pass the postgres implementation, tests pass
// in-memory fakes of the same Repositories interface.
//
// Option-task scoring below is exact-match per task; localization tasks score
// through lib/domain/imaging (matching + scoring) with server-side truth.

export const SUBMIT_PROTOCOL_VERSION = 1;
export const MAX_DRAFT_BYTES = 64 * 1024;

export type AttemptMode = 'practice' | 'assessment';

export interface CaseTruth {
  answers: Record<string, string>;
  localization?: {
    taskId: string;
    roi: { polygon: number[][] };
    targets: { id: string; classId: string; polygon: number[][]; cx: number; cy: number }[];
    ignored: { polygon: number[][]; reason: string }[];
    acceptedClasses: string[];
  };
  gradeExpected?: Record<string, string | null>;
  rationale?: string;
}

export type TruthProvider = (releaseId: string, caseId: string) => Promise<CaseTruth | null>;

export interface PerTaskScore {
  taskId: string;
  correct: boolean;
}

export interface ScoreResult {
  score: number;
  total: number;
  perTask: PerTaskScore[];
  localization?: {
    taskId: string;
    tp: number;
    fp: number;
    fn: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    matchPairs: [string, string][];
    unscoredMarkIds: string[];
    ignoredMarkIds: string[];
    duplicateMarkIds: string[];
    perClass: Record<string, { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null }>;
  };
}

/** Minimal pure scoring shim (see SEAM note above). Exact option-id match. */
export function scoreResponses(
  answers: Record<string, string>,
  truth: CaseTruth,
): ScoreResult {
  const perTask: PerTaskScore[] = Object.entries(truth.answers).map(([taskId, expected]) => ({
    taskId,
    correct: answers[taskId] === expected,
  }));
  return { score: perTask.filter((t) => t.correct).length, total: perTask.length, perTask };
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

export class ServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ServiceError(status, code, message);
}

function notFound(): never {
  // Opaque: same message for missing attempts and cross-session access.
  fail(404, 'not_found', 'Not found.');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface CreateAttemptInput {
  sessionId: string;
  releaseId: string;
  caseId: string;
  mode: AttemptMode;
  idempotencyKey?: string;
}

export interface SaveDraftInput {
  sessionId: string;
  attemptId: string;
  payload: unknown;
  expectedRevision: number;
}

export interface SubmitAttemptInput {
  sessionId: string;
  attemptId: string;
  payload: unknown;
  idempotencyKey?: string;
}

export interface FeedbackInput {
  sessionId: string;
  attemptId: string;
}

export interface Services {
  createAttempt(input: CreateAttemptInput): Promise<{ attemptId: string; revision: number; status: string }>;
  saveDraft(input: SaveDraftInput): Promise<{ revision: number }>;
  submitAttempt(input: SubmitAttemptInput): Promise<{ attemptId: string; status: string }>;
  getFeedback(input: FeedbackInput): Promise<{ attemptId: string; status: string; score: unknown }>;
}

export function createServices(
  repos: Repositories,
  opts?: { truthProvider?: TruthProvider; now?: () => Date; newId?: () => string },
): Services {
  const truthProvider = opts?.truthProvider ?? (async () => null);
  const now = opts?.now ?? (() => new Date());
  const newId = opts?.newId ?? (() => randomBytes(12).toString('base64url'));

  async function requireSession(sessionId: string): Promise<void> {
    const session = await repos.getSession(sessionId);
    if (!session || session.expiresAt.getTime() <= now().getTime()) {
      fail(401, 'unauthorized', 'Session missing or expired.');
    }
  }

  async function loadOwnedAttempt(sessionId: string, attemptId: string) {
    const attempt = await repos.getAttempt(attemptId);
    if (!attempt || attempt.sessionId !== sessionId) notFound();
    return attempt;
  }

  function checkIdempotencyKey(key: string | undefined): string | null {
    if (key === undefined) return null;
    if (typeof key !== 'string' || key.length === 0 || key.length > 128) {
      fail(400, 'bad_request', 'Invalid Idempotency-Key.');
    }
    return key;
  }

  return {
    async createAttempt(input: CreateAttemptInput) {
      const { sessionId, releaseId, caseId, mode } = input;
      if (!sessionId || !releaseId || !caseId) fail(400, 'bad_request', 'Missing required fields.');
      if (mode !== 'practice' && mode !== 'assessment') {
        fail(400, 'bad_request', 'Invalid mode.');
      }
      const key = checkIdempotencyKey(input.idempotencyKey);
      await requireSession(sessionId);
      const release = await repos.getRelease(releaseId);
      if (!release) notFound();
      const manifest = release.manifest as { cases?: Array<{ caseId?: string }>; version?: string };
      if (Array.isArray(manifest?.cases) && manifest.cases.length > 0) {
        const known = manifest.cases.some((c) => c?.caseId === caseId);
        if (!known) fail(422, 'unknown_case', 'Unknown case for this release.');
      }
      if (key) {
        const existing = await repos.findAttemptByIdempotencyKey(key);
        if (existing) {
          if (
            existing.sessionId !== sessionId ||
            existing.releaseId !== releaseId ||
            existing.caseId !== caseId
          ) {
            fail(409, 'idempotency_conflict', 'Idempotency key already used.');
          }
          return { attemptId: existing.id, revision: existing.revision, status: existing.status };
        }
      }
      const attemptId = newId();
      try {
        const attempt = await repos.createAttempt({
          id: attemptId,
          sessionId,
          releaseId,
          caseId,
          idempotencyKey: key,
        });
        // Mode has no dedicated column in the imaging schema; it rides in the
        // initial draft envelope and the submit path reads it back.
        await repos.upsertDraft(attemptId, { mode }, 0);
        return { attemptId: attempt.id, revision: attempt.revision, status: attempt.status };
      } catch (err) {
        if (err instanceof ServiceError) throw err;
        fail(409, 'idempotency_conflict', 'Idempotency key already used.');
      }
    },

    async saveDraft(input: SaveDraftInput) {
      const { sessionId, attemptId, payload, expectedRevision } = input;
      await requireSession(sessionId);
      const attempt = await loadOwnedAttempt(sessionId, attemptId);
      if (attempt.status !== 'draft') fail(409, 'already_submitted', 'Attempt is immutable after submit.');
      if (!Number.isInteger(expectedRevision)) fail(400, 'bad_request', 'Invalid expected revision.');
      if (!isPlainObject(payload)) fail(400, 'bad_request', 'Draft payload must be an object.');
      if (JSON.stringify(payload).length > MAX_DRAFT_BYTES) {
        fail(413, 'payload_too_large', 'Draft payload too large.');
      }
      const next = await repos.setAttemptRevision(attemptId, expectedRevision);
      if (next === null) fail(409, 'revision_conflict', 'Draft revision conflict; refetch and retry.');
      const draft = await repos.getDraft(attemptId);
      const merged = { ...((isPlainObject(draft?.payload) ? draft?.payload : {}) as Record<string, unknown>), ...payload };
      await repos.upsertDraft(attemptId, merged, next);
      return { revision: next };
    },

    async submitAttempt(input: SubmitAttemptInput) {
      const { sessionId, attemptId, payload } = input;
      await requireSession(sessionId);
      const attempt = await loadOwnedAttempt(sessionId, attemptId);
      const key = checkIdempotencyKey(input.idempotencyKey);
      if (!isPlainObject(payload)) fail(400, 'bad_request', 'Submit payload must be an object.');
      if (payload['version'] !== SUBMIT_PROTOCOL_VERSION) {
        fail(422, 'bad_version', 'Unsupported submit protocol version.');
      }
      const answers = payload['answers'];
      if (!isPlainObject(answers)) fail(422, 'bad_payload', 'Submit payload needs an answers object.');
      const release = await repos.getRelease(attempt.releaseId);
      if (!release) notFound();
      const manifestVersion = (release.manifest as { version?: unknown })?.version;
      if (
        payload['releaseVersion'] !== undefined &&
        typeof manifestVersion === 'string' &&
        payload['releaseVersion'] !== manifestVersion
      ) {
        fail(422, 'bad_version', 'Release version mismatch.');
      }
      if (key && attempt.idempotencyKey && attempt.idempotencyKey !== key) {
        fail(409, 'idempotency_conflict', 'Idempotency key mismatch for this attempt.');
      }
      if (key) {
        const existing = await repos.findAttemptByIdempotencyKey(key);
        if (existing && existing.id !== attemptId) {
          fail(409, 'idempotency_conflict', 'Idempotency key already used.');
        }
      }

      return repos.withAttemptLock(attemptId, async (tx) => {
        const locked = await tx.getAttempt(attemptId);
        if (!locked || locked.sessionId !== sessionId) notFound();
        if (locked.status !== 'draft') {
          // Idempotent replay: same key + byte-identical canonical payload
          // returns the original receipt instead of rescoring.
          if (key && locked.idempotencyKey === key) {
            const stored = await tx.getResponse(attemptId);
            if (stored && canonicalize(stored.payload) === canonicalize(payload)) {
              return { attemptId, status: locked.status };
            }
          }
          fail(409, 'already_submitted', 'Attempt already submitted.');
        }
        if (key && !locked.idempotencyKey) {
          try {
            await tx.setAttemptIdempotencyKey(attemptId, key);
          } catch {
            fail(409, 'idempotency_conflict', 'Idempotency key already used.');
          }
        }
        const truth = await truthProvider(locked.releaseId, locked.caseId);
        if (!truth) fail(422, 'unknown_case', 'No truth available for this case.');
        const stringAnswers: Record<string, string> = {};
        for (const [taskId, optionId] of Object.entries(answers as Record<string, unknown>)) {
          if (typeof optionId !== 'string') fail(422, 'bad_payload', 'Answers must map tasks to option ids.');
          stringAnswers[taskId] = optionId;
        }
        const result = scoreResponses(stringAnswers, truth);
        const rawMarks = (payload as Record<string, unknown>)['marks'];
        if (rawMarks !== undefined) {
          if (!Array.isArray(rawMarks) || rawMarks.length > 30) fail(422, 'bad_payload', 'Marks must be an array of at most 30.');
          const marks: { id: string; classId: string; x: number; y: number }[] = [];
          for (const m of rawMarks as unknown[]) {
            if (!isPlainObject(m) || typeof m['id'] !== 'string' || typeof m['classId'] !== 'string' || typeof m['x'] !== 'number' || typeof m['y'] !== 'number' || !Number.isFinite(m['x']) || !Number.isFinite(m['y']) || m['x'] < 0 || m['x'] > 1 || m['y'] < 0 || m['y'] > 1) {
              fail(422, 'bad_payload', 'Each mark needs id, classId and x/y in [0,1].');
            }
            marks.push({ id: m['id'] as string, classId: m['classId'] as string, x: m['x'] as number, y: m['y'] as number });
          }
          if (!truth.localization) fail(422, 'unknown_case', 'No localization truth available for this case.');
          const loc = truth.localization;
          for (const m of marks) {
            if (!pointInPolygon(loc.roi.polygon, m.x, m.y)) fail(422, 'out_of_roi', `Mark ${m.id} is outside the task region.`);
          }
          const locScore = scoreLocalizationTask(marks, loc);
          (result as ScoreResult & { localization?: unknown }).localization = {
            taskId: loc.taskId,
            tp: locScore.score.tp,
            fp: locScore.score.fp,
            fn: locScore.score.fn,
            precision: locScore.score.precision,
            recall: locScore.score.recall,
            f1: locScore.score.f1,
            matchPairs: locScore.matchPairs,
            unscoredMarkIds: locScore.unscoredMarkIds,
            ignoredMarkIds: locScore.ignoredMarkIds,
            duplicateMarkIds: locScore.score.duplicateMarkIds,
            perClass: locScore.score.perClass,
          };
        }
        await tx.saveResponse(attemptId, payload, null);
        await tx.saveScore(attemptId, result);
        const draft = await repos.getDraft(attemptId);
        const draftPayload = (
          isPlainObject(draft?.payload) ? draft?.payload : {}
        ) as Record<string, unknown>;
        const mode: AttemptMode = draftPayload['mode'] === 'assessment' ? 'assessment' : 'practice';
        const status = mode === 'practice' ? 'feedback_released' : 'submitted';
        await tx.setAttemptStatus(attemptId, status, now());
        return { attemptId, status };
      });
    },

    async getFeedback(input: FeedbackInput) {
      const { sessionId, attemptId } = input;
      await requireSession(sessionId);
      const attempt = await loadOwnedAttempt(sessionId, attemptId);
      if (attempt.status === 'draft') fail(403, 'not_submitted', 'Attempt has not been submitted.');
      // Reveal policy: practice releases feedback immediately at submit;
      // assessment returns a receipt only (feedback stays locked).
      if (attempt.status === 'submitted') {
        fail(403, 'feedback_not_released', 'Feedback is not released for this attempt.');
      }
      const score = await repos.getScore(attemptId);
      if (!score) fail(503, 'unavailable', 'Score not ready.');
      return { attemptId, status: attempt.status, score: score.result };
    },
  };
}
