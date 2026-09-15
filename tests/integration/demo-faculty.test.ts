import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDemoFacultyRepos } from '../../lib/server/demoFaculty.ts';
import { createDemoRepositories } from '../../lib/server/demoStore.ts';
import { createCohortService } from '../../lib/server/faculty/cohortService.ts';
import { createAssignmentService } from '../../lib/server/faculty/assignmentService.ts';
import { parseCohortCsv } from '../../lib/domain/faculty/csvImport.ts';
import { buildAssignmentExport } from '../../lib/server/faculty/assignmentService.ts';

vi.stubEnv('LAB_DEMO_STORE', '1');
process.env.LAB_DEMO_PATH = join(mkdtempSync(join(tmpdir(), 'ocula-demofac-')), 'store.json');

const CSV = [
  'email,display_name,learner_pathway',
  'a@demo.local,A,resident_foundation',
  'b@demo.local,B,koas_core',
].join('\n');

describe('demo faculty round-trip (synthetic only)', () => {
  it('institution -> cohort -> import -> assignment -> report -> export', async () => {
    const repos = createDemoFacultyRepos();
    await repos.createInstitution({ id: 'inst-1', name: 'Demo' });
    await repos.createUser({ id: 'fac-1', authSubject: 'demo-faculty', displayName: 'Fac' });
    await repos.createMembership({ id: 'm-1', institutionId: 'inst-1', userId: 'fac-1', role: 'faculty' });
    const cohorts = createCohortService(repos);
    const cohort = await cohorts.createCohort({ authSubject: 'demo-faculty', institutionId: 'inst-1', name: 'K1' });
    const preview = await cohorts.previewImport({ authSubject: 'demo-faculty', cohortId: cohort.id, csvText: CSV, parseCsv: parseCohortCsv });
    expect(preview.newCount).toBe(2);
    const { importTokenFor } = await import('../../lib/server/faculty/cohortService.ts');
    const confirmed = await cohorts.confirmImport({
      authSubject: 'demo-faculty', cohortId: cohort.id,
      token: importTokenFor(cohort.id, CSV), csvText: CSV, parseCsv: parseCohortCsv,
    });
    expect(confirmed.added).toBe(2);
    // Repeat confirm replays the stored result without duplicating members.
    const again = await cohorts.confirmImport({
      authSubject: 'demo-faculty', cohortId: cohort.id,
      token: importTokenFor(cohort.id, CSV), csvText: CSV, parseCsv: parseCohortCsv,
    });
    expect(again.added).toBe(2);
    const members = await repos.listCohortMembers(cohort.id);
    expect(members.length).toBe(2);

    const assigns = createAssignmentService(repos);
    await createDemoRepositories().upsertRelease('demo-synthetic-0.1.0', { version: '0.1.0' });
    const assignment = await assigns.createAssignment({
      authSubject: 'demo-faculty', cohortId: cohort.id, releaseId: 'demo-synthetic-0.1.0',
      pathway: 'resident_foundation', mode: 'practice',
      openAt: new Date(Date.now() - 1000).toISOString(), revealPolicy: 'immediate',
    });
    expect(assignment.releaseVersion).toBe('0.1.0');
    const report = await assigns.getReport({ authSubject: 'demo-faculty', assignmentId: assignment.id });
    expect(report).toBeTruthy();
    const csv = buildAssignmentExport(report);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('case_id');
    expect(lines[0]).not.toMatch(/email|nama|name/i);
  });

  it('cross-tenant faculty is denied', async () => {
    const repos = createDemoFacultyRepos();
    await repos.createInstitution({ id: 'inst-a', name: 'A' });
    await repos.createInstitution({ id: 'inst-b', name: 'B' });
    await repos.createUser({ id: 'fac-b', authSubject: 'fac-b', displayName: 'FB' });
    await repos.createMembership({ id: 'm-b', institutionId: 'inst-b', userId: 'fac-b', role: 'faculty' });
    const cohorts = createCohortService(repos);
    const cohort = await cohorts.createCohort({ authSubject: 'fac-b', institutionId: 'inst-b', name: 'KB' });
    // Faculty of B has no membership in A: any access keyed to A is denied.
    await expect(
      cohorts.createCohort({ authSubject: 'fac-b', institutionId: 'inst-a', name: 'Z' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(cohort.institutionId).toBe('inst-b');
  });
});
