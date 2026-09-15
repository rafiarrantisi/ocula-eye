import type { Claim } from '../../../lib/domain/content/schema.ts';

// All draft: no human reviewer identity or date exists yet. Nothing here is
// approved clinical truth. Locators are verified Goel (2010) section headings.
const DRAFT = { status: 'draft' as const, scope: ['aqueous-equilibrium-runtime'] };

export const aqueousClaims: Claim[] = [
  {
    id: 'goldmann-equilibrium',
    version: '0.1.0',
    text: { id: 'goldmann-equilibrium' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR – OUTFLOW (expanded Goldmann equation F = (Pi − Pe) × C + U)', relation: 'supports' },
    ],
    context: 'Steady-state teaching model of aqueous balance.',
    limitations: ['Simplified single-recipient-pressure form; the review itself calls the formula oversimplified.'],
    review: DRAFT,
  },
  {
    id: 'steady-conventional-flow',
    version: '0.1.0',
    text: { id: 'steady-conventional-flow' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR – OUTFLOW (equilibrium of production and drainage)', relation: 'supports' },
    ],
    context: 'At fixed formation and uveoscleral outflow, equilibrium conventional flow equals F − U.',
    limitations: ['Equilibrium only; says nothing about the transient right after resistance changes.'],
    review: DRAFT,
  },
  {
    id: 'transient-vs-equilibrium',
    version: '0.1.0',
    text: { id: 'transient-vs-equilibrium' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR – OUTFLOW (equilibrium of production and drainage)', relation: 'supports' },
    ],
    context: 'Reduced drainage at unchanged pressure is a transient; the display shows the new equilibrium.',
    limitations: ['The animation does not simulate the transient time course.'],
    review: DRAFT,
  },
  {
    id: 'u-pressure-limits',
    version: '0.1.0',
    text: { id: 'u-pressure-limits' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'Abstract (uveoscleral pathway relatively independent of IOP; proportion decreases with age)', relation: 'supports' },
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR – OUTFLOW (rate-limiting step is flow through the ciliary muscle)', relation: 'supports' },
    ],
    context: 'U treated as pressure-independent within the normal range; ciliary muscle is rate-limiting.',
    limitations: ['Not truly pressure-independent in monkeys; relationship nonlinear at extremes.'],
    review: DRAFT,
  },
  {
    id: 'circadian-direction',
    version: '0.1.0',
    text: { id: 'circadian-direction' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR – FORMATION AND COMPOSITION (circadian rhythm: higher in the morning than at night)', relation: 'supports' },
    ],
    context: 'Day/night scaling in the sandbox follows the observed direction only, not measured magnitudes.',
    limitations: ['Scaling factors are illustrative, not fluorophotometry values.'],
    review: DRAFT,
  },
  {
    id: 'convection-direction',
    version: '0.1.0',
    text: { id: 'convection-direction' },
    sourceRefs: [
      { sourceId: 'goel-2010', locator: 'AQUEOUS HUMOR - DEFINITION AND OVERVIEW (temperature-gradient convective flow pattern)', relation: 'supports' },
    ],
    context: 'Upright eye: rises near the warmer lens/iris, sinks near the cooler cornea.',
    limitations: ['Loop geometry and speed are schematic, not a flow solution.'],
    review: DRAFT,
  },
];
