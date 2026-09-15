// Pure localization + grade scoring for the imaging slice.
// Null rules are exact: missing predictions leave precision null, missing
// targets leave recall null, and F1 is null only when there is nothing to
// score. No combined competence percentage is computed anywhere here.
// No React, Three, DOM, clock, network or LLM imports.
import { pointInPolygon } from './matching.ts';

export interface LocalizationMark {
  id: string;
  classId: string;
  x: number;
  y: number;
}

export interface LocalizationTarget {
  id: string;
  /** True class of the lesion (server-side rubric). */
  classId: string;
  acceptedClasses: string[];
  polygon: number[][];
}

export interface LocalizationInput {
  marks: LocalizationMark[];
  targets: LocalizationTarget[];
  /** One-to-one [markId, targetId] pairs, e.g. from matchMarksToTargets. */
  pairs: [string, string][];
}

export interface ClassScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface MacroScore {
  precision: number | null;
  precisionDenominator: number;
  recall: number | null;
  recallDenominator: number;
  f1: number | null;
  f1Denominator: number;
}

export interface LocalizationScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** Set only when there were no targets and no marks. */
  tag?: 'correct_no_target';
  perClass: Record<string, ClassScore>;
  macro: MacroScore;
  /** Unmatched marks colocated with an already-matched same-class target. */
  duplicateMarkIds: string[];
}

function prf(
  tp: number,
  fp: number,
  fn: number,
): { precision: number | null; recall: number | null; f1: number | null } {
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  let f1: number | null;
  if (tp + fp + fn === 0) f1 = null;
  else if (precision === null || recall === null) f1 = 0;
  else if (precision + recall === 0) f1 = 0;
  else f1 = (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function average(values: (number | null)[]): { value: number | null; denominator: number } {
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length === 0) return { value: null, denominator: 0 };
  return { value: defined.reduce((a, b) => a + b, 0) / defined.length, denominator: defined.length };
}

export function computeLocalizationScore(input: LocalizationInput): LocalizationScore {
  const markById = new Map(input.marks.map((k) => [k.id, k]));
  const targetById = new Map(input.targets.map((k) => [k.id, k]));
  const tpBy = new Map<string, number>();
  const fpBy = new Map<string, number>();
  const fnBy = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  const seenMarks = new Set<string>();
  const seenTargets = new Set<string>();
  const duplicateMarkIds: string[] = [];

  for (const [markId, targetId] of input.pairs) {
    const mark = markById.get(markId);
    const target = targetById.get(targetId);
    if (!mark || !target) continue;
    if (seenMarks.has(markId)) {
      // One mark never matches twice: extras are false positives.
      bump(fpBy, mark.classId);
      duplicateMarkIds.push(markId);
      continue;
    }
    if (seenTargets.has(targetId)) {
      // Target already taken: extra mark is a false positive duplicate.
      bump(fpBy, mark.classId);
      duplicateMarkIds.push(markId);
      seenMarks.add(markId);
      continue;
    }
    seenMarks.add(markId);
    seenTargets.add(targetId);
    bump(tpBy, mark.classId);
  }

  for (const mark of input.marks) {
    if (seenMarks.has(mark.id)) continue;
    bump(fpBy, mark.classId);
    const colocated = input.targets.some(
      (target) =>
        seenTargets.has(target.id) &&
        target.acceptedClasses.includes(mark.classId) &&
        pointInPolygon(target.polygon, mark.x, mark.y),
    );
    if (colocated) duplicateMarkIds.push(mark.id);
  }
  for (const target of input.targets) {
    if (!seenTargets.has(target.id)) bump(fnBy, target.classId);
  }

  const classes = new Set<string>([...tpBy.keys(), ...fpBy.keys(), ...fnBy.keys()]);
  const perClass: Record<string, ClassScore> = {};
  for (const cls of [...classes].sort()) {
    const tp = tpBy.get(cls) ?? 0;
    const fp = fpBy.get(cls) ?? 0;
    const fn = fnBy.get(cls) ?? 0;
    perClass[cls] = { tp, fp, fn, ...prf(tp, fp, fn) };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const cls of classes) {
    tp += tpBy.get(cls) ?? 0;
    fp += fpBy.get(cls) ?? 0;
    fn += fnBy.get(cls) ?? 0;
  }
  const overall = prf(tp, fp, fn);
  const macroP = average(Object.values(perClass).map((c) => c.precision));
  const macroR = average(Object.values(perClass).map((c) => c.recall));
  const macroF = average(Object.values(perClass).map((c) => c.f1));
  const score: LocalizationScore = {
    tp,
    fp,
    fn,
    ...overall,
    perClass,
    macro: {
      precision: macroP.value,
      precisionDenominator: macroP.denominator,
      recall: macroR.value,
      recallDenominator: macroR.denominator,
      f1: macroF.value,
      f1Denominator: macroF.denominator,
    },
    duplicateMarkIds: [...duplicateMarkIds].sort(),
  };
  if (input.marks.length === 0 && input.targets.length === 0) {
    score.tag = 'correct_no_target';
  }
  return score;
}

export type GradeOutcome = 'correct' | 'incorrect' | 'unanswered' | 'not_assessable';

export interface GradeInput {
  answer?: string;
  accepted: string[];
  allowNotAssessable: boolean;
  rubricAgrees: boolean;
}

export interface GradeResult {
  outcome: GradeOutcome;
  /** Ordinal distance; defined only for a singleton grade-N reference. */
  distance?: number;
}

/** Sentinel answer a learner submits when the case cannot be assessed. */
export const NOT_ASSESSABLE_ANSWER = 'not_assessable';

function parseGradeOrdinal(value: string): number | undefined {
  const m = /(\d+)\s*$/.exec(value);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

export function scoreGrade(input: GradeInput): GradeResult {
  if (input.answer === undefined) return { outcome: 'unanswered' };
  if (input.allowNotAssessable && input.answer === NOT_ASSESSABLE_ANSWER) {
    return { outcome: 'not_assessable' };
  }
  const outcome: GradeOutcome = input.rubricAgrees ? 'correct' : 'incorrect';
  let distance: number | undefined;
  if (input.accepted.length === 1) {
    const ref = parseGradeOrdinal(input.accepted[0]);
    const got = parseGradeOrdinal(input.answer);
    if (ref !== undefined && got !== undefined) distance = Math.abs(got - ref);
  }
  return distance === undefined ? { outcome } : { outcome, distance };
}
