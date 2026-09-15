// Pure aqueous equilibrium evaluator (fidelity C: simplified physiology).
// No React, Three, DOM, clock, network or LLM imports. Deterministic:
// same input + model version always yields the same state and trace.
export const AQUEOUS_MODEL_ID = 'aqueous-equilibrium';
export const AQUEOUS_MODEL_VERSION = '0.1.0';

export interface AqueousInput {
  /** Formation rate, microlitre/min. */
  F: number;
  /** Conventional outflow facility, microlitre/min/mmHg. */
  C: number;
  /** Pressure-independent (uveoscleral) outflow, microlitre/min. */
  U: number;
  /** Episcleral venous pressure, mmHg. */
  Pv: number;
}

export interface AqueousState {
  /** Intraocular pressure, mmHg. */
  IOP: number;
  /** Conventional outflow, microlitre/min. */
  qConv: number;
  qU: number;
  shareConv: number;
}

export interface TraceStep {
  ruleId: string;
  inputs: Record<string, number | string | boolean>;
  output: Record<string, number | string | boolean>;
  claimIds: string[];
  explanationKey: string;
}

export interface InputError {
  field: string;
  code: string;
}

export type Evaluation<T> =
  | { ok: true; state: T; trace: TraceStep[] }
  | { ok: false; errors: InputError[] };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkField(errors: InputError[], field: string, value: unknown): asserts value is number {
  if (!isFiniteNumber(value)) errors.push({ field, code: 'not-finite' });
}

export function validateAqueousInput(input: unknown): Evaluation<AqueousInput> {
  const errors: InputError[] = [];
  const trace: TraceStep[] = [];
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: [{ field: '(input)', code: 'not-object' }] };
  }
  const rec = input as Record<string, unknown>;
  checkField(errors, 'F', rec.F);
  checkField(errors, 'C', rec.C);
  checkField(errors, 'U', rec.U);
  checkField(errors, 'Pv', rec.Pv);
  if (errors.length > 0) return { ok: false, errors };
  const F = rec.F as number;
  const C = rec.C as number;
  const U = rec.U as number;
  const Pv = rec.Pv as number;
  if (F < 0) errors.push({ field: 'F', code: 'negative' });
  if (C <= 0) errors.push({ field: 'C', code: 'must-be-positive' });
  if (U < 0) errors.push({ field: 'U', code: 'negative' });
  if (Pv < 0) errors.push({ field: 'Pv', code: 'negative' });
  if (errors.length === 0 && U > F) errors.push({ field: 'U', code: 'exceeds-formation' });
  if (errors.length > 0) return { ok: false, errors };
  const state: AqueousInput = { F, C, U, Pv };
  trace.push({
    ruleId: 'validate-inputs',
    inputs: { ...state },
    output: { valid: true },
    claimIds: [],
    explanationKey: 'input-domain',
  });
  return { ok: true, state, trace };
}

export function evaluateAqueous(input: AqueousInput): Evaluation<AqueousState> {
  const checked = validateAqueousInput(input);
  if (!checked.ok) return checked;
  const { F, C, U, Pv } = checked.state;
  // Steady-state equilibrium. qConv = F − U is the equilibrium conventional
  // flow at fixed F/U — not the transient dip right after resistance rises.
  const qConv = F - U;
  const IOP = qConv / C + Pv;
  const total = qConv + U;
  const state: AqueousState = { IOP, qConv, qU: U, shareConv: total > 0 ? qConv / total : 0 };
  return {
    ok: true,
    state,
    trace: [
      ...checked.trace,
      {
        ruleId: 'goldmann-equilibrium',
        inputs: { F, C, U, Pv },
        output: { IOP, qConv, qU: U },
        claimIds: ['goldmann-equilibrium', 'steady-conventional-flow'],
        explanationKey: 'steady-state-balance',
      },
    ],
  };
}
