import { describe, expect, it } from 'vitest';
import { validateDrPack } from '../../lib/domain/content/schema.ts';
import { loadDrPack } from '../../content/packs/dr-mechanism-0.1.0/load.ts';
import { drSources } from '../../content/packs/dr-mechanism-0.1.0/sources.ts';
import { drClaims } from '../../content/packs/dr-mechanism-0.1.0/claims.ts';
import { drMechanisms } from '../../content/packs/dr-mechanism-0.1.0/mechanisms.ts';
import { drBindings } from '../../content/packs/dr-mechanism-0.1.0/bindings.ts';
import { drQuestions } from '../../content/packs/dr-mechanism-0.1.0/questions.ts';
import { drManifest } from '../../content/packs/dr-mechanism-0.1.0/manifest.ts';

describe('dr mechanism 0.1.0 pack', () => {
  it('loads and validates clean', () => {
    const pack = loadDrPack();
    expect(pack.manifest.packId).toBe('dr-mechanism-draft');
    expect(pack.manifest.version).toBe('0.1.0');
    expect(Object.keys(pack.fileHashes)).toEqual(['sources', 'claims', 'mechanisms', 'bindings', 'questions', 'manifest']);
  });
  it('stays draft: no approved content without identity', () => {
    for (const c of drClaims) expect(c.review.status).not.toBe('approved');
    for (const m of drMechanisms) expect(m.review.status).not.toBe('approved');
    for (const q of drQuestions) expect(q.review.status).not.toBe('approved');
    expect(drManifest.review.status).not.toBe('approved');
  });
  it('uses no camera visual channel', () => {
    for (const b of drBindings) expect(b.visualChannel).not.toBe('camera');
  });
  it('manifest refs resolve', () => {
    const claimIds = new Set(drClaims.map((c) => c.id));
    for (const ref of drManifest.claimRefs) expect(claimIds.has(ref)).toBe(true);
    const mechanismIds = new Set(drMechanisms.map((m) => m.id));
    for (const ref of drManifest.modelRefs) expect(mechanismIds.has(ref.id)).toBe(true);
  });
});

describe('dr pack validation rejects bad packs', () => {
  const files = {
    sources: drSources,
    claims: drClaims,
    mechanisms: drMechanisms,
    bindings: drBindings,
    questions: drQuestions,
    manifest: drManifest,
  };
  it('rejects dangling source refs', () => {
    const bad = { ...files, claims: [{ ...drClaims[0], sourceRefs: [{ sourceId: 'nope', locator: 'x', relation: 'supports' as const }] }] };
    const issues = validateDrPack(bad);
    expect(issues.some((i) => i.code === 'dangling-source')).toBe(true);
  });
  it('rejects duplicate ids', () => {
    const bad = { ...files, mechanisms: [...drMechanisms, drMechanisms[0]] };
    const issues = validateDrPack(bad);
    expect(issues.some((i) => i.code === 'duplicate-id')).toBe(true);
  });
  it('rejects approved review without identity/date', () => {
    const bad = {
      ...files,
      questions: [{ ...drQuestions[0], review: { status: 'approved' as const, scope: ['x'] } }],
    };
    const issues = validateDrPack(bad);
    expect(issues.some((i) => i.code === 'approved-without-identity')).toBe(true);
  });
  it('rejects missing source locators via schema', () => {
    const bad = {
      ...files,
      claims: [{ ...drClaims[0], sourceRefs: [{ sourceId: 'nei-dr', locator: '', relation: 'supports' as const }] }],
    };
    const issues = validateDrPack(bad);
    expect(issues.length).toBeGreaterThan(0);
  });
});
