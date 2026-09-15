import type { Repositories } from './attemptRepository.ts';

// PART06 release quarantine reads. The quarantine table (migration 0004) holds
// institute-level holds: a quarantined release refuses NEW attempts with the
// stored correction notice, while history (existing attempts, reports) is
// preserved untouched. Reads go through the optional Repositories method so
// older fakes without quarantine support simply report "not quarantined".

export interface QuarantineRow {
  releaseId: string;
  reason: string;
  notice: string;
  createdAt: Date;
}

export async function getQuarantine(
  repos: Repositories,
  releaseId: string,
): Promise<QuarantineRow | null> {
  const fn = repos.getReleaseQuarantine;
  if (typeof fn !== 'function') return null;
  return fn.call(repos, releaseId);
}
