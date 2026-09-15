import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../lib/domain/content/hash.ts';
import { canonicalize, hashOf } from '../../lib/domain/content/release.ts';
import { validateAqueousPack } from '../../lib/domain/content/schema.ts';
import { loadAqueousPack } from '../../content/packs/aqueous-0.1.0/load.ts';
import { aqueousSources } from '../../content/packs/aqueous-0.1.0/sources.ts';
import { aqueousClaims } from '../../content/packs/aqueous-0.1.0/claims.ts';
import { aqueousModels, aqueousExamples, aqueousManifest } from '../../content/packs/aqueous-0.1.0/models.ts';

describe('canonical hashing', () => {
  it('matches the SHA-256 test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('is key-order independent and deterministic', () => {
    expect(hashOf({ b: 1, a: [3, 2] })).toBe(hashOf({ a: [3, 2], b: 1 }));
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('aqueous 0.1.0 pack', () => {
  it('loads and validates clean', () => {
    const pack = loadAqueousPack();
    expect(pack.manifest.version).toBe('0.1.0');
    expect(Object.keys(pack.fileHashes)).toEqual(['sources', 'claims', 'models', 'examples', 'manifest']);
  });
  it('stays draft: no approved clinical content without identity', () => {
    for (const c of aqueousClaims) expect(c.review.status).not.toBe('approved');
    for (const m of aqueousModels) expect(m.review.status).not.toBe('approved');
    expect(aqueousManifest.review.status).not.toBe('approved');
  });
  it('worked examples match the evaluator', async () => {
    const { evaluateAqueous } = await import('../../lib/domain/simulation/aqueous.ts');
    for (const ex of aqueousExamples) {
      const r = evaluateAqueous(ex.input);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(Math.abs(r.state.IOP - ex.expected.IOP)).toBeLessThan(1e-6);
      expect(Math.abs(r.state.qConv - ex.expected.qConv)).toBeLessThan(1e-6);
    }
  });
});

describe('pack validation rejects bad packs', () => {
  const files = {
    sources: aqueousSources,
    claims: aqueousClaims,
    models: aqueousModels,
    examples: aqueousExamples,
    manifest: aqueousManifest,
  };
  it('rejects dangling source refs', () => {
    const bad = { ...files, claims: [{ ...aqueousClaims[0], sourceRefs: [{ sourceId: 'nope', locator: 'x', relation: 'supports' as const }] }] };
    const issues = validateAqueousPack(bad);
    expect(issues.some(i => i.code === 'dangling-source')).toBe(true);
  });
  it('rejects duplicate ids', () => {
    const bad = { ...files, sources: [...aqueousSources, aqueousSources[0]] };
    const issues = validateAqueousPack(bad);
    expect(issues.some(i => i.code === 'duplicate-id')).toBe(true);
  });
  it('rejects approved review without identity/date', () => {
    const bad = {
      ...files,
      claims: [{ ...aqueousClaims[0], review: { status: 'approved' as const, scope: ['x'] } }],
    };
    const issues = validateAqueousPack(bad);
    expect(issues.some(i => i.code === 'approved-without-identity')).toBe(true);
  });
  it('rejects missing source locators via schema', () => {
    const bad = {
      ...files,
      claims: [{ ...aqueousClaims[0], sourceRefs: [{ sourceId: 'goel-2010', locator: '', relation: 'supports' as const }] }],
    };
    const issues = validateAqueousPack(bad);
    expect(issues.length).toBeGreaterThan(0);
  });
});
