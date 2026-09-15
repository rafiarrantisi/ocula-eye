# PART01 implementation report

Status: technically complete but review blocked

## Scope and authorization

- Approved part and date: PART01 (Scientific debt and working core boundary), authorized by founder message 2026-09-15 ("kerjakan sesuai instruksi ... bertahap dengan sempurna"; follow-up authorized parallel subagents for verification only).
- Initial repository SHA and branch: `76341e4` on `codex/ocula-atlas` (matches package audit baseline; tree clean except untracked founder files `Ocula_Coding_Agent_Package.zip`, `Ocula_Revised_Product_Strategy.pdf`, which were left uncommitted).
- Work branch: `part01-aqueous-runtime` (isolated; `codex/ocula-atlas` untouched).
- Final implementation commit SHA: (filled at commit time — see log).
- Report commit SHA if separate: this file committed separately per template allowance.
- Unrelated existing changes preserved: yes — no edits outside PART01 scope; orbital/aqueous/cataract/micro-view code paths untouched except the specified adapter/delegation points. No push or deploy performed.

## Working behavior delivered

Aqueous module journey, end to end: sliders (F/C/U, bounded) and presets (Normal, Resistensi TM↑, Sudut sempit, Analog PG) feed a pure versioned evaluator (`aqueous-equilibrium 0.1.0`). The physiology panel shows the Goldmann result, live balance `F = Qkonv + Quv`, and a new trace fold (rule steps with 4-decimal outputs, units, fidelity-C badge, draft status, assumptions, claim/pack versions). Presets now patch only named variables (verified by test). Invalid input is rejected with an accessible `role=alert` error while the 3D scene keeps the last valid parameters. Reset reloads the named baseline (F2.5/C0.30/U0.5/Pv9) and bumps the snapshot revision. Camera, labels, isolation, peeling, laterality, and sectioning are untouched by physiology state.

The straylight readout no longer prints calibrated `log(s)` numbers; it shows qualitative bands (ringan/sedang/kuat) with the PSC > nuclear > cortical ordering disclosed as illustrative. Veil/halo visuals are retained.

Unavailable: any approved/published status (pack is draft, no reviewer exists); server scoring, persistence, imaging, faculty workflow (PART03–05 scope).

## Changes and contracts

| File/module | Behavior changed | Reason |
|---|---|---|
| `lib/domain/simulation/aqueous.ts` (new) | Pure finite/domain validation + equilibrium + trace; model id/version constants | PART01 runtime boundary; zero-dependency, deterministic |
| `lib/domain/content/hash.ts` (new) | Dependency-free SHA-256 + UTF-8 encoder | Canonical hashing in Node and browser without new deps |
| `lib/domain/content/schema.ts` (new) | Zod contracts: Review/Source/Claim/AqueousModel/WorkedExample/ReleaseManifest + `validateAqueousPack` (duplicates, dangling refs, approved-without-identity, missing locators) | CONTRACTS subset consumed by this slice |
| `lib/domain/content/release.ts` (new) | Canonical sorted-key JSON + `hashOf` | Change detection primitive |
| `content/packs/aqueous-0.1.0/` (new: sources, claims, models, load) | Real loaded draft pack: 1 verified source (Goel 2010, section locators checked against full text 2026-09-15), 6 draft claims, 1 draft model, 3 worked examples, draft manifest; loader validates + hashes, throws on issues | "No dead pack": Explorer trace panel reads claims/version live; `content:validate` checks it |
| `components/atlas/simulationAdapter.ts` (new) | Pure `AQUEOUS_PRESETS` (patch-only), `evaluateAqueousSnapshot` (model/version/release/revision/trace), `sceneFlowSpeeds` | Adapter isolates domain from scene |
| `components/atlas/content.ts` | `illustrativeIOP`/`aqueousBalance` delegate to evaluator (signatures kept); `applyLighting` unchanged (UI day/night factor, not physiology) | No duplicated arithmetic; legacy formula deleted from content layer |
| `components/atlas/EyeScene.tsx` | Particle speeds via `sceneFlowSpeeds` (identical math, now tested) | UI consumes pure runtime |
| `components/atlas/Explorer.tsx` | Snapshot evaluation + revision, patch-only presets, invalid-input alert + last-valid scene, trace fold, qualitative straylight bands | Working slice wiring; no new state framework |
| `components/atlas/atlas.css` | `.trace-list` styles + light variant | Trace readability |
| `tests/domain/aqueous.test.ts`, `tests/domain/content.test.ts` (new) | 28 tests: CONTRACTS fixtures (tol 1e-6), validation rejections, monotonicity, determinism, preset purity, speed mapping, perf budget, hash vector, pack load, 4 negative pack cases | DoD evidence |
| `scripts/content/validate.mjs` (new) | Pack validation + hash determinism gate | `content:validate` command |
| `vitest.config.ts` (new) | Node-env, domain tests only; deliberately bypasses root vite Cloudflare config | miniflare breaks vitest startup on this machine |
| `package.json` | `typecheck`, `test:domain`, `content:validate` scripts; `vitest 3.2.4` pinned dev-only | Commands owned by this part |

No schema/API/version changes beyond aqueous 0.1.0 draft. No migrations (db untouched). No new runtime dependencies (+0 KB runtime). Deployment profile unchanged (vinext build; static prerender still marks `/` Static).

Deliberate deviations from MASTER/CONTRACTS (rationale recorded, not silently accepted):
1. Pack data as validated TS modules, not JSON files: repo conventions + Node type-stripping + bundler all resolve TS without tsconfig/build changes; loader still validates and hashes canonical bytes.
2. Manifest carries no pinned file hashes: hash function + determinism check implemented and verified; pinning belongs to a published server release (PART05), not a draft slice.
3. `illustrativeIOP`/`aqueousBalance` wrappers retained (delegating): migration rule forbids deleting legacy formulas before all consumers route through; all three consumers (Explorer, EyeScene via adapter, validate-eye) now execute evaluator code.

## Verification evidence

Environment: Windows 11, Node v24.13.0, repo `part01-aqueous-runtime`. Three parallel verification agents used; failures found were fixed and re-verified (evidence below is final state).

| Command/check | Environment | Result | Evidence/location |
|---|---|---|---|
| `npm run test:domain` | Node 24, vitest 3.2.4 | PASS, 28/28 (19 aqueous + 9 content), 3.01 s | Agent transcript; perf test asserts mean <5 ms over 2000 evals |
| `npm run content:validate` | Node 24 | PASS, 5 files hashed + stable | `sources: ok (b73eacf15a8b…)`, `claims: ok (8f990d293294…)`, `models: ok`, `examples: ok`, `manifest: ok` |
| `npm run typecheck` | tsc 5.9.3 | PASS, exit 0, ~40 s | Agent transcript |
| `npx eslint` on all PART01 files | eslint 9 | PASS, clean | Agent transcript |
| `node scripts/validate-eye.mjs` | Node 24 | PASS (incl. delegation asserts + physiology checks) | Agent transcript |
| `node scripts/validate-exploration.mjs` | Node 24 | PASS (incl. 49/41/20-surface section caps) | Agent transcript |
| `npm run build` | vinext/Vite 8 | PASS (~33 s build; only pre-existing >500 KB chunk warning) | Agent transcript |
| `npm run build:static` + serve | Node 24 + python http | PASS: prerender marks `/` Static (exercises loader+snapshot server-side), `dist/static/index.html` serves HTTP 200 with app title | This session |
| Manual: sliders/presets/reset/invalid | Code-reviewed, not browser-executed | Sliders bounded (invalid unreachable); evaluator rejection + alert + last-valid covered by tests; trace fold uses native details/buttons | PART01 code |
| Manual: browser/WebGL journey | NOT DONE — no WebGL browser tooling in this environment | 3D appearance, 390 px touch, keyboard walkthrough unverified | Honest gap, see issues |

Agent-found failures during the run (fixed, re-verified PASS): (1) extensionless TS imports fail under plain Node → explicit `.ts` throughout new files; (2) `AqueousPackFiles.reviews` required but unconsumed → field removed; (3) vitest loaded root Cloudflare config and crashed (miniflare spawn UNKNOWN) → minimal `vitest.config.ts`; (4) wrong test expectation on narrow-preset speed (qConv is higher, not lower) → rewritten as equilibrium-invariance assertion, which is the actual teaching point. `npm run lint` on the whole repo FAILS on pre-existing errors only (Explorer/EyeScene hooks patterns, orbitGeometry prefer-const) — none in PART01 files, none introduced here.

Performance: reducer mean <5 ms asserted in-suite; no new runtime JS (vitest dev-only); no added globe meshes; slider path performs no geometry rebuild (unchanged code path). 390 px: trace fold is text-only, inherits responsive inspector; not device-measured (see gap above).

## Clinical, content and rights review

- Published/draft pack and versions: `aqueous-draft 0.1.0`, everything `draft`. Nothing approved, nothing published.
- Case inventory and partition counts: n/a (no imaging in PART01).
- Rights evidence/archive hashes: n/a (no media; the one pack source is an open-access review already cited by the app).
- Reviewer identity/date/scope: NONE — publication gate blocked, correctly.
- Unresolved disagreement or limitations: ONH assertions below are flagged, not edited.
- Publication blocked? Yes — no clinical reviewer. Internal technical preview only.

ONH overly-categorical assertions (text UNCHANGED per protocol — agent must not rewrite clinical truth from memory; reviewer approval required). Proposed reviewer checks:
1. `cup` role: "rasio cup/disc vertikal adalah metrik skrining utama" — please confirm against current glaucoma screening guidance (c/d as initial vs confirmatory metric) or soften to "metrik skrining awal".
2. `rnfl` clinical: "Penipisan sektoral RNFL mendahului defek lapang" — please confirm universality or scope to typical early glaucoma (counterexamples exist).
3. `rim` clinical: "Notch rim + perdarahan diskus + defek lapang setempat = trias glaukoma" — please confirm "trias" framing vs co-occurring signs.
4. `vessels` role: "pulsasi vena spontan menandakan tekanan intrakranial tidak kritis" — please confirm direction/strength of inference.
General unreviewed banner ("Model edukasi · belum divalidasi klinis") already present in-app.

## Privacy and failure recovery

No backend, accounts, PII, telemetry, uploads, or secrets in this slice. Pack contains only public-review citations. Rollback: revert this branch (`git revert` or drop `part01-aqueous-runtime`; `codex/ocula-atlas` untouched). No migrations to roll back. No messages/invitations sent; no push performed.

## Open issues and next prerequisites

| Issue | Impact | Owner/action | Blocks next part? |
|---|---|---|---|
| No clinical reviewer for aqueous draft | Pack stays draft; internal preview only | Founder: book reviewer | Yes, for any publication claim; no for PART02 start (needs PART02 reviewer availability anyway) |
| No WebGL browser verification in agent env | 3D/touch/keyboard journey unverified | Founder or device pass: run app, exercise trace panel + presets on desktop + 390 px | Yes, before calling slice demo-ready |
| Whole-repo `npm run lint` fails (pre-existing) | Cannot claim repo-wide lint gate | Engineering: separate cleanup (out of PART01 scope) | No (PART01 files clean) |
| Dev server (vinext/miniflare) cannot spawn worker here | Local interactive dev blocked in this sandbox | Environment: investigate miniflare spawn UNKNOWN (-4094) on Windows | No (build + static serve verified) |
| ONH assertions unreviewed | Must stay draft-flagged | Reviewer (list above) | No for PART02 (retina reviewer is separate need) |

## Completion decision

Acceptance check: UI consumes pure runtime (yes — Explorer snapshot/trace/presets, EyeScene speeds, content.ts delegation); numerical + geometry checks pass (28 domain tests, both geometry validators, typecheck, build); identity preserved (visual/prose/geometry untouched except specified points); source pack is used and inspectable (loaded at runtime, validated, hashed); public clinical slice reviewed — NOT DONE, no reviewer exists. Verdict: **technically complete, review blocked**. Missing evidence candidly: browser/WebGL journey, reviewer approval.

**STOPPED. No later part has been started. Await explicit founder approval for PART02.**
