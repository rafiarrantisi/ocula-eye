import type { MembershipRow } from './auth.ts';

// Pure authorization helpers over membership rows. No I/O, no clock. The
// faculty slice is faculty-only for both viewing and managing cohorts today:
// learners hold memberships so their institution tenancy is explicit, but
// cohort management (import, assignments, invites, reports, exports) requires
// role 'faculty'. canViewCohort/canManageCohort are split so a future
// learner-facing view can widen canViewCohort without touching call sites.

export function isFacultyMember(membership: MembershipRow | null | undefined): boolean {
  return !!membership && membership.role === 'faculty';
}

export function canViewCohort(membership: MembershipRow | null | undefined): boolean {
  return isFacultyMember(membership);
}

export function canManageCohort(membership: MembershipRow | null | undefined): boolean {
  return isFacultyMember(membership);
}
