// Pure one-to-one mark-to-target matching for localization tasks.
// Maximum cardinality first, then minimum total cost, then stable lexical
// order. No React, Three, DOM, clock, network or LLM imports.
export interface MatchMark {
  id: string;
  classId: string;
  x: number;
  y: number;
}

export interface MatchTarget {
  id: string;
  acceptedClasses: string[];
  polygon: number[][];
  cx: number;
  cy: number;
}

export interface MatchResult {
  pairs: [string, string][];
  unmatchedMarkIds: string[];
  unmatchedTargetIds: string[];
}

/** Image diagonal in normalized [0, 1] space; normalizes centroid distance. */
export const NORMALIZED_DIAGONAL = Math.SQRT2;

/** Maximum marks/targets per call; beyond this the call throws. */
export const MAX_MATCH_ITEMS = 30;

const FORBIDDEN_COST = 1e9;
const DUMMY_COST = 2;
const LEX_EPSILON = 1e-9;

function onSegment(ax: number, ay: number, bx: number, by: number, x: number, y: number): boolean {
  const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  if (cross !== 0) return false;
  return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

/**
 * Strict point-in-polygon: points on an edge or vertex count as outside.
 * Accepts closed or unclosed rings with >= 3 vertices.
 */
export function pointInPolygon(points: number[][], x: number, y: number): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (onSegment(a[0], a[1], b[0], b[1], x, y)) return false;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    if (yi > y !== yj > y) {
      const xCross = xi + ((xj - xi) * (y - yi)) / (yj - yi);
      if (x < xCross) inside = !inside;
    }
  }
  return inside;
}

export function centroidCost(mark: { x: number; y: number }, target: { cx: number; cy: number }): number {
  return Math.hypot(mark.x - target.cx, mark.y - target.cy) / NORMALIZED_DIAGONAL;
}

/**
 * Minimum-cost perfect assignment for a square cost matrix (Hungarian,
 * O(n^3), deterministic: ties resolve to the lowest index). Returns
 * ans[row] = column.
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const ans = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) ans[p[j] - 1] = j - 1;
  }
  return ans;
}

function comparePair(a: [string, string], b: [string, string]): number {
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  if (a[1] < b[1]) return -1;
  if (a[1] > b[1]) return 1;
  return 0;
}

/**
 * One-to-one matching. An edge exists iff the target accepts the mark's
 * class AND the mark lies strictly inside the target polygon. Throws
 * { code: 'too-many' } when either side exceeds 30 items.
 */
export function matchMarksToTargets(marks: MatchMark[], targets: MatchTarget[]): MatchResult {
  if (marks.length > MAX_MATCH_ITEMS || targets.length > MAX_MATCH_ITEMS) {
    throw { code: 'too-many', message: 'too-many' };
  }
  const m = marks.length;
  const t = targets.length;
  const allowed: boolean[][] = [];
  const baseCost: number[][] = [];
  for (let i = 0; i < m; i++) {
    allowed.push([]);
    baseCost.push([]);
    for (let j = 0; j < t; j++) {
      const ok =
        targets[j].acceptedClasses.includes(marks[i].classId) &&
        pointInPolygon(targets[j].polygon, marks[i].x, marks[i].y);
      allowed[i].push(ok);
      baseCost[i].push(ok ? centroidCost(marks[i], targets[j]) : FORBIDDEN_COST);
    }
  }
  // Stable lexical tie-break: perturb allowed-edge costs by rank epsilon.
  // Total perturbation stays far below the cardinality step (DUMMY_COST -
  // max real cost >= 1), so cardinality-then-cost priority is preserved.
  const ranked: { i: number; j: number }[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < t; j++) {
      if (allowed[i][j]) ranked.push({ i, j });
    }
  }
  ranked.sort((a, b) =>
    comparePair([marks[a.i].id, targets[a.j].id], [marks[b.i].id, targets[b.j].id]),
  );
  const epsilon: number[][] = [];
  for (let i = 0; i < m; i++) epsilon.push(new Array<number>(t).fill(0));
  ranked.forEach((e, rank) => {
    epsilon[e.i][e.j] = (rank + 1) * LEX_EPSILON;
  });

  const n = m + t;
  if (n === 0) return { pairs: [], unmatchedMarkIds: [], unmatchedTargetIds: [] };
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost.push([]);
    for (let j = 0; j < n; j++) {
      if (i < m && j < t) cost[i].push(baseCost[i][j] + epsilon[i][j]);
      else if (i < m || j < t) cost[i].push(DUMMY_COST);
      else cost[i].push(0);
    }
  }
  const assign = hungarian(cost);
  const pairs: [string, string][] = [];
  const matchedMarks = new Set<number>();
  const matchedTargets = new Set<number>();
  for (let i = 0; i < m; i++) {
    const j = assign[i];
    if (j >= 0 && j < t && allowed[i][j]) {
      pairs.push([marks[i].id, targets[j].id]);
      matchedMarks.add(i);
      matchedTargets.add(j);
    }
  }
  pairs.sort(comparePair);
  const unmatchedMarkIds = marks
    .filter((_, i) => !matchedMarks.has(i))
    .map((k) => k.id)
    .sort();
  const unmatchedTargetIds = targets
    .filter((_, j) => !matchedTargets.has(j))
    .map((k) => k.id)
    .sort();
  return { pairs, unmatchedMarkIds, unmatchedTargetIds };
}
