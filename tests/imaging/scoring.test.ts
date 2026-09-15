import { describe, expect, it } from 'vitest';
import { matchMarksToTargets } from '../../lib/domain/imaging/matching.ts';
import type { MatchMark, MatchTarget } from '../../lib/domain/imaging/matching.ts';
import {
  computeLocalizationScore,
  scoreGrade,
} from '../../lib/domain/imaging/scoring.ts';
import type { LocalizationMark, LocalizationTarget } from '../../lib/domain/imaging/scoring.ts';
import mixedCase from '../fixtures/imaging/synthetic-mixed-case.json';

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

const mixedMarks = mixedCase.marks as FixtureMark[];
const mixedTargets = mixedCase.targets as FixtureTarget[];

const toMatchMarks = (rows: FixtureMark[]): MatchMark[] =>
  rows.map((r) => ({ id: r.id, classId: r.classId, x: r.x, y: r.y }));
const toMatchTargets = (rows: FixtureTarget[]): MatchTarget[] =>
  rows.map((r) => ({
    id: r.id,
    acceptedClasses: [...r.acceptedClasses],
    polygon: r.polygon.map((p) => [...p]),
    cx: r.cx,
    cy: r.cy,
  }));
const toScoreMarks = (rows: FixtureMark[]): LocalizationMark[] =>
  rows.map((r) => ({ id: r.id, classId: r.classId, x: r.x, y: r.y }));
const toScoreTargets = (rows: FixtureTarget[]): LocalizationTarget[] =>
  rows.map((r) => ({
    id: r.id,
    classId: r.classId,
    acceptedClasses: [...r.acceptedClasses],
    polygon: r.polygon.map((p) => [...p]),
  }));

describe('null-rule branches', () => {
  it('no targets + no marks -> f1 null with correct_no_target tag', () => {
    const s = computeLocalizationScore({ marks: [], targets: [], pairs: [] });
    expect(s.f1).toBeNull();
    expect(s.precision).toBeNull();
    expect(s.recall).toBeNull();
    expect(s.tag).toBe('correct_no_target');
    expect(s.perClass).toEqual({});
  });
  it('targets + no marks -> recall 0, F1 0, precision null', () => {
    const s = computeLocalizationScore({
      marks: [],
      targets: toScoreTargets([mixedTargets[2]]),
      pairs: [],
    });
    expect(s.tp).toBe(0);
    expect(s.fn).toBe(1);
    expect(s.recall).toBe(0);
    expect(s.f1).toBe(0);
    expect(s.precision).toBeNull();
    expect(s.tag).toBeUndefined();
  });
  it('no targets + false marks -> precision 0, F1 0, recall null', () => {
    const s = computeLocalizationScore({
      marks: toScoreMarks([mixedMarks[0]]),
      targets: [],
      pairs: [],
    });
    expect(s.fp).toBe(1);
    expect(s.precision).toBe(0);
    expect(s.f1).toBe(0);
    expect(s.recall).toBeNull();
    expect(s.tag).toBeUndefined();
  });
});

describe('localization counting', () => {
  it('scores a perfect single match as F1 1', () => {
    const matched = matchMarksToTargets(toMatchMarks([mixedMarks[0]]), toMatchTargets([mixedTargets[0]]));
    expect(matched.pairs).toEqual([['m1', 't1']]);
    const s = computeLocalizationScore({
      marks: toScoreMarks([mixedMarks[0]]),
      targets: toScoreTargets([mixedTargets[0]]),
      pairs: matched.pairs,
    });
    expect(s.tp).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.f1).toBe(1);
  });
  it('counts a wrong-class mark as FP in the chosen class + FN in the actual class', () => {
    const s = computeLocalizationScore({
      marks: toScoreMarks([mixedMarks[2]]),
      targets: toScoreTargets([mixedTargets[1]]),
      pairs: [],
    });
    expect(s.perClass['hard_exudate']).toMatchObject({ tp: 0, fp: 1, fn: 0, precision: 0 });
    expect(s.perClass['hard_exudate'].recall).toBeNull();
    expect(s.perClass['microaneurysm']).toMatchObject({ tp: 0, fp: 0, fn: 1, recall: 0 });
    expect(s.perClass['microaneurysm'].precision).toBeNull();
    expect(s.f1).toBe(0);
  });
  it('flags duplicate marks on the same target as FP duplicates', () => {
    const matched = matchMarksToTargets(toMatchMarks(mixedMarks), toMatchTargets(mixedTargets));
    expect(matched.pairs).toEqual([
      ['m1', 't1'],
      ['m4', 't2'],
    ]);
    const s = computeLocalizationScore({
      marks: toScoreMarks(mixedMarks),
      targets: toScoreTargets(mixedTargets),
      pairs: matched.pairs,
    });
    expect(s.tp).toBe(2);
    expect(s.fp).toBe(2);
    expect(s.fn).toBe(1);
    expect(s.duplicateMarkIds).toEqual(['m2']);
  });
});

describe('per-class and macro denominators', () => {
  it('reports the mixed fixture with exact per-class and macro values', () => {
    const matched = matchMarksToTargets(toMatchMarks(mixedMarks), toMatchTargets(mixedTargets));
    const s = computeLocalizationScore({
      marks: toScoreMarks(mixedMarks),
      targets: toScoreTargets(mixedTargets),
      pairs: matched.pairs,
    });
    expect(s.precision).toBeCloseTo(0.5, 12);
    expect(s.recall).toBeCloseTo(2 / 3, 12);
    expect(s.f1).toBeCloseTo(2 * 0.5 * (2 / 3) / (0.5 + 2 / 3), 12);
    expect(s.perClass['hemorrhage']).toMatchObject({ tp: 1, fp: 1, fn: 0 });
    expect(s.perClass['hemorrhage'].precision).toBeCloseTo(0.5, 12);
    expect(s.perClass['hemorrhage'].recall).toBe(1);
    expect(s.perClass['hard_exudate']).toMatchObject({ tp: 0, fp: 1, fn: 0, precision: 0, f1: 0 });
    expect(s.perClass['hard_exudate'].recall).toBeNull();
    expect(s.perClass['microaneurysm']).toMatchObject({ tp: 1, fp: 0, fn: 0 });
    expect(s.perClass['cotton_wool_spot']).toMatchObject({ tp: 0, fp: 0, fn: 1, recall: 0, f1: 0 });
    expect(s.perClass['cotton_wool_spot'].precision).toBeNull();
    // Macro averages exclude undefined classes; denominators are recorded.
    expect(s.macro.precisionDenominator).toBe(3);
    expect(s.macro.precision).toBeCloseTo((0.5 + 0 + 1) / 3, 12);
    expect(s.macro.recallDenominator).toBe(3);
    expect(s.macro.recall).toBeCloseTo((1 + 1 + 0) / 3, 12);
    expect(s.macro.f1Denominator).toBe(4);
  });
});

describe('grade scoring', () => {
  const accepted = ['grade-1', 'grade-2', 'grade-3'];
  it('marks rubric agreement as correct', () => {
    expect(
      scoreGrade({ answer: 'grade-2', accepted, allowNotAssessable: false, rubricAgrees: true }),
    ).toEqual({ outcome: 'correct' });
  });
  it('marks rubric disagreement as incorrect', () => {
    expect(
      scoreGrade({ answer: 'grade-3', accepted, allowNotAssessable: false, rubricAgrees: false }),
    ).toEqual({ outcome: 'incorrect' });
  });
  it('marks a missing answer as unanswered', () => {
    expect(
      scoreGrade({ answer: undefined, accepted, allowNotAssessable: false, rubricAgrees: false }),
    ).toEqual({ outcome: 'unanswered' });
  });
  it('marks the sentinel as not_assessable only when allowed', () => {
    expect(
      scoreGrade({ answer: 'not_assessable', accepted, allowNotAssessable: true, rubricAgrees: false }),
    ).toEqual({ outcome: 'not_assessable' });
    expect(
      scoreGrade({ answer: 'not_assessable', accepted, allowNotAssessable: false, rubricAgrees: false }),
    ).toEqual({ outcome: 'incorrect' });
  });
  it('reports ordinal distance only for a singleton grade-N reference', () => {
    const off = scoreGrade({
      answer: 'grade-4',
      accepted: ['grade-2'],
      allowNotAssessable: false,
      rubricAgrees: false,
    });
    expect(off).toEqual({ outcome: 'incorrect', distance: 2 });
    const multi = scoreGrade({
      answer: 'grade-4',
      accepted: ['grade-2', 'grade-3'],
      allowNotAssessable: false,
      rubricAgrees: false,
    });
    expect(multi.distance).toBeUndefined();
    const nominal = scoreGrade({
      answer: 'present',
      accepted: ['absent'],
      allowNotAssessable: false,
      rubricAgrees: true,
    });
    expect(nominal).toEqual({ outcome: 'correct' });
  });
});
