import type { Claim } from '../../../lib/domain/content/schema.ts';

// All draft: no human reviewer identity or date exists yet. Nothing here is
// approved clinical truth. NEI locators are verified section headings of the
// NEI diabetic retinopathy page. Barrier/finding distinctions the NEI page
// does not state precisely cite the Webvision full text with a pending
// reviewer-confirmation locator and carry the required limitation.
const DRAFT = { status: 'draft' as const, scope: ['dr-mechanism-lesson'] };
const PENDING_LOCATOR = 'Organization of the Retina (full text) — precise barrier/finding detail pending reviewer confirmation';
const PENDING_LIMIT = 'Requires reviewer-confirmed source locator before publication.';

export const drClaims: Claim[] = [
  {
    id: 'inner-vs-outer-barrier',
    version: '0.1.0',
    text: { id: 'inner-vs-outer-barrier', en: 'The lesson distinguishes an inner endothelial barrier from an outer RPE barrier.' },
    sourceRefs: [
      { sourceId: 'webvision', locator: PENDING_LOCATOR, relation: 'supports' },
    ],
    context: 'Normal-barrier teaching step in the magnified retinal patch.',
    limitations: [PENDING_LIMIT, 'Schematic patch; capillary detail is illustrative, not histology.'],
    review: DRAFT,
  },
  {
    id: 'leakage-vs-bleeding',
    version: '0.1.0',
    text: { id: 'leakage-vs-bleeding', en: 'Plasma leakage and red blood cell escape (bleeding) are taught as distinct processes.' },
    sourceRefs: [
      { sourceId: 'webvision', locator: PENDING_LOCATOR, relation: 'supports' },
    ],
    context: 'Leakage teaching step in the magnified retinal patch.',
    limitations: [PENDING_LIMIT, 'Particle paths are schematic; no transport is simulated.'],
    review: DRAFT,
  },
  {
    id: 'deposit-vs-ischemia',
    version: '0.1.0',
    text: { id: 'deposit-vs-ischemia', en: 'Lipid/protein deposit and focal nerve-fiber-layer ischemic injury (cotton-wool) are taught as distinct findings.' },
    sourceRefs: [
      { sourceId: 'webvision', locator: PENDING_LOCATOR, relation: 'supports' },
    ],
    context: 'Leakage versus nonperfusion comparison in the magnified retinal patch.',
    limitations: [PENDING_LIMIT, 'Appearance alone does not determine fluid thickness or acuity.'],
    review: DRAFT,
  },
  {
    id: 'nv-association',
    version: '0.1.0',
    text: { id: 'nv-association', en: 'Neovascular illustration is shown in association with ischemia, without staging the whole eye.' },
    sourceRefs: [
      { sourceId: 'nei-dr', locator: 'What other problems can diabetic retinopathy cause?', relation: 'supports' },
    ],
    context: 'Ischemia/neovascularization teaching step in the magnified retinal patch.',
    limitations: ['Association only; timing and extent are schematic, not a progression model.'],
    review: DRAFT,
  },
  {
    id: 'field-limits',
    version: '0.1.0',
    text: { id: 'field-limits', en: 'A single-field schematic patch cannot determine whole-eye stage.' },
    sourceRefs: [
      { sourceId: 'nei-dr', locator: 'What is diabetic retinopathy?', relation: 'limits' },
    ],
    context: 'Whole-lesson scope limit for every scenario.',
    limitations: ['No whole-eye stage or DME determination from the patch.'],
    review: DRAFT,
  },
];
