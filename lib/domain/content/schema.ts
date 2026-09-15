import { z } from 'zod';

// Zod contracts for the aqueous source pack (CONTRACTS subset consumed by PART01).
// Review status 'approved' requires identity + date; anything less stays draft.

export const reviewSchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'rejected', 'quarantined']),
  reviewerId: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  scope: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
  supersededBy: z.string().optional(),
});
export type Review = z.infer<typeof reviewSchema>;

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),
  version: z.string().min(1),
  publishedAt: z.string().optional(),
  accessedAt: z.string().min(1),
  locator: z.string().optional(),
  referenceUse: z.boolean(),
  assetRightsId: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const claimSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  text: z.object({ id: z.string().min(1), en: z.string().optional() }),
  sourceRefs: z.array(z.object({
    sourceId: z.string().min(1),
    locator: z.string().min(1),
    relation: z.enum(['supports', 'limits']),
  })).min(1),
  context: z.string().min(1),
  limitations: z.array(z.string()).default([]),
  review: reviewSchema,
});
export type Claim = z.infer<typeof claimSchema>;

export const aqueousModelSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  equation: z.string().min(1),
  bounds: z.object({
    F: z.tuple([z.number(), z.number()]),
    C: z.tuple([z.number(), z.number()]),
    U: z.tuple([z.number(), z.number()]),
    Pv: z.tuple([z.number(), z.number()]),
  }),
  fidelity: z.enum(['A_animation', 'B_causal', 'C_simplified_physiology', 'D_numerical_physics', 'E_validated_prediction']),
  limitations: z.array(z.string().min(1)).min(1),
  review: reviewSchema,
});
export type AqueousModel = z.infer<typeof aqueousModelSchema>;

export const workedExampleSchema = z.object({
  id: z.string().min(1),
  input: z.object({ F: z.number(), C: z.number(), U: z.number(), Pv: z.number() }),
  expected: z.object({ IOP: z.number(), qConv: z.number(), qU: z.number() }),
  note: z.string().min(1),
});
export type WorkedExample = z.infer<typeof workedExampleSchema>;

export const manifestSchema = z.object({
  packId: z.string().min(1),
  version: z.string().min(1),
  schemaVersion: z.literal('1.0'),
  modelRefs: z.array(z.object({ id: z.string().min(1), version: z.string().min(1) })).min(1),
  claimRefs: z.array(z.string().min(1)),
  review: reviewSchema,
});
export type ReleaseManifest = z.infer<typeof manifestSchema>;

export interface PackIssue {
  file: string;
  code: string;
  detail: string;
}

export interface AqueousPackFiles {
  sources: unknown;
  claims: unknown;
  models: unknown;
  examples: unknown;
  manifest: unknown;
}

/** Structural + referential validation. Never throws; collects issues. */
export function validateAqueousPack(files: AqueousPackFiles): PackIssue[] {
  const issues: PackIssue[] = [];
  const parsed = {
    sources: sourceSchema.array().safeParse(files.sources),
    claims: claimSchema.array().safeParse(files.claims),
    models: aqueousModelSchema.array().safeParse(files.models),
    examples: workedExampleSchema.array().safeParse(files.examples),
    manifest: manifestSchema.safeParse(files.manifest),
  } as const;
  if (!parsed.sources.success) issues.push({ file: 'sources', code: 'schema', detail: parsed.sources.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.claims.success) issues.push({ file: 'claims', code: 'schema', detail: parsed.claims.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.models.success) issues.push({ file: 'models', code: 'schema', detail: parsed.models.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.examples.success) issues.push({ file: 'examples', code: 'schema', detail: parsed.examples.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.manifest.success) issues.push({ file: 'manifest', code: 'schema', detail: parsed.manifest.error.issues[0]?.message ?? 'invalid' });
  if (issues.length > 0) return issues;

  const sources = parsed.sources.data!;
  const claims = parsed.claims.data!;
  const models = parsed.models.data!;
  const manifest = parsed.manifest.data!;

  function uniqueIds(kind: string, ids: string[]) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ file: kind, code: 'duplicate-id', detail: id });
      seen.add(id);
    }
  }
  uniqueIds('sources', sources.map(s => s.id));
  uniqueIds('claims', claims.map(c => c.id));
  uniqueIds('models', models.map(m => `${m.id}@${m.version}`));

  const sourceIds = new Set(sources.map(s => s.id));
  for (const claim of claims) {
    for (const ref of claim.sourceRefs) {
      if (!sourceIds.has(ref.sourceId)) {
        issues.push({ file: 'claims', code: 'dangling-source', detail: `${claim.id} -> ${ref.sourceId}` });
      }
    }
    checkReview('claims', claim.id, claim.review, issues);
  }
  for (const model of models) checkReview('models', model.id, model.review, issues);
  checkReview('manifest', manifest.packId, manifest.review, issues);

  for (const ref of manifest.claimRefs) {
    if (!claims.some(c => c.id === ref)) issues.push({ file: 'manifest', code: 'dangling-claim', detail: ref });
  }
  for (const ref of manifest.modelRefs) {
    if (!models.some(m => m.id === ref.id && m.version === ref.version)) {
      issues.push({ file: 'manifest', code: 'dangling-model', detail: `${ref.id}@${ref.version}` });
    }
  }
  return issues;
}

function checkReview(file: string, id: string, review: Review, issues: PackIssue[]) {
  if (review.status === 'approved' && (!review.reviewerId || !review.reviewedAt)) {
    issues.push({ file, code: 'approved-without-identity', detail: id });
  }
}

// ---- DR mechanism pack (PART02, appended; existing exports above untouched) ----

// Five CONTRACTS teaching scenarios. Order is teaching order, not a patient timeline.
export const drScenarioSchema = z.enum([
  'normal_barrier',
  'leakage',
  'capillary_nonperfusion',
  'ischemia_neovascularization',
  'combined',
]);
export type DrScenario = z.infer<typeof drScenarioSchema>;

export const drMechanismSchema = z.object({
  id: z.string().min(1),
  name: z.object({ id: z.string().min(1), en: z.string().optional() }),
  description: z.string().min(1),
  structureIds: z.array(z.string().min(1)).min(1),
  claimIds: z.array(z.string().min(1)).min(1),
  review: reviewSchema,
});
export type DrMechanism = z.infer<typeof drMechanismSchema>;

export const renderBindingSchema = z.object({
  id: z.string().min(1),
  stateSelector: drScenarioSchema,
  structureIds: z.array(z.string().min(1)).min(1),
  visualChannel: z.enum(['visibility', 'material', 'particle_path', 'annotation', 'camera']),
  presetId: z.string().min(1),
  exaggerationNote: z.string().optional(),
});
export type RenderBinding = z.infer<typeof renderBindingSchema>;

export const drQuestionSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOptionId: z.string().min(1),
  distractorConcepts: z.array(z.string()),
  review: reviewSchema,
});
export type DrQuestion = z.infer<typeof drQuestionSchema>;

export interface DrPackFiles {
  sources: unknown;
  claims: unknown;
  mechanisms: unknown;
  bindings: unknown;
  questions: unknown;
  manifest: unknown;
}

/**
 * Structural + referential validation for the DR mechanism pack.
 * Never throws; collects issues. Mirrors validateAqueousPack: schema,
 * duplicate ids, dangling refs, approved-without-identity.
 * DR specifics: manifest modelRefs resolve against mechanism ids (the DR
 * slice has no numerical model; see content/packs/dr-mechanism-0.1.0/
 * manifest.ts), mechanism claimIds and manifest claimRefs resolve against
 * claim ids, and each question's correctOptionId must match one option.
 * Bindings are terminal render targets: stateSelector is schema-checked
 * above and per-scenario coverage is shown by
 * scripts/content/preview-dr.mjs (integration-verified against dr.ts).
 */
export function validateDrPack(files: DrPackFiles): PackIssue[] {
  const issues: PackIssue[] = [];
  const parsed = {
    sources: sourceSchema.array().safeParse(files.sources),
    claims: claimSchema.array().safeParse(files.claims),
    mechanisms: drMechanismSchema.array().safeParse(files.mechanisms),
    bindings: renderBindingSchema.array().safeParse(files.bindings),
    questions: drQuestionSchema.array().safeParse(files.questions),
    manifest: manifestSchema.safeParse(files.manifest),
  } as const;
  if (!parsed.sources.success) issues.push({ file: 'sources', code: 'schema', detail: parsed.sources.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.claims.success) issues.push({ file: 'claims', code: 'schema', detail: parsed.claims.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.mechanisms.success) issues.push({ file: 'mechanisms', code: 'schema', detail: parsed.mechanisms.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.bindings.success) issues.push({ file: 'bindings', code: 'schema', detail: parsed.bindings.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.questions.success) issues.push({ file: 'questions', code: 'schema', detail: parsed.questions.error.issues[0]?.message ?? 'invalid' });
  if (!parsed.manifest.success) issues.push({ file: 'manifest', code: 'schema', detail: parsed.manifest.error.issues[0]?.message ?? 'invalid' });
  if (issues.length > 0) return issues;

  const sources = parsed.sources.data!;
  const claims = parsed.claims.data!;
  const mechanisms = parsed.mechanisms.data!;
  const bindings = parsed.bindings.data!;
  const questions = parsed.questions.data!;
  const manifest = parsed.manifest.data!;

  function uniqueDrIds(kind: string, ids: string[]) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ file: kind, code: 'duplicate-id', detail: id });
      seen.add(id);
    }
  }
  uniqueDrIds('sources', sources.map((s) => s.id));
  uniqueDrIds('claims', claims.map((c) => c.id));
  uniqueDrIds('mechanisms', mechanisms.map((m) => m.id));
  uniqueDrIds('bindings', bindings.map((b) => b.id));
  uniqueDrIds('questions', questions.map((q) => q.id));

  const sourceIds = new Set(sources.map((s) => s.id));
  const claimIds = new Set(claims.map((c) => c.id));
  const mechanismIds = new Set(mechanisms.map((m) => m.id));

  for (const claim of claims) {
    for (const ref of claim.sourceRefs) {
      if (!sourceIds.has(ref.sourceId)) {
        issues.push({ file: 'claims', code: 'dangling-source', detail: `${claim.id} -> ${ref.sourceId}` });
      }
    }
    checkReview('claims', claim.id, claim.review, issues);
  }
  for (const mechanism of mechanisms) {
    for (const claimId of mechanism.claimIds) {
      if (!claimIds.has(claimId)) {
        issues.push({ file: 'mechanisms', code: 'dangling-claim', detail: `${mechanism.id} -> ${claimId}` });
      }
    }
    checkReview('mechanisms', mechanism.id, mechanism.review, issues);
  }
  for (const ref of manifest.modelRefs) {
    if (!mechanismIds.has(ref.id)) {
      issues.push({ file: 'manifest', code: 'dangling-mechanism', detail: `${ref.id}@${ref.version}` });
    }
  }
  for (const ref of manifest.claimRefs) {
    if (!claimIds.has(ref)) issues.push({ file: 'manifest', code: 'dangling-claim', detail: ref });
  }
  for (const question of questions) {
    const optionIds = question.options.map((o) => o.id);
    if (!optionIds.includes(question.correctOptionId)) {
      issues.push({ file: 'questions', code: 'dangling-option', detail: `${question.id} -> ${question.correctOptionId}` });
    }
    if (new Set(optionIds).size !== optionIds.length) {
      issues.push({ file: 'questions', code: 'duplicate-id', detail: `${question.id}:option` });
    }
    checkReview('questions', question.id, question.review, issues);
  }
  checkReview('manifest', manifest.packId, manifest.review, issues);
  return issues;
}
