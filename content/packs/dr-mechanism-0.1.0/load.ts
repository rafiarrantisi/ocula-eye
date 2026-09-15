import { validateDrPack, type PackIssue } from '../../../lib/domain/content/schema.ts';
import { hashOf } from '../../../lib/domain/content/release.ts';
import { drSources } from './sources.ts';
import { drClaims } from './claims.ts';
import { drMechanisms } from './mechanisms.ts';
import { drBindings } from './bindings.ts';
import { drQuestions } from './questions.ts';
import { drManifest } from './manifest.ts';

export interface LoadedDrPack {
  sources: typeof drSources;
  claims: typeof drClaims;
  mechanisms: typeof drMechanisms;
  bindings: typeof drBindings;
  questions: typeof drQuestions;
  manifest: typeof drManifest;
  fileHashes: Record<string, string>;
}

let cached: LoadedDrPack | null = null;

/** Loads and validates the DR mechanism 0.1.0 teaching pack. Throws listing issues. */
export function loadDrPack(): LoadedDrPack {
  if (cached) return cached;
  const files = {
    sources: drSources,
    claims: drClaims,
    mechanisms: drMechanisms,
    bindings: drBindings,
    questions: drQuestions,
    manifest: drManifest,
  };
  const issues: PackIssue[] = validateDrPack(files);
  if (issues.length > 0) {
    throw new Error(`dr pack invalid: ${issues.map((i) => `${i.file}/${i.code}:${i.detail}`).join('; ')}`);
  }
  const fileHashes: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) fileHashes[name] = hashOf(data);
  cached = { ...files, fileHashes };
  return cached;
}
