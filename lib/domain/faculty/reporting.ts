// Pure cohort aggregation for the faculty slice. Input rows are plain data
// (no DB). Denominators are reported everywhere; sparse data yields nulls
// instead of invented composites. There is deliberately no competence
// percentage, no score, and no ranking anywhere in this module.
// `repeatedConcepts` reuses the learning-slice concept-evidence shape
// ({conceptId, errors, opportunities}, implemented locally, no import):
// a concept is repeated only with >= 2 errors on distinct caseIds, so a
// same-case retry never counts as independent evidence.

export interface MechanismResponse {
  questionId: string;
  correct: boolean;
}

export interface AttemptSummary {
  learnerId: string;
  caseId: string;
  releaseId: string;
  rubricVersion: string;
  submitted: boolean;
  requiredTasks: number;
  completedTasks: number;
  localization?: { tp: number; fp: number; fn: number } | null;
  gradeAgreement: boolean | null;
  mechanismResponses: MechanismResponse[];
  bridgeCompleted: boolean;
  transferFollowups: number;
}

export interface GradeAgreementRate {
  agree: number;
  denominator: number;
}

export interface MechanismAccuracyRate {
  correct: number;
  denominator: number;
}

export interface RepeatedConcept {
  conceptId: string;
  errors: number;
  opportunities: number;
}

export interface CohortReport {
  learners: number;
  invited: number;
  activated: number;
  started: number;
  completed: number;
  uniqueCases: number;
  repeats: number;
  gradeAgreement: GradeAgreementRate | null;
  mechanismAccuracy: MechanismAccuracyRate | null;
  repeatedConcepts: RepeatedConcept[];
  bridgeCompletions: number;
}

export function aggregateCohort(attempts: AttemptSummary[]): CohortReport {
  const learnerIds = new Set<string>();
  const caseIds = new Set<string>();
  const learnerCases = new Set<string>();
  const activated = new Set<string>();
  const started = new Set<string>();
  const completed = new Set<string>();
  let gradeAgree = 0;
  let gradeDenominator = 0;
  let mechCorrect = 0;
  let mechDenominator = 0;
  let bridgeCompletions = 0;
  const opportunities = new Map<string, number>();
  const errorsByConcept = new Map<string, { count: number; cases: Set<string> }>();

  for (const attempt of attempts) {
    learnerIds.add(attempt.learnerId);
    caseIds.add(attempt.caseId);
    learnerCases.add(JSON.stringify([attempt.learnerId, attempt.caseId]));
    if (attempt.completedTasks > 0) {
      started.add(attempt.learnerId);
    }
    if (!attempt.submitted) {
      continue;
    }
    activated.add(attempt.learnerId);
    if (attempt.requiredTasks > 0 && attempt.completedTasks >= attempt.requiredTasks) {
      completed.add(attempt.learnerId);
    }
    if (attempt.gradeAgreement !== null) {
      gradeDenominator += 1;
      if (attempt.gradeAgreement) {
        gradeAgree += 1;
      }
    }
    for (const response of attempt.mechanismResponses) {
      mechDenominator += 1;
      if (response.correct) {
        mechCorrect += 1;
      }
      opportunities.set(response.questionId, (opportunities.get(response.questionId) ?? 0) + 1);
      if (!response.correct) {
        let entry = errorsByConcept.get(response.questionId);
        if (!entry) {
          entry = { count: 0, cases: new Set<string>() };
          errorsByConcept.set(response.questionId, entry);
        }
        entry.count += 1;
        entry.cases.add(attempt.caseId);
      }
    }
    if (attempt.bridgeCompleted) {
      bridgeCompletions += 1;
    }
  }

  const repeatedConcepts: RepeatedConcept[] = [];
  for (const [conceptId, entry] of errorsByConcept) {
    if (entry.count >= 2 && entry.cases.size >= 2) {
      repeatedConcepts.push({
        conceptId,
        errors: entry.count,
        opportunities: opportunities.get(conceptId) ?? entry.count,
      });
    }
  }
  repeatedConcepts.sort((a, b) => {
    if (a.conceptId < b.conceptId) {
      return -1;
    }
    if (a.conceptId > b.conceptId) {
      return 1;
    }
    return 0;
  });

  return {
    learners: learnerIds.size,
    invited: learnerIds.size,
    activated: activated.size,
    started: started.size,
    completed: completed.size,
    uniqueCases: caseIds.size,
    repeats: attempts.length - learnerCases.size,
    gradeAgreement: gradeDenominator === 0 ? null : { agree: gradeAgree, denominator: gradeDenominator },
    mechanismAccuracy: mechDenominator === 0 ? null : { correct: mechCorrect, denominator: mechDenominator },
    repeatedConcepts,
    bridgeCompletions,
  };
}
