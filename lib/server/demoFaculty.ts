import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AssignmentRow,
  AttemptOutcomeRow,
  CohortMemberRow,
  FacultyRepositories,
  FacultyRole,
  FacultyUserRow,
  InstitutionRow,
  InvitationRow,
  ReleaseManifestView,
} from './faculty/auth.ts';
import type { AssignmentServiceRepos } from './faculty/assignmentService.ts';
import type { CohortServiceRepos } from './faculty/cohortService.ts';
import type { InviteServiceRepos } from './faculty/inviteService.ts';
import { readDemoDb, writeDemoDb, type DemoDb } from './demoStore.ts';

type FacultyDb = DemoDb['faculty'];

function load(): FacultyDb {
  return readDemoDb().faculty;
}

function save(part: FacultyDb): void {
  const db = readDemoDb();
  db.faculty = part;
  writeDemoDb(db);
}

const reviveDates = <T extends { createdAt: string }>(r: T) => ({ ...r, createdAt: new Date(r.createdAt) });

function reviveMember(r: FacultyDb['members'][string]): CohortMemberRow {
  return {
    id: r.id, cohortId: r.cohortId, userId: r.userId, learnerPathway: r.learnerPathway,
    status: 'active', invitedAt: r.invitedAt ? new Date(r.invitedAt) : null, createdAt: new Date(r.createdAt),
  };
}

function reviveInvitation(r: FacultyDb['invitations'][string]): InvitationRow {
  return {
    ...r,
    expiresAt: new Date(r.expiresAt),
    usedAt: r.usedAt ? new Date(r.usedAt) : null,
    createdAt: new Date(r.createdAt),
  };
}

function reviveAssignment(r: FacultyDb['assignments'][string]): AssignmentRow {
  return {
    ...r,
    openAt: new Date(r.openAt),
    dueAt: r.dueAt ? new Date(r.dueAt) : null,
    createdAt: new Date(r.createdAt),
  };
}

/** File-backed faculty repositories for LOCAL SYNTHETIC DEMO ONLY
 * (LAB_DEMO_STORE=1). Same honesty rules as the imaging demo store. */
export function createDemoFacultyRepos(): FacultyRepositories & AssignmentServiceRepos & CohortServiceRepos & InviteServiceRepos {
  return {
    getInstitution: async (id) => {
      const r = load().institutions[id];
      return r ? { ...reviveDates(r) } : null;
    },
    createInstitution: async (input) => {
      const db = load();
      const row: InstitutionRow = { ...input, createdAt: new Date() };
      db.institutions[input.id] = { ...row, createdAt: row.createdAt.toISOString() };
      save(db);
      return row;
    },
    getUser: async (id) => {
      const r = load().users[id];
      return r ? { ...reviveDates(r) } : null;
    },
    getUserByAuthSubject: async (authSubject) => {
      const r = Object.values(load().users).find((u) => u.authSubject === authSubject);
      return r ? { ...reviveDates(r) } : null;
    },
    createUser: async (input): Promise<FacultyUserRow> => {
      const db = load();
      const row: FacultyUserRow = { ...input, createdAt: new Date() };
      db.users[input.id] = { ...row, createdAt: row.createdAt.toISOString() };
      save(db);
      return row;
    },
    getMembership: async (institutionId, userId) => {
      const r = Object.values(load().memberships).find((m) => m.institutionId === institutionId && m.userId === userId);
      return r ? { ...reviveDates(r), role: r.role as FacultyRole } : null;
    },
    createMembership: async (input) => {
      const db = load();
      const row = { ...input, createdAt: new Date().toISOString() };
      db.memberships[input.id] = row;
      save(db);
      return { ...row, createdAt: new Date(row.createdAt), role: row.role as FacultyRole };
    },
    deleteMembership: async (institutionId, userId) => {
      const db = load();
      for (const [id, m] of Object.entries(db.memberships)) {
        if (m.institutionId === institutionId && m.userId === userId) delete db.memberships[id];
      }
      save(db);
    },
    getCohort: async (id) => {
      const r = load().cohorts[id];
      return r ? { ...reviveDates(r) } : null;
    },
    createCohort: async (input) => {
      const db = load();
      const row = { ...input, createdAt: new Date().toISOString() };
      db.cohorts[input.id] = row;
      save(db);
      return { ...row, createdAt: new Date(row.createdAt) };
    },
    listCohortMembers: async (cohortId) => {
      return Object.values(load().members)
        .filter((m) => m.cohortId === cohortId)
        .map(reviveMember);
    },
    addCohortMember: async (input) => {
      const db = load();
      const row = { ...input, invitedAt: input.invitedAt ? input.invitedAt.toISOString() : null, createdAt: new Date().toISOString() };
      db.members[input.id] = row;
      save(db);
      return reviveMember(row);
    },
    getInvitation: async (id) => {
      const r = load().invitations[id];
      return r ? reviveInvitation(r) : null;
    },
    getInvitationByHash: async (tokenHash) => {
      const r = Object.values(load().invitations).find((i) => i.tokenHash === tokenHash);
      return r ? reviveInvitation(r) : null;
    },
    createInvitation: async (input) => {
      const db = load();
      const row = { ...input, expiresAt: input.expiresAt.toISOString(), usedAt: null as string | null, createdAt: new Date().toISOString() };
      db.invitations[input.id] = row;
      save(db);
      return reviveInvitation(row);
    },
    markInvitationUsed: async (id, usedAt) => {
      const db = load();
      const r = db.invitations[id];
      if (r) {
        r.usedAt = usedAt.toISOString();
        save(db);
      }
    },
    deleteInvitation: async (id) => {
      const db = load();
      delete db.invitations[id];
      save(db);
    },
    getAssignment: async (id) => {
      const r = load().assignments[id];
      return r ? reviveAssignment(r) : null;
    },
    createAssignment: async (input) => {
      const db = load();
      const row = {
        ...input,
        openAt: input.openAt.toISOString(),
        dueAt: input.dueAt ? input.dueAt.toISOString() : null,
        createdAt: new Date().toISOString(),
      };
      db.assignments[input.id] = row;
      save(db);
      return reviveAssignment(row);
    },
    updateAssignmentRelease: async (id, input) => {
      const db = load();
      const r = db.assignments[id];
      if (!r) return null;
      r.releaseId = input.releaseId;
      r.releaseVersion = input.releaseVersion;
      r.releaseSnapshot = input.releaseSnapshot;
      save(db);
      return reviveAssignment(r);
    },
    getReleaseManifest: async (releaseId): Promise<ReleaseManifestView | null> => {
      if (!releaseId.startsWith('demo-synthetic-')) return null;
      try {
        const raw = await readFile(path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json'), 'utf8');
        const manifest = JSON.parse(raw) as { releaseId?: unknown; version?: unknown };
        if (manifest.releaseId !== releaseId || typeof manifest.version !== 'string') return null;
        return { version: manifest.version, manifest };
      } catch {
        return null;
      }
    },
    countAttemptsForRelease: async (releaseId) => {
      return Object.values(readDemoDb().attempts).filter((a) => a.releaseId === releaseId).length;
    },
    listAttemptOutcomes: async (releaseId): Promise<AttemptOutcomeRow[]> => {
      const db = readDemoDb();
      return Object.values(db.attempts)
        .filter((a) => a.releaseId === releaseId)
        .map((a) => {
          const score = db.scores[a.id]?.result as { score?: unknown; total?: unknown } | undefined;
          return {
            attemptId: a.id,
            caseId: a.caseId,
            status: a.status,
            score: typeof score?.score === 'number' ? score.score : null,
            total: typeof score?.total === 'number' ? score.total : null,
          };
        });
    },
  };
}

export function demoInstitutionSeed(): { institutionId: string; name: string } {
  return { institutionId: 'demo-institution', name: 'Institusi Demo (sintetis)' };
}
