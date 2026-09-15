import { describe, expect, it } from 'vitest';
import {
  createBridgeServices,
  type BridgeAttempt,
  type BridgeEventRow,
  type BridgeProgressRow,
  type BridgeRepos,
  type BridgeRule,
} from '../../lib/server/bridgeService.ts';

// In-test fakes: in-memory BridgeRepos doubles for service-level tests.
// They are explicitly NOT a database; the bridge route uses postgres only
// (503 without DATABASE_URL) and demo bridge coverage lives here.
class FakeBridgeRepos implements BridgeRepos {
  attempts = new Map<string, BridgeAttempt>();
  scores = new Map<string, unknown>();
  progress: BridgeProgressRow[] = [];
  events: BridgeEventRow[] = [];

  async getAttempt(id: string): Promise<BridgeAttempt | null> {
    return this.attempts.get(id) ?? null;
  }

  async getScore(attemptId: string): Promise<unknown | null> {
    if (!this.scores.has(attemptId)) return null;
    return this.scores.get(attemptId) as unknown;
  }

  async listSessionBridgeCount(sessionId: string, releaseId: string): Promise<number> {
    return this.progress.filter((p) => p.sessionId === sessionId && p.releaseId === releaseId).length;
  }

  async saveProgress(row: BridgeProgressRow): Promise<void> {
    const idx = this.progress.findIndex((p) => p.id === row.id);
    if (idx >= 0) this.progress[idx] = row;
    else this.progress.push(row);
  }

  async listProgress(sessionId: string): Promise<BridgeProgressRow[]> {
    return this.progress.filter((p) => p.sessionId === sessionId);
  }

  async saveEvent(row: BridgeEventRow): Promise<void> {
    this.events.push(row);
  }
}

const RULES: BridgeRule[] = [
  {
    id: 'rule-hemorrhage',
    triggerConceptIds: ['concept:hemorrhage'],
    caseFindingIds: ['finding:dot-blot'],
    mechanismIds: ['mechanism:capillary-rupture'],
    scenarioId: 'scenario:proliferative-dr',
    approvedExplanationKey: 'explanation:hemorrhage',
    followupPoolIds: ['pool-a'],
  },
];

const SCORE_WITH_FN = {
  score: 0,
  total: 1,
  perTask: [],
  localization: {
    taskId: 'loc-1',
    perClass: {
      hemorrhage: { tp: 0, fp: 0, fn: 1, precision: null, recall: 0, f1: 0 },
    },
  },
};

function seedReleasedAttempt(repos: FakeBridgeRepos): { sessionId: string; attemptId: string } {
  const sessionId = 'sess-a';
  const attemptId = 'att-1';
  repos.attempts.set(attemptId, {
    id: attemptId,
    sessionId,
    releaseId: 'rel-1',
    caseId: 'case-1',
    status: 'feedback_released',
  });
  repos.scores.set(attemptId, SCORE_WITH_FN);
  return { sessionId, attemptId };
}

function makeServices(repos: FakeBridgeRepos, nowValue = new Date('2026-06-01T00:00:00Z')): ReturnType<typeof createBridgeServices> {
  let n = 0;
  return createBridgeServices(repos, {
    rules: RULES,
    followupEligible: async () => [{ caseId: 'case-follow', releaseId: 'rel-1' }],
    newId: () => `evt-${String((n += 1))}`,
    now: () => nowValue,
  });
}

async function expectStatus(promise: Promise<unknown>, status: number): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toMatchObject({ status });
    return;
  }
  throw new Error(`expected rejection with status ${String(status)}`);
}

describe('bridge service (fake repos)', () => {
  it('getBridge happy path returns rule, followup, resume and records an event', async () => {
    const repos = new FakeBridgeRepos();
    const { sessionId, attemptId } = seedReleasedAttempt(repos);
    const services = makeServices(repos);
    const result = await services.getBridge({ sessionId, attemptId });
    expect(result).toMatchObject({
      available: true,
      followup: { caseId: 'case-follow', releaseId: 'rel-1' },
      resume: { attemptId },
    });
    if (result.available) {
      expect(result.rule.id).toBe('rule-hemorrhage');
    } else {
      throw new Error('expected available bridge');
    }
    expect(repos.events.length).toBe(1);
    expect(repos.events[0]).toMatchObject({ event: 'mechanism_opened', sessionId, attemptId });
  });

  it('getBridge before feedback release is a 403', async () => {
    const repos = new FakeBridgeRepos();
    repos.attempts.set('att-draft', {
      id: 'att-draft',
      sessionId: 'sess-a',
      releaseId: 'rel-1',
      caseId: 'case-1',
      status: 'draft',
    });
    const services = makeServices(repos);
    await expectStatus(services.getBridge({ sessionId: 'sess-a', attemptId: 'att-draft' }), 403);
  });

  it('getBridge cross-session access is an opaque 404', async () => {
    const repos = new FakeBridgeRepos();
    seedReleasedAttempt(repos);
    const services = makeServices(repos);
    await expectStatus(services.getBridge({ sessionId: 'sess-other', attemptId: 'att-1' }), 404);
    await expectStatus(services.getBridge({ sessionId: 'sess-a', attemptId: 'att-missing' }), 404);
  });

  it('getBridge past the session limit is unavailable', async () => {
    const repos = new FakeBridgeRepos();
    const { sessionId, attemptId } = seedReleasedAttempt(repos);
    const stamped = new Date('2026-06-01T00:00:00Z');
    await repos.saveProgress({
      id: 'prog-1',
      sessionId,
      attemptId,
      releaseId: 'rel-1',
      questionId: 'q-1',
      followupCaseId: null,
      completed: true,
      respondedCorrect: true,
      createdAt: stamped,
    });
    await repos.saveProgress({
      id: 'prog-2',
      sessionId,
      attemptId,
      releaseId: 'rel-1',
      questionId: 'q-2',
      followupCaseId: null,
      completed: true,
      respondedCorrect: false,
      createdAt: stamped,
    });
    const services = makeServices(repos);
    const result = await services.getBridge({ sessionId, attemptId });
    expect(result).toEqual({ available: false, reason: 'session-limit' });
  });

  it('answerBridgeQuestion completion persists', async () => {
    const repos = new FakeBridgeRepos();
    const { sessionId, attemptId } = seedReleasedAttempt(repos);
    const stamped = new Date('2026-06-01T00:00:00Z');
    await repos.saveProgress({
      id: 'prog-9',
      sessionId,
      attemptId,
      releaseId: 'rel-1',
      questionId: 'q-9',
      followupCaseId: null,
      completed: false,
      respondedCorrect: null,
      createdAt: stamped,
    });
    const services = makeServices(repos);
    const result = await services.answerBridgeQuestion({
      sessionId,
      progressId: 'prog-9',
      correct: true,
    });
    expect(result).toEqual({ completed: true });
    const rows = await repos.listProgress(sessionId);
    const row = rows.find((r) => r.id === 'prog-9');
    expect(row).toMatchObject({ completed: true, respondedCorrect: true });
    expect(repos.events.some((e) => e.event === 'bridge_answered')).toBe(true);
  });
});
