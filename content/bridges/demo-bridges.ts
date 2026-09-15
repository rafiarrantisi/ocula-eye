import type { BridgeRule } from '../../lib/server/bridgeService.ts';

// SYNTHETIC demo bridge rules for demo-synthetic-* releases only.
// Mechanism/scenario ids resolve against the DR mechanism pack; follow-up
// pools resolve against the synthetic demo manifest. Nothing here is reviewed
// or publishable; real releases carry their own reviewed bridges.
export const DEMO_BRIDGE_RULES: BridgeRule[] = [
  {
    id: 'demo-bridge-exudate',
    triggerConceptIds: ['concept:hard-exudate'],
    caseFindingIds: ['finding:hard-exudate'],
    mechanismIds: ['lipid-deposit'],
    scenarioId: 'leakage',
    approvedExplanationKey: 'bridge:demo-exudate-cws',
    followupPoolIds: ['synthetic-loc-3', 'synthetic-loc-4', 'synthetic-loc-5'],
  },
  {
    id: 'demo-bridge-ma-bleed',
    triggerConceptIds: ['concept:microaneurysm', 'concept:hemorrhage'],
    caseFindingIds: ['finding:microaneurysm', 'finding:hemorrhage'],
    mechanismIds: ['rbc-escape'],
    scenarioId: 'leakage',
    approvedExplanationKey: 'bridge:demo-ma-bleed',
    followupPoolIds: ['synthetic-loc-1', 'synthetic-loc-2', 'synthetic-loc-5'],
  },
  {
    id: 'demo-bridge-nonperfusion',
    triggerConceptIds: ['concept:cotton-wool-spot'],
    caseFindingIds: ['finding:cotton-wool-spot'],
    mechanismIds: ['nfl-ischemia'],
    scenarioId: 'capillary_nonperfusion',
    approvedExplanationKey: 'bridge:demo-nonperfusion',
    followupPoolIds: ['synthetic-loc-4', 'synthetic-loc-5'],
  },
  {
    id: 'demo-bridge-proliferative',
    triggerConceptIds: ['concept:hemorrhage'],
    caseFindingIds: ['finding:hemorrhage'],
    mechanismIds: ['nv-drive'],
    scenarioId: 'ischemia_neovascularization',
    approvedExplanationKey: 'bridge:demo-proliferative',
    followupPoolIds: ['synthetic-loc-2', 'synthetic-loc-5'],
  },
];

/** Bridge rule → DR pack prediction question (server grades; never shipped with answers). */
export const DEMO_RULE_QUESTION: Record<string, string> = {
  'demo-bridge-exudate': 'q-deposit-ischemia',
  'demo-bridge-ma-bleed': 'q-exudate-bleed',
  'demo-bridge-nonperfusion': 'q-deposit-ischemia',
  'demo-bridge-proliferative': 'q-exudate-bleed',
};
