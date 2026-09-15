import { describe, expect, it } from 'vitest';
import { selectFollowUp } from '../../lib/domain/learning/scheduler.ts';
import type { FollowUpInput } from '../../lib/domain/learning/scheduler.ts';

function makeInput(overrides: Partial<FollowUpInput> = {}): FollowUpInput {
  return {
    pool: ['case-a', 'case-b', 'case-c'],
    seenCaseIds: [],
    lastSeen: {},
    currentCaseId: 'case-current',
    protectedIds: [],
    limitPerSession: 3,
    usedThisSession: 0,
    ...overrides,
  };
}

describe('selectFollowUp unseen preference', () => {
  it('picks smallest-id unseen eligible case', () => {
    expect(selectFollowUp(makeInput({ seenCaseIds: ['case-a'] }))).toBe('case-b');
  });
  it('excludes current case', () => {
    expect(selectFollowUp(makeInput({ pool: ['case-a'], currentCaseId: 'case-a' }))).toBeNull();
  });
  it('excludes protected ids', () => {
    expect(selectFollowUp(makeInput({ pool: ['case-a', 'case-b'], protectedIds: ['case-a'] }))).toBe('case-b');
  });
  it('all protected yields null', () => {
    expect(
      selectFollowUp(makeInput({ pool: ['case-a', 'case-b'], protectedIds: ['case-a', 'case-b'] })),
    ).toBeNull();
  });
});

describe('selectFollowUp fallback and tie-breaks', () => {
  it('falls back to least-recently-seen when all eligible are seen', () => {
    const selected = selectFollowUp(
      makeInput({
        seenCaseIds: ['case-a', 'case-b', 'case-c'],
        lastSeen: { 'case-a': 30, 'case-b': 10, 'case-c': 20 },
      }),
    );
    expect(selected).toBe('case-b');
  });
  it('deterministic id tie-break on equal recency', () => {
    const base = makeInput({
      seenCaseIds: ['case-a', 'case-b', 'case-c'],
      lastSeen: { 'case-a': 5, 'case-b': 5, 'case-c': 5 },
    });
    expect(selectFollowUp(base)).toBe('case-a');
    expect(selectFollowUp(makeInput({ ...base, pool: ['case-c', 'case-b', 'case-a'] }))).toBe('case-a');
  });
  it('unseen selection is stable regardless of pool order', () => {
    expect(selectFollowUp(makeInput({ pool: ['case-c', 'case-b'] }))).toBe('case-b');
  });
});

describe('selectFollowUp limits and exhaustion', () => {
  it('returns null when session limit reached', () => {
    expect(selectFollowUp(makeInput({ usedThisSession: 3, limitPerSession: 3 }))).toBeNull();
    expect(selectFollowUp(makeInput({ usedThisSession: 4, limitPerSession: 3 }))).toBeNull();
  });
  it('selects when under the session limit', () => {
    expect(selectFollowUp(makeInput({ usedThisSession: 2, limitPerSession: 3 }))).toBe('case-a');
  });
  it('empty pool yields null', () => {
    expect(selectFollowUp(makeInput({ pool: [] }))).toBeNull();
  });
  it('does not mutate inputs', () => {
    const input = makeInput({ pool: ['case-c', 'case-a'] });
    const poolCopy = [...input.pool];
    selectFollowUp(input);
    expect(input.pool).toEqual(poolCopy);
  });
});
