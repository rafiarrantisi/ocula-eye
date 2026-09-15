import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRepositories } from '../../lib/server/demoStore.ts';
import { createServices } from '../../lib/server/attemptService.ts';
vi.stubEnv('LAB_DEMO_STORE', '1');
process.env.LAB_DEMO_PATH = join(mkdtempSync(join(tmpdir(), 'ocula-demo-')), 'store.json');

const TRUTH = {
  answers: { 'demo-grade-1-grade': 'grade-2' },
  localization: {
    taskId: 'demo-loc-1-loc',
    roi: { polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    targets: [{ id: 't1', classId: 'hemorrhage', polygon: [[0.4, 0.4], [0.5, 0.4], [0.5, 0.5], [0.4, 0.5]], cx: 0.45, cy: 0.45 }],
    ignored: [],
    acceptedClasses: ['hemorrhage', 'microaneurysm'],
  },
  gradeExpected: { 'demo-grade-1-grade': 'grade-2' },
  rationale: 'Synthetic fixture.',
};

function services() {
  return createServices(createDemoRepositories(), {
    truthProvider: async () => TRUTH,
    now: () => new Date('2026-09-15T00:00:00Z'),
    newId: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
}

async function servicesWithSession(sessionId: string) {
  const repos = createDemoRepositories();
  await repos.createSession(sessionId, new Date(Date.now() + 86400000));
  await repos.upsertRelease('demo-synthetic-0.1.0', { version: '0.1.0' });
  return createServices(repos, {
    truthProvider: async () => TRUTH,
    now: () => new Date('2026-09-15T00:00:00Z'),
    newId: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
}

describe('demo store end-to-end (synthetic only)', () => {
  let svc: Awaited<ReturnType<typeof servicesWithSession>>;
  beforeEach(async () => {
    svc = await servicesWithSession('s1');
  });
  it('create -> draft -> submit -> feedback with localization scoring', async () => {
    const created = await svc.createAttempt({ sessionId: 's1', releaseId: 'demo-synthetic-0.1.0', caseId: 'demo-loc-1', mode: 'practice', idempotencyKey: 'k1' });
    expect(created.status).toBe('draft');
    await svc.saveDraft({ sessionId: 's1', attemptId: created.attemptId, payload: { marks: [] }, expectedRevision: 0 });
    const sub = await svc.submitAttempt({
      sessionId: 's1', attemptId: created.attemptId,
      payload: {
        version: 1,
        answers: { 'demo-grade-1-grade': 'grade-2' },
        marks: [{ id: 'm1', classId: 'hemorrhage', x: 0.45, y: 0.45 }],
      },
      idempotencyKey: 'k1',
    });
    expect(sub.status).toBe('feedback_released');
    const fb = await svc.getFeedback({ sessionId: 's1', attemptId: created.attemptId });
    const score = fb.score as { localization?: { tp: number; fp: number; fn: number; f1: number | null } };
    expect(score.localization?.tp).toBe(1);
    expect(score.localization?.f1).toBe(1);
  });
  it('refuses non-synthetic releases', async () => {
    await expect(
      svc.createAttempt({ sessionId: 's1', releaseId: 'dr-real-1.0', caseId: 'x', mode: 'practice' }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('denies cross-session access opaquely', async () => {
    const created = await svc.createAttempt({ sessionId: 's1', releaseId: 'demo-synthetic-0.1.0', caseId: 'demo-loc-1', mode: 'practice' });
    await expect(svc.getFeedback({ sessionId: 's2', attemptId: created.attemptId })).rejects.toMatchObject({ status: 401 });
  });
  it('denies other-session attempt as not-found', async () => {
    const repos = createDemoRepositories();
    await repos.createSession('s1', new Date(Date.now() + 86400000));
    await repos.createSession('s2', new Date(Date.now() + 86400000));
    await repos.upsertRelease('demo-synthetic-0.1.0', { version: '0.1.0' });
    const svcX = createServices(repos, {
      truthProvider: async () => TRUTH,
      now: () => new Date('2026-09-15T00:00:00Z'),
      newId: (() => { let n = 0; return () => `z-${++n}`; })(),
    });
    const created = await svcX.createAttempt({ sessionId: 's1', releaseId: 'demo-synthetic-0.1.0', caseId: 'demo-loc-1', mode: 'practice' });
    await expect(svcX.getFeedback({ sessionId: 's2', attemptId: created.attemptId })).rejects.toMatchObject({ status: 404 });
  });
  it('rejects out-of-ROI marks with 422', async () => {
    const truth = { ...TRUTH, localization: { ...TRUTH.localization, roi: { polygon: [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]] } } };
    const repos2 = createDemoRepositories();
    await repos2.createSession('s1', new Date(Date.now() + 86400000));
    await repos2.upsertRelease('demo-synthetic-0.1.0', { version: '0.1.0' });
    const svc2 = createServices(repos2, {
      truthProvider: async () => truth,
      now: () => new Date(),
      newId: (() => { let n = 100; return () => `x-${++n}`; })(),
    });
    const created = await svc2.createAttempt({ sessionId: 's1', releaseId: 'demo-synthetic-0.1.0', caseId: 'demo-loc-1', mode: 'practice' });
    await expect(
      svc2.submitAttempt({ sessionId: 's1', attemptId: created.attemptId, payload: { version: 1, answers: {}, marks: [{ id: 'm9', classId: 'hemorrhage', x: 0.9, y: 0.9 }] } }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
