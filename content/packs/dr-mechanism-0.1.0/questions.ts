import type { DrQuestion } from '../../../lib/domain/content/schema.ts';

// Fixed lesson questions. All draft: option distractors are proposed
// placeholders needing clinician authoring. Fixed scoring, no LLM.
const DISTRACTOR_NOTE = 'distractors proposed, need clinician authoring';
const SCOPE = ['dr-mechanism-lesson'] as string[];

export const drQuestions: DrQuestion[] = [
  {
    id: 'q-barrier',
    conceptId: 'barrier-id',
    prompt: 'In this lesson, which structure forms the inner blood–retina barrier?',
    options: [
      { id: 'q-barrier-a', text: 'Retinal capillary endothelium' },
      { id: 'q-barrier-b', text: 'Retinal pigment epithelium' },
      { id: 'q-barrier-c', text: 'Choroid' },
      { id: 'q-barrier-d', text: 'Vitreous gel' },
    ],
    correctOptionId: 'q-barrier-a',
    distractorConcepts: ['outer-rpe', 'choroid', 'vitreous'],
    review: { status: 'draft', scope: SCOPE, notes: DISTRACTOR_NOTE },
  },
  {
    id: 'q-exudate-bleed',
    conceptId: 'exudate-vs-bleed',
    prompt: 'In this lesson, a yellowish hard-exudate deposit best represents which process?',
    options: [
      { id: 'q-exudate-bleed-a', text: 'Lipid/protein deposit from plasma leakage' },
      { id: 'q-exudate-bleed-b', text: 'Red blood cell escape (bleeding)' },
      { id: 'q-exudate-bleed-c', text: 'Focal nerve-fiber-layer ischemic injury' },
      { id: 'q-exudate-bleed-d', text: 'New vessel growth' },
    ],
    correctOptionId: 'q-exudate-bleed-a',
    distractorConcepts: ['rbc-escape', 'nfl-ischemia', 'nv-drive'],
    review: { status: 'draft', scope: SCOPE, notes: DISTRACTOR_NOTE },
  },
  {
    id: 'q-deposit-ischemia',
    conceptId: 'deposit-vs-ischemia',
    prompt: 'In this lesson, a pale cotton-wool spot best represents which process?',
    options: [
      { id: 'q-deposit-ischemia-a', text: 'Focal nerve-fiber-layer ischemic injury' },
      { id: 'q-deposit-ischemia-b', text: 'Lipid/protein deposit from plasma leakage' },
      { id: 'q-deposit-ischemia-c', text: 'Red blood cell escape (bleeding)' },
      { id: 'q-deposit-ischemia-d', text: 'New vessel growth' },
    ],
    correctOptionId: 'q-deposit-ischemia-a',
    distractorConcepts: ['lipid-deposit', 'rbc-escape', 'nv-drive'],
    review: { status: 'draft', scope: SCOPE, notes: DISTRACTOR_NOTE },
  },
];
