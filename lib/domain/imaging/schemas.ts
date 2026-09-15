// Zod contracts for the medical-education imaging slice (localization /
// grade / feature tasks and the attempt submission payload). Structural
// validation only; no clinical facts live here.
import { z } from 'zod';

export const FindingClassSchema = z.enum([
  'microaneurysm',
  'hemorrhage',
  'hard_exudate',
  'cotton_wool_spot',
]);
export type FindingClass = z.infer<typeof FindingClassSchema>;

const idSchema = z.string().min(1);

const polygonSchema = z.array(z.array(z.number()).min(2).max(2)).min(3);

export const LocalizationTaskSchema = z.object({
  id: idSchema,
  kind: z.literal('localization'),
  permittedClasses: z
    .array(FindingClassSchema)
    .min(1)
    .refine((xs) => new Set(xs).size === xs.length, { message: 'duplicate-classes' }),
  roi: z
    .object({
      id: idSchema,
      polygon: polygonSchema,
    })
    .optional(),
  maxMarks: z.number().int().min(1).max(30),
});
export type LocalizationTask = z.infer<typeof LocalizationTaskSchema>;

export const GradeTaskSchema = z.object({
  id: idSchema,
  kind: z.literal('grade'),
  options: z.array(z.string().min(1)).min(2),
  allowNotAssessable: z.boolean(),
});
export type GradeTask = z.infer<typeof GradeTaskSchema>;

export const FeatureTaskSchema = z.object({
  id: idSchema,
  kind: z.literal('feature'),
  options: z.array(z.string().min(1)).min(2),
  /** Server-side rubric; never sent to the learner client. */
  correctOptionIds: z.array(z.string().min(1)),
});
export type FeatureTask = z.infer<typeof FeatureTaskSchema>;

export const SubmitPayloadSchema = z.object({
  marks: z
    .array(
      z.object({
        id: idSchema,
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        classId: FindingClassSchema,
      }),
    )
    .max(30),
  gradeAnswer: z.string().optional(),
  featureAnswers: z.array(
    z.object({
      taskId: idSchema,
      optionIds: z.array(z.string()),
    }),
  ),
  confidence: z.number().int().min(1).max(5).optional(),
  idempotencyKey: z.string().min(1),
  pinnedIds: z.object({
    releaseId: z.string().min(1),
    caseVersion: z.string().min(1),
    rubricVersion: z.string().min(1),
  }),
});
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;
