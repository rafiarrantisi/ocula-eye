export interface ErrorEvent {
  conceptId: string;
  caseId: string;
  taskId: string;
  correct: boolean;
}

export type FlagState = 'none' | 'provisional' | 'repeated';

export interface FlagStatus {
  conceptId: string;
  status: FlagState;
  opportunities: number;
  errors: number;
}

function compareConceptId(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function evaluateMisconceptions(events: ErrorEvent[]): FlagStatus[] {
  const byConcept = new Map<string, ErrorEvent[]>();
  for (const event of events) {
    const group = byConcept.get(event.conceptId);
    if (group) {
      group.push(event);
    } else {
      byConcept.set(event.conceptId, [event]);
    }
  }
  const flags: FlagStatus[] = [];
  for (const [conceptId, group] of byConcept) {
    const errors = group.filter((event) => !event.correct);
    if (errors.length === 0) {
      continue;
    }
    const distinctErrorCases = new Set(errors.map((event) => event.caseId));
    flags.push({
      conceptId,
      status: distinctErrorCases.size >= 2 ? 'repeated' : 'provisional',
      opportunities: group.length,
      errors: errors.length,
    });
  }
  flags.sort((a, b) => compareConceptId(a.conceptId, b.conceptId));
  return flags;
}

export function applyClearing(flags: FlagStatus[], laterCorrect: ErrorEvent[]): FlagStatus[] {
  const correctCasesByConcept = new Map<string, Set<string>>();
  for (const event of laterCorrect) {
    if (!event.correct) {
      continue;
    }
    const cases = correctCasesByConcept.get(event.conceptId);
    if (cases) {
      cases.add(event.caseId);
    } else {
      correctCasesByConcept.set(event.conceptId, new Set([event.caseId]));
    }
  }
  const next = flags.map((flag) => {
    if (flag.status === 'none') {
      return { ...flag };
    }
    const cases = correctCasesByConcept.get(flag.conceptId);
    if (cases && cases.size >= 2) {
      const cleared: FlagStatus = { ...flag, status: 'none' };
      return cleared;
    }
    return { ...flag };
  });
  next.sort((a, b) => compareConceptId(a.conceptId, b.conceptId));
  return next;
}
