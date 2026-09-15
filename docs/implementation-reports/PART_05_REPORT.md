# PART05 implementation report

Status: technically complete but review blocked

## Scope and authorization

- Approved part and date: PART05 (minimal faculty workflow). Founder ordered all parts through completion, no STOP, no push.
- Initial repository SHA and branch: `76341e4` baseline; work on `part01-aqueous-runtime` (PART01–PART04 commits below).
- Final implementation commit SHA: (see log — PART05 implementation commit below).
- Unrelated existing changes preserved: yes. Two parallel subagents partitioned by files (faculty domain / faculty server+API); coordinator did demo wiring, seed, faculty+learner UI, and all fixes. No push or deploy performed.

## Working behavior delivered

Faculty journey (demo mode): `/faculty` → create cohort → `/faculty/cohorts/[id]` → CSV import with side-effect-free preview → explicit confirm (idempotent) → create practice assignment → load report (metrics with denominators) → export link (formula-safe CSV download). Learner journey: `/learner/sign-in` → `/learner` (demo identity picker, assignments, attempt links into `/lab`) → sign-out clears the session cookie.

Real mode without a managed auth provider honestly refuses (503 `auth-not-configured` / explanatory notices); no users, tenants, or checks are invented. Demo mode (`LAB_DEMO_STORE=1`, localhost only) uses fixed demo subjects behind loud banners; nothing demo touches real data paths (demo store refuses non-synthetic releases; Postgres path byte-identical to before).

## Changes and contracts

| File/module | Behavior changed | Reason |
|---|---|---|
| `lib/domain/faculty/` (new: csvImport, reporting, csvExport) + `tests/faculty/` (51 tests) | CSV validation (exact header, 200-row/256KB caps, NIK-class columns rejected), funnel/report aggregation with nulls (no composites), RFC4180 + formula-injection escaping | Agent-built, all green |
| `db/migrations/0003_faculty.sql` + journal + `db/faculty-schema.ts` | institutions/users/memberships/cohorts/members/invitations/assignments, all IF NOT EXISTS, additive | Versioned multi-tenant schema |
| `lib/server/faculty/` (new: auth, authorization, cohortService, assignmentService, inviteService) | Provider interface (no implementation by design), tenant gates, idempotent import tokens, release pinning + version freeze, invite hash-only storage, report/export | Agent-built |
| `app/api/faculty/` (6 routes) + `app/api/learner/assignments` + `preview-session` DELETE | Contract error codes, rate limits, demo-subject fallback in demo mode only | Agent routes + coordinator additions |
| `lib/server/demoAuth.ts`, `demoFaculty.ts` (new) | Demo header (demo mode only), file-backed faculty repos (tsc-verified against all three repo interfaces) | Demo wiring; provider path untouched |
| `lib/server/demoStore.ts` | Exported IO helpers + faculty JSON sections (backward compatible with existing demo files) | Shared demo persistence |
| `lib/server/faculty/auth.ts` | `resolveFacultyRepos` returns demo repos under LAB_DEMO_STORE=1 | Additive branch; injected-fake and Postgres paths byte-identical |
| `scripts/faculty/demo-seed.mjs` (new) | Seeds demo org/faculty/3 learners/cohort/import/assignment through real services | Reproducible local demo |
| `app/faculty/`, `app/learner/` (new pages + clients) | Cohort CRUD UI, CSV import flow, assignment create, report view, export download, learner assignments/sign-in/out | Minimal faculty/learner workflow |
| `app/lab/lab.css` | Form/report/question styles + light variants | UI readability |
| `tests/integration/demo-faculty.test.ts` (new) | Full demo round-trip incl. cross-tenant denial + export hygiene (no name/email columns) | DoD evidence |

No deliberate deviations from PART05 except: (1) listing endpoints serve demo mode via direct file reads (`overview`, learner assignments) — real mode honestly 503s since no session index exists without a provider; (2) invite UI omitted (service + tests exist; no invite endpoints in the API table); (3) duplicate 15-line pure helpers (CSV fallback parser, formula escaper) kept in services instead of importing domain twins — both pinned by tests, recorded for future dedup.

## Verification evidence

Environment: Windows 11, Node v24.13.0, branch `part01-aqueous-runtime`.

| Command/check | Environment | Result | Evidence/location |
|---|---|---|---|
| `npm run test:domain` | vitest 3.2.4 | PASS 181/181 + 1 skipped (live-DB) | This session (15 files) |
| `npm run content:validate` + `preview-dr` | Node 24 | PASS (unchanged) | Agent transcript |
| `npm run typecheck` | tsc 5.9.3 | PASS exit 0 | This session |
| `npx eslint` PART05 files | eslint 9 | PASS 0 errors (fixed: render-phase ref, `any`, exhaustive-deps, unused imports; 2 justified mount-effect disables) | This session |
| `node scripts/validate-eye.mjs` + `validate-exploration.mjs` | Node 24 | PASS | Prior transcript (untouched paths) |
| `node scripts/db/migrate.mjs` (no DB) | Node 24 | exit 2 honest refusal | Agent transcript |
| `node scripts/faculty/demo-seed.mjs` | Node 24, demo store | PASS: cohort + 3 imports + assignment created through real services | This session |
| `npm run build` | vinext/Vite 8 | PASS | This session |
| Manual: faculty/learner click journeys, CSV edge UX, 390 px | NOT DONE — no browser tooling here | Code-reviewed; demo seed proves service paths | Honest gap |
| Staging onboarding (managed auth/tenant checklist) | NOT DONE — no staging exists | Checklist is documentation-only until deployed | Gate blocked |

Whole-repo lint still fails on pre-existing patterns only (PART01 baseline).

## Clinical, content and rights review

- No clinical content added (workflow only). No cases, labels, or rubrics created.
- Reviewer identity/date/scope: n/a for workflow code; faculty-independence ("independently usable") is itself unverified without a real faculty user — recorded.
- Publication blocked? Workflow has nothing to publish; pilot use needs PART06 gates + staging.

## Privacy and failure recovery

Demo store holds synthetic display names/emails (`@demo.local`) in a gitignored local file; export contains no identifiers (tested). No NIK/patient fields accepted by CSV validation (tested). Secrets remain env-only. Rollback: revert PART05 commit(s); base branch untouched. No messages/invitations sent; no push performed. Invite tokens hash-only; reuse/expiry/revoke tested by agent suite.

## Open issues and next prerequisites

| Issue | Impact | Owner/action | Blocks next part? |
|---|---|---|---|
| No managed auth/Staging Postgres | Real accounts, tenant enforcement live, onboarding checklist untested | Staging env + provider binding | Yes for any real-user claim; PART06 needs staging for smoke |
| No browser verification | UI journeys unclicked | Founder/device pass | Yes before demo-ready claim |
| Duplicate pure helpers (CSV fallback, escaper) | Divergence risk | Dedup to domain imports in cleanup | No (both tested) |
| Learner sign-in is demo-auto | No real learner auth UX proven | Managed auth | Yes for pilot |

## Completion decision

Acceptance check: real independently usable workflow — DEMO-ONLY verifiably yes (seed→cohort→import→assign→report→export all executed through real services); against managed auth — not provable here by design. Metrics exact with denominators; tenant rules tested (incl. cross-tenant denial); migration additive; privacy holds (no identifiers in export, tested). Missing: staging, managed auth, browser evidence, faculty human. Verdict: **technically complete, review blocked**.

**Continuing to PART06 per founder order (all parts through completion, no STOP, no push).**
