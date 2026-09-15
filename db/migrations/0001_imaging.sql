-- PART03 imaging slice, version 0001. Hand-written, additive only.
-- Matches db/imaging-schema.ts. Never edited after landing; later changes
-- ship as new versioned files applied in journal order by scripts/db/migrate.mjs.

CREATE TABLE IF NOT EXISTS "imaging_sessions" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "imaging_releases" (
  "id" text PRIMARY KEY,
  "manifest" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE "imaging_attempt_status" AS ENUM ('draft', 'submitted', 'feedback_released');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "imaging_attempts" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL REFERENCES "imaging_sessions" ("id") ON DELETE CASCADE,
  "release_id" text NOT NULL REFERENCES "imaging_releases" ("id") ON DELETE RESTRICT,
  "case_id" text NOT NULL,
  "status" "imaging_attempt_status" NOT NULL DEFAULT 'draft',
  "idempotency_key" text UNIQUE,
  "revision" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "imaging_attempt_drafts" (
  "attempt_id" text PRIMARY KEY REFERENCES "imaging_attempts" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "revision" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "imaging_responses" (
  "attempt_id" text PRIMARY KEY REFERENCES "imaging_attempts" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "error" jsonb
);

CREATE TABLE IF NOT EXISTS "imaging_scores" (
  "attempt_id" text PRIMARY KEY REFERENCES "imaging_attempts" ("id") ON DELETE CASCADE,
  "result" jsonb NOT NULL
);
