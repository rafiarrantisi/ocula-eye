import { relations } from 'drizzle-orm';
import { integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// PART03 medical-education imaging slice. Postgres-only tables (this repo's
// default db/index.ts is Cloudflare D1; the imaging slice uses postgres-js +
// DATABASE_URL via lib/server/db.ts and never touches the D1 binding).

export const imagingAttemptStatus = pgEnum('imaging_attempt_status', [
  'draft',
  'submitted',
  'feedback_released',
]);
export type ImagingAttemptStatus = 'draft' | 'submitted' | 'feedback_released';

export const imagingSessions = pgTable('imaging_sessions', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const imagingReleases = pgTable('imaging_releases', {
  id: text('id').primaryKey(),
  manifest: jsonb('manifest').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const imagingAttempts = pgTable('imaging_attempts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => imagingSessions.id, { onDelete: 'cascade' }),
  releaseId: text('release_id')
    .notNull()
    .references(() => imagingReleases.id, { onDelete: 'restrict' }),
  caseId: text('case_id').notNull(),
  status: imagingAttemptStatus('status').notNull().default('draft'),
  idempotencyKey: text('idempotency_key').unique(),
  revision: integer('revision').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
});

export const imagingAttemptDrafts = pgTable('imaging_attempt_drafts', {
  attemptId: text('attempt_id')
    .primaryKey()
    .references(() => imagingAttempts.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  revision: integer('revision').notNull().default(0),
});

export const imagingResponses = pgTable('imaging_responses', {
  attemptId: text('attempt_id')
    .primaryKey()
    .references(() => imagingAttempts.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  error: jsonb('error'),
});

export const imagingScores = pgTable('imaging_scores', {
  attemptId: text('attempt_id')
    .primaryKey()
    .references(() => imagingAttempts.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
});

export const imagingSessionsRelations = relations(imagingSessions, ({ many }) => ({
  attempts: many(imagingAttempts),
}));

export const imagingReleasesRelations = relations(imagingReleases, ({ many }) => ({
  attempts: many(imagingAttempts),
}));

export const imagingAttemptsRelations = relations(imagingAttempts, ({ one }) => ({
  session: one(imagingSessions, {
    fields: [imagingAttempts.sessionId],
    references: [imagingSessions.id],
  }),
  release: one(imagingReleases, {
    fields: [imagingAttempts.releaseId],
    references: [imagingReleases.id],
  }),
  draft: one(imagingAttemptDrafts, {
    fields: [imagingAttempts.id],
    references: [imagingAttemptDrafts.attemptId],
  }),
  response: one(imagingResponses, {
    fields: [imagingAttempts.id],
    references: [imagingResponses.attemptId],
  }),
  score: one(imagingScores, {
    fields: [imagingAttempts.id],
    references: [imagingScores.attemptId],
  }),
}));
