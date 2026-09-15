import { createHash } from 'node:crypto';
import {
  facultyFail,
  newFacultyId,
  requireFaculty,
  type CohortMemberRow,
  type CohortRow,
  type FacultyUserRow,
  type InstitutionRow,
  type MembershipRow,
} from './auth.ts';

// Cohort CSV import orchestration for the faculty slice. Constructor-injected
// repos (same pattern as lib/server/attemptService.ts `createServices`).
//
// Zero dependency on the parallel-agent-owned
// `lib/domain/faculty/csvImport.ts`: callers inject a
// `parseCsv: (text: string) => ParsedCsv` function with the structural type
// below (compatible with that module's `parseCohortCsv` shape). Routes pass
// `fallbackParseCsv` (minimal structural parser kept here) until the
// domain-owned parser is wired; tests inject strict fakes.
//
// Learner identity convention (documented): a CSV email maps to the faculty
// user with auth subject `email:<lowercased email>`. Confirm provisions such
// placeholder users plus 'learner' memberships for addresses without
// accounts; real learners claim the same subject when managed auth binds.
// Import tokens are deterministic sha256 digests of (cohortId, csv text):
// the client resends the CSV with the token, the server recomputes it, and
// natural unique(cohort_id, user_id) upserts plus a consumed-token cache make
// double confirm of the same token return a single membership set.

export interface ParsedCsvRow {
  email: string;
  displayName?: string;
  pathway?: string;
  line?: number;
}

export interface ParsedCsvInvalid {
  line: number;
  reason: string;
}

export interface ParsedCsv {
  rows: ParsedCsvRow[];
  invalid: (ParsedCsvInvalid | string)[];
  duplicates: string[];
}

export type ParseCsv = (text: string) => ParsedCsv;

export interface CohortServiceRepos {
  getInstitution(id: string): Promise<InstitutionRow | null>;
  getCohort(id: string): Promise<CohortRow | null>;
  createCohort(input: { id: string; institutionId: string; name: string }): Promise<CohortRow>;
  getUserByAuthSubject(authSubject: string): Promise<FacultyUserRow | null>;
  createUser(input: { id: string; authSubject: string; displayName: string }): Promise<FacultyUserRow>;
  getMembership(institutionId: string, userId: string): Promise<MembershipRow | null>;
  createMembership(input: {
    id: string;
    institutionId: string;
    userId: string;
    role: 'faculty' | 'learner';
  }): Promise<MembershipRow>;
  listCohortMembers(cohortId: string): Promise<CohortMemberRow[]>;
  addCohortMember(input: {
    id: string;
    cohortId: string;
    userId: string;
    learnerPathway: string | null;
    invitedAt: Date | null;
  }): Promise<CohortMemberRow>;
}

export const COHORT_CSV_MAX_BYTES = 262144;
export const COHORT_CSV_MAX_ROWS = 200;

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VALID_PATHWAYS: ReadonlySet<string> = new Set(['resident_foundation', 'koas_core']);

export function emailSubject(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function importTokenFor(cohortId: string, csvText: string): string {
  return createHash('sha256').update(`cohort-import\n${cohortId}\n${csvText}`, 'utf8').digest('hex');
}

/** Minimal structural fallback parser (header
 * `email,display_name,learner_pathway`). The domain-owned validator remains
 * the contract reference; this exists so routes run without importing it. */
export function fallbackParseCsv(text: string): ParsedCsv {
  if (new TextEncoder().encode(text).length > COHORT_CSV_MAX_BYTES) {
    return { rows: [], invalid: [{ line: 0, reason: 'file_too_large' }], duplicates: [] };
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if ((lines[0] ?? '').trim() !== 'email,display_name,learner_pathway') {
    return { rows: [], invalid: [{ line: 1, reason: 'invalid_header' }], duplicates: [] };
  }
  const data = lines.slice(1).filter((l) => l.trim() !== '');
  if (data.length > COHORT_CSV_MAX_ROWS) {
    return { rows: [], invalid: [{ line: 0, reason: 'too_many_rows' }], duplicates: [] };
  }
  const rows: ParsedCsvRow[] = [];
  const invalid: ParsedCsvInvalid[] = [];
  const counts = new Map<string, number>();
  data.forEach((raw, idx) => {
    const line = idx + 2;
    const cells = raw.split(',');
    if (cells.length !== 3) {
      invalid.push({ line, reason: 'wrong_field_count' });
      return;
    }
    const email = cells[0].trim();
    const displayName = cells[1].trim();
    const pathway = cells[2].trim();
    if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      invalid.push({ line, reason: 'invalid_email' });
      return;
    }
    const nameLen = [...displayName].length;
    if (nameLen < 1 || nameLen > 120) {
      invalid.push({ line, reason: 'invalid_display_name' });
      return;
    }
    if (!VALID_PATHWAYS.has(pathway)) {
      invalid.push({ line, reason: 'invalid_pathway' });
      return;
    }
    rows.push({ email, displayName, pathway, line });
    const key = email.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const duplicates = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([email]) => email)
    .sort();
  return { rows, invalid, duplicates };
}

export interface ImportPreview {
  token: string;
  cohortId: string;
  total: number;
  entries: { email: string; displayName: string; pathway: string; alreadyMember: boolean }[];
  invalid: (ParsedCsvInvalid | string)[];
  duplicates: string[];
  newCount: number;
  existingCount: number;
}

export interface ImportConfirmation {
  token: string;
  cohortId: string;
  total: number;
  added: number;
  existing: number;
  invalid: (ParsedCsvInvalid | string)[];
  duplicates: string[];
}

export function createCohortService(
  repos: CohortServiceRepos,
  opts?: { newId?: () => string },
): {
  createCohort(input: {
    authSubject: string;
    institutionId: string;
    name: string;
  }): Promise<CohortRow>;
  previewImport(input: {
    authSubject: string;
    cohortId: string;
    csvText: string;
    parseCsv: ParseCsv;
  }): Promise<ImportPreview>;
  confirmImport(input: {
    authSubject: string;
    cohortId: string;
    token: string;
    csvText: string;
    parseCsv: ParseCsv;
  }): Promise<ImportConfirmation>;
} {
  const newId = opts?.newId ?? newFacultyId;
  const consumed = new Map<string, ImportConfirmation>();

  async function loadFacultyCohort(authSubject: string, cohortId: string): Promise<CohortRow> {
    const cohort = await repos.getCohort(cohortId);
    if (!cohort) facultyFail(404, 'not_found', 'Cohort not found.');
    await requireFaculty(repos, authSubject, (cohort as CohortRow).institutionId);
    return cohort as CohortRow;
  }

  return {
    async createCohort(input: {
      authSubject: string;
      institutionId: string;
      name: string;
    }): Promise<CohortRow> {
      const { authSubject, institutionId, name } = input;
      if (!institutionId || typeof institutionId !== 'string') {
        facultyFail(400, 'bad_request', 'institutionId is required.');
      }
      const cleanName = typeof name === 'string' ? name.trim() : '';
      if (cleanName.length === 0 || cleanName.length > 200) {
        facultyFail(400, 'bad_request', 'Cohort name must be 1..200 characters.');
      }
      await requireFaculty(repos, authSubject, institutionId);
      const institution = await repos.getInstitution(institutionId);
      if (!institution) facultyFail(404, 'not_found', 'Institution not found.');
      return repos.createCohort({ id: newId(), institutionId, name: cleanName });
    },

    async previewImport(input: {
      authSubject: string;
      cohortId: string;
      csvText: string;
      parseCsv: ParseCsv;
    }): Promise<ImportPreview> {
      const { authSubject, cohortId, csvText, parseCsv } = input;
      const cohort = await loadFacultyCohort(authSubject, cohortId);
      if (typeof csvText !== 'string') facultyFail(400, 'bad_request', 'csv is required.');
      if (new TextEncoder().encode(csvText).length > COHORT_CSV_MAX_BYTES) {
        facultyFail(413, 'payload_too_large', 'CSV file too large.');
      }
      const parsed = parseCsv(csvText);
      const members = await repos.listCohortMembers(cohort.id);
      const memberUserIds = new Set(members.map((m) => m.userId));
      const entries: ImportPreview['entries'] = [];
      const seen = new Set<string>();
      for (const row of parsed.rows) {
        const key = row.email.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const user = await repos.getUserByAuthSubject(emailSubject(key));
        entries.push({
          email: row.email.trim(),
          displayName: row.displayName ?? '',
          pathway: row.pathway ?? '',
          alreadyMember: !!user && memberUserIds.has(user.id),
        });
      }
      const existingCount = entries.filter((e) => e.alreadyMember).length;
      return {
        token: importTokenFor(cohort.id, csvText),
        cohortId: cohort.id,
        total: parsed.rows.length,
        entries,
        invalid: parsed.invalid,
        duplicates: parsed.duplicates,
        newCount: entries.length - existingCount,
        existingCount,
      };
    },

    async confirmImport(input: {
      authSubject: string;
      cohortId: string;
      token: string;
      csvText: string;
      parseCsv: ParseCsv;
    }): Promise<ImportConfirmation> {
      const { authSubject, cohortId, token, csvText, parseCsv } = input;
      const cohort = await loadFacultyCohort(authSubject, cohortId);
      if (typeof csvText !== 'string' || typeof token !== 'string' || token.length === 0) {
        facultyFail(400, 'bad_request', 'token and csv are required.');
      }
      if (token !== importTokenFor(cohort.id, csvText)) {
        facultyFail(400, 'bad_request', 'Invalid import token for this CSV.');
      }
      const cached = consumed.get(token);
      if (cached) return cached;
      if (new TextEncoder().encode(csvText).length > COHORT_CSV_MAX_BYTES) {
        facultyFail(413, 'payload_too_large', 'CSV file too large.');
      }
      const parsed = parseCsv(csvText);
      const before = await repos.listCohortMembers(cohort.id);
      const beforeIds = new Set(before.map((m) => m.userId));
      const seen = new Set<string>();
      let added = 0;
      let existing = 0;
      for (const row of parsed.rows) {
        const key = row.email.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const subject = emailSubject(key);
        let user = await repos.getUserByAuthSubject(subject);
        if (!user) {
          const local = key.split('@')[0] || key;
          user = await repos.createUser({
            id: newId(),
            authSubject: subject,
            displayName: row.displayName?.trim() || local,
          });
        }
        const membership = await repos.getMembership(cohort.institutionId, user.id);
        if (!membership) {
          await repos.createMembership({
            id: newId(),
            institutionId: cohort.institutionId,
            userId: user.id,
            role: 'learner',
          });
        }
        await repos.addCohortMember({
          id: newId(),
          cohortId: cohort.id,
          userId: user.id,
          learnerPathway: row.pathway?.trim() || null,
          invitedAt: null,
        });
        if (beforeIds.has(user.id)) {
          existing += 1;
        } else {
          added += 1;
          beforeIds.add(user.id);
        }
      }
      const result: ImportConfirmation = {
        token,
        cohortId: cohort.id,
        total: parsed.rows.length,
        added,
        existing,
        invalid: parsed.invalid,
        duplicates: parsed.duplicates,
      };
      consumed.set(token, result);
      return result;
    },
  };
}
