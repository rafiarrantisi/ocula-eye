import type { DrMechanism } from '../../../lib/domain/content/schema.ts';

// All draft: no human reviewer identity or date exists yet. Descriptions are
// one-line teaching scaffolding for the magnified schematic patch, not
// clinical truth and not histology.
const DRAFT = { status: 'draft' as const, scope: ['dr-mechanism-lesson'] };

export const drMechanisms: DrMechanism[] = [
  {
    id: 'inner-endothelium',
    name: { id: 'inner-endothelium', en: 'Inner barrier: retinal capillary endothelium' },
    description: 'Schematic inner blood–retina barrier at the retinal capillary endothelium.',
    structureIds: ['retina'],
    claimIds: ['inner-vs-outer-barrier'],
    review: DRAFT,
  },
  {
    id: 'outer-rpe',
    name: { id: 'outer-rpe', en: 'Outer barrier: retinal pigment epithelium' },
    description: 'Schematic outer blood–retina barrier at the retinal pigment epithelium.',
    structureIds: ['retina'],
    claimIds: ['inner-vs-outer-barrier'],
    review: DRAFT,
  },
  {
    id: 'plasma-leakage',
    name: { id: 'plasma-leakage', en: 'Plasma leakage through a compromised barrier' },
    description: 'Schematic plasma escape through a compromised barrier into retinal tissue.',
    structureIds: ['retina'],
    claimIds: ['leakage-vs-bleeding'],
    review: DRAFT,
  },
  {
    id: 'rbc-escape',
    name: { id: 'rbc-escape', en: 'Red blood cell escape (bleeding)' },
    description: 'Schematic red blood cell escape (bleeding), distinct from plasma leakage.',
    structureIds: ['retina'],
    claimIds: ['leakage-vs-bleeding'],
    review: DRAFT,
  },
  {
    id: 'lipid-deposit',
    name: { id: 'lipid-deposit', en: 'Lipid/protein deposit after plasma leakage' },
    description: 'Schematic lipid/protein deposit left behind after plasma leakage.',
    structureIds: ['retina'],
    claimIds: ['deposit-vs-ischemia'],
    review: DRAFT,
  },
  {
    id: 'nfl-ischemia',
    name: { id: 'nfl-ischemia', en: 'Focal nerve-fiber-layer ischemic injury' },
    description: 'Schematic focal nerve-fiber-layer injury from capillary nonperfusion.',
    structureIds: ['retina'],
    claimIds: ['deposit-vs-ischemia'],
    review: DRAFT,
  },
  {
    id: 'nv-drive',
    name: { id: 'nv-drive', en: 'Ischemia-associated neovascular drive' },
    description: 'Schematic ischemia-associated neovascular drive, illustrated separately.',
    structureIds: ['retina'],
    claimIds: ['nv-association', 'field-limits'],
    review: DRAFT,
  },
];
