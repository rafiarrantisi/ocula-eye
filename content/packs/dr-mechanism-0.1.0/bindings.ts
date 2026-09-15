import type { RenderBinding } from '../../../lib/domain/content/schema.ts';

// Schematic render targets for the magnified retinal patch. No 'camera'
// channel anywhere here: camera selection stays independent of clinical
// state. Every binding carries the exaggerated-scale disclosure.
const NOTE = 'Magnified schematic patch, not to scale.';

export const drBindings: RenderBinding[] = [
  {
    id: 'rb-normal-barriers',
    stateSelector: 'normal_barrier',
    structureIds: ['retina'],
    visualChannel: 'annotation',
    presetId: 'normal-barrier-annotation',
    exaggerationNote: NOTE,
  },
  {
    id: 'rb-leak-plasma',
    stateSelector: 'leakage',
    structureIds: ['retina'],
    visualChannel: 'particle_path',
    presetId: 'leak-plasma-particles',
    exaggerationNote: NOTE,
  },
  {
    id: 'rb-leak-deposit',
    stateSelector: 'leakage',
    structureIds: ['retina'],
    visualChannel: 'material',
    presetId: 'leak-deposit-material',
    exaggerationNote: NOTE,
  },
  {
    id: 'rb-perfusion-drop',
    stateSelector: 'capillary_nonperfusion',
    structureIds: ['retina'],
    visualChannel: 'material',
    presetId: 'perfusion-drop-material',
    exaggerationNote: NOTE,
  },
  {
    id: 'rb-cws-spots',
    stateSelector: 'capillary_nonperfusion',
    structureIds: ['retina'],
    visualChannel: 'visibility',
    presetId: 'cws-spots-visibility',
    exaggerationNote: NOTE,
  },
  {
    id: 'rb-nv-fronds',
    stateSelector: 'ischemia_neovascularization',
    structureIds: ['retina'],
    visualChannel: 'visibility',
    presetId: 'nv-fronds-visibility',
    exaggerationNote: NOTE,
  },
];
