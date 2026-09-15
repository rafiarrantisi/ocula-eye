import type { Repositories } from './attemptRepository.ts';

// PART06 scheduled/manual answer-reveal enforcement. Practice attempts release
// feedback at submit (unchanged). Attempts LINKED to a faculty assignment with
// a manual or scheduled reveal policy stay locked until the faculty reveals
// (manual) or the due time passes (scheduled). Unlinked attempts and
// 'immediate'-policy assignments behave exactly as before.

export interface AssignmentRevealState {
  revealPolicy: string;
  dueAt: Date | null;
  revealedAt: Date | null;
}

export function resolveReveal(
  state: AssignmentRevealState,
  nowMs: number,
): { released: boolean; reason: string } {
  const policy = state.revealPolicy;
  if (policy !== 'manual' && policy !== 'scheduled') {
    return { released: true, reason: 'immediate' };
  }
  if (state.revealedAt) return { released: true, reason: 'revealed' };
  if (policy === 'scheduled' && state.dueAt && state.dueAt.getTime() <= nowMs) {
    return { released: true, reason: 'due-passed' };
  }
  return { released: false, reason: policy === 'scheduled' ? 'scheduled-not-due' : 'manual-not-revealed' };
}

/** Assignment id linked to an attempt at creation time (route-level link;
 * null when unlinked or when the repos predate migration 0004). */
export async function getAttemptAssignmentId(
  repos: Repositories,
  attemptId: string,
): Promise<string | null> {
  const fn = repos.getAttemptAssignmentId;
  if (typeof fn !== 'function') return null;
  return fn.call(repos, attemptId);
}

export async function getAssignmentRevealState(
  repos: Repositories,
  assignmentId: string,
): Promise<AssignmentRevealState | null> {
  const fn = repos.getAssignmentRevealState;
  if (typeof fn !== 'function') return null;
  return fn.call(repos, assignmentId);
}
