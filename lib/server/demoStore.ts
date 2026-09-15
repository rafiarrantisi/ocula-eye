import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  AttemptRow,
  AttemptTx,
  Repositories,
} from './attemptRepository.ts';
import type { BridgeRepos } from './bridgeService.ts';

// File-backed Repositories for LOCAL SYNTHETIC DEMO ONLY.
// Active only when LAB_DEMO_STORE=1 (see lib/server/repos.ts) and refuses
// every releaseId outside the demo-synthetic-* namespace. Never for real,
// assessed, or pilot data. Storage file is gitignored.
interface DemoDb {
  sessions: Record<string, { id: string; createdAt: string; expiresAt: string }>;
  releases: Record<string, { id: string; manifest: unknown; createdAt: string }>;
  attempts: Record<string, {
    id: string; sessionId: string; releaseId: string; caseId: string;
    status: AttemptRow['status']; idempotencyKey: string | null; revision: number;
    createdAt: string; submittedAt: string | null;
  }>;
  drafts: Record<string, { attemptId: string; payload: unknown; revision: number }>;
  responses: Record<string, { attemptId: string; payload: unknown; error: unknown }>;
  scores: Record<string, { attemptId: string; result: unknown }>;
  bridgeProgress: Record<string, {
    id: string; sessionId: string; attemptId: string; releaseId: string;
    questionId: string; followupCaseId: string | null; completed: boolean;
    respondedCorrect: boolean | null; createdAt: string;
  }>;
  learningEvents: Record<string, {
    id: string; sessionId: string; attemptId: string | null; releaseId: string | null;
    event: string; conceptId: string | null; payload: unknown; createdAt: string;
  }>;
  faculty: {
    institutions: Record<string, { id: string; name: string; createdAt: string }>;
    users: Record<string, { id: string; authSubject: string; displayName: string; createdAt: string }>;
    memberships: Record<string, { id: string; institutionId: string; userId: string; role: string; createdAt: string }>;
    cohorts: Record<string, { id: string; institutionId: string; name: string; createdAt: string }>;
    members: Record<string, { id: string; cohortId: string; userId: string; learnerPathway: string | null; invitedAt: string | null; createdAt: string }>;
    invitations: Record<string, { id: string; cohortId: string; email: string; tokenHash: string; expiresAt: string; usedAt: string | null; createdAt: string }>;
    assignments: Record<string, {
      id: string; cohortId: string; releaseId: string; pathway: string | null; mode: string;
      openAt: string; dueAt: string | null; revealPolicy: string;
      releaseVersion: string | null; releaseSnapshot: unknown; createdAt: string;
    }>;
  };
}

export type { DemoDb };

function emptyDb(): DemoDb {
  return {
    sessions: {}, releases: {}, attempts: {}, drafts: {}, responses: {}, scores: {},
    bridgeProgress: {}, learningEvents: {},
    faculty: { institutions: {}, users: {}, memberships: {}, cohorts: {}, members: {}, invitations: {}, assignments: {} },
  };
}

function demoPath(): string {
  return resolve(process.env.LAB_DEMO_PATH ?? 'lab-demo/store.json');
}

function denied(): never {
  throw Object.assign(new Error('Demo store serves synthetic demo releases only.'), {
    status: 404,
    code: 'not_found',
  });
}

function loadDb(path: string): DemoDb {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DemoDb>;
    const base = emptyDb();
    return {
      ...base,
      ...parsed,
      faculty: { ...base.faculty, ...(parsed.faculty ?? {}) },
    };
  } catch {
    return emptyDb();
  }
}

export function readDemoDb(): DemoDb {
  return loadDb(demoPath());
}

export function writeDemoDb(db: DemoDb): void {
  const path = demoPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db));
}

function toAttemptRow(a: DemoDb['attempts'][string]): AttemptRow {
  return {
    id: a.id, sessionId: a.sessionId, releaseId: a.releaseId, caseId: a.caseId,
    status: a.status, idempotencyKey: a.idempotencyKey, revision: a.revision,
    createdAt: new Date(a.createdAt), submittedAt: a.submittedAt ? new Date(a.submittedAt) : null,
  };
}

export function createDemoRepositories(): Repositories {


  function txView(db: DemoDb): AttemptTx {
    return {
      getAttempt: async (id) => (db.attempts[id] ? toAttemptRow(db.attempts[id]) : null),
      getResponse: async (attemptId) => db.responses[attemptId] ?? null,
      getScore: async (attemptId) => db.scores[attemptId] ?? null,
      setAttemptStatus: async (id, status, submittedAt) => {
        const a = db.attempts[id];
        if (!a) return;
        a.status = status;
        a.submittedAt = submittedAt ? submittedAt.toISOString() : null;
        writeDemoDb(db);
      },
      setAttemptIdempotencyKey: async (id, key) => {
        for (const other of Object.values(db.attempts)) {
          if (other.id !== id && other.idempotencyKey === key) throw new Error('duplicate-key');
        }
        const a = db.attempts[id];
        if (!a) return;
        a.idempotencyKey = key;
        writeDemoDb(db);
      },
      saveResponse: async (attemptId, payload, error) => {
        db.responses[attemptId] = { attemptId, payload, error };
        writeDemoDb(db);
      },
      saveScore: async (attemptId, result) => {
        db.scores[attemptId] = { attemptId, result };
        writeDemoDb(db);
      },
    };
  }
  return {
    createSession: async (id, expiresAt) => {
      const db = readDemoDb();
      db.sessions[id] = { id, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
      writeDemoDb(db);
      return { id, createdAt: new Date(), expiresAt };
    },
    getSession: async (id) => {
      const s = readDemoDb().sessions[id];
      return s ? { id: s.id, createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt) } : null;
    },
    getRelease: async (id) => {
      const r = readDemoDb().releases[id];
      return r ? { id: r.id, manifest: r.manifest, createdAt: new Date(r.createdAt) } : null;
    },
    upsertRelease: async (id, manifest) => {
      const db = readDemoDb();
      db.releases[id] = { id, manifest, createdAt: new Date().toISOString() };
      writeDemoDb(db);
    },
    createAttempt: async (input) => {
      if (!input.releaseId.startsWith('demo-synthetic-')) denied();
      const db = readDemoDb();
      const now = new Date().toISOString();
      db.attempts[input.id] = {
        id: input.id, sessionId: input.sessionId, releaseId: input.releaseId, caseId: input.caseId,
        status: 'draft', idempotencyKey: input.idempotencyKey, revision: 0, createdAt: now, submittedAt: null,
      };
      writeDemoDb(db);
      return toAttemptRow(db.attempts[input.id]);
    },
    getAttempt: async (id) => {
      const a = readDemoDb().attempts[id];
      return a ? toAttemptRow(a) : null;
    },
    findAttemptByIdempotencyKey: async (key) => {
      const found = Object.values(readDemoDb().attempts).find((a) => a.idempotencyKey === key);
      return found ? toAttemptRow(found) : null;
    },
    getDraft: async (attemptId) => {
      const d = readDemoDb().drafts[attemptId];
      return d ? { attemptId: d.attemptId, payload: d.payload, revision: d.revision } : null;
    },
    upsertDraft: async (attemptId, payload, revision) => {
      const db = readDemoDb();
      db.drafts[attemptId] = { attemptId, payload, revision };
      writeDemoDb(db);
    },
    setAttemptRevision: async (id, expected) => {
      const db = readDemoDb();
      const a = db.attempts[id];
      if (!a || a.revision !== expected) return null;
      a.revision = expected + 1;
      writeDemoDb(db);
      return a.revision;
    },
    getResponse: async (attemptId) => readDemoDb().responses[attemptId] ?? null,
    saveResponse: async (attemptId, payload, error) => {
      const db = readDemoDb();
      db.responses[attemptId] = { attemptId, payload, error };
      writeDemoDb(db);
    },
    getScore: async (attemptId) => readDemoDb().scores[attemptId] ?? null,
    saveScore: async (attemptId, result) => {
      const db = readDemoDb();
      db.scores[attemptId] = { attemptId, result };
      writeDemoDb(db);
    },
    withAttemptLock: async (attemptId, fn) => {
      const db = readDemoDb();
      return fn(txView(db));
    },
  };
}

/** Bridge tables on the same demo file. Synthetic demo only, like the rest
 * of this store. Structural twin of the postgres bridge repos. */
export function createDemoBridgeRepos(): BridgeRepos {
  const revive = <T extends { createdAt: string }>(r: T) => ({ ...r, createdAt: new Date(r.createdAt) });
  return {
    getAttempt: async (id) => {
      const a = readDemoDb().attempts[id];
      return a ? { id: a.id, sessionId: a.sessionId, releaseId: a.releaseId, caseId: a.caseId, status: a.status } : null;
    },
    getScore: async (attemptId) => {
      const s = readDemoDb().scores[attemptId];
      return s ? s.result : null;
    },
    listSessionBridgeCount: async (sessionId, releaseId) => {
      return Object.values(readDemoDb().bridgeProgress).filter((r) => r.sessionId === sessionId && r.releaseId === releaseId).length;
    },
    saveProgress: async (row) => {
      const db = readDemoDb();
      db.bridgeProgress[row.id] = { ...row, createdAt: row.createdAt.toISOString() };
      writeDemoDb(db);
    },
    listProgress: async (sessionId) => {
      return Object.values(readDemoDb().bridgeProgress)
        .filter((r) => r.sessionId === sessionId)
        .map(revive);
    },
    saveEvent: async (row) => {
      const db = readDemoDb();
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      db.learningEvents[id] = { ...row, id, createdAt: row.createdAt.toISOString() };
      writeDemoDb(db);
    },
  };
}
