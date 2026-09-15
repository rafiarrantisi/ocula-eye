// PART04 medical-education bridge slice.
//
// Constructor-injected service over a minimal repo surface (BridgeRepos).
// Routes pass the postgres implementation from this file; tests pass
// in-memory fakes of the same interface.
//
// Boundary note: answerBridgeQuestion records the bridge_progress row
// (completed + responded_correct) and a learning_events row, then returns
// { completed: true }. Misconception aggregation (e.g. repeated-needs
// thresholds over distinct cases) stays a pure domain concern tested
// elsewhere; this service deliberately does not compute flag transitions
// and takes no domain imports so the boundary stays dependency-free.

import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as schema from '../../db/imaging-schema.ts';
import { ServiceError } from './attemptService.ts';

export const MAX_BRIDGES_PER_SESSION_RELEASE = 2;

// Local structural rule shape. Deliberately NOT imported from any
// parallel-agent file; this interface is the bridge slice contract.
export interface BridgeRule {
  id: string;
  triggerConceptIds: string[];
  caseFindingIds: string[];
  mechanismIds: string[];
  scenarioId: string;
  approvedExplanationKey: string;
  followupPoolIds: string[];
}

export interface BridgeAttempt {
  id: string;
  sessionId: string;
  releaseId: string;
  caseId: string;
  status: string;
}

export interface BridgeProgressRow {
  id: string;
  sessionId: string;
  attemptId: string;
  releaseId: string;
  questionId: string;
  followupCaseId: string | null;
  completed: boolean;
  respondedCorrect: boolean | null;
  createdAt: Date;
}

export interface BridgeEventRow {
  id: string;
  sessionId: string;
  attemptId: string | null;
  releaseId: string | null;
  event: string;
  conceptId: string | null;
  payload: unknown;
  createdAt: Date;
}

export interface BridgeRepos {
  getAttempt(id: string): Promise<BridgeAttempt | null>;
  // Stored score result for server-side concept derivation. Required because
  // getBridge must derive trigger concepts from perClass (fn>0 or fp>0)
  // rather than trusting caller-supplied concept ids.
  getScore(attemptId: string): Promise<unknown | null>;
  listSessionBridgeCount(sessionId: string, releaseId: string): Promise<number>;
  saveProgress(row: BridgeProgressRow): Promise<void>;
  listProgress(sessionId: string): Promise<BridgeProgressRow[]>;
  saveEvent(row: BridgeEventRow): Promise<void>;
}

export type FollowupEligible = (poolIds: string[]) => Promise<Array<{ caseId: string; releaseId: string }>>;

export type ConceptHints = Record<string, string[]>;

// Default map for the 4 demo classes (see tests/imaging/scoring.test.ts).
export const DEFAULT_CONCEPT_HINTS: ConceptHints = {
  hard_exudate: ['concept:hard-exudate'],
  microaneurysm: ['concept:microaneurysm'],
  hemorrhage: ['concept:hemorrhage'],
  cotton_wool_spot: ['concept:cotton-wool-spot'],
};

export const DEFAULT_BRIDGE_RULES: BridgeRule[] = [
  {
    id: 'bridge-hard-exudate',
    triggerConceptIds: ['concept:hard-exudate'],
    caseFindingIds: [],
    mechanismIds: ['mechanism:lipid-leakage'],
    scenarioId: 'scenario:diabetic-maculopathy',
    approvedExplanationKey: 'explanation:hard-exudate',
    followupPoolIds: [],
  },
  {
    id: 'bridge-microaneurysm',
    triggerConceptIds: ['concept:microaneurysm'],
    caseFindingIds: [],
    mechanismIds: ['mechanism:capillary-outpouching'],
    scenarioId: 'scenario:early-dr',
    approvedExplanationKey: 'explanation:microaneurysm',
    followupPoolIds: [],
  },
  {
    id: 'bridge-hemorrhage',
    triggerConceptIds: ['concept:hemorrhage'],
    caseFindingIds: [],
    mechanismIds: ['mechanism:capillary-rupture'],
    scenarioId: 'scenario:proliferative-dr',
    approvedExplanationKey: 'explanation:hemorrhage',
    followupPoolIds: [],
  },
  {
    id: 'bridge-cotton-wool-spot',
    triggerConceptIds: ['concept:cotton-wool-spot'],
    caseFindingIds: [],
    mechanismIds: ['mechanism:nerve-fiber-infarct'],
    scenarioId: 'scenario:ischemic-dr',
    approvedExplanationKey: 'explanation:cotton-wool-spot',
    followupPoolIds: [],
  },
];

export type BridgeResult =
  | {
      available: true;
      rule: BridgeRule;
      followup: { caseId: string; releaseId: string } | null;
      resume: { attemptId: string };
    }
  | { available: false; reason: string };

export interface GetBridgeInput {
  sessionId: string;
  attemptId: string;
}

export interface AnswerBridgeInput {
  sessionId: string;
  progressId: string;
  correct: boolean;
  // Optional creation extras for the route POST {questionId, correct} path:
  // when no row with progressId exists and these are present, the service
  // creates a completed row instead of returning 404.
  questionId?: string;
  attemptId?: string;
  releaseId?: string;
  followupCaseId?: string | null;
}

function fail(status: number, code: string, message: string): never {
  throw new ServiceError(status, code, message);
}

function notFound(): never {
  fail(404, 'not_found', 'Not found.');
}

function deriveConceptIds(score: unknown, hints: ConceptHints): string[] {
  if (!score || typeof score !== 'object') return [];
  const localization = (score as { localization?: unknown }).localization;
  if (!localization || typeof localization !== 'object') return [];
  const perClass = (localization as { perClass?: unknown }).perClass;
  if (!perClass || typeof perClass !== 'object' || Array.isArray(perClass)) return [];
  const out = new Set<string>();
  for (const [classId, value] of Object.entries(perClass as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const fn = (value as { fn?: unknown }).fn;
    const fp = (value as { fp?: unknown }).fp;
    const hit = (typeof fn === 'number' && fn > 0) || (typeof fp === 'number' && fp > 0);
    if (!hit) continue;
    const mapped = hints[classId] ?? [];
    for (const conceptId of mapped) out.add(conceptId);
  }
  return [...out];
}

type Db = PostgresJsDatabase<typeof schema>;

function toProgressRow(r: typeof schema.bridgeProgress.$inferSelect): BridgeProgressRow {
  return {
    id: r.id,
    sessionId: r.sessionId,
    attemptId: r.attemptId,
    releaseId: r.releaseId,
    questionId: r.questionId,
    followupCaseId: r.followupCaseId,
    completed: r.completed,
    respondedCorrect: r.respondedCorrect,
    createdAt: r.createdAt,
  };
}

export class BridgePostgresRepos implements BridgeRepos {
  private readonly db: Db;

  constructor(sql: Sql) {
    this.db = drizzle(sql, { schema });
  }

  async getAttempt(id: string): Promise<BridgeAttempt | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingAttempts)
      .where(eq(schema.imagingAttempts.id, id));
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, sessionId: r.sessionId, releaseId: r.releaseId, caseId: r.caseId, status: r.status };
  }

  async getScore(attemptId: string): Promise<unknown | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingScores)
      .where(eq(schema.imagingScores.attemptId, attemptId));
    if (rows.length === 0) return null;
    return rows[0].result;
  }

  async listSessionBridgeCount(sessionId: string, releaseId: string): Promise<number> {
    const rows = await this.db
      .select({ id: schema.bridgeProgress.id })
      .from(schema.bridgeProgress)
      .where(
        and(
          eq(schema.bridgeProgress.sessionId, sessionId),
          eq(schema.bridgeProgress.releaseId, releaseId),
        ),
      );
    return rows.length;
  }

  async saveProgress(row: BridgeProgressRow): Promise<void> {
    await this.db
      .insert(schema.bridgeProgress)
      .values({
        id: row.id,
        sessionId: row.sessionId,
        attemptId: row.attemptId,
        releaseId: row.releaseId,
        questionId: row.questionId,
        followupCaseId: row.followupCaseId,
        completed: row.completed,
        respondedCorrect: row.respondedCorrect,
        createdAt: row.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.bridgeProgress.id,
        set: {
          sessionId: row.sessionId,
          attemptId: row.attemptId,
          releaseId: row.releaseId,
          questionId: row.questionId,
          followupCaseId: row.followupCaseId,
          completed: row.completed,
          respondedCorrect: row.respondedCorrect,
        },
      });
  }

  async listProgress(sessionId: string): Promise<BridgeProgressRow[]> {
    const rows = await this.db
      .select()
      .from(schema.bridgeProgress)
      .where(eq(schema.bridgeProgress.sessionId, sessionId));
    return rows.map(toProgressRow);
  }

  async saveEvent(row: BridgeEventRow): Promise<void> {
    await this.db.insert(schema.learningEvents).values({
      id: row.id,
      sessionId: row.sessionId,
      attemptId: row.attemptId,
      releaseId: row.releaseId,
      event: row.event,
      conceptId: row.conceptId,
      payload: row.payload,
      createdAt: row.createdAt,
    });
  }
}

export function createBridgePostgresRepos(sql: Sql): BridgeRepos {
  return new BridgePostgresRepos(sql);
}

export interface BridgeServices {
  getBridge(input: GetBridgeInput): Promise<BridgeResult>;
  answerBridgeQuestion(input: AnswerBridgeInput): Promise<{ completed: true }>;
}

export function createBridgeServices(
  repos: BridgeRepos,
  opts: {
    rules: BridgeRule[];
    followupEligible: FollowupEligible;
    conceptHints?: ConceptHints;
    newId?: () => string;
    now?: () => Date;
  },
): BridgeServices {
  const rules = opts.rules;
  const followupEligible = opts.followupEligible;
  const conceptHints = opts.conceptHints ?? DEFAULT_CONCEPT_HINTS;
  const newId = opts.newId ?? (() => randomBytes(12).toString('base64url'));
  const now = opts.now ?? (() => new Date());

  async function getBridge(input: GetBridgeInput): Promise<BridgeResult> {
    const { sessionId, attemptId } = input;
    if (!sessionId || !attemptId) fail(400, 'bad_request', 'Missing required fields.');
    const attempt = await repos.getAttempt(attemptId);
    if (!attempt || attempt.sessionId !== sessionId) notFound();
    if (attempt.status !== 'feedback_released') {
      fail(403, 'feedback_not_released', 'Bridge is available only after feedback is released.');
    }
    const used = await repos.listSessionBridgeCount(sessionId, attempt.releaseId);
    if (used >= MAX_BRIDGES_PER_SESSION_RELEASE) {
      return { available: false, reason: 'session-limit' };
    }
    const score = await repos.getScore(attemptId);
    if (score === null || score === undefined) {
      fail(503, 'unavailable', 'Score not ready.');
    }
    const conceptIds = deriveConceptIds(score, conceptHints);
    const rule = rules.find((r) => r.triggerConceptIds.some((c) => conceptIds.includes(c))) ?? null;
    if (!rule) {
      return { available: false, reason: 'no-rule' };
    }
    let followup: { caseId: string; releaseId: string } | null = null;
    if (rule.followupPoolIds.length > 0) {
      const eligible = await followupEligible(rule.followupPoolIds);
      if (eligible.length > 0) {
        followup = { caseId: eligible[0].caseId, releaseId: eligible[0].releaseId };
      }
    }
    await repos.saveEvent({
      id: newId(),
      sessionId,
      attemptId,
      releaseId: attempt.releaseId,
      event: 'mechanism_opened',
      conceptId: conceptIds.length > 0 ? conceptIds[0] : null,
      payload: { ruleId: rule.id, triggerConceptIds: conceptIds, followup },
      createdAt: now(),
    });
    return { available: true, rule, followup, resume: { attemptId } };
  }

  async function answerBridgeQuestion(input: AnswerBridgeInput): Promise<{ completed: true }> {
    const { sessionId, progressId, correct } = input;
    if (!sessionId || !progressId || typeof correct !== 'boolean') {
      fail(400, 'bad_request', 'Missing required fields.');
    }
    const rows = await repos.listProgress(sessionId);
    const existing = rows.find((r) => r.id === progressId) ?? null;
    if (!existing) {
      // Route creation path: POST {questionId, correct} with attempt context.
      if (input.questionId && input.attemptId && input.releaseId) {
        await repos.saveProgress({
          id: progressId,
          sessionId,
          attemptId: input.attemptId,
          releaseId: input.releaseId,
          questionId: input.questionId,
          followupCaseId: input.followupCaseId ?? null,
          completed: true,
          respondedCorrect: correct,
          createdAt: now(),
        });
        await repos.saveEvent({
          id: newId(),
          sessionId,
          attemptId: input.attemptId,
          releaseId: input.releaseId,
          event: 'bridge_answered',
          conceptId: null,
          payload: { progressId, questionId: input.questionId, correct },
          createdAt: now(),
        });
        return { completed: true };
      }
      notFound();
    }
    const row = existing as BridgeProgressRow;
    await repos.saveProgress({ ...row, completed: true, respondedCorrect: correct });
    await repos.saveEvent({
      id: newId(),
      sessionId,
      attemptId: row.attemptId,
      releaseId: row.releaseId,
      event: 'bridge_answered',
      conceptId: null,
      payload: { progressId, questionId: row.questionId, correct },
      createdAt: now(),
    });
    return { completed: true };
  }

  return { getBridge, answerBridgeQuestion };
}
