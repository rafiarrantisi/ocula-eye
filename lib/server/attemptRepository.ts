import { eq, sql as dsql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as schema from '../../db/imaging-schema.ts';

// Postgres-backed Repositories for the PART03 imaging slice, plus the
// Repositories interface that lib/server/attemptService.ts is injected with.
// Tests use in-memory fakes of the same interface (see
// tests/integration/imaging-api.test.ts); production routes use
// createPostgresRepositories(getSql()).

export type AttemptStatus = 'draft' | 'submitted' | 'feedback_released';

export interface SessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ReleaseRow {
  id: string;
  manifest: unknown;
  createdAt: Date;
}

export interface AttemptRow {
  id: string;
  sessionId: string;
  releaseId: string;
  caseId: string;
  status: AttemptStatus;
  idempotencyKey: string | null;
  revision: number;
  createdAt: Date;
  submittedAt: Date | null;
}

export interface DraftRow {
  attemptId: string;
  payload: unknown;
  revision: number;
}

export interface ResponseRow {
  attemptId: string;
  payload: unknown;
  error: unknown;
}

export interface ScoreRow {
  attemptId: string;
  result: unknown;
}

// PART06 pilot gates (migration 0004). All OPTIONAL so pre-existing fakes and
// implementations keep compiling and behave as "no quarantine / unlinked".
export interface QuarantineRow {
  releaseId: string;
  reason: string;
  notice: string;
  createdAt: Date;
}

export interface AssignmentRevealState {
  revealPolicy: string;
  dueAt: Date | null;
  revealedAt: Date | null;
}

/** Transaction-scoped view used for the atomic submit path. The postgres
 * implementation takes a SELECT ... FOR UPDATE row lock before invoking fn. */
export interface AttemptTx {
  getAttempt(id: string): Promise<AttemptRow | null>;
  getResponse(attemptId: string): Promise<ResponseRow | null>;
  getScore(attemptId: string): Promise<ScoreRow | null>;
  setAttemptStatus(id: string, status: AttemptStatus, submittedAt: Date | null): Promise<void>;
  setAttemptIdempotencyKey(id: string, key: string): Promise<void>;
  saveResponse(attemptId: string, payload: unknown, error: unknown): Promise<void>;
  saveScore(attemptId: string, result: unknown): Promise<void>;
}

export interface Repositories {
  createSession(id: string, expiresAt: Date): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | null>;
  getRelease(id: string): Promise<ReleaseRow | null>;
  upsertRelease(id: string, manifest: unknown): Promise<void>;
  createAttempt(input: {
    id: string;
    sessionId: string;
    releaseId: string;
    caseId: string;
    idempotencyKey: string | null;
  }): Promise<AttemptRow>;
  getAttempt(id: string): Promise<AttemptRow | null>;
  findAttemptByIdempotencyKey(key: string): Promise<AttemptRow | null>;
  getDraft(attemptId: string): Promise<DraftRow | null>;
  upsertDraft(attemptId: string, payload: unknown, revision: number): Promise<void>;
  /** Atomic optimistic-concurrency bump: sets revision to expected+1 only when
   * the current revision equals expected; returns the new revision or null
   * on conflict. */
  setAttemptRevision(id: string, expected: number): Promise<number | null>;
  getResponse(attemptId: string): Promise<ResponseRow | null>;
  saveResponse(attemptId: string, payload: unknown, error: unknown): Promise<void>;
  getScore(attemptId: string): Promise<ScoreRow | null>;
  saveScore(attemptId: string, result: unknown): Promise<void>;
  withAttemptLock<T>(attemptId: string, fn: (tx: AttemptTx) => Promise<T>): Promise<T>;
  // PART06 additions (all optional; absent = gates open as before).
  getReleaseQuarantine?(releaseId: string): Promise<QuarantineRow | null>;
  setAttemptAssignmentId?(attemptId: string, assignmentId: string): Promise<void>;
  getAttemptAssignmentId?(attemptId: string): Promise<string | null>;
  getAssignmentRevealState?(assignmentId: string): Promise<AssignmentRevealState | null>;
}

type Db = PostgresJsDatabase<typeof schema>;

function toAttemptRow(r: typeof schema.imagingAttempts.$inferSelect): AttemptRow {
  return {
    id: r.id,
    sessionId: r.sessionId,
    releaseId: r.releaseId,
    caseId: r.caseId,
    status: r.status,
    idempotencyKey: r.idempotencyKey,
    revision: r.revision,
    createdAt: r.createdAt,
    submittedAt: r.submittedAt,
  };
}

function txView(dbOrTx: Pick<Db, 'execute'> & {
  select: Db['select'];
  update: Db['update'];
  insert: Db['insert'];
}): AttemptTx {
  return {
    async getAttempt(id: string): Promise<AttemptRow | null> {
      const rows = await dbOrTx
        .select()
        .from(schema.imagingAttempts)
        .where(eq(schema.imagingAttempts.id, id));
      return rows.length > 0 ? toAttemptRow(rows[0]) : null;
    },
    async getResponse(attemptId: string): Promise<ResponseRow | null> {
      const rows = await dbOrTx
        .select()
        .from(schema.imagingResponses)
        .where(eq(schema.imagingResponses.attemptId, attemptId));
      if (rows.length === 0) return null;
      return { attemptId: rows[0].attemptId, payload: rows[0].payload, error: rows[0].error };
    },
    async getScore(attemptId: string): Promise<ScoreRow | null> {
      const rows = await dbOrTx
        .select()
        .from(schema.imagingScores)
        .where(eq(schema.imagingScores.attemptId, attemptId));
      if (rows.length === 0) return null;
      return { attemptId: rows[0].attemptId, result: rows[0].result };
    },
    async setAttemptStatus(id: string, status: AttemptStatus, submittedAt: Date | null): Promise<void> {
      await dbOrTx
        .update(schema.imagingAttempts)
        .set({ status, submittedAt })
        .where(eq(schema.imagingAttempts.id, id));
    },
    async setAttemptIdempotencyKey(id: string, key: string): Promise<void> {
      await dbOrTx
        .update(schema.imagingAttempts)
        .set({ idempotencyKey: key })
        .where(eq(schema.imagingAttempts.id, id));
    },
    async saveResponse(attemptId: string, payload: unknown, error: unknown): Promise<void> {
      await dbOrTx
        .insert(schema.imagingResponses)
        .values({ attemptId, payload, error })
        .onConflictDoUpdate({
          target: schema.imagingResponses.attemptId,
          set: { payload, error },
        });
    },
    async saveScore(attemptId: string, result: unknown): Promise<void> {
      await dbOrTx
        .insert(schema.imagingScores)
        .values({ attemptId, result })
        .onConflictDoUpdate({ target: schema.imagingScores.attemptId, set: { result } });
    },
  };
}

export class PostgresRepositories implements Repositories {
  private readonly db: Db;
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
    this.db = drizzle(sql, { schema });
  }

  async createSession(id: string, expiresAt: Date): Promise<SessionRow> {
    const rows = await this.db.insert(schema.imagingSessions).values({ id, expiresAt }).returning();
    return { id: rows[0].id, createdAt: rows[0].createdAt, expiresAt: rows[0].expiresAt };
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingSessions)
      .where(eq(schema.imagingSessions.id, id));
    if (rows.length === 0) return null;
    return { id: rows[0].id, createdAt: rows[0].createdAt, expiresAt: rows[0].expiresAt };
  }

  async getRelease(id: string): Promise<ReleaseRow | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingReleases)
      .where(eq(schema.imagingReleases.id, id));
    if (rows.length === 0) return null;
    return { id: rows[0].id, manifest: rows[0].manifest, createdAt: rows[0].createdAt };
  }

  async upsertRelease(id: string, manifest: unknown): Promise<void> {
    await this.db
      .insert(schema.imagingReleases)
      .values({ id, manifest })
      .onConflictDoUpdate({ target: schema.imagingReleases.id, set: { manifest } });
  }

  async createAttempt(input: {
    id: string;
    sessionId: string;
    releaseId: string;
    caseId: string;
    idempotencyKey: string | null;
  }): Promise<AttemptRow> {
    const rows = await this.db.insert(schema.imagingAttempts).values(input).returning();
    return toAttemptRow(rows[0]);
  }

  async getAttempt(id: string): Promise<AttemptRow | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingAttempts)
      .where(eq(schema.imagingAttempts.id, id));
    return rows.length > 0 ? toAttemptRow(rows[0]) : null;
  }

  async findAttemptByIdempotencyKey(key: string): Promise<AttemptRow | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingAttempts)
      .where(eq(schema.imagingAttempts.idempotencyKey, key));
    return rows.length > 0 ? toAttemptRow(rows[0]) : null;
  }

  async getDraft(attemptId: string): Promise<DraftRow | null> {
    const rows = await this.db
      .select()
      .from(schema.imagingAttemptDrafts)
      .where(eq(schema.imagingAttemptDrafts.attemptId, attemptId));
    if (rows.length === 0) return null;
    return { attemptId: rows[0].attemptId, payload: rows[0].payload, revision: rows[0].revision };
  }

  async upsertDraft(attemptId: string, payload: unknown, revision: number): Promise<void> {
    await this.db
      .insert(schema.imagingAttemptDrafts)
      .values({ attemptId, payload, revision })
      .onConflictDoUpdate({
        target: schema.imagingAttemptDrafts.attemptId,
        set: { payload, revision },
      });
  }

  async setAttemptRevision(id: string, expected: number): Promise<number | null> {
    const rows = await this.sql<{ revision: number }[]>`
      UPDATE "imaging_attempts" SET "revision" = "revision" + 1
      WHERE "id" = ${id} AND "revision" = ${expected}
      RETURNING "revision"`;
    return rows.length > 0 ? rows[0].revision : null;
  }

  async getResponse(attemptId: string): Promise<ResponseRow | null> {
    return txView(this.db).getResponse(attemptId);
  }
  async saveResponse(attemptId: string, payload: unknown, error: unknown): Promise<void> {
    await txView(this.db).saveResponse(attemptId, payload, error);
  }

  async getScore(attemptId: string): Promise<ScoreRow | null> {
    return txView(this.db).getScore(attemptId);
  }

  async saveScore(attemptId: string, result: unknown): Promise<void> {
    await txView(this.db).saveScore(attemptId, result);
  }

  async withAttemptLock<T>(attemptId: string, fn: (tx: AttemptTx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        dsql`SELECT "id" FROM "imaging_attempts" WHERE "id" = ${attemptId} FOR UPDATE`,
      );
      return fn(txView(tx));
    });
  }

  // PART06 pilot gates. Quarantine reads tolerate a database that predates
  // migration 0004 (undefined_table => no quarantine, not a crash); every
  // other SQL error still propagates. AttemptRow is deliberately NOT extended
  // with assignmentId so existing row fakes keep compiling.
  async getReleaseQuarantine(releaseId: string): Promise<QuarantineRow | null> {
    let rows: { release_id: string; reason: string; notice: string; created_at: Date }[];
    try {
      rows = await this.sql<
        { release_id: string; reason: string; notice: string; created_at: Date }[]
      >`SELECT "release_id", "reason", "notice", "created_at" FROM "release_quarantine" WHERE "release_id" = ${releaseId}`;
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === '42P01') return null;
      throw err;
    }
    if (rows.length === 0) return null;
    return { releaseId: rows[0].release_id, reason: rows[0].reason, notice: rows[0].notice, createdAt: rows[0].created_at };
  }

  async setAttemptAssignmentId(attemptId: string, assignmentId: string): Promise<void> {
    await this.db
      .update(schema.imagingAttempts)
      .set({ assignmentId })
      .where(eq(schema.imagingAttempts.id, attemptId));
  }

  async getAttemptAssignmentId(attemptId: string): Promise<string | null> {
    const rows = await this.db
      .select({ assignmentId: schema.imagingAttempts.assignmentId })
      .from(schema.imagingAttempts)
      .where(eq(schema.imagingAttempts.id, attemptId));
    if (rows.length === 0) return null;
    return rows[0].assignmentId;
  }

  async getAssignmentRevealState(assignmentId: string): Promise<AssignmentRevealState | null> {
    const rows = await this.sql<
      { reveal_policy: string; due_at: Date | null; revealed_at: Date | null }[]
    >`SELECT "reveal_policy", "due_at", "revealed_at" FROM "assignments" WHERE "id" = ${assignmentId}`;
    if (rows.length === 0) return null;
    return { revealPolicy: rows[0].reveal_policy, dueAt: rows[0].due_at, revealedAt: rows[0].revealed_at };
  }
}

export function createPostgresRepositories(sql: Sql): Repositories {
  return new PostgresRepositories(sql);
}
