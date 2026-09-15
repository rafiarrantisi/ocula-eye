import { describe, expect, it } from 'vitest';
import { aggregateCohort } from '../../lib/domain/faculty/reporting.ts';
import type { AttemptSummary } from '../../lib/domain/faculty/reporting.ts';

function attempt(overrides: Partial<AttemptSummary>): AttemptSummary {
  return {
    learnerId: 'learner-1',
    caseId: 'case-1',
    releaseId: 'release-1',
    rubricVersion: 'v1',
    submitted: true,
    requiredTasks: 3,
    completedTasks: 3,
    localization: null,
    gradeAgreement: null,
    mechanismResponses: [],
    bridgeCompleted: false,
    transferFollowups: 0,
    ...overrides,
  };
}

function submittedResponse(questionId: string, correct: boolean, caseId = 'case-1'): AttemptSummary {
  return attempt({ caseId, mechanismResponses: [{ questionId, correct }] });
}

describe('sparse data', () => {
  it('empty input yields zeros, nulls, and no concepts', () => {
    expect(aggregateCohort([])).toEqual({
      learners: 0,
      invited: 0,
      activated: 0,
      started: 0,
      completed: 0,
      uniqueCases: 0,
      repeats: 0,
      gradeAgreement: null,
      mechanismAccuracy: null,
      repeatedConcepts: [],
      bridgeCompletions: 0,
    });
  });

  it('submitted attempts without grade or mechanism evidence keep null rates', () => {
    const report = aggregateCohort([attempt({ gradeAgreement: null, mechanismResponses: [] })]);
    expect(report.gradeAgreement).toBeNull();
    expect(report.mechanismAccuracy).toBeNull();
    expect(report.repeatedConcepts).toEqual([]);
    expect(report.activated).toBe(1);
  });

  it('unsubmitted-only input yields null rates and zero activations', () => {
    const report = aggregateCohort([
      attempt({ learnerId: 'l1', submitted: false, completedTasks: 2, bridgeCompleted: true }),
    ]);
    expect(report.learners).toBe(1);
    expect(report.invited).toBe(1);
    expect(report.activated).toBe(0);
    expect(report.started).toBe(1);
    expect(report.completed).toBe(0);
    expect(report.gradeAgreement).toBeNull();
    expect(report.mechanismAccuracy).toBeNull();
    expect(report.bridgeCompletions).toBe(0);
  });

  it('zero required tasks never count as vacuous completion', () => {
    const report = aggregateCohort([
      attempt({ learnerId: 'l1', requiredTasks: 0, completedTasks: 0 }),
    ]);
    expect(report.activated).toBe(1);
    expect(report.completed).toBe(0);
  });
});

describe('funnel and denominators', () => {
  it('aggregates learners, cases, repeats, and funnel counts', () => {
    const attempts: AttemptSummary[] = [
      attempt({
        learnerId: 'l1',
        caseId: 'case-a',
        gradeAgreement: true,
        mechanismResponses: [
          { questionId: 'q1', correct: true },
          { questionId: 'q2', correct: false },
        ],
        bridgeCompleted: true,
      }),
      attempt({ learnerId: 'l1', caseId: 'case-b', completedTasks: 1, gradeAgreement: false }),
      attempt({ learnerId: 'l1', caseId: 'case-a', completedTasks: 3, gradeAgreement: null }),
      attempt({ learnerId: 'l2', caseId: 'case-a', submitted: false, completedTasks: 2 }),
      attempt({ learnerId: 'l3', caseId: 'case-c', submitted: false, completedTasks: 0 }),
    ];
    const report = aggregateCohort(attempts);
    expect(report.learners).toBe(3);
    expect(report.invited).toBe(3);
    expect(report.activated).toBe(1);
    expect(report.started).toBe(2);
    expect(report.completed).toBe(1);
    expect(report.uniqueCases).toBe(3);
    expect(report.repeats).toBe(1);
    expect(report.gradeAgreement).toEqual({ agree: 1, denominator: 2 });
    expect(report.mechanismAccuracy).toEqual({ correct: 1, denominator: 2 });
    expect(report.bridgeCompletions).toBe(1);
    expect(report.repeatedConcepts).toEqual([]);
  });
});

describe('repeated-concept rule', () => {
  it('needs at least two errors on distinct caseIds', () => {
    const report = aggregateCohort([
      submittedResponse('q1', false, 'case-a'),
      submittedResponse('q1', false, 'case-b'),
    ]);
    expect(report.repeatedConcepts).toEqual([{ conceptId: 'q1', errors: 2, opportunities: 2 }]);
  });

  it('same-case retry is not independent evidence', () => {
    const report = aggregateCohort([
      submittedResponse('q1', false, 'case-a'),
      attempt({ caseId: 'case-a', mechanismResponses: [{ questionId: 'q1', correct: false }] }),
    ]);
    expect(report.repeatedConcepts).toEqual([]);
  });

  it('a single error is not repeated', () => {
    expect(aggregateCohort([submittedResponse('q1', false)]).repeatedConcepts).toEqual([]);
  });

  it('counts later correct responses as opportunities, not errors', () => {
    const report = aggregateCohort([
      submittedResponse('q1', false, 'case-a'),
      submittedResponse('q1', false, 'case-b'),
      submittedResponse('q1', true, 'case-c'),
    ]);
    expect(report.repeatedConcepts).toEqual([{ conceptId: 'q1', errors: 2, opportunities: 3 }]);
  });

  it('sorts repeated concepts by conceptId', () => {
    const report = aggregateCohort([
      submittedResponse('q-b', false, 'case-a'),
      submittedResponse('q-b', false, 'case-b'),
      submittedResponse('q-a', false, 'case-a'),
      submittedResponse('q-a', false, 'case-b'),
    ]);
    expect(report.repeatedConcepts).toEqual([
      { conceptId: 'q-a', errors: 2, opportunities: 2 },
      { conceptId: 'q-b', errors: 2, opportunities: 2 },
    ]);
  });

  it('ignores unsubmitted errors', () => {
    const report = aggregateCohort([
      attempt({ caseId: 'case-a', submitted: false, mechanismResponses: [{ questionId: 'q1', correct: false }] }),
      attempt({ caseId: 'case-b', submitted: false, mechanismResponses: [{ questionId: 'q1', correct: false }] }),
    ]);
    expect(report.repeatedConcepts).toEqual([]);
    expect(report.mechanismAccuracy).toBeNull();
  });
});

describe('no composite scores', () => {
  it('exposes exactly the specified keys and no competence, score, or rank', () => {
    const report = aggregateCohort([attempt({ gradeAgreement: true })]);
    expect(Object.keys(report).sort()).toEqual([
      'activated',
      'bridgeCompletions',
      'completed',
      'gradeAgreement',
      'invited',
      'learners',
      'mechanismAccuracy',
      'repeatedConcepts',
      'repeats',
      'started',
      'uniqueCases',
    ]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('competence');
    expect(serialized).not.toContain('percentage');
    expect(serialized).not.toContain('rank');
  });
});
