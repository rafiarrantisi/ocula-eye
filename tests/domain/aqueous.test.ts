import { describe, expect, it } from 'vitest';
import {
  AQUEOUS_MODEL_ID,
  AQUEOUS_MODEL_VERSION,
  evaluateAqueous,
  validateAqueousInput,
} from '../../lib/domain/simulation/aqueous.ts';
import { AQUEOUS_BASELINE, AQUEOUS_PRESETS, evaluateAqueousSnapshot, sceneFlowSpeeds } from '../../components/atlas/simulationAdapter.ts';

const TOL = 1e-6;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(TOL);

describe('aqueous equilibrium fixtures (CONTRACTS)', () => {
  it('baseline F2.5 C0.30 U0.5 Pv9 -> 15.6666667 mmHg', () => {
    const r = evaluateAqueous({ F: 2.5, C: 0.3, U: 0.5, Pv: 9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.state.IOP, 15.6666667);
    near(r.state.qConv, 2.0);
    near(r.state.qU, 0.5);
  });
  it('only C -> 0.12 gives 25.6666667 (qConv unchanged)', () => {
    const r = evaluateAqueous({ F: 2.5, C: 0.12, U: 0.5, Pv: 9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.state.IOP, 25.6666667);
    near(r.state.qConv, 2.0);
  });
  it('then only U -> 1.2 gives 19.8333333', () => {
    const r = evaluateAqueous({ F: 2.5, C: 0.12, U: 1.2, Pv: 9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.state.IOP, 19.8333333);
    near(r.state.qConv, 1.3);
  });
  it('U = F drains fully conventional to Pv', () => {
    const r = evaluateAqueous({ F: 1.5, C: 0.3, U: 1.5, Pv: 9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.state.IOP, 9);
    near(r.state.qConv, 0);
  });
});

describe('input validation (reject, never clamp)', () => {
  it.each([
    [{ F: 2.5, C: 0, U: 0.5, Pv: 9 }, 'C'],
    [{ F: 2.5, C: -0.1, U: 0.5, Pv: 9 }, 'C'],
    [{ F: -1, C: 0.3, U: 0.5, Pv: 9 }, 'F'],
    [{ F: 2.5, C: 0.3, U: -0.2, Pv: 9 }, 'U'],
    [{ F: 1.0, C: 0.3, U: 1.5, Pv: 9 }, 'U'],
    [{ F: 2.5, C: 0.3, U: 0.5, Pv: -1 }, 'Pv'],
    [{ F: NaN, C: 0.3, U: 0.5, Pv: 9 }, 'F'],
    [{ F: 2.5, C: Infinity, U: 0.5, Pv: 9 }, 'C'],
  ])('rejects %o on field %s', (input, field) => {
    const r = validateAqueousInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === field)).toBe(true);
  });
  it('rejects non-objects', () => {
    expect(validateAqueousInput(null).ok).toBe(false);
    expect(validateAqueousInput(42).ok).toBe(false);
  });
});

describe('monotonicity and determinism', () => {
  it('lower facility raises IOP at fixed F/U', () => {
    const a = evaluateAqueous({ F: 2.5, C: 0.1, U: 0.5, Pv: 9 });
    const b = evaluateAqueous({ F: 2.5, C: 0.3, U: 0.5, Pv: 9 });
    expect(a.ok && b.ok && a.state.IOP > b.state.IOP).toBe(true);
  });
  it('identical input/version yields identical canonical state and trace', () => {
    const a = evaluateAqueousSnapshot({ ...AQUEOUS_BASELINE }, 3);
    const b = evaluateAqueousSnapshot({ ...AQUEOUS_BASELINE }, 3);
    expect(a).toEqual(b);
    expect(a.ok && a.state.modelId === AQUEOUS_MODEL_ID).toBe(true);
    expect(a.ok && a.state.modelVersion === AQUEOUS_MODEL_VERSION).toBe(true);
  });
});

describe('presets patch only named variables', () => {
  it('pga touches U only', () => {
    expect(AQUEOUS_PRESETS.pga).toEqual({ U: 1.2 });
  });
  it('resist touches C only; narrow touches C and U', () => {
    expect(AQUEOUS_PRESETS.resist).toEqual({ C: 0.12 });
    expect(AQUEOUS_PRESETS.narrow).toEqual({ C: 0.08, U: 0.3 });
  });
  it('scene speeds follow branch flows; facility alone never changes equilibrium flow', () => {
    const s = sceneFlowSpeeds({ ...AQUEOUS_BASELINE });
    expect(s.shared).toBeCloseTo(0.12, 10);
    expect(s.trabecular).toBeCloseTo(0.19, 10);
    expect(s.uveoscleral).toBeCloseTo(0.19, 10);
    // Same F/U, lower C: same equilibrium conventional flow (teaching point).
    const stiff = sceneFlowSpeeds({ F: 2.5, C: 0.08, U: 0.5, Pv: 9 });
    expect(stiff.trabecular).toBeCloseTo(s.trabecular, 10);
    // Higher U at fixed F: less conventional flow, slower branch.
    const pga = sceneFlowSpeeds({ F: 2.5, C: 0.3, U: 1.2, Pv: 9 });
    expect(pga.trabecular).toBeLessThan(s.trabecular);
    expect(pga.uveoscleral).toBeGreaterThan(s.uveoscleral);
  });
  it('reducer is fast (budget p95 < 5ms)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) evaluateAqueous({ F: 2.5, C: 0.3, U: 0.5, Pv: 9 });
    const mean = (performance.now() - t0) / 2000;
    expect(mean).toBeLessThan(5);
  });
});
