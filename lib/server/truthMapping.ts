import type { CaseTruth } from './attemptService.ts';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumArray(a: unknown): a is number[] {
  return Array.isArray(a) && a.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isPolygon(p: unknown): p is number[][] {
  return Array.isArray(p) && p.length >= 3 && p.every(isNumArray);
}

/** Map one private-pack case to server truth. Returns null when the case
 * carries no usable answers (unknown_case downstream). Localization,
 * grade expectations and rationale pass through only when well-formed. */
export function toCaseTruth(found: unknown): CaseTruth | null {
  if (!isRecord(found)) return null;
  const answers = found['answers'];
  if (!isRecord(answers)) return null;
  for (const v of Object.values(answers)) if (typeof v !== 'string') return null;
  const truth: CaseTruth = { answers: answers as Record<string, string> };
  const loc = found['localization'];
  if (isRecord(loc) && typeof loc['taskId'] === 'string' && isRecord(loc['roi']) && isPolygon(loc['roi']['polygon']) && Array.isArray(loc['targets']) && Array.isArray(loc['ignored']) && Array.isArray(loc['acceptedClasses'])) {
    const clean = {
      taskId: loc['taskId'] as string,
      roi: { polygon: loc['roi']['polygon'] as number[][] },
      targets: (loc['targets'] as unknown[]).filter(
        (t): t is { id: string; classId: string; polygon: number[][]; cx: number; cy: number } =>
          isRecord(t) && typeof t['id'] === 'string' && typeof t['classId'] === 'string' && isPolygon(t['polygon']) && typeof t['cx'] === 'number' && typeof t['cy'] === 'number',
      ),
      ignored: (loc['ignored'] as unknown[]).filter(
        (r): r is { polygon: number[][]; reason: string } =>
          isRecord(r) && isPolygon(r['polygon']) && typeof r['reason'] === 'string',
      ),
      acceptedClasses: (loc['acceptedClasses'] as unknown[]).filter((c): c is string => typeof c === 'string'),
    };
    truth.localization = clean;
  }
  if (isRecord(found['gradeExpected'])) {
    const ge: Record<string, string | null> = {};
    let ok = true;
    for (const [k, v] of Object.entries(found['gradeExpected'])) {
      if (typeof v !== 'string' && v !== null) { ok = false; break; }
      ge[k] = v;
    }
    if (ok) truth.gradeExpected = ge;
  }
  if (typeof found['rationale'] === 'string') truth.rationale = found['rationale'];
  return truth;
}

export interface ExpertView {
  targets: { id: string; classId: string; polygon: number[][]; cx: number; cy: number }[];
  ignored: { polygon: number[][]; reason: string }[];
  rationale: string | null;
  gradeExpected: Record<string, string | null>;
}

/** Post-reveal expert overlay data. Call only after the reveal gate passed. */
export function toExpertView(found: unknown): ExpertView | null {
  const truth = toCaseTruth(found);
  if (!truth) return null;
  return {
    targets: truth.localization?.targets ?? [],
    ignored: truth.localization?.ignored ?? [],
    rationale: truth.rationale ?? null,
    gradeExpected: truth.gradeExpected ?? {},
  };
}
