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
  const empty = (): DemoDb => ({
    sessions: {}, releases: {}, attempts: {}, drafts: {}, responses: {}, scores: {},
    bridgeProgress: {}, learningEvents: {},
  });
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DemoDb>;
    return {
      sessions: parsed.sessions ?? {},
      releases: parsed.releases ?? {},
      attempts: parsed.attempts ?? {},
      drafts: parsed.drafts ?? {},
      responses: parsed.responses ?? {},
      scores: parsed.scores ?? {},
      bridgeProgress: parsed.bridgeProgress ?? {},
      learningEvents: parsed.learningEvents ?? {},
    };
  } catch {
    return empty();
  }
}

function readDb(): DemoDb {
  return loadDb(demoPath());
}

function writeDb(db: DemoDb): void {
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
        writeDb(db);
      },
      setAttemptIdempotencyKey: async (id, key) => {
        for (const other of Object.values(db.attempts)) {
          if (other.id !== id && other.idempotencyKey === key) throw new Error('duplicate-key');
        }
        const a = db.attempts[id];
        if (!a) return;
        a.idempotencyKey = key;
        writeDb(db);
      },
      saveResponse: async (attemptId, payload, error) => {
        db.responses[attemptId] = { attemptId, payload, error };
        writeDb(db);
      },
      saveScore: async (attemptId, result) => {
        db.scores[attemptId] = { attemptId, result };
        writeDb(db);
      },
    };
  }
  return {
    createSession: async (id, expiresAt) => {
      const db = readDb();
      db.sessions[id] = { id, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
      writeDb(db);
      return { id, createdAt: new Date(), expiresAt };
    },
    getSession: async (id) => {
      const s = readDb().sessions[id];
      return s ? { id: s.id, createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt) } : null;
    },
    getRelease: async (id) => {
      const r = readDb().releases[id];
      return r ? { id: r.id, manifest: r.manifest, createdAt: new Date(r.createdAt) } : null;
    },
    upsertRelease: async (id, manifest) => {
      const db = readDb();
      db.releases[id] = { id, manifest, createdAt: new Date().toISOString() };
      writeDb(db);
    },
    createAttempt: async (input) => {
      if (!input.releaseId.startsWith('demo-synthetic-')) denied();
      const db = readDb();
      const now = new Date().toISOString();
      db.attempts[input.id] = {
        id: input.id, sessionId: input.sessionId, releaseId: input.releaseId, caseId: input.caseId,
        status: 'draft', idempotencyKey: input.idempotencyKey, revision: 0, createdAt: now, submittedAt: null,
      };
      writeDb(db);
      return toAttemptRow(db.attempts[input.id]);
    },
    getAttempt: async (id) => {
      const a = readDb().attempts[id];
      return a ? toAttemptRow(a) : null;
    },
    findAttemptByIdempotencyKey: async (key) => {
      const found = Object.values(readDb().attempts).find((a) => a.idempotencyKey === key);
      return found ? toAttemptRow(found) : null;
    },
    getDraft: async (attemptId) => {
      const d = readDb().drafts[attemptId];
      return d ? { attemptId: d.attemptId, payload: d.payload, revision: d.revision } : null;
    },
    upsertDraft: async (attemptId, payload, revision) => {
      const db = readDb();
      db.drafts[attemptId] = { attemptId, payload, revision };
      writeDb(db);
    },
    setAttemptRevision: async (id, expected) => {
      const db = readDb();
      const a = db.attempts[id];
      if (!a || a.revision !== expected) return null;
      a.revision = expected + 1;
      writeDb(db);
      return a.revision;
    },
    getResponse: async (attemptId) => readDb().responses[attemptId] ?? null,
    saveResponse: async (attemptId, payload, error) => {
      const db = readDb();
      db.responses[attemptId] = { attemptId, payload, error };
      writeDb(db);
    },
    getScore: async (attemptId) => readDb().scores[attemptId] ?? null,
    saveScore: async (attemptId, result) => {
      const db = readDb();
      db.scores[attemptId] = { attemptId, result };
      writeDb(db);
    },
    withAttemptLock: async (attemptId, fn) => {
      const db = readDb();
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
      const a = readDb().attempts[id];
      return a ? { id: a.id, sessionId: a.sessionId, releaseId: a.releaseId, caseId: a.caseId, status: a.status } : null;
    },
    getScore: async (attemptId) => {
      const s = readDb().scores[attemptId];
      return s ? s.result : null;
    },
    listSessionBridgeCount: async (sessionId, releaseId) => {
      return Object.values(readDb().bridgeProgress).filter((r) => r.sessionId === sessionId && r.releaseId === releaseId).length;
    },
    saveProgress: async (row) => {
      const db = readDb();
      db.bridgeProgress[row.id] = { ...row, createdAt: row.createdAt.toISOString() };
      writeDb(db);
    },
    listProgress: async (sessionId) => {
      return Object.values(readDb().bridgeProgress)
        .filter((r) => r.sessionId === sessionId)
        .map(revive);
    },
    saveEvent: async (row) => {
      const db = readDb();
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      db.learningEvents[id] = { ...row, id, createdAt: row.createdAt.toISOString() };
      writeDb(db);
    },
  };
}
