# PART06 implementation report

Status: technically complete but review blocked

## Scope and authorization

- Approved part and date: PART06 (release hardening + pilot validation). Founder ordered all parts through completion, no STOP, no push.
- Initial repository SHA and branch: `76341e4` baseline; work on `part01-aqueous-runtime` (PART01 commit `3726fbe`, PART02, PART03 `2ccc6ac`, PART04 `93858af`, PART05 `da0dbc4` below).
- Final implementation commit SHA: (see log — PART06 implementation commit below).
- Unrelated existing changes preserved: yes. `pilot:validate` script + tests by one subagent (defaults and vitest include fixed by coordinator); migration/reveal/quarantine/routes/UI/CLI by coordinator. No push or deploy performed.

## Working behavior delivered

Pilot gates, demo-proven: `npm run pilot:validate` (8/8 on synthetic demo; honestly FAILS `--stage release60` with no real data); `scripts/pilot/quarantine.mjs` set/show/clear (demo-file fully functional; postgres mode emits pipe-into-psql SQL, zero-dep); quarantined releases refuse NEW attempts (403 `quarantined` + correction notice) while history stays readable; attempts can link to a faculty assignment (`assignmentId`, advisory — enforcement only ever delays feedback); linked manual/scheduled-reveal attempts stay locked until faculty reveal (POST reveal endpoint, idempotent) or due time passes (server clock); feedback + bridge + report + reveal responses carry `Cache-Control: no-store`.

## Changes and contracts

| File/module | Behavior changed | Reason |
|---|---|---|
| `scripts/pilot/validate.mjs` + `pilot:validate` script, `tests/pilot/validate.test.ts` (3 tests) | 8 gate checks (inventory/partitions/rights/reviews/hashes/rubric/separation/quarantine); `--stage demo\|release12\|36\|60` | Agent-built; coordinator fixed wrong default private path and added `tests/pilot` (+`tests/faculty`, previously missing too) to vitest include |
| `db/migrations/0004_pilot.sql` + journal idx 3 | `release_quarantine` table; `imaging_attempts.assignment_id`; `assignments.revealed_at` — all IF NOT EXISTS / nullable | Additive pilot schema |
| `db/imaging-schema.ts`, `db/faculty-schema.ts` | Drizzle twins of the 0004 columns + quarantine table | Additive only |
| `lib/server/attemptRepository.ts` | 4 OPTIONAL interface methods + postgres impls (`getReleaseQuarantine` tolerates pre-0004 DB via 42P01; `set/getAttemptAssignmentId`; `getAssignmentRevealState`); AttemptRow deliberately unchanged | Zero breakage for existing fakes |
| `lib/server/quarantine.ts`, `assessmentReveal.ts` (new) | Tolerant quarantine read; pure `resolveReveal` (immediate/manual/scheduled×revealed/due) + link/state fetchers | New, tested |
| `lib/server/faculty/auth.ts` | `AssignmentRow.revealedAt?` (optional); `setAssignmentRevealed?`; postgres impl | Additive; fakes unaffected |
| `lib/server/demoStore.ts`, `demoFaculty.ts` | Demo `quarantine` section + helpers; attempt `assignmentId`; reveal-state reads; demo `setAssignmentRevealed` | Demo twins |
| `app/api/attempts/route.ts` | Quarantine 403 + `assignmentId` link (≤128 chars) after create | Route-level; submit service untouched |
| `app/api/attempts/[id]/feedback/route.ts` | Reveal gate BEFORE service (no answer bytes for locked attempts) + no-store | Security ordering |
| `app/api/attempts/[id]/bridge/route.ts` | no-store on GET responses | Per-attempt privacy |
| `app/api/faculty/assignments/[id]/reveal/route.ts` (new) | GET state + POST reveal, faculty-gated via `requireFaculty` on owning cohort | Manual reveal action |
| `app/faculty/cohorts/[id]/CohortDetail.tsx` | Reveal status panel + "Buka jawaban" button | Faculty UX |
| `scripts/pilot/quarantine.mjs` (new) | set/clear/show, demo-file or psql-SQL modes | Institute workflow tool |
| `tests/pilot/release-gates.test.ts` (8 tests) | `resolveReveal` matrix, quarantine tolerance + demo round-trips, link + reveal-state reads | DoD evidence |

No deliberate deviations except documented ones: (1) quarantine postgres mode is SQL-emitting, not live (zero-dep constraint); (2) `assignmentId` link is advisory/unverified at link time (spoofing only self-denies); (3) `resolveReveal` treats unknown policies as immediate (matches pre-existing permissive default).

## Verification evidence

Environment: Windows 11, Node v24.13.0, branch `part01-aqueous-runtime`.

| Command/check | Environment | Result | Evidence/location |
|---|---|---|---|
| `npm run test:domain` | vitest 3.2.4 | PASS 243/243 + 1 skipped (live-DB) | This session (22 files) |
| `npm run pilot:validate` | Node 24 | 8/8 PASS (demo); `--stage release60` honestly FAILS | This session |
| `npm run content:validate` + `preview-dr` | Node 24 | PASS (unchanged paths) | Prior sessions |
| `npm run typecheck` | tsc 5.9.3 | PASS exit 0 | This session |
| `npx eslint` all PART06 files | eslint 9 | 0 errors | This session |
| `quarantine.mjs` set/show/clear | Node 24, temp demo file | PASS (set→listed→cleared) | This session |
| `node scripts/validate-eye.mjs` + `validate-exploration.mjs` | Node 24 | PASS (untouched) | Prior sessions |
| `scripts/db/migrate.mjs` (no DB) | Node 24 | exit 2 honest refusal | PART05 transcript |
| `npm run build` | vinext/Vite 8 | PASS | This session |
| Manual: quarantine-block click, reveal-button click, 390 px | NOT DONE — no browser tooling | Code-reviewed; route logic unit-tested | Honest gap |
| Staging: real Postgres 0004, backup/restore, device matrix, security scan | NOT DONE — no staging exists | — | Gate blocked |

Whole-repo lint still fails on pre-existing patterns only (PART01 baseline).

## Clinical, content and rights review

- No clinical content added (gates + workflow only). Demo manifests remain synthetic with 0% reviewer/date/scope coverage — `pilot:validate` reports this explicitly (reviews check passes as implicit draft for demo; release stages require records).
- Reviewer identity/date/scope: n/a for gate code; release-stage data does not exist yet.
- Publication blocked? Nothing new to publish; pilot use needs staging + real reviewed data.

## Privacy and failure recovery

Quarantine and reveal state hold no identifiers. Assignment links are opaque ids. Rollback: revert PART06 commit(s); 0004 migration is additive (safe to leave applied). No push performed. Archived re-release path: correction workflow is quarantine-notice + clear (history never rewritten), documented in CLI header.

## Open issues and next prerequisites

| Issue | Impact | Owner/action | Blocks next part? |
|---|---|---|---|
| No staging / managed auth / real Postgres | 0004 unapplied anywhere real; backup/restore, device matrix, security scan undone; faculty independence unproven with humans | Staging env + provider binding | Yes for any pilot claim |
| No browser verification | Quarantine notice + reveal button unclicked | Founder/device pass | Yes before demo-ready claim |
| Route-level (HTTP) tests for quarantine/reveal gates | Gates proven at service/helper level only | Add when test harness mints session tokens | No (logic covered) |
| Commercial docs (protocol/offer/decision) | Founder-owned per spec | Founder | Out of engineering scope |

## Completion decision

Acceptance check: 60 rights-cleared cases — honestly ABSENT (no real data exists; validator gates fail closed as designed); protected forms/partitions — schema + checks ready, vacuous on demo; truth/security/device gates — answer-separation + quarantine + no-store proven, device/security scans need staging; faculty runs cohort — demo-proven end to end (PART05 seed + PART06 reveal). Verdict: **technically complete, review blocked**.

**All six parts implemented per founder order. Awaiting review meeting: staging provisioning, device/browser pass, and clinical reviewer assignment.**
