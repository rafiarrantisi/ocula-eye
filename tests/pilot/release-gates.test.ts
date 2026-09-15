import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuarantine } from '../../lib/server/quarantine.ts';
import {
  getAssignmentRevealState,
  getAttemptAssignmentId,
  resolveReveal,
} from '../../lib/server/assessmentReveal.ts';
import {
  clearDemoQuarantine,
  createDemoRepositories,
  readDemoDb,
  setDemoQuarantine,
  writeDemoDb,
} from '../../lib/server/demoStore.ts';

// PART06 pilot-gate tests: quarantine reads and scheduled/manual reveal
// resolution. Pure logic plus demo-store twins; postgres SQL runs live only.

describe('resolveReveal', () => {
  it('immediate and unknown policies release at once', () => {
    expect(resolveReveal({ revealPolicy: 'immediate', dueAt: null, revealedAt: null }, 0).released).toBe(true);
    expect(resolveReveal({ revealPolicy: 'whatever', dueAt: null, revealedAt: null }, 0).released).toBe(true);
  });
  it('manual releases only after faculty reveal', () => {
    const locked = resolveReveal({ revealPolicy: 'manual', dueAt: null, revealedAt: null }, 9_999_999_999_999);
    expect(locked).toEqual({ released: false, reason: 'manual-not-revealed' });
    const open = resolveReveal({ revealPolicy: 'manual', dueAt: null, revealedAt: new Date(0) }, 0);
    expect(open).toEqual({ released: true, reason: 'revealed' });
  });
  it('scheduled releases on reveal or after due', () => {
    const before = resolveReveal(
      { revealPolicy: 'scheduled', dueAt: new Date(9_999_999_999_999), revealedAt: null },
      0,
    );
    expect(before).toEqual({ released: false, reason: 'scheduled-not-due' });
    const after = resolveReveal(
      { revealPolicy: 'scheduled', dueAt: new Date(1), revealedAt: null },
      2,
    );
    expect(after).toEqual({ released: true, reason: 'due-passed' });
    const manual = resolveReveal(
      { revealPolicy: 'scheduled', dueAt: new Date(9_999_999_999_999), revealedAt: new Date(0) },
      0,
    );
    expect(manual.released).toBe(true);
  });
});

describe('getQuarantine tolerance', () => {
  it('returns null for repos without quarantine support', async () => {
    expect(await getQuarantine({} as never, 'rel-x')).toBeNull();
  });
  it('delegates when the optional method exists', async () => {
    const row = { releaseId: 'rel-x', reason: 'r', notice: 'n', createdAt: new Date(0) };
    const repos = { getReleaseQuarantine: async () => row } as never;
    expect(await getQuarantine(repos, 'rel-x')).toBe(row);
  });
  it('assignment link helpers tolerate legacy repos', async () => {
    expect(await getAttemptAssignmentId({} as never, 'a')).toBeNull();
    expect(await getAssignmentRevealState({} as never, 'a')).toBeNull();
  });
});

describe('demo store pilot gates', () => {
  let dir: string;
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ocula-pilot-'));
    process.env.LAB_DEMO_PATH = join(dir, 'store.json');
    writeDemoDb(readDemoDb());
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('quarantine set/get/clear round-trips', async () => {
    const repos = createDemoRepositories();
    expect(await getQuarantine(repos, 'demo-synthetic-0.1.0')).toBeNull();
    setDemoQuarantine('demo-synthetic-0.1.0', 'inkonsistensi kunci', 'Rilis ditahan untuk koreksi.');
    const hold = await getQuarantine(repos, 'demo-synthetic-0.1.0');
    expect(hold?.notice).toBe('Rilis ditahan untuk koreksi.');
    clearDemoQuarantine('demo-synthetic-0.1.0');
    expect(await getQuarantine(repos, 'demo-synthetic-0.1.0')).toBeNull();
  });

  it('assignment link set/get round-trips and reveal state reads faculty rows', async () => {
    const repos = createDemoRepositories();
    await repos.createAttempt({
      id: 'att-1', sessionId: 's-1', releaseId: 'demo-synthetic-0.1.0', caseId: 'c-1', idempotencyKey: null,
    });
    expect(await getAttemptAssignmentId(repos, 'att-1')).toBeNull();
    await repos.setAttemptAssignmentId?.('att-1', 'asg-1');
    expect(await getAttemptAssignmentId(repos, 'att-1')).toBe('asg-1');
    const db = readDemoDb();
    db.faculty.assignments['asg-1'] = {
      id: 'asg-1', cohortId: 'co-1', releaseId: 'demo-synthetic-0.1.0', pathway: null,
      mode: 'assessment', openAt: new Date(0).toISOString(), dueAt: null,
      revealPolicy: 'manual', releaseVersion: null, releaseSnapshot: null, createdAt: new Date(0).toISOString(),
    };
    writeDemoDb(db);
    const state = await getAssignmentRevealState(repos, 'asg-1');
    expect(state?.revealPolicy).toBe('manual');
    expect(resolveReveal(state as never, Date.now()).released).toBe(false);
  });
});
