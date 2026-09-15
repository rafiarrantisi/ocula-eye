export interface FollowUpInput {
  pool: string[];
  seenCaseIds: string[];
  lastSeen: Record<string, number>;
  currentCaseId: string;
  protectedIds: string[];
  limitPerSession: number;
  usedThisSession: number;
}

function compareId(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function selectFollowUp(input: FollowUpInput): string | null {
  if (input.usedThisSession >= input.limitPerSession) {
    return null;
  }
  const seen = new Set(input.seenCaseIds);
  const blocked = new Set(input.protectedIds);
  const deduped = new Set<string>();
  const candidates: string[] = [];
  for (const id of input.pool) {
    if (deduped.has(id) || id === input.currentCaseId || blocked.has(id)) {
      continue;
    }
    deduped.add(id);
    candidates.push(id);
  }
  if (candidates.length === 0) {
    return null;
  }
  const unseen = candidates.filter((id) => !seen.has(id)).sort(compareId);
  if (unseen.length > 0) {
    const first = unseen[0];
    return first === undefined ? null : first;
  }
  const ranked = [...candidates].sort((a, b) => {
    const timeA = input.lastSeen[a] ?? Number.NEGATIVE_INFINITY;
    const timeB = input.lastSeen[b] ?? Number.NEGATIVE_INFINITY;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return compareId(a, b);
  });
  const first = ranked[0];
  return first === undefined ? null : first;
}
