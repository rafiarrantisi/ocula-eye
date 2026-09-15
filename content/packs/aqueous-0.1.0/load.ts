import { validateAqueousPack, type PackIssue } from '../../../lib/domain/content/schema.ts';
import { hashOf } from '../../../lib/domain/content/release.ts';
import { aqueousSources } from './sources.ts';
import { aqueousClaims } from './claims.ts';
import { aqueousModels, aqueousExamples, aqueousManifest } from './models.ts';

export interface LoadedAqueousPack {
  sources: typeof aqueousSources;
  claims: typeof aqueousClaims;
  models: typeof aqueousModels;
  examples: typeof aqueousExamples;
  manifest: typeof aqueousManifest;
  fileHashes: Record<string, string>;
}

let cached: LoadedAqueousPack | null = null;

/** Loads and validates the aqueous 0.1.0 teaching pack. Throws listing issues. */
export function loadAqueousPack(): LoadedAqueousPack {
  if (cached) return cached;
  const files = {
    sources: aqueousSources,
    claims: aqueousClaims,
    models: aqueousModels,
    examples: aqueousExamples,
    manifest: aqueousManifest,
  };
  const issues: PackIssue[] = validateAqueousPack(files);
  if (issues.length > 0) {
    throw new Error(`aqueous pack invalid: ${issues.map(i => `${i.file}/${i.code}:${i.detail}`).join('; ')}`);
  }
  const fileHashes: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) fileHashes[name] = hashOf(data);
  cached = { ...files, fileHashes };
  return cached;
}
