# PART04 implementation report

Status: technically complete but review blocked

## Scope and authorization

- Approved part and date: PART04 (error→mechanism→new-case bridge). Founder ordered all parts through completion, no STOP, no push.
- Initial repository SHA and branch: `76341e4` baseline; work on `part01-aqueous-runtime` (PART01–PART03 commits below it).
- Final implementation commit SHA: (see log — PART04 implementation commit below).
- Unrelated existing changes preserved: yes. Two parallel subagents partitioned by files (learning domain / bridge server+migration+API); coordinator did demo rules, route grading, panels, lab wiring, and all fixes. No push or deploy performed.

## Working behavior delivered

After feedback on a practice attempt, an optional bridge journey: "Pelajari mekanisme kesalahan ini" → BridgePanel fetches the matched reviewed rule (explanation + mechanism texts + one prediction question, correct option NEVER shipped) → answering (server-graded) completes the bridge → "Coba kasus lanjutan" navigates to a scheduler-chosen unseen case with a return bar to the originating attempt. Skip/collapse any time, no grade penalty. Completion requires a response, not a page open. Assessment attempts never receive bridges (403 reveal gate preserved).

Four synthetic concept families wired end-to-end (demo releases only): exudate-vs-CWS, MA-vs-hemorrhage, leakage-vs-nonperfusion, proliferative-vs-hemorrhage-assumption. rbc-escape scoping resolved: it is covered by Q2 options/feedback and family-2 rules (no reducer change needed; the PART02 integration note is closed).

## Changes and contracts

| File/module | Behavior changed | Reason |
|---|---|---|
| `lib/domain/learning/` (new: bridge, misconceptions, scheduler) + `tests/learning/` (33 tests) | Pure rule matching (concept∩finding, empty never matches), evidence flags (1 error→provisional, ≥2 distinct→repeated, 2 later correct clears), follow-up scheduler (unseen→least-recent, tie-break, limits, protected) | Agent-built, all green |
| `db/migrations/0002_bridge.sql` + journal + `db/imaging-schema.ts` (append) | `bridge_progress`, `learning_events`, `attempts.parent_attempt_id` — all `IF NOT EXISTS`, additive | Durable bridge state |
| `lib/server/bridgeService.ts` (new) | Owner-gated bridge fetch (403 pre-submit, opaque 404), 2-per-session limit, server-derived concepts, progress/event recording | Agent-built |
| `app/api/attempts/[id]/bridge/route.ts` (new) | GET (rule + stripped question + followup + resume), POST (server-side grading, completion) | Rewritten by coordinator: answers never trusted from client, keys never serialized |
| `content/bridges/demo-bridges.ts` (new) | 4 synthetic rules with real DR-pack mechanism/scenario/question ids + `DEMO_RULE_QUESTION` map | Synthetic-only links, clearly marked |
| `lib/server/demoStore.ts` | Additive bridge tables + `createDemoBridgeRepos()` (structural twin, tsc-verified against `BridgeRepos`) | Demo journey clickable locally |
| `lib/server/repos.ts` | Unchanged interface (demo switch already existed) | — |
| `app/lab/[caseId]/LabRunner.tsx` | Bridge button/panel, follow-up navigation with `?from=` + return bar, `Suspense` boundary | State-preserving journey (viewport restore documented as limitation) |
| `components/learning/BridgePanel.tsx`, `MechanismReturnBar.tsx` (new) | Fetch/answer/collapse/follow-up; return affordance | — |
| `app/lab/lab.css` | Panel/return/question styles + light variants (atlas classes unavailable in lab routes) | — |
| `tests/integration/demo-bridges.test.ts` (new) | Rule→mechanism/scenario/question/demo-case resolution | Link integrity |

No deliberate deviations from PART04. One adaptation: follow-up eligibility reads the committed demo manifest for demo releases (no env needed) and the configured public manifest otherwise, empty on any failure — never invented.

## Verification evidence

Environment: Windows 11, Node v24.13.0, branch `part01-aqueous-runtime`.

| Command/check | Environment | Result | Evidence/location |
|---|---|---|---|
| `npm run test:domain` | vitest 3.2.4 | PASS 156/156 + 1 skipped (live-DB) | This session (14 files) |
| `npm run content:validate` + `preview-dr` | Node 24 | PASS (unchanged) | Agent transcript |
| `npm run typecheck` | tsc 5.9.3 | PASS exit 0 | This session (after bridge fixes) |
| `npx eslint` PART04 files | eslint 9 | PASS 0 errors (fixed: render-phase ref, unused vars, exhaustive-deps, demoStore scope) | This session |
| `node scripts/validate-eye.mjs` + `validate-exploration.mjs` | Node 24 | PASS | Agent transcript |
| `npm run build` | vinext/Vite 8 | PASS; route table includes bridge GET/POST | Agent + this session |
| Manual: annotate→submit→bridge→question→follow-up→return journey, touch, keyboard | NOT DONE — no browser/WebGL tooling here | Code-reviewed; viewport-restore limitation recorded | Honest gap |
| Reducer/scheduler perf | Suites run in milliseconds (vitest totals) | No isolated p95 rig; trivially fast pure functions | Recorded |

Whole-repo lint still fails on pre-existing patterns only (PART01 baseline).

## Clinical, content and rights review

- Published/draft: everything draft; bridge explanations are DR-pack draft mechanism texts; distractors remain proposed placeholders.
- No new media, no dataset, no adjudication. Demo rules reference synthetic case ids only.
- Reviewer identity/date/scope: NONE — publication gate blocked.
- Publication blocked? Yes. Internal technical preview only.

## Privacy and failure recovery

No PII (anonymous sessions persist); bridge rows carry only pseudonymous ids + booleans. Rollback: revert PART04 commit(s); base branch untouched. No messages/invitations sent; no push performed. POST validation errors are 400/404/409/422 per contract; demo store failures surface as 503/500 without secrets.

## Open issues and next prerequisites

| Issue | Impact | Owner/action | Blocks next part? |
|---|---|---|---|
| No clinical reviewer (bridges, questions, distractors) | Draft only | Founder: doctors track | Yes for publication; PART05 needs auth/tenant decisions, not this |
| No browser verification | Journey unclicked | Founder/device pass | Yes before demo-ready claim |
| Viewport/scroll restore across follow-up navigation | Return is link-level, not pixel-level | Engineering if required | No |
| Real releases have no bridges file yet | `no-rule` response (honest) | PART06/editorial when real cases exist | No |

## Completion decision

Acceptance check: 4 reviewed-shape (draft) bridges, deterministic scheduling, state-preserving journey components, evidence rules with denominators, link integrity tested, performance trivially within budget, no decorative animation without causal link. Missing: human review + browser evidence (stated). Verdict: **technically complete, review blocked**.

**Continuing to PART05 per founder order (all parts through completion, no STOP, no push).**
