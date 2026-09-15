import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type {
  AttemptRow,
  AttemptTx,
  DraftRow,
  Repositories,
  ResponseRow,
  ScoreRow,
  SessionRow,
} from '../../lib/server/attemptRepository.ts';
import { createServices, type AttemptMode, type Services } from '../../lib/server/attemptService.ts';

// Unit-fixture fakes: in-memory Repositories doubles for service-level tests.
// They are explicitly NOT a database; DB-backed coverage lives in the
// describe.runIf(DATABASE_URL) suite below (skipped when DATABASE_URL is
// absent, as in this environment).
class FakeRepos implements Repositories {
  sessions = new Map<string, SessionRow>();
  releases = new Map<string, { id: string; manifest: unknown; createdAt: Date }>();
  attempts = new Map<string, AttemptRow>();
  drafts = new Map<string, DraftRow>();
  responses = new Map<string, ResponseRow>();
  scores = new Map<string, ScoreRow>();

  private tx(): AttemptTx {
    return {
      getAttempt: async (id: string) => this.attempts.get(id) ?? null,
      getResponse: async (attemptId: string) => this.responses.get(attemptId) ?? null,
      getScore: async (attemptId: string) => this.scores.get(attemptId) ?? null,
      setAttemptStatus: async (id, status, submittedAt) => {
        const a = this.attempts.get(id);
        if (a) this.attempts.set(id, { ...a, status, submittedAt });
      },
      setAttemptIdempotencyKey: async (id, key) => {
        for (const other of this.attempts.values()) {
          if (other.id !== id && other.idempotencyKey === key) throw new Error('unique violation');
        }
        const a = this.attempts.get(id);
        if (a) this.attempts.set(id, { ...a, idempotencyKey: key });
      },
      saveResponse: async (attemptId, payload, error) => {
        this.responses.set(attemptId, { attemptId, payload, error });
      },
      saveScore: async (attemptId, result) => {
        this.scores.set(attemptId, { attemptId, result });
      },
    };
  }

  async createSession(id: string, expiresAt: Date): Promise<SessionRow> {
    const row: SessionRow = { id, createdAt: new Date('2026-01-01T00:00:00Z'), expiresAt };
    this.sessions.set(id, row);
    return row;
  }

  async getSession(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async getRelease(id: string) {
    return this.releases.get(id) ?? null;
  }

  async upsertRelease(id: string, manifest: unknown): Promise<void> {
    this.releases.set(id, { id, manifest, createdAt: new Date('2026-01-01T00:00:00Z') });
  }

  async createAttempt(input: {
    id: string;
    sessionId: string;
    releaseId: string;
    caseId: string;
    idempotencyKey: string | null;
  }): Promise<AttemptRow> {
    if (input.idempotencyKey) {
      for (const other of this.attempts.values()) {
        if (other.idempotencyKey === input.idempotencyKey) throw new Error('unique violation');
      }
    }
    const row: AttemptRow = {
      ...input,
      status: 'draft',
      revision: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      submittedAt: null,
    };
    this.attempts.set(row.id, row);
    return row;
  }

  async getAttempt(id: string): Promise<AttemptRow | null> {
    return this.attempts.get(id) ?? null;
  }

  async findAttemptByIdempotencyKey(key: string): Promise<AttemptRow | null> {
    for (const a of this.attempts.values()) {
      if (a.idempotencyKey === key) return a;
    }
    return null;
  }

  async getDraft(attemptId: string): Promise<DraftRow | null> {
    return this.drafts.get(attemptId) ?? null;
  }

  async upsertDraft(attemptId: string, payload: unknown, revision: number): Promise<void> {
    this.drafts.set(attemptId, { attemptId, payload, revision });
  }

  async setAttemptRevision(id: string, expected: number): Promise<number | null> {
    const a = this.attempts.get(id);
    if (!a || a.revision !== expected) return null;
    const next = expected + 1;
    this.attempts.set(id, { ...a, revision: next });
    return next;
  }

  async getResponse(attemptId: string): Promise<ResponseRow | null> {
    return this.responses.get(attemptId) ?? null;
  }

  async saveResponse(attemptId: string, payload: unknown, error: unknown): Promise<void> {
    this.responses.set(attemptId, { attemptId, payload, error });
  }

  async getScore(attemptId: string): Promise<ScoreRow | null> {
    return this.scores.get(attemptId) ?? null;
  }

  async saveScore(attemptId: string, result: unknown): Promise<void> {
    this.scores.set(attemptId, { attemptId, result });
  }

  async withAttemptLock<T>(attemptId: string, fn: (tx: AttemptTx) => Promise<T>): Promise<T> {
    void attemptId;
    return fn(this.tx());
  }
}

const TRUTH = { answers: { t1: 'opt-a', t2: 'opt-b' } };

async function makeHarness(mode: AttemptMode = 'practice'): Promise<{
  repos: FakeRepos;
  services: Services;
  sessionId: string;
  attemptId: string;
}> {
  const repos = new FakeRepos();
  const sessionId = 'sess-a';
  await repos.createSession(sessionId, new Date('2027-01-01T00:00:00Z'));
  await repos.upsertRelease('rel-1', {
    version: '1.0.0',
    cases: [{ caseId: 'case-1' }],
  });
  let n = 0;
  const services = createServices(repos, {
    truthProvider: async () => TRUTH,
    now: () => new Date('2026-06-01T00:00:00Z'),
    newId: () => `att-${String((n += 1))}`,
  });
  const created = await services.createAttempt({
    sessionId,
    releaseId: 'rel-1',
    caseId: 'case-1',
    mode,
  });
  return { repos, services, sessionId, attemptId: created.attemptId };
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

describe('imaging attempt service (fake repos)', () => {
  it('idempotent submit returns the original receipt without rescoring', async () => {
    const { repos, services, sessionId, attemptId } = await makeHarness();
    const payload = { version: 1, answers: { t1: 'opt-a', t2: 'opt-x' } };
    const first = await services.submitAttempt({ sessionId, attemptId, payload, idempotencyKey: 'k-1' });
    expect(first.status).toBe('feedback_released');
    const second = await services.submitAttempt({ sessionId, attemptId, payload, idempotencyKey: 'k-1' });
    expect(second).toEqual(first);
    expect(repos.scores.size).toBe(1);
    expect(repos.responses.size).toBe(1);
  });

  it('same key with a conflicting payload is a 409', async () => {
    const { services, sessionId, attemptId } = await makeHarness();
    await services.submitAttempt({
      sessionId,
      attemptId,
      payload: { version: 1, answers: { t1: 'opt-a' } },
      idempotencyKey: 'k-9',
    });
    await expectStatus(
      services.submitAttempt({
        sessionId,
        attemptId,
        payload: { version: 1, answers: { t1: 'opt-b' } },
        idempotencyKey: 'k-9',
      }),
      409,
    );
  });

  it('forged protocol version is rejected', async () => {
    const { services, sessionId, attemptId } = await makeHarness();
    await expectStatus(
      services.submitAttempt({ sessionId, attemptId, payload: { version: 999, answers: {} } }),
      422,
    );
  });

  it('draft revision conflict is a 409', async () => {
    const { services, sessionId, attemptId } = await makeHarness();
    const first = await services.saveDraft({ sessionId, attemptId, payload: { a: 1 }, expectedRevision: 0 });
    expect(first.revision).toBe(1);
    await expectStatus(
      services.saveDraft({ sessionId, attemptId, payload: { a: 2 }, expectedRevision: 0 }),
      409,
    );
    const second = await services.saveDraft({ sessionId, attemptId, payload: { a: 2 }, expectedRevision: 1 });
    expect(second.revision).toBe(2);
  });

  it('feedback is denied before submit', async () => {
    const { services, sessionId, attemptId } = await makeHarness();
    await expectStatus(services.getFeedback({ sessionId, attemptId }), 403);
  });

  it('cross-session access is an opaque 404', async () => {
    const { repos, services, attemptId } = await makeHarness();
    await repos.createSession('sess-b', new Date('2027-01-01T00:00:00Z'));
    await expectStatus(services.getFeedback({ sessionId: 'sess-b', attemptId }), 404);
    await expectStatus(
      services.saveDraft({ sessionId: 'sess-b', attemptId, payload: {}, expectedRevision: 0 }),
      404,
    );
    await expectStatus(
      services.submitAttempt({ sessionId: 'sess-b', attemptId, payload: { version: 1, answers: {} } }),
      404,
    );
  });

  it('practice releases feedback immediately; assessment returns a receipt only', async () => {
    const practice = await makeHarness('practice');
    await practice.services.submitAttempt({
      sessionId: practice.sessionId,
      attemptId: practice.attemptId,
      payload: { version: 1, answers: { t1: 'opt-a', t2: 'opt-b' } },
    });
    const feedback = await practice.services.getFeedback({
      sessionId: practice.sessionId,
      attemptId: practice.attemptId,
    });
    expect(feedback.status).toBe('feedback_released');
    expect(feedback.score).toMatchObject({ score: 2, total: 2 });

    const assessment = await makeHarness('assessment');
    const receipt = await assessment.services.submitAttempt({
      sessionId: assessment.sessionId,
      attemptId: assessment.attemptId,
      payload: { version: 1, answers: { t1: 'opt-a', t2: 'opt-b' } },
    });
    expect(receipt.status).toBe('submitted');
    await expectStatus(
      assessment.services.getFeedback({ sessionId: assessment.sessionId, attemptId: assessment.attemptId }),
      403,
    );
  });

  it('submitted attempts are immutable', async () => {
    const { services, sessionId, attemptId } = await makeHarness();
    await services.submitAttempt({ sessionId, attemptId, payload: { version: 1, answers: {} } });
    await expectStatus(
      services.saveDraft({ sessionId, attemptId, payload: {}, expectedRevision: 0 }),
      409,
    );
    await expectStatus(
      services.submitAttempt({ sessionId, attemptId, payload: { version: 1, answers: {} } }),
      409,
    );
  });
});

// Live Postgres round-trip. Requires DATABASE_URL; skipped otherwise (this
// environment has no DATABASE_URL, so this suite reports skipped).
describe.runIf(!!process.env.DATABASE_URL)('imaging api live db', () => {
  it('migrates and round-trips create/submit', async () => {
    const { getSql } = await import('../../lib/server/db.ts');
    const { createPostgresRepositories } = await import('../../lib/server/attemptRepository.ts');
    const sql = getSql();
    try {
      const migration = await readFile(
        new URL('../../db/migrations/0001_imaging.sql', import.meta.url),
        'utf8',
      );
      await sql.unsafe(migration);
      const repos = createPostgresRepositories(sql);
      const sessionId = `live-${Date.now().toString(36)}`;
      await repos.createSession(sessionId, new Date(Date.now() + 3600_000));
      await repos.upsertRelease('live-rel', { version: '1.0.0', cases: [{ caseId: 'live-case' }] });
      const services = createServices(repos, {
        truthProvider: async () => ({ answers: { t1: 'opt-a' } }),
      });
      const created = await services.createAttempt({
        sessionId,
        releaseId: 'live-rel',
        caseId: 'live-case',
        mode: 'practice',
      });
      const receipt = await services.submitAttempt({
        sessionId,
        attemptId: created.attemptId,
        payload: { version: 1, answers: { t1: 'opt-a' } },
      });
      expect(receipt.status).toBe('feedback_released');
      const feedback = await services.getFeedback({ sessionId, attemptId: created.attemptId });
      expect(feedback.score).toMatchObject({ score: 1, total: 1 });
    } finally {
      await sql.end();
    }
  });
});
