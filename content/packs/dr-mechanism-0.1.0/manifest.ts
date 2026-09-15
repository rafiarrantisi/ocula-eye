import type { ReleaseManifest } from '../../../lib/domain/content/schema.ts';

// Draft release manifest for the DR mechanism pack. The DR slice has no
// numerical model, but ReleaseManifest requires at least one modelRef, so
// modelRefs inventories the mechanism set at the pack version (resolved by
// validateDrPack against mechanism ids, not a model registry).
export const drManifest: ReleaseManifest = {
  packId: 'dr-mechanism-draft',
  version: '0.1.0',
  schemaVersion: '1.0',
  modelRefs: [
    { id: 'inner-endothelium', version: '0.1.0' },
    { id: 'outer-rpe', version: '0.1.0' },
    { id: 'plasma-leakage', version: '0.1.0' },
    { id: 'rbc-escape', version: '0.1.0' },
    { id: 'lipid-deposit', version: '0.1.0' },
    { id: 'nfl-ischemia', version: '0.1.0' },
    { id: 'nv-drive', version: '0.1.0' },
  ],
  claimRefs: [
    'inner-vs-outer-barrier',
    'leakage-vs-bleeding',
    'deposit-vs-ischemia',
    'nv-association',
    'field-limits',
  ],
  review: { status: 'draft', scope: ['dr-mechanism-lesson'] },
};
