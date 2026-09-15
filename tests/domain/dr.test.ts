import { describe, expect, it } from 'vitest';
import { resetScenario, resolveRenderBinding, selectMechanism, selectScenario } from '../../lib/domain/simulation/dr.ts';

describe('dr scenario states', () => {
  it('normal_barrier exact state', () => {
    const r = selectScenario('normal_barrier');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.activeMechanismIds).toEqual(['inner-endothelium', 'outer-rpe']);
    expect(r.state.barrier).toBe('intact');
    expect(r.state.perfusion).toBe('preserved');
    expect(r.state.neovascularization).toBe('absent');
  });
  it('leakage exact state', () => {
    const r = selectScenario('leakage');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.activeMechanismIds).toEqual(['inner-endothelium', 'plasma-leakage', 'lipid-deposit']);
    expect(r.state.barrier).toBe('compromised');
    expect(r.state.perfusion).toBe('preserved');
    expect(r.state.neovascularization).toBe('absent');
  });
  it('capillary_nonperfusion exact state', () => {
    const r = selectScenario('capillary_nonperfusion');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.activeMechanismIds).toEqual(['nfl-ischemia']);
    expect(r.state.barrier).toBe('intact');
    expect(r.state.perfusion).toBe('reduced');
    expect(r.state.neovascularization).toBe('absent');
  });
  it('ischemia_neovascularization exact state', () => {
    const r = selectScenario('ischemia_neovascularization');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.activeMechanismIds).toEqual(['nfl-ischemia', 'nv-drive']);
    expect(r.state.barrier).toBe('compromised');
    expect(r.state.perfusion).toBe('reduced');
    expect(r.state.neovascularization).toBe('present');
  });
  it('combined exact state', () => {
    const r = selectScenario('combined');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.activeMechanismIds).toEqual(['plasma-leakage', 'lipid-deposit', 'nfl-ischemia', 'nv-drive']);
    expect(r.state.barrier).toBe('compromised');
    expect(r.state.perfusion).toBe('reduced');
    expect(r.state.neovascularization).toBe('present');
  });
});

describe('dr reset', () => {
  it('reset returns normal_barrier with no leakage/nv', () => {
    const r = resetScenario();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.scenario).toBe('normal_barrier');
    expect(r.state.activeMechanismIds).toEqual(['inner-endothelium', 'outer-rpe']);
    expect(r.state.barrier).toBe('intact');
    expect(r.state.perfusion).toBe('preserved');
    expect(r.state.neovascularization).toBe('absent');
    expect(r.state.activeMechanismIds).not.toContain('plasma-leakage');
    expect(r.state.activeMechanismIds).not.toContain('nv-drive');
  });
});

describe('dr determinism', () => {
  it('two identical calls toEqual', () => {
    const a = selectScenario('combined');
    const b = selectScenario('combined');
    expect(a).toEqual(b);
  });
});

describe('dr errors', () => {
  it('unknown scenario', () => {
    const r = selectScenario('nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([{ field: 'scenario', code: 'unknown-scenario' }]);
  });
  it('unknown mechanism', () => {
    const s = selectScenario('leakage');
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const r = selectMechanism(s.state, 'nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([{ field: 'mechanismId', code: 'unknown-mechanism' }]);
  });
  it('not-in-scenario mechanism', () => {
    const s = selectScenario('normal_barrier');
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const r = selectMechanism(s.state, 'nv-drive');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([{ field: 'mechanismId', code: 'not-in-scenario' }]);
  });
  it('known listed mechanism appends focus without duplicates', () => {
    const s = selectScenario('leakage');
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const first = selectMechanism(s.state, 'plasma-leakage');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.activeMechanismIds).toEqual(s.state.activeMechanismIds);
    expect(first.state.trace.map((t) => t.ruleId)).toEqual(['validate', 'scenario-load', 'mechanism-focus']);
    const second = selectMechanism(first.state, 'plasma-leakage');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.trace.length).toBe(first.state.trace.length);
  });
});

describe('dr bindings', () => {
  it('resolveRenderBinding unknown throws', () => {
    expect(() => resolveRenderBinding([{ id: 'a' }], 'missing')).toThrow('unknown-binding:missing');
  });
  it('resolveRenderBinding known returns binding', () => {
    expect(resolveRenderBinding([{ id: 'a' }], 'a')).toEqual({ id: 'a' });
  });
});

describe('dr performance', () => {
  it('reducer mean <5ms over 2000 selectScenario calls', () => {
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) selectScenario('leakage');
    const mean = (performance.now() - t0) / 2000;
    expect(mean).toBeLessThan(5);
  });
});
