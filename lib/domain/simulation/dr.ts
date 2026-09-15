import type { Evaluation, TraceStep } from '../trace.ts';

export const DR_MODEL_ID = 'dr-mechanism';
export const DR_MODEL_VERSION = '0.1.0';

export type DRScenario = 'normal_barrier' | 'leakage' | 'capillary_nonperfusion' | 'ischemia_neovascularization' | 'combined';

export interface DRState {
  scenario: DRScenario;
  activeMechanismIds: string[];
  barrier: 'intact' | 'compromised';
  perfusion: 'preserved' | 'reduced';
  neovascularization: 'absent' | 'present';
  trace: TraceStep[];
}

type DRFacets = Pick<DRState, 'activeMechanismIds' | 'barrier' | 'perfusion' | 'neovascularization'>;

const SCENARIOS: Record<DRScenario, DRFacets> = {
  normal_barrier: {
    activeMechanismIds: ['inner-endothelium', 'outer-rpe'],
    barrier: 'intact',
    perfusion: 'preserved',
    neovascularization: 'absent',
  },
  leakage: {
    activeMechanismIds: ['inner-endothelium', 'plasma-leakage', 'lipid-deposit'],
    barrier: 'compromised',
    perfusion: 'preserved',
    neovascularization: 'absent',
  },
  capillary_nonperfusion: {
    activeMechanismIds: ['nfl-ischemia'],
    barrier: 'intact',
    perfusion: 'reduced',
    neovascularization: 'absent',
  },
  ischemia_neovascularization: {
    activeMechanismIds: ['nfl-ischemia', 'nv-drive'],
    barrier: 'compromised',
    perfusion: 'reduced',
    neovascularization: 'present',
  },
  combined: {
    activeMechanismIds: ['plasma-leakage', 'lipid-deposit', 'nfl-ischemia', 'nv-drive'],
    barrier: 'compromised',
    perfusion: 'reduced',
    neovascularization: 'present',
  },
};

const KNOWN_MECHANISMS: ReadonlySet<string> = new Set([
  'inner-endothelium',
  'outer-rpe',
  'plasma-leakage',
  'lipid-deposit',
  'nfl-ischemia',
  'nv-drive',
]);

function isDRScenario(id: string): id is DRScenario {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, id);
}

function buildState(scenario: DRScenario): DRState {
  const facets = SCENARIOS[scenario];
  const trace: TraceStep[] = [
    {
      ruleId: 'validate',
      inputs: { scenario },
      output: { valid: true },
      claimIds: [],
      explanationKey: 'validate',
    },
    {
      ruleId: 'scenario-load',
      inputs: { scenario },
      output: { barrier: facets.barrier, perfusion: facets.perfusion, neovascularization: facets.neovascularization },
      claimIds: [],
      explanationKey: 'scenario-load',
    },
  ];
  return {
    scenario,
    activeMechanismIds: [...facets.activeMechanismIds],
    barrier: facets.barrier,
    perfusion: facets.perfusion,
    neovascularization: facets.neovascularization,
    trace,
  };
}

export function selectScenario(id: string): Evaluation<DRState> {
  if (!isDRScenario(id)) {
    return { ok: false, errors: [{ field: 'scenario', code: 'unknown-scenario' }] };
  }
  const state = buildState(id);
  return { ok: true, state, trace: state.trace };
}

export function resetScenario(): Evaluation<DRState> {
  return selectScenario('normal_barrier');
}

export function selectMechanism(state: DRState, mechanismId: string): Evaluation<DRState> {
  if (!KNOWN_MECHANISMS.has(mechanismId)) {
    return { ok: false, errors: [{ field: 'mechanismId', code: 'unknown-mechanism' }] };
  }
  if (!state.activeMechanismIds.includes(mechanismId)) {
    return { ok: false, errors: [{ field: 'mechanismId', code: 'not-in-scenario' }] };
  }
  const already = state.trace.some((s) => s.ruleId === 'mechanism-focus' && s.inputs['mechanismId'] === mechanismId);
  const trace: TraceStep[] = already
    ? [...state.trace]
    : [
        ...state.trace,
        {
          ruleId: 'mechanism-focus',
          inputs: { mechanismId, scenario: state.scenario },
          output: { focused: true },
          claimIds: [],
          explanationKey: 'mechanism-focus',
        },
      ];
  const next: DRState = {
    scenario: state.scenario,
    activeMechanismIds: [...state.activeMechanismIds],
    barrier: state.barrier,
    perfusion: state.perfusion,
    neovascularization: state.neovascularization,
    trace,
  };
  return { ok: true, state: next, trace: next.trace };
}

export function resolveRenderBinding(bindings: { id: string }[], id: string): { id: string } {
  const found = bindings.find((b) => b.id === id);
  if (!found) {
    throw new Error('unknown-binding:' + id);
  }
  return found;
}
