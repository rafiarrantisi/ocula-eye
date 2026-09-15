import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  AttemptRow,
  AttemptTx,
  Repositories,
} from './attemptRepository.ts';

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
    return {
      sessions: parsed.sessions ?? {},
      releases: parsed.releases ?? {},
      attempts: parsed.attempts ?? {},
      drafts: parsed.drafts ?? {},
      responses: parsed.responses ?? {},
      scores: parsed.scores ?? {},
    };
  } catch {
    return { sessions: {}, releases: {}, attempts: {}, drafts: {}, responses: {}, scores: {} };
  }
}

function toAttemptRow(a: DemoDb['attempts'][string]): AttemptRow {
  return {
    id: a.id, sessionId: a.sessionId, releaseId: a.releaseId, caseId: a.caseId,
    status: a.status, idempotencyKey: a.idempotencyKey, revision: a.revision,
    createdAt: new Date(a.createdAt), submittedAt: a.submittedAt ? new Date(a.submittedAt) : null,
  };
}

export function createDemoRepositories(): Repositories {
  const path = demoPath();
  const read = () => loadDb(path);
  const write = (db: DemoDb) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(db));
  };
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
        write(db);
      },
      setAttemptIdempotencyKey: async (id, key) => {
        for (const other of Object.values(db.attempts)) {
          if (other.id !== id && other.idempotencyKey === key) throw new Error('duplicate-key');
        }
        const a = db.attempts[id];
        if (!a) return;
        a.idempotencyKey = key;
        write(db);
      },
      saveResponse: async (attemptId, payload, error) => {
        db.responses[attemptId] = { attemptId, payload, error };
        write(db);
      },
      saveScore: async (attemptId, result) => {
        db.scores[attemptId] = { attemptId, result };
        write(db);
      },
    };
  }
  return {
    createSession: async (id, expiresAt) => {
      const db = read();
      db.sessions[id] = { id, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
      write(db);
      return { id, createdAt: new Date(), expiresAt };
    },
    getSession: async (id) => {
      const s = read().sessions[id];
      return s ? { id: s.id, createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt) } : null;
    },
    getRelease: async (id) => {
      const r = read().releases[id];
      return r ? { id: r.id, manifest: r.manifest, createdAt: new Date(r.createdAt) } : null;
    },
    upsertRelease: async (id, manifest) => {
      const db = read();
      db.releases[id] = { id, manifest, createdAt: new Date().toISOString() };
      write(db);
    },
    createAttempt: async (input) => {
      if (!input.releaseId.startsWith('demo-synthetic-')) denied();
      const db = read();
      const now = new Date().toISOString();
      db.attempts[input.id] = {
        id: input.id, sessionId: input.sessionId, releaseId: input.releaseId, caseId: input.caseId,
        status: 'draft', idempotencyKey: input.idempotencyKey, revision: 0, createdAt: now, submittedAt: null,
      };
      write(db);
      return toAttemptRow(db.attempts[input.id]);
    },
    getAttempt: async (id) => {
      const a = read().attempts[id];
      return a ? toAttemptRow(a) : null;
    },
    findAttemptByIdempotencyKey: async (key) => {
      const found = Object.values(read().attempts).find((a) => a.idempotencyKey === key);
      return found ? toAttemptRow(found) : null;
    },
    getDraft: async (attemptId) => {
      const d = read().drafts[attemptId];
      return d ? { attemptId: d.attemptId, payload: d.payload, revision: d.revision } : null;
    },
    upsertDraft: async (attemptId, payload, revision) => {
      const db = read();
      db.drafts[attemptId] = { attemptId, payload, revision };
      write(db);
    },
    setAttemptRevision: async (id, expected) => {
      const db = read();
      const a = db.attempts[id];
      if (!a || a.revision !== expected) return null;
      a.revision = expected + 1;
      write(db);
      return a.revision;
    },
    getResponse: async (attemptId) => read().responses[attemptId] ?? null,
    saveResponse: async (attemptId, payload, error) => {
      const db = read();
      db.responses[attemptId] = { attemptId, payload, error };
      write(db);
    },
    getScore: async (attemptId) => read().scores[attemptId] ?? null,
    saveScore: async (attemptId, result) => {
      const db = read();
      db.scores[attemptId] = { attemptId, result };
      write(db);
    },
    withAttemptLock: async (attemptId, fn) => {
      const db = read();
      return fn(txView(db));
    },
  };
}
