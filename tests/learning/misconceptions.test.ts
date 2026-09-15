import { describe, expect, it } from 'vitest';
import { applyClearing, evaluateMisconceptions } from '../../lib/domain/learning/misconceptions.ts';
import type { ErrorEvent, FlagStatus } from '../../lib/domain/learning/misconceptions.ts';

function miss(conceptId: string, caseId: string, taskId = 'task-1'): ErrorEvent {
  return { conceptId, caseId, taskId, correct: false };
}

function hit(conceptId: string, caseId: string, taskId = 'task-1'): ErrorEvent {
  return { conceptId, caseId, taskId, correct: true };
}

describe('evaluateMisconceptions', () => {
  it('empty events yield no flags', () => {
    expect(evaluateMisconceptions([])).toEqual([]);
  });
  it('all-correct events yield no flags', () => {
    expect(evaluateMisconceptions([hit('c1', 'case-1'), hit('c1', 'case-2')])).toEqual([]);
  });
  it('single error yields provisional', () => {
    expect(evaluateMisconceptions([miss('c1', 'case-1')])).toEqual([
      { conceptId: 'c1', status: 'provisional', opportunities: 1, errors: 1 },
    ]);
  });
  it('same-image retry does not count as independent evidence', () => {
    const flags = evaluateMisconceptions([miss('c1', 'case-1', 'task-1'), miss('c1', 'case-1', 'task-2')]);
    expect(flags).toEqual([{ conceptId: 'c1', status: 'provisional', opportunities: 2, errors: 2 }]);
  });
  it('two errors on distinct images yield repeated', () => {
    const flags = evaluateMisconceptions([miss('c1', 'case-1'), miss('c1', 'case-2')]);
    expect(flags).toEqual([{ conceptId: 'c1', status: 'repeated', opportunities: 2, errors: 2 }]);
  });
  it('counts opportunities including correct attempts', () => {
    const flags = evaluateMisconceptions([hit('c1', 'case-0'), miss('c1', 'case-1'), miss('c1', 'case-2')]);
    expect(flags).toEqual([{ conceptId: 'c1', status: 'repeated', opportunities: 3, errors: 2 }]);
  });
  it('distinguishes first miss from repeated across concepts and sorts by conceptId', () => {
    const flags = evaluateMisconceptions([
      miss('c-b', 'case-1'),
      miss('c-a', 'case-1'),
      miss('c-a', 'case-2'),
    ]);
    expect(flags).toEqual([
      { conceptId: 'c-a', status: 'repeated', opportunities: 2, errors: 2 },
      { conceptId: 'c-b', status: 'provisional', opportunities: 1, errors: 1 },
    ]);
  });
});

describe('applyClearing', () => {
  it('two later successes on distinct cases clear provisional', () => {
    const flags: FlagStatus[] = [{ conceptId: 'c1', status: 'provisional', opportunities: 1, errors: 1 }];
    const cleared = applyClearing(flags, [hit('c1', 'case-1'), hit('c1', 'case-2')]);
    expect(cleared).toEqual([{ conceptId: 'c1', status: 'none', opportunities: 1, errors: 1 }]);
  });
  it('two later successes on distinct cases clear repeated', () => {
    const flags: FlagStatus[] = [{ conceptId: 'c1', status: 'repeated', opportunities: 2, errors: 2 }];
    const cleared = applyClearing(flags, [hit('c1', 'case-3'), hit('c1', 'case-4')]);
    expect(cleared).toEqual([{ conceptId: 'c1', status: 'none', opportunities: 2, errors: 2 }]);
  });
  it('single later success does not clear', () => {
    const flags: FlagStatus[] = [{ conceptId: 'c1', status: 'provisional', opportunities: 1, errors: 1 }];
    expect(applyClearing(flags, [hit('c1', 'case-1')])).toEqual(flags);
  });
  it('two later successes on the same case do not clear', () => {
    const flags: FlagStatus[] = [{ conceptId: 'c1', status: 'repeated', opportunities: 2, errors: 2 }];
    expect(applyClearing(flags, [hit('c1', 'case-1', 'task-1'), hit('c1', 'case-1', 'task-2')])).toEqual(flags);
  });
  it('later incorrect events do not count toward clearing', () => {
    const flags: FlagStatus[] = [{ conceptId: 'c1', status: 'provisional', opportunities: 1, errors: 1 }];
    expect(applyClearing(flags, [miss('c1', 'case-1'), miss('c1', 'case-2')])).toEqual(flags);
  });
  it('none flags stay none and output is sorted', () => {
    const flags: FlagStatus[] = [
      { conceptId: 'c-b', status: 'provisional', opportunities: 1, errors: 1 },
      { conceptId: 'c-a', status: 'none', opportunities: 2, errors: 0 },
    ];
    const cleared = applyClearing(flags, [hit('c-b', 'case-1'), hit('c-b', 'case-2')]);
    expect(cleared).toEqual([
      { conceptId: 'c-a', status: 'none', opportunities: 2, errors: 0 },
      { conceptId: 'c-b', status: 'none', opportunities: 1, errors: 1 },
    ]);
  });
});
