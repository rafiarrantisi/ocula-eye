import {
  facultyFail,
  newFacultyId,
  requireFaculty,
  type AssignmentRow,
  type AttemptOutcomeRow,
  type CohortMemberRow,
  type CohortRow,
  type FacultyUserRow,
  type MembershipRow,
  type ReleaseManifestView,
} from './auth.ts';

// Assignment lifecycle for the faculty slice. Constructor-injected repos
// (same pattern as lib/server/attemptService.ts `createServices`).
//
//   - create validates the open/due window (due must be after open) and pins
//     the release manifest version snapshot at creation time.
//   - Truth is frozen once attempts exist: changing the pinned release after
//     `countAttemptsForRelease > 0` is refused with 409 `version_frozen`.
//   - Reports derive from attempts joined with scores (read-only); module and
//     target cases are implied by the pinned release manifest, so per-case
//     denominators come from the manifest case list.
//   - `buildAssignmentExport` renders the report as CSV with a local
//     formula-injection escaper (duplicated here on purpose: this slice must
//     not import the parallel-agent-owned export helpers).

export const ASSIGNMENT_MODES: ReadonlySet<string> = new Set(['practice', 'assessment']);
export const REVEAL_POLICIES: ReadonlySet<string> = new Set(['immediate', 'manual', 'scheduled']);

export interface AssignmentServiceRepos {
  getCohort(id: string): Promise<CohortRow | null>;
  getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null>;
  getMembership(institutionId: string, userId: string): Promise<MembershipRow | null>;
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
  listCohortMembers(cohortId: string): Promise<CohortMemberRow[]>;
}

export interface PerCaseMetric {
  caseId: string;
  attempts: number;
  submitted: number;
  scored: number;
  mean: number | null;
}

export interface AssignmentReport {
  assignmentId: string;
  cohortId: string;
  releaseId: string;
  releaseVersion: string | null;
  denominators: { learners: number; cases: number; attempts: number };
  attempts: { total: number; draft: number; submitted: number; feedbackReleased: number };
  scores: { n: number; mean: number; min: number; max: number } | null;
  perCase: PerCaseMetric[];
}

function toDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(value as string);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    facultyFail(400, 'bad_request', `${field} must be a valid date.`);
  }
  return date as Date;
}

function manifestCaseIds(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [];
  const cases = (manifest as { cases?: unknown })['cases'];
  if (!Array.isArray(cases)) return [];
  const ids: string[] = [];
  for (const c of cases) {
    if (c && typeof c === 'object' && typeof (c as { caseId?: unknown })['caseId'] === 'string') {
      ids.push((c as { caseId: string })['caseId']);
    }
  }
  return ids;
}

// Local formula-injection escaper (intentional duplicate; see header).
// Any cell whose first character is =, +, -, @, tab, or CR is prefixed with
// a single quote before RFC4180 quoting is applied.
const FORMULA_LEADERS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r']);

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

function escapeCsvCell(value: unknown): string {
  let text = cellText(value);
  if (text.length > 0 && FORMULA_LEADERS.has(text[0])) {
    text = `'${text}`;
  }
  if (text.includes(',') || text.includes('"') || text.includes('\r') || text.includes('\n')) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildAssignmentExport(report: AssignmentReport): string {
  const columns = ['case_id', 'attempts', 'submitted', 'scored', 'mean_score'];
  const lines = [columns.map((c) => escapeCsvCell(c)).join(',')];
  for (const row of report.perCase) {
    lines.push(
      [
        escapeCsvCell(row.caseId),
        escapeCsvCell(row.attempts),
        escapeCsvCell(row.submitted),
        escapeCsvCell(row.scored),
        escapeCsvCell(row.mean === null ? '' : row.mean.toFixed(2)),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function createAssignmentService(
  repos: AssignmentServiceRepos,
  opts?: { newId?: () => string },
): {
  createAssignment(input: {
    authSubject: string;
    cohortId: string;
    releaseId: string;
    pathway?: string;
    mode: string;
    openAt: unknown;
    dueAt?: unknown;
    revealPolicy: string;
  }): Promise<AssignmentRow>;
  changeAssignmentRelease(input: {
    authSubject: string;
    assignmentId: string;
    releaseId: string;
  }): Promise<AssignmentRow>;
  getReport(input: { authSubject: string; assignmentId: string }): Promise<AssignmentReport>;
} {
  const newId = opts?.newId ?? newFacultyId;

  async function loadFacultyAssignment(
    authSubject: string,
    assignmentId: string,
  ): Promise<{ assignment: AssignmentRow; cohort: CohortRow }> {
    const assignment = await repos.getAssignment(assignmentId);
    if (!assignment) facultyFail(404, 'not_found', 'Assignment not found.');
    const cohort = await repos.getCohort((assignment as AssignmentRow).cohortId);
    if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
    await requireFaculty(repos, authSubject, (cohort as CohortRow).institutionId);
    return { assignment: assignment as AssignmentRow, cohort: cohort as CohortRow };
  }

  return {
    async createAssignment(input: {
      authSubject: string;
      cohortId: string;
      releaseId: string;
      pathway?: string;
      mode: string;
      openAt: unknown;
      dueAt?: unknown;
      revealPolicy: string;
    }): Promise<AssignmentRow> {
      const { authSubject, cohortId, releaseId } = input;
      const cohort = await repos.getCohort(cohortId);
      if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
      await requireFaculty(repos, authSubject, (cohort as CohortRow).institutionId);
      if (typeof releaseId !== 'string' || releaseId.length === 0) {
        facultyFail(400, 'bad_request', 'releaseId is required.');
      }
      if (!ASSIGNMENT_MODES.has(input.mode)) {
        facultyFail(400, 'bad_request', 'mode must be practice or assessment.');
      }
      if (!REVEAL_POLICIES.has(input.revealPolicy)) {
        facultyFail(400, 'bad_request', 'revealPolicy must be immediate, manual, or scheduled.');
      }
      const pathway =
        input.pathway === undefined || input.pathway === null ? null : String(input.pathway);
      if (pathway !== null && (pathway.length === 0 || pathway.length > 120)) {
        facultyFail(400, 'bad_request', 'pathway must be 1..120 characters.');
      }
      const openAt = toDate(input.openAt, 'openAt');
      let dueAt: Date | null = null;
      if (input.dueAt !== undefined && input.dueAt !== null) {
        dueAt = toDate(input.dueAt, 'dueAt');
        if (dueAt.getTime() <= openAt.getTime()) {
          facultyFail(422, 'invalid_window', 'dueAt must be after openAt.');
        }
      }
      const pinned = await repos.getReleaseManifest(releaseId);
      if (!pinned) facultyFail(422, 'unknown_release', 'Release is unknown or unversioned.');
      return repos.createAssignment({
        id: newId(),
        cohortId: (cohort as CohortRow).id,
        releaseId,
        pathway,
        mode: input.mode,
        openAt,
        dueAt,
        revealPolicy: input.revealPolicy,
        releaseVersion: (pinned as ReleaseManifestView).version,
        releaseSnapshot: (pinned as ReleaseManifestView).manifest,
      });
    },

    async changeAssignmentRelease(input: {
      authSubject: string;
      assignmentId: string;
      releaseId: string;
    }): Promise<AssignmentRow> {
      const { assignment } = await loadFacultyAssignment(input.authSubject, input.assignmentId);
      if (typeof input.releaseId !== 'string' || input.releaseId.length === 0) {
        facultyFail(400, 'bad_request', 'releaseId is required.');
      }
      const pinned = await repos.getReleaseManifest(input.releaseId);
      if (!pinned) facultyFail(422, 'unknown_release', 'Release is unknown or unversioned.');
      const attempts = await repos.countAttemptsForRelease(assignment.releaseId);
      if (attempts > 0) {
        facultyFail(409, 'version_frozen', 'Release is frozen once attempts exist.');
      }
      const updated = await repos.updateAssignmentRelease(assignment.id, {
        releaseId: input.releaseId,
        releaseVersion: (pinned as ReleaseManifestView).version,
        releaseSnapshot: (pinned as ReleaseManifestView).manifest,
      });
      if (!updated) facultyFail(404, 'not_found', 'Assignment not found.');
      return updated as AssignmentRow;
    },

    async getReport(input: {
      authSubject: string;
      assignmentId: string;
    }): Promise<AssignmentReport> {
      const { assignment, cohort } = await loadFacultyAssignment(
        input.authSubject,
        input.assignmentId,
      );
      const outcomes = await repos.listAttemptOutcomes(assignment.releaseId);
      const members = await repos.listCohortMembers(cohort.id);
      const pinned = await repos.getReleaseManifest(assignment.releaseId);
      const caseIds = pinned ? manifestCaseIds(pinned.manifest) : [];
      const byCase = new Map<string, { attempts: number; submitted: number; scores: number[] }>();
      for (const id of caseIds) byCase.set(id, { attempts: 0, submitted: 0, scores: [] });
      let draft = 0;
      let submitted = 0;
      let feedbackReleased = 0;
      const allScores: number[] = [];
      for (const o of outcomes) {
        if (!byCase.has(o.caseId)) byCase.set(o.caseId, { attempts: 0, submitted: 0, scores: [] });
        const bucket = byCase.get(o.caseId) as { attempts: number; submitted: number; scores: number[] };
        bucket.attempts += 1;
        if (o.status === 'draft') {
          draft += 1;
        } else {
          bucket.submitted += 1;
          submitted += 1;
          if (o.status === 'feedback_released') feedbackReleased += 1;
        }
        if (o.score !== null) {
          bucket.scores.push(o.score);
          allScores.push(o.score);
        }
      }
      const perCase: PerCaseMetric[] = [...byCase.entries()].map(([caseId, b]) => ({
        caseId,
        attempts: b.attempts,
        submitted: b.submitted,
        scored: b.scores.length,
        mean:
          b.scores.length > 0 ? b.scores.reduce((a, c) => a + c, 0) / b.scores.length : null,
      }));
      perCase.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
      return {
        assignmentId: assignment.id,
        cohortId: cohort.id,
        releaseId: assignment.releaseId,
        releaseVersion: assignment.releaseVersion,
        denominators: { learners: members.length, cases: caseIds.length, attempts: outcomes.length },
        attempts: {
          total: outcomes.length,
          draft,
          submitted,
          feedbackReleased,
        },
        scores:
          allScores.length > 0
            ? {
                n: allScores.length,
                mean: allScores.reduce((a, c) => a + c, 0) / allScores.length,
                min: Math.min(...allScores),
                max: Math.max(...allScores),
              }
            : null,
        perCase,
      };
    },
  };
}
