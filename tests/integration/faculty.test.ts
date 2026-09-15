import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetFacultyReposForTests,
  setFacultyReposForTests,
  type AssignmentRow,
  type AttemptOutcomeRow,
  type CohortMemberRow,
  type CohortRow,
  type FacultyRepositories,
  type FacultyUserRow,
  type InstitutionRow,
  type InvitationRow,
  type MembershipRow,
  type ReleaseManifestView,
} from '../../lib/server/faculty/auth.ts';
import {
  buildAssignmentExport,
  createAssignmentService,
} from '../../lib/server/faculty/assignmentService.ts';
import {
  createCohortService,
  fallbackParseCsv,
} from '../../lib/server/faculty/cohortService.ts';
import { createInviteService } from '../../lib/server/faculty/inviteService.ts';
import { resetRateLimitsForTests } from '../../lib/server/rateLimit.ts';
import { POST as createCohortRoute } from '../../app/api/faculty/cohorts/route.ts';
import { POST as previewRoute } from '../../app/api/faculty/cohorts/[id]/import/route.ts';
import { POST as confirmRoute } from '../../app/api/faculty/cohorts/[id]/import-confirm/route.ts';
import { POST as createAssignmentRoute } from '../../app/api/faculty/assignments/route.ts';
import { GET as reportRoute } from '../../app/api/faculty/assignments/[id]/report/route.ts';
import { GET as exportRoute } from '../../app/api/faculty/assignments/[id]/export/route.ts';

// In-memory fakes of FacultyRepositories. Explicitly NOT a database;
// Postgres-backed coverage is the additive migration + drizzle schema
// (db/migrations/0003_faculty.sql, db/faculty-schema.ts) exercised live only
// when DATABASE_URL is present.
class FakeFacultyRepos implements FacultyRepositories {
  institutions = new Map<string, InstitutionRow>();
  users = new Map<string, FacultyUserRow>();
  usersBySubject = new Map<string, FacultyUserRow>();
  memberships = new Map<string, MembershipRow>();
  cohorts = new Map<string, CohortRow>();
  members = new Map<string, CohortMemberRow>();
  invitations = new Map<string, InvitationRow>();
  invitationsByHash = new Map<string, InvitationRow>();
  assignments = new Map<string, AssignmentRow>();
  manifests = new Map<string, ReleaseManifestView>();
  outcomes: (AttemptOutcomeRow & { releaseId: string })[] = [];
  private n = 0;

  uid(prefix: string): string {
    this.n += 1;
    return `${prefix}-${this.n}`;
  }

  async getInstitution(id: string): Promise<InstitutionRow | null> {
    return this.institutions.get(id) ?? null;
  }

  async createInstitution(input: { id: string; name: string }): Promise<InstitutionRow> {
    const row: InstitutionRow = { ...input, createdAt: new Date('2026-01-01T00:00:00Z') };
    this.institutions.set(row.id, row);
    return row;
  }

  async getUser(id: string): Promise<FacultyUserRow | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null> {
    return this.usersBySubject.get(authSubject) ?? null;
  }

  async createUser(input: {
    id: string;
    authSubject: string;
    displayName: string;
  }): Promise<FacultyUserRow> {
    const existing = this.usersBySubject.get(input.authSubject);
    if (existing) return existing;
    const row: FacultyUserRow = { ...input, createdAt: new Date('2026-01-01T00:00:00Z') };
    this.users.set(row.id, row);
    this.usersBySubject.set(row.authSubject, row);
    return row;
  }

  async getMembership(institutionId: string, userId: string): Promise<MembershipRow | null> {
    return this.memberships.get(`${institutionId}|${userId}`) ?? null;
  }

  async createMembership(input: {
    id: string;
    institutionId: string;
    userId: string;
    role: 'faculty' | 'learner';
  }): Promise<MembershipRow> {
    const key = `${input.institutionId}|${input.userId}`;
    const existing = this.memberships.get(key);
    if (existing) return existing;
    const row: MembershipRow = { ...input, createdAt: new Date('2026-01-01T00:00:00Z') };
    this.memberships.set(key, row);
    return row;
  }

  async deleteMembership(institutionId: string, userId: string): Promise<void> {
    this.memberships.delete(`${institutionId}|${userId}`);
  }

  async getCohort(id: string): Promise<CohortRow | null> {
    return this.cohorts.get(id) ?? null;
  }

  async createCohort(input: {
    id: string;
    institutionId: string;
    name: string;
  }): Promise<CohortRow> {
    const row: CohortRow = { ...input, createdAt: new Date('2026-01-01T00:00:00Z') };
    this.cohorts.set(row.id, row);
    return row;
  }

  async listCohortMembers(cohortId: string): Promise<CohortMemberRow[]> {
    return [...this.members.values()].filter((m) => m.cohortId === cohortId);
  }

  async addCohortMember(input: {
    id: string;
    cohortId: string;
    userId: string;
    learnerPathway: string | null;
    invitedAt: Date | null;
  }): Promise<CohortMemberRow> {
    const key = `${input.cohortId}|${input.userId}`;
    const existing = this.members.get(key);
    if (existing) return existing;
    const row: CohortMemberRow = {
      ...input,
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    this.members.set(key, row);
    return row;
  }

  async getInvitation(id: string): Promise<InvitationRow | null> {
    return this.invitations.get(id) ?? null;
  }

  async getInvitationByHash(tokenHash: string): Promise<InvitationRow | null> {
    return this.invitationsByHash.get(tokenHash) ?? null;
  }

  async createInvitation(input: {
    id: string;
    cohortId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRow> {
    const row: InvitationRow = {
      ...input,
      usedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    this.invitations.set(row.id, row);
    this.invitationsByHash.set(row.tokenHash, row);
    return row;
  }

  async markInvitationUsed(id: string, usedAt: Date): Promise<void> {
    const row = this.invitations.get(id);
    if (row) {
      row.usedAt = usedAt;
      this.invitationsByHash.set(row.tokenHash, row);
    }
  }

  async deleteInvitation(id: string): Promise<void> {
    const row = this.invitations.get(id);
    if (row) {
      this.invitations.delete(id);
      this.invitationsByHash.delete(row.tokenHash);
    }
  }

  async getAssignment(id: string): Promise<AssignmentRow | null> {
    return this.assignments.get(id) ?? null;
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
    const row: AssignmentRow = { ...input, createdAt: new Date('2026-01-01T00:00:00Z') };
    this.assignments.set(row.id, row);
    return row;
  }

  async updateAssignmentRelease(
    id: string,
    input: { releaseId: string; releaseVersion: string | null; releaseSnapshot: unknown },
  ): Promise<AssignmentRow | null> {
    const row = this.assignments.get(id);
    if (!row) return null;
    row.releaseId = input.releaseId;
    row.releaseVersion = input.releaseVersion;
    row.releaseSnapshot = input.releaseSnapshot;
    return row;
  }

  async getReleaseManifest(releaseId: string): Promise<ReleaseManifestView | null> {
    return this.manifests.get(releaseId) ?? null;
  }

  async countAttemptsForRelease(releaseId: string): Promise<number> {
    return this.outcomes.filter((o) => o.releaseId === releaseId).length;
  }

  async listAttemptOutcomes(releaseId: string): Promise<AttemptOutcomeRow[]> {
    return this.outcomes
      .filter((o) => o.releaseId === releaseId)
      .map((o) => ({
        attemptId: o.attemptId,
        caseId: o.caseId,
        status: o.status,
        score: o.score,
        total: o.total,
      }));
  }
}

const FACULTY_A = 'faculty-a-sub';
const FACULTY_B = 'faculty-b-sub';
const LEARNER = 'learner-sub';

const CSV_TWO = [
  'email,display_name,learner_pathway',
  'ana@example.com,Ana,resident_foundation',
  'budi@example.com,Budi,koas_core',
].join('\n');

const CSV_MALICIOUS = [
  'email,display_name,learner_pathway',
  '=HYPERLINK("http://evil"),Evil,resident_foundation',
  'not-an-email,Nope,koas_core',
  'cara@example.com,Cara,koas_core',
].join('\n');

async function seedTenancy(repos: FakeFacultyRepos): Promise<{ cohortA: string; cohortB: string }> {
  await repos.createInstitution({ id: 'inst-a', name: 'Faculty A University' });
  await repos.createInstitution({ id: 'inst-b', name: 'Faculty B University' });
  const fa = await repos.createUser({ id: 'u-fa', authSubject: FACULTY_A, displayName: 'Fac A' });
  const fb = await repos.createUser({ id: 'u-fb', authSubject: FACULTY_B, displayName: 'Fac B' });
  const learner = await repos.createUser({ id: 'u-ln', authSubject: LEARNER, displayName: 'Learner' });
  await repos.createMembership({ id: 'm-fa', institutionId: 'inst-a', userId: fa.id, role: 'faculty' });
  await repos.createMembership({ id: 'm-fb', institutionId: 'inst-b', userId: fb.id, role: 'faculty' });
  await repos.createMembership({ id: 'm-ln', institutionId: 'inst-a', userId: learner.id, role: 'learner' });
  const cohortA = await repos.createCohort({ id: 'cohort-a', institutionId: 'inst-a', name: 'Cohort A' });
  const cohortB = await repos.createCohort({ id: 'cohort-b', institutionId: 'inst-b', name: 'Cohort B' });
  repos.manifests.set('rel-1', {
    version: '1.0.0',
    manifest: { version: '1.0.0', cases: [{ caseId: 'case-1' }, { caseId: 'case-2' }] },
  });
  repos.manifests.set('rel-2', {
    version: '2.0.0',
    manifest: { version: '2.0.0', cases: [{ caseId: 'case-1' }] },
  });
  return { cohortA: cohortA.id, cohortB: cohortB.id };
}

function postJson(url: string, subject: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (subject) headers['x-faculty-subject'] = subject;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

function getWithSubject(url: string, subject: string | null): Request {
  const headers: Record<string, string> = {};
  if (subject) headers['x-faculty-subject'] = subject;
  return new Request(url, { method: 'GET', headers });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
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

let savedHatch: string | undefined;

beforeEach(() => {
  savedHatch = process.env.ALLOW_TEST_SUBJECT;
  process.env.ALLOW_TEST_SUBJECT = '1';
  resetRateLimitsForTests();
});

afterEach(() => {
  if (savedHatch === undefined) {
    delete process.env.ALLOW_TEST_SUBJECT;
  } else {
    process.env.ALLOW_TEST_SUBJECT = savedHatch;
  }
  resetFacultyReposForTests();
  resetRateLimitsForTests();
});

describe('faculty auth boundary', () => {
  it('returns 503 auth-not-configured without the test hatch', async () => {
    delete process.env.ALLOW_TEST_SUBJECT;
    resetFacultyReposForTests();
    const res = await createCohortRoute(
      postJson('http://localhost/api/faculty/cohorts', FACULTY_A, {
        institutionId: 'inst-a',
        name: 'X',
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'auth-not-configured' });
  });

  it('returns 401 without the test subject header', async () => {
    const repos = new FakeFacultyRepos();
    await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const res = await createCohortRoute(
      postJson('http://localhost/api/faculty/cohorts', null, {
        institutionId: 'inst-a',
        name: 'X',
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('faculty gate and tenancy', () => {
  it('cross-tenant denial: faculty A cannot create a cohort in institution B', async () => {
    const repos = new FakeFacultyRepos();
    await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const res = await createCohortRoute(
      postJson('http://localhost/api/faculty/cohorts', FACULTY_A, {
        institutionId: 'inst-b',
        name: 'Intruder',
      }),
    );
    expect(res.status).toBe(403);
    expect([...repos.cohorts.values()].some((c) => c.name === 'Intruder')).toBe(false);
  });

  it('cross-user altered IDs: faculty A cannot confirm an import on institution B cohort', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortB } = await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const preview = await previewRoute(
      postJson('http://localhost/api/faculty/cohorts/x/import', FACULTY_A, { csv: CSV_TWO }),
      params(cohortB),
    );
    expect(preview.status).toBe(403);
    const confirm = await confirmRoute(
      postJson('http://localhost/api/faculty/cohorts/x/import-confirm', FACULTY_A, {
        token: 'whatever',
        csv: CSV_TWO,
      }),
      params(cohortB),
    );
    expect(confirm.status).toBe(403);
    expect(await repos.listCohortMembers(cohortB)).toHaveLength(0);
  });

  it('revoked role is denied', async () => {
    const repos = new FakeFacultyRepos();
    await seedTenancy(repos);
    await repos.deleteMembership('inst-a', 'u-fa');
    const cohorts = createCohortService(repos);
    await expectStatus(
      cohorts.createCohort({ authSubject: FACULTY_A, institutionId: 'inst-a', name: 'X' }),
      403,
    );
  });

  it('learner role cannot manage cohorts', async () => {
    const repos = new FakeFacultyRepos();
    await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    await expectStatus(
      cohorts.createCohort({ authSubject: LEARNER, institutionId: 'inst-a', name: 'X' }),
      403,
    );
  });

  it('creates a cohort for faculty of the same institution', async () => {
    const repos = new FakeFacultyRepos();
    await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const res = await createCohortRoute(
      postJson('http://localhost/api/faculty/cohorts', FACULTY_A, {
        institutionId: 'inst-a',
        name: 'Cohort A2',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { cohortId: string; institutionId: string; name: string };
    expect(body.institutionId).toBe('inst-a');
    expect(body.name).toBe('Cohort A2');
    expect(await repos.getCohort(body.cohortId)).not.toBeNull();
  });
});

describe('cohort import orchestration', () => {
  it('preview has no side effects', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const res = await previewRoute(
      postJson('http://localhost/api/faculty/cohorts/x/import', FACULTY_A, { csv: CSV_TWO }),
      params(cohortA),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; newCount: number; existingCount: number };
    expect(typeof body.token).toBe('string');
    expect(body.newCount).toBe(2);
    expect(body.existingCount).toBe(0);
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(0);
  });

  it('import retry is idempotent: double confirm of one token, single membership set', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    const preview = await cohorts.previewImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    const first = await cohorts.confirmImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      token: preview.token,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    expect(first.added).toBe(2);
    const second = await cohorts.confirmImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      token: preview.token,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    expect(second).toEqual(first);
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(2);
  });

  it('concurrent double confirm yields a single membership set', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    const preview = await cohorts.previewImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    const [a, b] = await Promise.all([
      cohorts.confirmImport({
        authSubject: FACULTY_A,
        cohortId: cohortA,
        token: preview.token,
        csvText: CSV_TWO,
        parseCsv: fallbackParseCsv,
      }),
      cohorts.confirmImport({
        authSubject: FACULTY_A,
        cohortId: cohortA,
        token: preview.token,
        csvText: CSV_TWO,
        parseCsv: fallbackParseCsv,
      }),
    ]);
    expect(a.added + a.existing).toBe(2);
    expect(b.added + b.existing).toBe(2);
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(2);
  });

  it('token mismatch is a 400 and creates nothing', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    await expectStatus(
      cohorts.confirmImport({
        authSubject: FACULTY_A,
        cohortId: cohortA,
        token: 'deadbeef',
        csvText: CSV_TWO,
        parseCsv: fallbackParseCsv,
      }),
      400,
    );
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(0);
  });

  it('malicious CSV rows are flagged invalid; only clean rows import', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    const preview = await cohorts.previewImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      csvText: CSV_MALICIOUS,
      parseCsv: fallbackParseCsv,
    });
    expect(preview.invalid).toHaveLength(2);
    const confirmed = await cohorts.confirmImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      token: preview.token,
      csvText: CSV_MALICIOUS,
      parseCsv: fallbackParseCsv,
    });
    expect(confirmed.added).toBe(1);
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(1);
  });

  it('export escaper neutralizes formula-leading cells', () => {
    const csv = buildAssignmentExport({
      assignmentId: 'a1',
      cohortId: 'cohort-a',
      releaseId: 'rel-1',
      releaseVersion: '1.0.0',
      denominators: { learners: 1, cases: 2, attempts: 1 },
      attempts: { total: 1, draft: 0, submitted: 1, feedbackReleased: 1 },
      scores: { n: 1, mean: 1, min: 1, max: 1 },
      perCase: [
        { caseId: '=1+1', attempts: 1, submitted: 1, scored: 1, mean: 1 },
        { caseId: '@mention', attempts: 0, submitted: 0, scored: 0, mean: null },
      ],
    });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('case_id,attempts,submitted,scored,mean_score');
    expect(lines[1].startsWith("'=1+1,")).toBe(true);
    expect(lines[2].startsWith("'@mention,")).toBe(true);
    expect(csv).not.toMatch(/(^|,)=1\+1(,|$)/);
  });
});

describe('invitations', () => {
  it('create shows the token once; reads return id only', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const invites = createInviteService(repos, {
      now: () => new Date('2026-06-01T00:00:00Z'),
      newId: () => 'inv-1',
      randomToken: () => 'a'.repeat(64),
    });
    const created = await invites.createInvite({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      email: 'New@Example.com',
    });
    expect(created.token).toBe('a'.repeat(64));
    expect(created.copyLink).toContain(encodeURIComponent(created.token));
    const read = await invites.getInvite({ authSubject: FACULTY_A, invitationId: 'inv-1' });
    expect(Object.keys(read).sort()).toEqual(
      ['cohortId', 'createdAt', 'email', 'expiresAt', 'id', 'usedAt'].sort(),
    );
    expect(JSON.stringify(read)).not.toContain('token');
    expect(JSON.stringify(read)).not.toContain('a'.repeat(64));
  });

  it('confirm provisions once; reuse is a 410', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const invites = createInviteService(repos, {
      now: () => new Date('2026-06-01T00:00:00Z'),
      newId: () => repos.uid('inv'),
      randomToken: () => 'b'.repeat(64),
    });
    const created = await invites.createInvite({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      email: 'new@example.com',
    });
    const first = await invites.confirmInvite({ rawToken: created.token });
    expect(first.cohortId).toBe(cohortA);
    expect(await repos.listCohortMembers(cohortA)).toHaveLength(1);
    try {
      await invites.confirmInvite({ rawToken: created.token });
    } catch (err) {
      expect(err).toMatchObject({ status: 410, code: 'invite_used' });
      expect(await repos.listCohortMembers(cohortA)).toHaveLength(1);
      return;
    }
    throw new Error('expected 410 invite_used');
  });

  it('expired invite is a 410', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const invites = createInviteService(repos, {
      now: () => new Date('2026-06-01T00:00:00Z'),
      newId: () => repos.uid('inv'),
      randomToken: () => 'c'.repeat(64),
    });
    const created = await invites.createInvite({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      email: 'old@example.com',
    });
    const stored = await repos.getInvitation(created.invitationId);
    (stored as InvitationRow).expiresAt = new Date('2020-01-01T00:00:00Z');
    await expectStatus(invites.confirmInvite({ rawToken: created.token }), 410);
  });

  it('revoked invite confirms as 404 and reads as 404', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const invites = createInviteService(repos, {
      now: () => new Date('2026-06-01T00:00:00Z'),
      newId: () => repos.uid('inv'),
      randomToken: () => 'd'.repeat(64),
    });
    const created = await invites.createInvite({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      email: 'gone@example.com',
    });
    const revoked = await invites.revokeInvite({
      authSubject: FACULTY_A,
      invitationId: created.invitationId,
    });
    expect(revoked).toEqual({ revoked: true });
    await expectStatus(invites.confirmInvite({ rawToken: created.token }), 404);
    await expectStatus(
      invites.getInvite({ authSubject: FACULTY_A, invitationId: created.invitationId }),
      404,
    );
  });
});

describe('assignments', () => {
  it('due before open is a 422', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const assignments = createAssignmentService(repos);
    await expectStatus(
      assignments.createAssignment({
        authSubject: FACULTY_A,
        cohortId: cohortA,
        releaseId: 'rel-1',
        mode: 'practice',
        openAt: '2026-07-01T00:00:00Z',
        dueAt: '2026-06-01T00:00:00Z',
        revealPolicy: 'manual',
      }),
      422,
    );
  });

  it('unknown release is a 422', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const assignments = createAssignmentService(repos);
    await expectStatus(
      assignments.createAssignment({
        authSubject: FACULTY_A,
        cohortId: cohortA,
        releaseId: 'rel-nope',
        mode: 'practice',
        openAt: '2026-06-01T00:00:00Z',
        revealPolicy: 'manual',
      }),
      422,
    );
  });

  it('truth change freezes once attempts exist, succeeds before', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const assignments = createAssignmentService(repos);
    const created = await assignments.createAssignment({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      releaseId: 'rel-1',
      mode: 'assessment',
      openAt: '2026-06-01T00:00:00Z',
      dueAt: '2026-08-01T00:00:00Z',
      revealPolicy: 'manual',
    });
    expect(created.releaseVersion).toBe('1.0.0');
    const moved = await assignments.changeAssignmentRelease({
      authSubject: FACULTY_A,
      assignmentId: created.id,
      releaseId: 'rel-2',
    });
    expect(moved.releaseVersion).toBe('2.0.0');
    repos.outcomes.push({
      releaseId: 'rel-2',
      attemptId: 'att-1',
      caseId: 'case-1',
      status: 'submitted',
      score: 1,
      total: 1,
    });
    await expectStatus(
      assignments.changeAssignmentRelease({
        authSubject: FACULTY_A,
        assignmentId: created.id,
        releaseId: 'rel-1',
      }),
      409,
    );
  });

  it('report carries denominators and per-case metrics', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    const cohorts = createCohortService(repos);
    const preview = await cohorts.previewImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    await cohorts.confirmImport({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      token: preview.token,
      csvText: CSV_TWO,
      parseCsv: fallbackParseCsv,
    });
    const assignments = createAssignmentService(repos);
    const created = await assignments.createAssignment({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      releaseId: 'rel-1',
      mode: 'practice',
      openAt: '2026-06-01T00:00:00Z',
      revealPolicy: 'immediate',
    });
    repos.outcomes.push(
      { releaseId: 'rel-1', attemptId: 'a1', caseId: 'case-1', status: 'feedback_released', score: 2, total: 2 },
      { releaseId: 'rel-1', attemptId: 'a2', caseId: 'case-1', status: 'feedback_released', score: 1, total: 2 },
      { releaseId: 'rel-1', attemptId: 'a3', caseId: 'case-2', status: 'draft', score: null, total: null },
    );
    const report = await assignments.getReport({
      authSubject: FACULTY_A,
      assignmentId: created.id,
    });
    expect(report.denominators).toEqual({ learners: 2, cases: 2, attempts: 3 });
    expect(report.attempts).toEqual({ total: 3, draft: 1, submitted: 2, feedbackReleased: 2 });
    expect(report.scores).toMatchObject({ n: 2, min: 1, max: 2 });
    expect(report.perCase).toHaveLength(2);
    expect(report.perCase[0]).toMatchObject({ caseId: 'case-1', attempts: 2, submitted: 2, scored: 2, mean: 1.5 });
    expect(report.perCase[1]).toMatchObject({ caseId: 'case-2', attempts: 1, submitted: 0, scored: 0, mean: null });
  });

  it('full route flow: create, report, export with no-store CSV', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const createdRes = await createAssignmentRoute(
      postJson('http://localhost/api/faculty/assignments', FACULTY_A, {
        cohortId: cohortA,
        releaseId: 'rel-1',
        mode: 'practice',
        openAt: '2026-06-01T00:00:00Z',
        dueAt: '2026-08-01T00:00:00Z',
        revealPolicy: 'manual',
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as { assignmentId: string };
    repos.outcomes.push({
      releaseId: 'rel-1',
      attemptId: 'a1',
      caseId: 'case-1',
      status: 'feedback_released',
      score: 2,
      total: 2,
    });
    const reportRes = await reportRoute(
      getWithSubject(`http://localhost/api/faculty/assignments/${created.assignmentId}/report`, FACULTY_A),
      params(created.assignmentId),
    );
    expect(reportRes.status).toBe(200);
    expect(reportRes.headers.get('cache-control')).toBe('no-store');
    const report = (await reportRes.json()) as { denominators: unknown };
    expect(report.denominators).toEqual({ learners: 0, cases: 2, attempts: 1 });
    const exportRes = await exportRoute(
      getWithSubject(`http://localhost/api/faculty/assignments/${created.assignmentId}/export`, FACULTY_A),
      params(created.assignmentId),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('text/csv');
    expect(exportRes.headers.get('cache-control')).toBe('no-store');
    const csv = await exportRes.text();
    expect(csv.split('\n')[0]).toBe('case_id,attempts,submitted,scored,mean_score');
    expect(csv).toContain('case-1,1,1,1,2.00');
  });
});

describe('secret absence', () => {
  it('no route response leaks token hashes, secrets, or key material', async () => {
    const repos = new FakeFacultyRepos();
    const { cohortA } = await seedTenancy(repos);
    setFacultyReposForTests(repos);
    const bodies: string[] = [];
    const cohortRes = await createCohortRoute(
      postJson('http://localhost/api/faculty/cohorts', FACULTY_A, {
        institutionId: 'inst-a',
        name: 'Audit',
      }),
    );
    bodies.push(await cohortRes.text());
    const previewRes = await previewRoute(
      postJson('http://localhost/api/faculty/cohorts/x/import', FACULTY_A, { csv: CSV_TWO }),
      params(cohortA),
    );
    const previewText = await previewRes.text();
    bodies.push(previewText);
    const previewBody = JSON.parse(previewText) as { token: string };
    const confirmRes = await confirmRoute(
      postJson('http://localhost/api/faculty/cohorts/x/import-confirm', FACULTY_A, {
        token: previewBody.token,
        csv: CSV_TWO,
      }),
      params(cohortA),
    );
    bodies.push(await confirmRes.text());
    const assignmentRes = await createAssignmentRoute(
      postJson('http://localhost/api/faculty/assignments', FACULTY_A, {
        cohortId: cohortA,
        releaseId: 'rel-1',
        mode: 'practice',
        openAt: '2026-06-01T00:00:00Z',
        revealPolicy: 'manual',
      }),
    );
    const assignmentText = await assignmentRes.text();
    bodies.push(assignmentText);
    const assignmentBody = JSON.parse(assignmentText) as { assignmentId: string };
    const reportRes = await reportRoute(
      getWithSubject('http://localhost/api/faculty/assignments/x/report', FACULTY_A),
      params(assignmentBody.assignmentId),
    );
    bodies.push(await reportRes.text());
    const exportRes = await exportRoute(
      getWithSubject('http://localhost/api/faculty/assignments/x/export', FACULTY_A),
      params(assignmentBody.assignmentId),
    );
    bodies.push(await exportRes.text());
    const invites = createInviteService(repos, {
      now: () => new Date('2026-06-01T00:00:00Z'),
      newId: () => repos.uid('inv'),
      randomToken: () => 'e'.repeat(64),
    });
    const created = await invites.createInvite({
      authSubject: FACULTY_A,
      cohortId: cohortA,
      email: 'audit@example.com',
    });
    const read = await invites.getInvite({
      authSubject: FACULTY_A,
      invitationId: created.invitationId,
    });
    bodies.push(JSON.stringify(read));
    const rawToken = created.token;
    for (const text of bodies) {
      expect(text.toLowerCase()).not.toContain('tokenhash');
      expect(text.toLowerCase()).not.toContain('token_hash');
      expect(text.toLowerCase()).not.toContain('secret');
      expect(text).not.toContain('SESSION_SECRET');
      expect(text).not.toContain('DATABASE_URL');
      expect(text).not.toContain(rawToken);
    }
  });
});
