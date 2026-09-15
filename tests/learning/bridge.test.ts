import { describe, expect, it } from 'vitest';
import { matchBridgeRule } from '../../lib/domain/learning/bridge.ts';
import type { BridgeRule } from '../../lib/domain/learning/bridge.ts';

function makeRule(overrides: Partial<BridgeRule> = {}): BridgeRule {
  return {
    id: 'rule-1',
    version: '0.1.0',
    triggerConceptIds: ['concept-a'],
    caseFindingIds: ['finding-1'],
    mechanismIds: ['mech-1'],
    structureIds: ['struct-1'],
    scenarioId: 'scenario-1',
    approvedExplanationKey: 'explain-1',
    followupPoolIds: ['case-x'],
    review: { status: 'approved', scope: 'session' },
    ...overrides,
  };
}

describe('bridge rule matching', () => {
  it('matches when concept and finding both intersect', () => {
    const rules = [makeRule()];
    const matched = matchBridgeRule(rules, { conceptIds: ['concept-a', 'other'], caseFindingIds: ['finding-1'] });
    expect(matched).toEqual(rules);
  });
  it('no match when concept misses', () => {
    const rules = [makeRule()];
    expect(matchBridgeRule(rules, { conceptIds: ['concept-zzz'], caseFindingIds: ['finding-1'] })).toEqual([]);
  });
  it('no match when finding misses', () => {
    const rules = [makeRule()];
    expect(matchBridgeRule(rules, { conceptIds: ['concept-a'], caseFindingIds: ['finding-zzz'] })).toEqual([]);
  });
  it('empty triggerConceptIds never matches', () => {
    const rules = [makeRule({ triggerConceptIds: [] })];
    expect(matchBridgeRule(rules, { conceptIds: ['concept-a'], caseFindingIds: ['finding-1'] })).toEqual([]);
  });
  it('empty caseFindingIds never matches', () => {
    const rules = [makeRule({ caseFindingIds: [] })];
    expect(matchBridgeRule(rules, { conceptIds: ['concept-a'], caseFindingIds: ['finding-1'] })).toEqual([]);
  });
  it('empty input lists never match', () => {
    const rules = [makeRule()];
    expect(matchBridgeRule(rules, { conceptIds: [], caseFindingIds: ['finding-1'] })).toEqual([]);
    expect(matchBridgeRule(rules, { conceptIds: ['concept-a'], caseFindingIds: [] })).toEqual([]);
    expect(matchBridgeRule(rules, { conceptIds: [], caseFindingIds: [] })).toEqual([]);
  });
  it('returns only matching rules in rule order', () => {
    const yesA = makeRule({ id: 'yes-a' });
    const no = makeRule({ id: 'no', triggerConceptIds: ['concept-zzz'] });
    const yesB = makeRule({ id: 'yes-b', caseFindingIds: ['finding-1', 'finding-2'] });
    const matched = matchBridgeRule([yesA, no, yesB], { conceptIds: ['concept-a'], caseFindingIds: ['finding-2'] });
    expect(matched.map((r) => r.id)).toEqual(['yes-b']);
  });
  it('empty rules match nothing', () => {
    expect(matchBridgeRule([], { conceptIds: ['concept-a'], caseFindingIds: ['finding-1'] })).toEqual([]);
  });
  it('deterministic across calls', () => {
    const rules = [makeRule(), makeRule({ id: 'rule-2' })];
    const input = { conceptIds: ['concept-a'], caseFindingIds: ['finding-1'] };
    expect(matchBridgeRule(rules, input)).toEqual(matchBridgeRule(rules, input));
  });
});
