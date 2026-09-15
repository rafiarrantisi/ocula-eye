-- PART05 faculty-workflow slice, version 0003. Hand-written, additive only.
-- Matches db/faculty-schema.ts. Never edited after landing; later changes
-- ship as new versioned files applied in journal order by scripts/db/migrate.mjs.
-- Institutions own cohorts; users join institutions via memberships with a
-- faculty|learner role; cohorts hold members; invitations carry single-use
-- hashed expiring tokens; assignments pin a release manifest snapshot and
-- reports derive from attempts (no per-case truth copy here).

CREATE TABLE IF NOT EXISTS "institutions" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "faculty_users" (
  "id" text PRIMARY KEY,
  "auth_subject" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" text PRIMARY KEY,
  "institution_id" text NOT NULL REFERENCES "institutions" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "faculty_users" ("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('faculty', 'learner')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("institution_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "memberships_institution_idx" ON "memberships" ("institution_id");
CREATE INDEX IF NOT EXISTS "memberships_user_idx" ON "memberships" ("user_id");

CREATE TABLE IF NOT EXISTS "cohorts" (
  "id" text PRIMARY KEY,
  "institution_id" text NOT NULL REFERENCES "institutions" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cohorts_institution_idx" ON "cohorts" ("institution_id");

CREATE TABLE IF NOT EXISTS "cohort_members" (
  "id" text PRIMARY KEY,
  "cohort_id" text NOT NULL REFERENCES "cohorts" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "faculty_users" ("id") ON DELETE CASCADE,
  "learner_pathway" text,
  "status" text NOT NULL DEFAULT 'active',
  "invited_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("cohort_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "cohort_members_cohort_idx" ON "cohort_members" ("cohort_id");

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" text PRIMARY KEY,
  "cohort_id" text NOT NULL REFERENCES "cohorts" ("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "invitations_cohort_idx" ON "invitations" ("cohort_id");

CREATE TABLE IF NOT EXISTS "assignments" (
  "id" text PRIMARY KEY,
  "cohort_id" text NOT NULL REFERENCES "cohorts" ("id") ON DELETE CASCADE,
  "release_id" text NOT NULL,
  "pathway" text,
  "mode" text NOT NULL DEFAULT 'practice' CHECK ("mode" IN ('practice', 'assessment')),
  "open_at" timestamptz NOT NULL,
  "due_at" timestamptz,
  "reveal_policy" text NOT NULL DEFAULT 'manual' CHECK ("reveal_policy" IN ('immediate', 'manual', 'scheduled')),
  "release_version" text,
  "release_snapshot" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assignments_cohort_idx" ON "assignments" ("cohort_id");
