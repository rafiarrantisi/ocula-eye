import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// PART05 faculty-workflow slice. Postgres-only tables mirroring
// db/migrations/0003_faculty.sql. Additive only; db/imaging-schema.ts is
// untouched. Reports derive from imaging attempts; module/target cases are
// implied by the pinned release (no per-case truth copy here).

export const institutions = pgTable('institutions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const facultyUsers = pgTable('faculty_users', {
  id: text('id').primaryKey(),
  authSubject: text('auth_subject').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => facultyUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const cohorts = pgTable('cohorts', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const cohortMembers = pgTable('cohort_members', {
  id: text('id').primaryKey(),
  cohortId: text('cohort_id')
    .notNull()
    .references(() => cohorts.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => facultyUsers.id, { onDelete: 'cascade' }),
  learnerPathway: text('learner_pathway'),
  status: text('status').notNull().default('active'),
  invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  cohortId: text('cohort_id')
    .notNull()
    .references(() => cohorts.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const assignments = pgTable('assignments', {
  id: text('id').primaryKey(),
  cohortId: text('cohort_id')
    .notNull()
    .references(() => cohorts.id, { onDelete: 'cascade' }),
  releaseId: text('release_id').notNull(),
  pathway: text('pathway'),
  mode: text('mode').notNull().default('practice'),
  openAt: timestamp('open_at', { withTimezone: true, mode: 'date' }).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
  revealPolicy: text('reveal_policy').notNull().default('manual'),
  // PART06: manual reveal timestamp (migration 0004). NULL = unrevealed.
  revealedAt: timestamp('revealed_at', { withTimezone: true, mode: 'date' }),
  releaseVersion: text('release_version'),
  releaseSnapshot: jsonb('release_snapshot'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const institutionsRelations = relations(institutions, ({ many }) => ({
  memberships: many(memberships),
  cohorts: many(cohorts),
}));

export const facultyUsersRelations = relations(facultyUsers, ({ many }) => ({
  memberships: many(memberships),
  cohortMembers: many(cohortMembers),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  institution: one(institutions, {
    fields: [memberships.institutionId],
    references: [institutions.id],
  }),
  user: one(facultyUsers, {
    fields: [memberships.userId],
    references: [facultyUsers.id],
  }),
}));

export const cohortsRelations = relations(cohorts, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [cohorts.institutionId],
    references: [institutions.id],
  }),
  members: many(cohortMembers),
  invitations: many(invitations),
  assignments: many(assignments),
}));

export const cohortMembersRelations = relations(cohortMembers, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [cohortMembers.cohortId],
    references: [cohorts.id],
  }),
  user: one(facultyUsers, {
    fields: [cohortMembers.userId],
    references: [facultyUsers.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [invitations.cohortId],
    references: [cohorts.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [assignments.cohortId],
    references: [cohorts.id],
  }),
}));
