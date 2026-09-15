// Seeds the LOCAL SYNTHETIC demo store for faculty/learner UI try-outs:
// one institution, one faculty, three learners, one cohort, one assignment.
// Idempotent by fixed ids. Never run against real data (demo store refuses
// non-synthetic releases; this script only writes demo-* ids).
// Usage: LAB_DEMO_STORE=1 node scripts/faculty/demo-seed.mjs
import { createDemoFacultyRepos } from '../../lib/server/demoFaculty.ts';
import { createCohortService } from '../../lib/server/faculty/cohortService.ts';
import { createAssignmentService } from '../../lib/server/faculty/assignmentService.ts';
import { parseCohortCsv } from '../../lib/domain/faculty/csvImport.ts';

if (process.env.LAB_DEMO_STORE !== '1') {
  console.error('demo-seed: refusing without LAB_DEMO_STORE=1.');
  process.exit(2);
}

const repos = createDemoFacultyRepos();
const cohortSvc = createCohortService(repos);
const assignSvc = createAssignmentService(repos);
const log = (m) => console.log(`demo-seed: ${m}`);

await repos.createInstitution({ id: 'demo-institution', name: 'Institusi Demo (sintetis)' }).catch(() => null);
await repos.createUser({ id: 'demo-faculty', authSubject: 'demo-faculty', displayName: 'Fasilitator Demo' }).catch(() => null);
await repos.createMembership({ id: 'demo-mship-faculty', institutionId: 'demo-institution', userId: 'demo-faculty', role: 'faculty' }).catch(() => null);

const learners = [
  ['demo-learner-1', 'Peserta Satu', 'resident_foundation'],
  ['demo-learner-2', 'Peserta Dua', 'resident_foundation'],
  ['demo-learner-3', 'Peserta Tiga', 'koas_core'],
];
for (const [id, name] of learners) {
  await repos.createUser({ id, authSubject: id, displayName: name }).catch(() => null);
  await repos.createMembership({ id: `demo-mship-${id}`, institutionId: 'demo-institution', userId: id, role: 'learner' }).catch(() => null);
}

const existing = await repos.getCohort('demo-cohort-1').catch(() => null);
let cohortId = 'demo-cohort-1';
if (!existing) {
  // Service mints its own id; adopt whatever it returns for this run.
  const created = await cohortSvc.createCohort({ authSubject: 'demo-faculty', institutionId: 'demo-institution', name: 'Kohort Demo 1' });
  cohortId = created.id;
  log(`cohort created: ${cohortId}`);
} else {
  log(`cohort reused: ${cohortId}`);
}
const csv = [
  'email,display_name,learner_pathway',
  'peserta.satu@demo.local,Peserta Satu,resident_foundation',
  'peserta.dua@demo.local,Peserta Dua,resident_foundation',
  'peserta.tiga@demo.local,Peserta Tiga,koas_core',
].join('\n');
const preview = await cohortSvc.previewImport({ authSubject: 'demo-faculty', cohortId, csvText: csv, parseCsv: parseCohortCsv });
log(`import preview: ${preview.newCount} new, ${preview.existingCount} existing, ${preview.invalid.length} invalid`);
const { importTokenFor } = await import('../../lib/server/faculty/cohortService.ts');
const confirmed = await cohortSvc.confirmImport({
  authSubject: 'demo-faculty', cohortId,
  token: importTokenFor(cohortId, csv), csvText: csv, parseCsv: parseCohortCsv,
});
log(`import confirmed: ${confirmed.added} added, ${confirmed.existing} existing`);

const assignments = await assignSvc.createAssignment({
  authSubject: 'demo-faculty', cohortId, releaseId: 'demo-synthetic-0.1.0',
  pathway: 'resident_foundation', mode: 'practice',
  openAt: new Date(Date.now() - 86400000).toISOString(),
  dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  revealPolicy: 'immediate',
}).catch((e) => ({ id: `(reuse: ${e && e.code ? e.code : 'exists'})` }));
log(`assignment: ${(assignments).id}`);
log('done. Faculty subject: demo-faculty. Learners: demo-learner-1..3.');
