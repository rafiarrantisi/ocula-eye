-- PART06 pilot gates: release quarantine + assignment linkage + manual reveal.
-- All additive; safe to apply over 0001-0003. Postgres only (the imaging and
-- faculty slices never touch the Cloudflare D1 binding).

CREATE TABLE IF NOT EXISTS release_quarantine (
  release_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  notice TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links an imaging attempt to the faculty assignment it was launched from.
-- Advisory only: enforcement can only ever DELAY feedback, never leak it, so
-- a spoofed id can only self-deny. Nullable so pre-0004 rows stay valid.
ALTER TABLE imaging_attempts
  ADD COLUMN IF NOT EXISTS assignment_id TEXT;

-- Manual reveal timestamp for faculty assignments. NULL means unrevealed.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS revealed_at TIMESTAMPTZ;
