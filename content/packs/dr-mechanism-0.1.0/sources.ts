import type { Source } from '../../../lib/domain/content/schema.ts';

// Accessed 2026-09-15. The NEI page is cited by verified section heading;
// Webvision is a living text cited for barrier/finding detail pending
// reviewer confirmation. All draft; no reviewer identity or date exists.
export const drSources: Source[] = [
  {
    id: 'nei-dr',
    title: 'Diabetic Retinopathy',
    url: 'https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/diabetic-retinopathy',
    publisher: 'National Eye Institute',
    version: 'page-2025-09-11',
    accessedAt: '2026-09-15',
    referenceUse: true,
  },
  {
    id: 'webvision',
    title: 'Webvision: Organization of the Retina',
    url: 'https://www.webvision.pitt.edu/',
    publisher: 'University of Utah',
    version: 'living-text',
    accessedAt: '2026-09-15',
    referenceUse: true,
  },
];
