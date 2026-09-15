import { randomBytes } from 'node:crypto';
import {
  facultyFail,
  newFacultyId,
  requireFaculty,
  sha256Hex,
  type CohortRow,
  type FacultyUserRow,
  type InvitationRow,
  type MembershipRow,
} from './auth.ts';

// Single-use hashed expiring invitations for the faculty slice.
// Constructor-injected repos (same pattern as lib/server/attemptService.ts).
//
//   - create mints `randomBytes(32)` hex, stores ONLY the sha256 hash, and
//     returns the raw token exactly once inside a manual copy link. Later
//     reads (`getInvite`) return the invitation id only — never the token or
//     its hash — so repo/API responses carry no secret material.
//   - confirm is learner-facing: the bearer token itself is the credential
//     (no faculty gate), with an explicit mark-used step. Reuse and expiry
//     are 410s; unknown or revoked invitations are 404s.
//   - revoke is faculty-gated and deletes the invitation row.

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export interface InviteServiceRepos {
  getCohort(id: string): Promise<CohortRow | null>;
  getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null>;
  getMembership(institutionId: string, userId: string): Promise<MembershipRow | null>;
  createUser(input: { id: string; authSubject: string; displayName: string }): Promise<FacultyUserRow>;
  createMembership(input: {
    id: string;
    institutionId: string;
    userId: string;
    role: 'faculty' | 'learner';
  }): Promise<MembershipRow>;
  addCohortMember(input: {
    id: string;
    cohortId: string;
    userId: string;
    learnerPathway: string | null;
    invitedAt: Date | null;
  }): Promise<unknown>;
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
}

export interface CreatedInvite {
  invitationId: string;
  cohortId: string;
  email: string;
  /** Raw token: shown exactly once at creation inside `copyLink`. */
  token: string;
  copyLink: string;
  expiresAt: Date;
}

export interface PublicInvite {
  id: string;
  cohortId: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export function toPublicInvite(row: InvitationRow): PublicInvite {
  return {
    id: row.id,
    cohortId: row.cohortId,
    email: row.email,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export function createInviteService(
  repos: InviteServiceRepos,
  opts?: { now?: () => Date; newId?: () => string; randomToken?: () => string },
): {
  createInvite(input: {
    authSubject: string;
    cohortId: string;
    email: string;
    ttlHours?: number;
    baseUrl?: string;
  }): Promise<CreatedInvite>;
  getInvite(input: { authSubject: string; invitationId: string }): Promise<PublicInvite>;
  confirmInvite(input: { rawToken: string; cohortId?: string }): Promise<{
    invitationId: string;
    cohortId: string;
    userId: string;
  }>;
  revokeInvite(input: { authSubject: string; invitationId: string }): Promise<{ revoked: boolean }>;
} {
  const now = opts?.now ?? (() => new Date());
  const newId = opts?.newId ?? newFacultyId;
  const randomToken = opts?.randomToken ?? (() => randomBytes(32).toString('hex'));

  async function loadFacultyCohort(authSubject: string, cohortId: string): Promise<CohortRow> {
    const cohort = await repos.getCohort(cohortId);
    if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
    await requireFaculty(repos, authSubject, (cohort as CohortRow).institutionId);
    return cohort as CohortRow;
  }

  return {
    async createInvite(input: {
      authSubject: string;
      cohortId: string;
      email: string;
      ttlHours?: number;
      baseUrl?: string;
    }): Promise<CreatedInvite> {
      const cohort = await loadFacultyCohort(input.authSubject, input.cohortId);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        facultyFail(400, 'bad_request', 'A valid email is required.');
      }
      const ttlHours =
        input.ttlHours === undefined || input.ttlHours === null ? 72 : Number(input.ttlHours);
      if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 720) {
        facultyFail(400, 'bad_request', 'ttlHours must be within 1..720.');
      }
      const token = randomToken();
      if (typeof token !== 'string' || token.length < 32) {
        facultyFail(500, 'internal', 'Failed to mint invitation token.');
      }
      const created = await repos.createInvitation({
        id: newId(),
        cohortId: cohort.id,
        email,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now().getTime() + ttlHours * 3600_000),
      });
      const base = (input.baseUrl ?? '').replace(/\/+$/, '');
      const copyLink = `${base}/join?cohort=${encodeURIComponent(cohort.id)}&token=${encodeURIComponent(token)}`;
      return {
        invitationId: created.id,
        cohortId: cohort.id,
        email: created.email,
        token,
        copyLink,
        expiresAt: created.expiresAt,
      };
    },

    async getInvite(input: { authSubject: string; invitationId: string }): Promise<PublicInvite> {
      const row = await repos.getInvitation(input.invitationId);
      if (!row) facultyFail(404, 'not_found', 'Invitation not found.');
      const cohort = await repos.getCohort((row as InvitationRow).cohortId);
      if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
      await requireFaculty(repos, input.authSubject, (cohort as CohortRow).institutionId);
      return toPublicInvite(row as InvitationRow);
    },

    async confirmInvite(input: { rawToken: string; cohortId?: string }): Promise<{
      invitationId: string;
      cohortId: string;
      userId: string;
    }> {
      if (typeof input.rawToken !== 'string' || input.rawToken.length === 0) {
        facultyFail(404, 'invite_not_found', 'Invitation not found.');
      }
      const row = await repos.getInvitationByHash(sha256Hex(input.rawToken));
      if (!row) facultyFail(404, 'invite_not_found', 'Invitation not found.');
      const invitation = row as InvitationRow;
      if (input.cohortId !== undefined && input.cohortId !== invitation.cohortId) {
        facultyFail(404, 'invite_not_found', 'Invitation not found.');
      }
      if (invitation.usedAt) facultyFail(410, 'invite_used', 'Invitation was already used.');
      if (invitation.expiresAt.getTime() <= now().getTime()) {
        facultyFail(410, 'invite_expired', 'Invitation has expired.');
      }
      const cohort = await repos.getCohort(invitation.cohortId);
      if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
      await repos.markInvitationUsed(invitation.id, now());
      const subject = `email:${invitation.email.toLowerCase()}`;
      let user = await repos.getUserByAuthSubject(subject);
      if (!user) {
        user = await repos.createUser({
          id: newId(),
          authSubject: subject,
          displayName: invitation.email.split('@')[0] || invitation.email,
        });
      }
      const membership = await repos.getMembership(
        (cohort as CohortRow).institutionId,
        (user as FacultyUserRow).id,
      );
      if (!membership) {
        await repos.createMembership({
          id: newId(),
          institutionId: (cohort as CohortRow).institutionId,
          userId: (user as FacultyUserRow).id,
          role: 'learner',
        });
      }
      await repos.addCohortMember({
        id: newId(),
        cohortId: (cohort as CohortRow).id,
        userId: (user as FacultyUserRow).id,
        learnerPathway: null,
        invitedAt: now(),
      });
      return {
        invitationId: invitation.id,
        cohortId: (cohort as CohortRow).id,
        userId: (user as FacultyUserRow).id,
      };
    },

    async revokeInvite(input: {
      authSubject: string;
      invitationId: string;
    }): Promise<{ revoked: boolean }> {
      const row = await repos.getInvitation(input.invitationId);
      if (!row) facultyFail(404, 'not_found', 'Invitation not found.');
      const cohort = await repos.getCohort((row as InvitationRow).cohortId);
      if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
      await requireFaculty(repos, input.authSubject, (cohort as CohortRow).institutionId);
      await repos.deleteInvitation((row as InvitationRow).id);
      return { revoked: true };
    },
  };
}
