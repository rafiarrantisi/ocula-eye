import type { AqueousModel, WorkedExample, ReleaseManifest } from '../../../lib/domain/content/schema.ts';

export const aqueousModels: AqueousModel[] = [
  {
    id: 'aqueous-equilibrium',
    version: '0.1.0',
    equation: 'qConv = F − U; IOP = (F − U) / C + Pv',
    bounds: { F: [0, 6], C: [0.01, 2], U: [0, 3], Pv: [0, 30] },
    fidelity: 'C_simplified_physiology',
    limitations: [
      'Equilibrium only; no transient, pulsatility, or circadian mechanism.',
      'Single episcleral recipient pressure; distal-segment detail omitted.',
      'Bounds are draft UI ranges, not reference intervals.',
    ],
    review: { status: 'draft', scope: ['aqueous-equilibrium-runtime'] },
  },
];

export const aqueousExamples: WorkedExample[] = [
  {
    id: 'baseline',
    input: { F: 2.5, C: 0.3, U: 0.5, Pv: 9 },
    expected: { IOP: 15.666666666666666, qConv: 2, qU: 0.5 },
    note: 'Nominal teaching baseline.',
  },
  {
    id: 'low-facility',
    input: { F: 2.5, C: 0.12, U: 0.5, Pv: 9 },
    expected: { IOP: 25.666666666666664, qConv: 2, qU: 0.5 },
    note: 'Only facility patched: pressure rises, equilibrium conventional flow unchanged.',
  },
  {
    id: 'high-uveoscleral',
    input: { F: 2.5, C: 0.12, U: 1.2, Pv: 9 },
    expected: { IOP: 19.833333333333332, qConv: 1.3, qU: 1.2 },
    note: 'Only U patched on top of the previous state: pressure falls.',
  },
];

export const aqueousManifest: ReleaseManifest = {
  packId: 'aqueous-draft',
  version: '0.1.0',
  schemaVersion: '1.0',
  modelRefs: [{ id: 'aqueous-equilibrium', version: '0.1.0' }],
  claimRefs: [
    'goldmann-equilibrium',
    'steady-conventional-flow',
    'transient-vs-equilibrium',
    'u-pressure-limits',
    'circadian-direction',
    'convection-direction',
  ],
  review: { status: 'draft', scope: ['aqueous-equilibrium-runtime'] },
};
