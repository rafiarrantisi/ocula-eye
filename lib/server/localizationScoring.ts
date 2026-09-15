import {
  computeLocalizationScore,
  type LocalizationMark,
  type LocalizationScore,
  type LocalizationTarget,
} from '../domain/imaging/scoring.ts';
import { matchMarksToTargets, pointInPolygon } from '../domain/imaging/matching.ts';

export interface LocTruthTarget {
  id: string;
  classId: string;
  polygon: number[][];
  cx: number;
  cy: number;
}

export interface LocTruth {
  taskId: string;
  roi: { polygon: number[][] };
  targets: LocTruthTarget[];
  ignored: { polygon: number[][]; reason: string }[];
  acceptedClasses: string[];
}

export interface LocScoreResult {
  taskId: string;
  score: LocalizationScore;
  matchPairs: [string, string][];
  unscoredMarkIds: string[];
  ignoredMarkIds: string[];
}

export function markInRoi(mark: { x: number; y: number }, roi: { polygon: number[][] }): boolean {
  return pointInPolygon(roi.polygon, mark.x, mark.y);
}

/** Score one localization task. Marks inside ignored regions are unscored
 * (never FP). Throws {status:422} shaped errors on malformed input. */
export function scoreLocalizationTask(
  marks: { id: string; classId: string; x: number; y: number }[],
  truth: LocTruth,
): LocScoreResult {
  const ignoredMarkIds: string[] = [];
  const scored: LocalizationMark[] = [];
  for (const m of marks) {
    if (truth.ignored.some((r) => pointInPolygon(r.polygon, m.x, m.y))) {
      ignoredMarkIds.push(m.id);
    } else {
      scored.push(m);
    }
  }
  const targets: LocalizationTarget[] = truth.targets.map((t) => ({
    id: t.id,
    classId: t.classId,
    acceptedClasses: truth.acceptedClasses,
    polygon: t.polygon,
  }));
  const matched = matchMarksToTargets(
    scored.map((m) => ({ id: m.id, classId: m.classId, x: m.x, y: m.y })),
    truth.targets.map((t) => ({ id: t.id, acceptedClasses: truth.acceptedClasses, polygon: t.polygon, cx: t.cx, cy: t.cy })),
  );
  const score = computeLocalizationScore({
    marks: scored,
    targets,
    pairs: matched.pairs,
  });
  return {
    taskId: truth.taskId,
    score,
    matchPairs: matched.pairs,
    unscoredMarkIds: [...ignoredMarkIds].sort(),
    ignoredMarkIds: [...ignoredMarkIds].sort(),
  };
}
