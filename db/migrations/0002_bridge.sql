-- PART04 medical-education bridge slice, version 0002. Hand-written, additive only.
-- Matches db/imaging-schema.ts bridge additions. Never edited after landing;
-- later changes ship as new versioned files applied in journal order by scripts/db/migrate.mjs.

CREATE TABLE IF NOT EXISTS "bridge_progress" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL,
  "attempt_id" text NOT NULL,
  "release_id" text NOT NULL,
  "question_id" text NOT NULL,
  "followup_case_id" text,
  "completed" boolean NOT NULL DEFAULT false,
  "responded_correct" boolean,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bridge_progress_session_release_idx" ON "bridge_progress" ("session_id", "release_id");

CREATE TABLE IF NOT EXISTS "learning_events" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL,
  "attempt_id" text,
  "release_id" text,
  "event" text NOT NULL,
  "concept_id" text,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "imaging_attempts" ADD COLUMN IF NOT EXISTS "parent_attempt_id" text;
