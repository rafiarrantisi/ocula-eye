import { and, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import * as facultySchema from '../../../db/faculty-schema.ts';
import { getSql } from '../db.ts';
import { resolveRepositories } from '../repos.ts';
import { createDemoFacultyRepos } from '../demoFaculty.ts';

// Auth boundary for the PART05 faculty-workflow slice.
//
// There is NO managed auth provider, NO live Postgres and NO real users in
// this environment. This module therefore defines:
//   - `AuthProvider`: the explicit provider adapter interface a future managed
//     auth integration must implement. There is intentionally NO working
//     provider implementation in this repo.
//   - `requireFaculty`: the faculty gate. It verifies a membership row with
//     role 'faculty' for the given institution and throws 401/403 otherwise.
//     It never invents users, sessions, or tenant checks that pass without
//     verification.
//   - `resolveFacultySubject`: route gate. Unless the explicit test escape
//     hatch `ALLOW_TEST_SUBJECT=1` is set, every faculty route returns 503
//     `auth-not-configured`. The `x-faculty-subject` header is honored ONLY
//     under that flag (tests); production must bind a managed auth provider
//     implementing `AuthProvider` and resolve the subject from it.
//   - `PostgresFacultyRepositories`: real Postgres-backed implementation of
//     `FacultyRepositories` (drizzle pg-core over db/faculty-schema.ts plus
//     read-only joins into db/imaging-schema.ts for attempt-derived reports).
//     Tests use in-memory fakes of the same interface.

export type FacultyRole = 'faculty' | 'learner';

export interface InstitutionRow {
  id: string;
  name: string;
  createdAt: Date;
}

export interface FacultyUserRow {
  id: string;
  authSubject: string;
  displayName: string;
  createdAt: Date;
}

export interface MembershipRow {
  id: string;
  institutionId: string;
  userId: string;
  role: FacultyRole;
  createdAt: Date;
}

export interface CohortRow {
  id: string;
  institutionId: string;
  name: string;
  createdAt: Date;
}

export interface CohortMemberRow {
  id: string;
  cohortId: string;
  userId: string;
  learnerPathway: string | null;
  status: string;
  invitedAt: Date | null;
  createdAt: Date;
}

export interface InvitationRow {
  id: string;
  cohortId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface AssignmentRow {
  id: string;
  cohortId: string;
  releaseId: string;
  pathway: string | null;
  mode: string;
  openAt: Date;
  dueAt: Date | null;
  revealPolicy: string;
  releaseVersion: string | null;
  releaseSnapshot: unknown;
  createdAt: Date;
  // PART06 manual-reveal timestamp. Optional so older fakes keep compiling;
  // absent/undefined means unrevealed.
  revealedAt?: Date | null;
}

export interface AttemptOutcomeRow {
  attemptId: string;
  caseId: string;
  status: string;
  score: number | null;
  total: number | null;
}

export interface ReleaseManifestView {
  version: string;
  manifest: unknown;
}

/** Explicit provider adapter interface. A managed auth integration (e.g. a
 * session-cookie issuer backed by an identity provider) implements this.
 * No implementation ships here by design. */
export interface AuthProvider {
  getSessionUser(input: { cookieHeader: string | null }): Promise<{ authSubject: string } | null>;
}

export class FacultyError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function facultyFail(status: number, code: string, message: string): never {
  throw new FacultyError(status, code, message);
}

/** Narrow repos view needed by the faculty gate. */
export interface FacultyAuthRepos {
  getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null>;
  getMembership(institutionId: string, userId: string): Promise<MembershipRow | null>;
}

/** Combined repositories interface for the faculty slice. Postgres-backed in
 * production (`PostgresFacultyRepositories`); in-memory fakes in tests. */
export interface FacultyRepositories extends FacultyAuthRepos {
  getInstitution(id: string): Promise<InstitutionRow | null>;
  createInstitution(input: { id: string; name: string }): Promise<InstitutionRow>;
  getUser(id: string): Promise<FacultyUserRow | null>;
  createUser(input: { id: string; authSubject: string; displayName: string }): Promise<FacultyUserRow>;
  createMembership(input: {
    id: string;
    institutionId: string;
    userId: string;
    role: FacultyRole;
  }): Promise<MembershipRow>;
  deleteMembership(institutionId: string, userId: string): Promise<void>;
  getCohort(id: string): Promise<CohortRow | null>;
  createCohort(input: { id: string; institutionId: string; name: string }): Promise<CohortRow>;
  listCohortMembers(cohortId: string): Promise<CohortMemberRow[]>;
  addCohortMember(input: {
    id: string;
    cohortId: string;
    userId: string;
    learnerPathway: string | null;
    invitedAt: Date | null;
  }): Promise<CohortMemberRow>;
  getInvitation(id: string): Promise<InvitationRow | null>;
  getInvitationByHash(tokenHash: string): Promise<InvitationRow | null>;
  createInvitation(input: {
    id: string;
    cohortId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRow>;
  markInvitationUsed(id: string, usedAt: Date): Promise<void>;
  deleteInvitation(id: string): Promise<void>;
  getAssignment(id: string): Promise<AssignmentRow | null>;
  createAssignment(input: {
    id: string;
    cohortId: string;
    releaseId: string;
    pathway: string | null;
    mode: string;
    openAt: Date;
    dueAt: Date | null;
    revealPolicy: string;
    releaseVersion: string | null;
    releaseSnapshot: unknown;
  }): Promise<AssignmentRow>;
  updateAssignmentRelease(
    id: string,
    input: { releaseId: string; releaseVersion: string | null; releaseSnapshot: unknown },
  ): Promise<AssignmentRow | null>;
  getReleaseManifest(releaseId: string): Promise<ReleaseManifestView | null>;
  countAttemptsForRelease(releaseId: string): Promise<number>;
  listAttemptOutcomes(releaseId: string): Promise<AttemptOutcomeRow[]>;
  // PART06 manual reveal (optional; demo + postgres implement it).
  setAssignmentRevealed?(id: string, at: Date): Promise<void>;
}

/** Faculty gate. 401 when the subject has no user row (unknown subject);
 * 403 when the user holds no 'faculty' membership in the institution
 * (learners, revoked memberships, and cross-tenant subjects included).
 * Never creates rows and never passes without verification. */
export async function requireFaculty(
  repos: FacultyAuthRepos,
  authSubject: string | null | undefined,
  institutionId: string,
): Promise<FacultyUserRow> {
  if (!authSubject || typeof authSubject !== 'string' || authSubject.length === 0) {
    facultyFail(401, 'unauthorized', 'Faculty authentication required.');
  }
  const user = await repos.getUserByAuthSubject(authSubject as string);
  if (!user) {
    facultyFail(401, 'unauthorized', 'Faculty authentication required.');
  }
  const membership = await repos.getMembership(institutionId, (user as FacultyUserRow).id);
  if (!membership || membership.role !== 'faculty') {
    facultyFail(403, 'forbidden', 'Faculty role required for this institution.');
  }
  return user as FacultyUserRow;
}

/** Route-level subject resolution. Production has no provider, so this
 * always throws 503 `auth-not-configured` unless tests explicitly opt into
 * the `x-faculty-subject` header via `ALLOW_TEST_SUBJECT=1`. */
export function resolveFacultySubject(req: Request): string {
  if (process.env.ALLOW_TEST_SUBJECT === '1') {
    const subject = (req.headers.get('x-faculty-subject') ?? '').trim();
    if (!subject) {
      facultyFail(401, 'unauthorized', 'Faculty authentication required.');
    }
    return subject;
  }
  facultyFail(
    503,
    'auth-not-configured',
    'Managed auth is not configured; faculty routes require a bound AuthProvider.',
  );
}

type FacultyDb = PostgresJsDatabase<typeof facultySchema>;

function toMembership(r: typeof facultySchema.memberships.$inferSelect): MembershipRow {
  return {
    id: r.id,
    institutionId: r.institutionId,
    userId: r.userId,
    role: r.role as FacultyRole,
    createdAt: r.createdAt,
  };
}

function toMember(r: typeof facultySchema.cohortMembers.$inferSelect): CohortMemberRow {
  return {
    id: r.id,
    cohortId: r.cohortId,
    userId: r.userId,
    learnerPathway: r.learnerPathway,
    status: r.status ?? 'active',
    invitedAt: r.invitedAt,
    createdAt: r.createdAt,
  };
}

function toInvitation(r: typeof facultySchema.invitations.$inferSelect): InvitationRow {
  return {
    id: r.id,
    cohortId: r.cohortId,
    email: r.email,
    tokenHash: r.tokenHash,
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    createdAt: r.createdAt,
  };
}

function toAssignment(r: typeof facultySchema.assignments.$inferSelect): AssignmentRow {
  return {
    id: r.id,
    cohortId: r.cohortId,
    releaseId: r.releaseId,
    pathway: r.pathway,
    mode: r.mode ?? 'practice',
    openAt: r.openAt,
    dueAt: r.dueAt,
    revealPolicy: r.revealPolicy ?? 'manual',
    releaseVersion: r.releaseVersion,
    releaseSnapshot: r.releaseSnapshot,
    createdAt: r.createdAt,
    // PART06: manual reveal timestamp (migration 0004 column).
    revealedAt: r.revealedAt,
  };
}

/** Real Postgres-backed faculty repositories. Additive reads/writes only;
 * membership upserts use on-conflict-do-nothing so import-confirm retries
 * stay idempotent at the database level. */
export class PostgresFacultyRepositories implements FacultyRepositories {
  private readonly db: FacultyDb;
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
    this.db = drizzle(sql, { schema: facultySchema });
  }

  async getInstitution(id: string): Promise<InstitutionRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.institutions)
      .where(eq(facultySchema.institutions.id, id));
    if (rows.length === 0) return null;
    return { id: rows[0].id, name: rows[0].name, createdAt: rows[0].createdAt };
  }

  async createInstitution(input: { id: string; name: string }): Promise<InstitutionRow> {
    const rows = await this.db.insert(facultySchema.institutions).values(input).returning();
    return { id: rows[0].id, name: rows[0].name, createdAt: rows[0].createdAt };
  }

  async getUser(id: string): Promise<FacultyUserRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.facultyUsers)
      .where(eq(facultySchema.facultyUsers.id, id));
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      authSubject: rows[0].authSubject,
      displayName: rows[0].displayName,
      createdAt: rows[0].createdAt,
    };
  }

  async getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.facultyUsers)
      .where(eq(facultySchema.facultyUsers.authSubject, authSubject));
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      authSubject: rows[0].authSubject,
      displayName: rows[0].displayName,
      createdAt: rows[0].createdAt,
    };
  }

  async createUser(input: {
    id: string;
    authSubject: string;
    displayName: string;
  }): Promise<FacultyUserRow> {
    await this.db
      .insert(facultySchema.facultyUsers)
      .values(input)
      .onConflictDoNothing({ target: facultySchema.facultyUsers.authSubject });
    const existing = await this.getUserByAuthSubject(input.authSubject);
    if (!existing) facultyFail(500, 'internal', 'Failed to provision user.');
    return existing as FacultyUserRow;
  }

  async getMembership(institutionId: string, userId: string): Promise<MembershipRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.memberships)
      .where(
        and(
          eq(facultySchema.memberships.institutionId, institutionId),
          eq(facultySchema.memberships.userId, userId),
        ),
      );
    if (rows.length === 0) return null;
    return toMembership(rows[0]);
  }

  async createMembership(input: {
    id: string;
    institutionId: string;
    userId: string;
    role: FacultyRole;
  }): Promise<MembershipRow> {
    await this.db
      .insert(facultySchema.memberships)
      .values(input)
      .onConflictDoNothing({
        target: [facultySchema.memberships.institutionId, facultySchema.memberships.userId],
      });
    const existing = await this.getMembership(input.institutionId, input.userId);
    if (!existing) facultyFail(500, 'internal', 'Failed to provision membership.');
    return existing as MembershipRow;
  }

  async deleteMembership(institutionId: string, userId: string): Promise<void> {
    await this.db
      .delete(facultySchema.memberships)
      .where(
        and(
          eq(facultySchema.memberships.institutionId, institutionId),
          eq(facultySchema.memberships.userId, userId),
        ),
      );
  }

  async getCohort(id: string): Promise<CohortRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.cohorts)
      .where(eq(facultySchema.cohorts.id, id));
    if (rows.length === 0) return null;
    return { id: rows[0].id, institutionId: rows[0].institutionId, name: rows[0].name, createdAt: rows[0].createdAt };
  }

  async createCohort(input: { id: string; institutionId: string; name: string }): Promise<CohortRow> {
    const rows = await this.db.insert(facultySchema.cohorts).values(input).returning();
    return {
      id: rows[0].id,
      institutionId: rows[0].institutionId,
      name: rows[0].name,
      createdAt: rows[0].createdAt,
    };
  }

  async listCohortMembers(cohortId: string): Promise<CohortMemberRow[]> {
    const rows = await this.db
      .select()
      .from(facultySchema.cohortMembers)
      .where(eq(facultySchema.cohortMembers.cohortId, cohortId));
    return rows.map(toMember);
  }

  async addCohortMember(input: {
    id: string;
    cohortId: string;
    userId: string;
    learnerPathway: string | null;
    invitedAt: Date | null;
  }): Promise<CohortMemberRow> {
    await this.db
      .insert(facultySchema.cohortMembers)
      .values(input)
      .onConflictDoNothing({
        target: [facultySchema.cohortMembers.cohortId, facultySchema.cohortMembers.userId],
      });
    const rows = await this.db
      .select()
      .from(facultySchema.cohortMembers)
      .where(
        and(
          eq(facultySchema.cohortMembers.cohortId, input.cohortId),
          eq(facultySchema.cohortMembers.userId, input.userId),
        ),
      );
    if (rows.length === 0) facultyFail(500, 'internal', 'Failed to provision cohort member.');
    return toMember(rows[0]);
  }

  async getInvitation(id: string): Promise<InvitationRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.invitations)
      .where(eq(facultySchema.invitations.id, id));
    if (rows.length === 0) return null;
    return toInvitation(rows[0]);
  }

  async getInvitationByHash(tokenHash: string): Promise<InvitationRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.invitations)
      .where(eq(facultySchema.invitations.tokenHash, tokenHash));
    if (rows.length === 0) return null;
    return toInvitation(rows[0]);
  }

  async createInvitation(input: {
    id: string;
    cohortId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRow> {
    const rows = await this.db.insert(facultySchema.invitations).values(input).returning();
    return toInvitation(rows[0]);
  }

  async markInvitationUsed(id: string, usedAt: Date): Promise<void> {
    await this.db
      .update(facultySchema.invitations)
      .set({ usedAt })
      .where(eq(facultySchema.invitations.id, id));
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.db.delete(facultySchema.invitations).where(eq(facultySchema.invitations.id, id));
  }

  async getAssignment(id: string): Promise<AssignmentRow | null> {
    const rows = await this.db
      .select()
      .from(facultySchema.assignments)
      .where(eq(facultySchema.assignments.id, id));
    if (rows.length === 0) return null;
    return toAssignment(rows[0]);
  }

  async createAssignment(input: {
    id: string;
    cohortId: string;
    releaseId: string;
    pathway: string | null;
    mode: string;
    openAt: Date;
    dueAt: Date | null;
    revealPolicy: string;
    releaseVersion: string | null;
    releaseSnapshot: unknown;
  }): Promise<AssignmentRow> {
    const rows = await this.db.insert(facultySchema.assignments).values(input).returning();
    return toAssignment(rows[0]);
  }

  async updateAssignmentRelease(
    id: string,
    input: { releaseId: string; releaseVersion: string | null; releaseSnapshot: unknown },
  ): Promise<AssignmentRow | null> {
    const rows = await this.db
      .update(facultySchema.assignments)
      .set({
        releaseId: input.releaseId,
        releaseVersion: input.releaseVersion,
        releaseSnapshot: input.releaseSnapshot,
      })
      .where(eq(facultySchema.assignments.id, id))
      .returning();
    if (rows.length === 0) return null;
    return toAssignment(rows[0]);
  }

  // PART06 manual reveal: stamps revealed_at so linked assessment attempts
  // unlock. Idempotent (re-reveal just re-stamps).
  async setAssignmentRevealed(id: string, at: Date): Promise<void> {
    await this.db
      .update(facultySchema.assignments)
      .set({ revealedAt: at })
      .where(eq(facultySchema.assignments.id, id));
  }

  async getReleaseManifest(releaseId: string): Promise<ReleaseManifestView | null> {
    const rows = await this.sql<{ manifest: unknown }[]>`
      SELECT "manifest" FROM "imaging_releases" WHERE "id" = ${releaseId}`;
    if (rows.length === 0) return null;
    const manifest = rows[0].manifest as { version?: unknown } | null;
    const version = manifest && typeof manifest === 'object' ? manifest['version'] : undefined;
    if (typeof version !== 'string' || version.length === 0) return null;
    return { version, manifest };
  }

  async countAttemptsForRelease(releaseId: string): Promise<number> {
    const rows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS "count" FROM "imaging_attempts" WHERE "release_id" = ${releaseId}`;
    return Number(rows[0]?.count ?? '0');
  }

  async listAttemptOutcomes(releaseId: string): Promise<AttemptOutcomeRow[]> {
    const rows = await this.sql<
      { attempt_id: string; case_id: string; status: string; result: unknown }[]
    >`
      SELECT a."id" AS "attempt_id", a."case_id" AS "case_id", a."status"::text AS "status",
             s."result" AS "result"
      FROM "imaging_attempts" a LEFT JOIN "imaging_scores" s ON s."attempt_id" = a."id"
      WHERE a."release_id" = ${releaseId}`;
    return rows.map((r) => {
      let score: number | null = null;
      let total: number | null = null;
      const result = r.result as { score?: unknown; total?: unknown } | null;
      if (result && typeof result === 'object') {
        if (typeof result['score'] === 'number' && Number.isFinite(result['score'])) {
          score = result['score'] as number;
        }
        if (typeof result['total'] === 'number' && Number.isFinite(result['total'])) {
          total = result['total'] as number;
        }
      }
      return { attemptId: r.attempt_id, caseId: r.case_id, status: r.status, score, total };
    });
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function newFacultyId(): string {
  return randomBytes(12).toString('base64url');
}

let injectedRepos: FacultyRepositories | null = null;

/** Test-only injection hook. Production code never calls this; it lets
 * `tests/integration/faculty.test.ts` supply in-memory fakes. */
export function setFacultyReposForTests(repos: FacultyRepositories): void {
  injectedRepos = repos;
}

export function resetFacultyReposForTests(): void {
  injectedRepos = null;
}

/** Faculty analogue of sibling `resolveRepositories()` (lib/server/repos.ts):
 * injected fakes under test, demo file store under explicit LAB_DEMO_STORE=1,
 * otherwise real Postgres (503 when unconfigured). Calls the sibling resolver
 * first so a missing DATABASE_URL surfaces the same `unavailable` signal as
 * the imaging routes. */
export function resolveFacultyRepos(): FacultyRepositories {
  if (injectedRepos) return injectedRepos;
  if (process.env.LAB_DEMO_STORE === '1') return createDemoFacultyRepos();
  try {
    resolveRepositories();
  } catch {
    facultyFail(503, 'unavailable', 'Database not configured.');
  }
  try {
    return new PostgresFacultyRepositories(getSql());
  } catch {
    facultyFail(503, 'unavailable', 'Database not configured.');
  }
}
