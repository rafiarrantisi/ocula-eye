import { describe, expect, it } from 'vitest';
import {
  matchMarksToTargets,
  pointInPolygon,
} from '../../lib/domain/imaging/matching.ts';
import type { MatchMark, MatchTarget } from '../../lib/domain/imaging/matching.ts';
import { validateMark } from '../../lib/domain/imaging/coordinates.ts';
import overlapCase from '../fixtures/imaging/synthetic-overlap-case.json';

interface FixtureMark {
  id: string;
  classId: string;
  x: number;
  y: number;
}

interface FixtureTarget {
  id: string;
  classId: string;
  acceptedClasses: string[];
  polygon: number[][];
  cx: number;
  cy: number;
}

const marksOf = (rows: FixtureMark[]): MatchMark[] =>
  rows.map((r) => ({ id: r.id, classId: r.classId, x: r.x, y: r.y }));
const targetsOf = (rows: FixtureTarget[]): MatchTarget[] =>
  rows.map((r) => ({
    id: r.id,
    acceptedClasses: [...r.acceptedClasses],
    polygon: r.polygon.map((p) => [...p]),
    cx: r.cx,
    cy: r.cy,
  }));

/** Exhaustive oracle: tries every assignment (mark -> target | none). */
function bruteForce(
  marks: FixtureMark[],
  targets: FixtureTarget[],
): { cardinality: number; cost: number; pairs: [string, string][] } {
  const edge = (mi: number, ti: number): number | null => {
    const k = marks[mi];
    const t = targets[ti];
    if (!t.acceptedClasses.includes(k.classId)) return null;
    if (!pointInPolygon(t.polygon, k.x, k.y)) return null;
    return Math.hypot(k.x - t.cx, k.y - t.cy) / Math.SQRT2;
  };
  const keyOf = (pairs: [string, string][]): string =>
    [...pairs]
      .sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1))
      .map((p) => `${p[0]}>${p[1]}`)
      .join('|');
  let best = { cardinality: -1, cost: Number.POSITIVE_INFINITY, key: '', pairs: [] as [string, string][] };
  const used = new Array<boolean>(targets.length).fill(false);
  const current: [string, string][] = [];
  const visit = (mi: number, cost: number): void => {
    if (mi === marks.length) {
      const key = keyOf(current);
      if (
        current.length > best.cardinality ||
        (current.length === best.cardinality &&
          (cost < best.cost - 1e-12 || (Math.abs(cost - best.cost) <= 1e-12 && key < best.key)))
      ) {
        best = { cardinality: current.length, cost, key, pairs: [...current] };
      }
      return;
    }
    visit(mi + 1, cost);
    for (let ti = 0; ti < targets.length; ti++) {
      const c = edge(mi, ti);
      if (c === null || used[ti]) continue;
      used[ti] = true;
      current.push([marks[mi].id, targets[ti].id]);
      visit(mi + 1, cost + c);
      current.pop();
      used[ti] = false;
    }
  };
  visit(0, 0);
  best.pairs.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
  return best;
}

function baseCostOf(
  pairs: [string, string][],
  marks: FixtureMark[],
  targets: FixtureTarget[],
): number {
  const byMark = new Map(marks.map((k) => [k.id, k]));
  const byTarget = new Map(targets.map((k) => [k.id, k]));
  return pairs.reduce((sum, [mi, ti]) => {
    const k = byMark.get(mi);
    const t = byTarget.get(ti);
    if (!k || !t) throw new Error('oracle-fixture-mismatch');
    return sum + Math.hypot(k.x - t.cx, k.y - t.cy) / Math.SQRT2;
  }, 0);
}

const overlapMarks = overlapCase.marks as FixtureMark[];
const overlapTargets = overlapCase.targets as FixtureTarget[];

describe('pointInPolygon (strict interior)', () => {
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  it('accepts interior points', () => {
    expect(pointInPolygon(square, 0.5, 0.5)).toBe(true);
  });
  it('rejects exterior points', () => {
    expect(pointInPolygon(square, 1.5, 0.5)).toBe(false);
  });
  it('rejects edge and vertex points (strict)', () => {
    expect(pointInPolygon(square, 0, 0.5)).toBe(false);
    expect(pointInPolygon(square, 0.5, 0)).toBe(false);
    expect(pointInPolygon(square, 0, 0)).toBe(false);
  });
  it('works with unclosed rings', () => {
    const tri = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    expect(pointInPolygon(tri, 0.1, 0.1)).toBe(true);
    expect(pointInPolygon(tri, 0.9, 0.9)).toBe(false);
  });
});

describe('basic matching', () => {
  it('pairs a correct mark with its target', () => {
    const r = matchMarksToTargets(marksOf([overlapMarks[1]]), targetsOf([overlapTargets[1]]));
    expect(r.pairs).toEqual([['m2', 't2']]);
    expect(r.unmatchedMarkIds).toEqual([]);
    expect(r.unmatchedTargetIds).toEqual([]);
  });
  it('rejects a wrong-class mark inside the polygon', () => {
    const r = matchMarksToTargets(
      [{ id: 'w1', classId: 'hard_exudate', x: 0.6, y: 0.2 }],
      targetsOf([overlapTargets[1]]),
    );
    expect(r.pairs).toEqual([]);
    expect(r.unmatchedMarkIds).toEqual(['w1']);
    expect(r.unmatchedTargetIds).toEqual(['t2']);
  });
  it('pairs only one of two duplicate marks on the same target', () => {
    const r = matchMarksToTargets(
      [
        { id: 'd1', classId: 'hemorrhage', x: 0.2, y: 0.2 },
        { id: 'd2', classId: 'hemorrhage', x: 0.21, y: 0.19 },
      ],
      [
        {
          id: 't1',
          acceptedClasses: ['hemorrhage'],
          polygon: [
            [0.1, 0.1],
            [0.3, 0.1],
            [0.3, 0.3],
            [0.1, 0.3],
          ],
          cx: 0.2,
          cy: 0.2,
        },
      ],
    );
    expect(r.pairs).toHaveLength(1);
    expect(r.unmatchedMarkIds).toHaveLength(1);
    expect(r.unmatchedTargetIds).toEqual([]);
  });
});

describe('overlap trap vs exhaustive oracle', () => {
  it('finds maximum cardinality where greedy fails', () => {
    const got = matchMarksToTargets(marksOf(overlapMarks), targetsOf(overlapTargets));
    // Nearest-first greedy would bind m1->t2 and strand m2 (cardinality 1).
    expect(got.pairs).toEqual([
      ['m1', 't1'],
      ['m2', 't2'],
    ]);
    const oracle = bruteForce(overlapMarks, overlapTargets);
    expect(oracle.cardinality).toBe(2);
    expect(got.pairs).toHaveLength(oracle.cardinality);
    expect(baseCostOf(got.pairs, overlapMarks, overlapTargets)).toBeCloseTo(oracle.cost, 9);
  });
  it('matches the oracle on a 3-mark sharing case (cardinality, cost, lexical order)', () => {
    const marks: FixtureMark[] = [
      { id: 'm1', classId: 'hemorrhage', x: 0.1, y: 0.1 },
      { id: 'm2', classId: 'hemorrhage', x: 0.9, y: 0.1 },
      { id: 'm3', classId: 'hemorrhage', x: 0.4, y: 0.4 },
    ];
    const targets: FixtureTarget[] = [
      {
        id: 'tA',
        classId: 'hemorrhage',
        acceptedClasses: ['hemorrhage'],
        polygon: [
          [0, 0],
          [0.5, 0],
          [0.5, 0.5],
          [0, 0.5],
        ],
        cx: 0.25,
        cy: 0.25,
      },
      {
        id: 'tB',
        classId: 'hemorrhage',
        acceptedClasses: ['hemorrhage'],
        polygon: [
          [0.5, 0],
          [1, 0],
          [1, 0.5],
          [0.5, 0.5],
        ],
        cx: 0.75,
        cy: 0.25,
      },
    ];
    const got = matchMarksToTargets(marksOf(marks), targetsOf(targets));
    const oracle = bruteForce(marks, targets);
    expect(oracle.cardinality).toBe(2);
    expect(got.pairs).toEqual(oracle.pairs);
    expect(baseCostOf(got.pairs, marks, targets)).toBeCloseTo(oracle.cost, 12);
  });
});

describe('bounds and budgets', () => {
  it('flags out-of-bounds marks via validateMark', () => {
    const errors = validateMark({ id: 'oob', x: 1.2, y: 0.5, classId: 'hemorrhage' });
    expect(errors).toContainEqual({ field: 'x', code: 'out-of-bounds' });
  });
  it('enforces the 30-item maximum on marks', () => {
    const many: MatchMark[] = [];
    for (let i = 0; i < 31; i++) many.push({ id: `m${i}`, classId: 'hemorrhage', x: 0.5, y: 0.5 });
    let code: unknown;
    try {
      matchMarksToTargets(many, []);
    } catch (e: unknown) {
      code = (e as { code?: unknown }).code;
    }
    expect(code).toBe('too-many');
  });
  it('enforces the 30-item maximum on targets', () => {
    const many: MatchTarget[] = [];
    for (let i = 0; i < 31; i++) {
      many.push({ id: `t${i}`, acceptedClasses: ['hemorrhage'], polygon: [[0, 0], [1, 0], [1, 1], [0, 1]], cx: 0.5, cy: 0.5 });
    }
    let code: unknown;
    try {
      matchMarksToTargets([], many);
    } catch (e: unknown) {
      code = (e as { code?: unknown }).code;
    }
    expect(code).toBe('too-many');
  });
});

describe('lexical tie-break determinism', () => {
  const twin = (id: string): MatchTarget => ({
    id,
    acceptedClasses: ['hemorrhage'],
    polygon: [
      [0.1, 0.1],
      [0.3, 0.1],
      [0.3, 0.3],
      [0.1, 0.3],
    ],
    cx: 0.2,
    cy: 0.2,
  });
  it('is stable across repeated runs of an exact tie', () => {
    const marks: MatchMark[] = [
      { id: 'm1', classId: 'hemorrhage', x: 0.2, y: 0.2 },
      { id: 'm2', classId: 'hemorrhage', x: 0.2, y: 0.2 },
    ];
    const first = matchMarksToTargets(marks, [twin('t1'), twin('t2')]);
    const second = matchMarksToTargets(marks, [twin('t1'), twin('t2')]);
    expect(first.pairs).toHaveLength(2);
    expect(first).toEqual(second);
  });
  it('prefers the lexically smaller target independent of input order', () => {
    const marks: MatchMark[] = [{ id: 'm1', classId: 'hemorrhage', x: 0.2, y: 0.2 }];
    const forward = matchMarksToTargets(marks, [twin('t1'), twin('t2')]);
    const reversed = matchMarksToTargets(marks, [twin('t2'), twin('t1')]);
    expect(forward.pairs).toEqual([['m1', 't1']]);
    expect(reversed.pairs).toEqual([['m1', 't1']]);
  });
});
