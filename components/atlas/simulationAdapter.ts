import {
  AQUEOUS_MODEL_ID,
  AQUEOUS_MODEL_VERSION,
  evaluateAqueous,
  type AqueousInput,
  type AqueousState,
  type Evaluation,
  type TraceStep,
} from '../../lib/domain/simulation/aqueous.ts';

// Presets patch ONLY the named variables (CONTRACTS): a U demonstration must
// not secretly normalize facility, and vice versa.
export const AQUEOUS_BASELINE: AqueousInput = { F: 2.5, C: 0.3, U: 0.5, Pv: 9 };
export const AQUEOUS_PRESETS: Record<'normal' | 'resist' | 'narrow' | 'pga', Partial<AqueousInput>> = {
  normal: { F: 2.5, C: 0.3, U: 0.5 },
  resist: { C: 0.12 },
  narrow: { C: 0.08, U: 0.3 },
  pga: { U: 1.2 },
};

export interface AqueousSnapshot {
  modelId: string;
  modelVersion: string;
  releaseId: string;
  revision: number;
  inputState: AqueousInput;
  derivedState: AqueousState;
  trace: TraceStep[];
}

export function evaluateAqueousSnapshot(input: AqueousInput, revision: number): Evaluation<AqueousSnapshot> {
  const result = evaluateAqueous(input);
  if (!result.ok) return result;
  return {
    ok: true,
    state: {
      modelId: AQUEOUS_MODEL_ID,
      modelVersion: AQUEOUS_MODEL_VERSION,
      releaseId: 'aqueous-draft-0.1.0',
      revision,
      inputState: { ...input },
      derivedState: result.state,
      trace: result.trace,
    },
    trace: result.trace,
  };
}

export interface SceneFlowSpeeds {
  shared: number;
  trabecular: number;
  uveoscleral: number;
}

/** Pure mapping from validated input to illustrative particle speeds. */
export function sceneFlowSpeeds(input: AqueousInput): SceneFlowSpeeds {
  const result = evaluateAqueous(input);
  if (!result.ok) return { shared: 0, trabecular: 0, uveoscleral: 0 };
  const { F } = input;
  const { qConv, qU } = result.state;
  return {
    shared: 0.12 * (F / 2.5),
    trabecular: 0.19 * (qConv / 2.0),
    uveoscleral: 0.19 * (qU / 0.5),
  };
}
