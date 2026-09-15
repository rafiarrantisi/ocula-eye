// scripts/pilot/validate.mjs — stage-gated pilot validation for imaging packs.
//
// Usage:
//   node scripts/pilot/validate.mjs [--stage demo|release12|release36|release60]
//     [--manifest PATH] [--private PATH] [--quarantine PATH]
//   node scripts/pilot/validate.mjs --help
//
// Defaults (demo): --manifest public/lab-demo/public-manifest.json
//   --private private/lab-demo/full-pack.json
//
// Checks (each prints PASS/FAIL; any FAIL exits 1):
//   1. inventory - case counts vs stage target + synthetic marking (demo)
//   2. partitions - public/private caseId sets identical + partition disjointness
//   3. rights - per-case attribution; synthetic marker (demo) / rights (release)
//   4. reviews - per-case review scope or draft flag + coverage percent
//   5. hashes - sha256 digests of both manifest files (consistency check)
//   6. rubric - truth answer keys subset of task ids + version pins
//   7. separation - public manifest carries no answer-bearing keys
//   8. quarantine - quarantined ids excluded from practice pools (or vacuous)
//
// Recorded limitations (honest gates, see PART_06):
//   - The brief names private/lab-demo/full-pack.json and
//     scripts/imaging/compile.mjs, but this repo stores private truth at
//     lab-demo/private/private-pack.json and the compiler at
//     scripts/content/compile.mjs. Defaults keep the brief-specified paths;
//     pass explicit --manifest/--private for the real demo files (as
//     tests/pilot/validate.test.ts does).
//   - Demo manifests carry no review, rights, source or partitions fields, so
//     demo-stage checks treat absent review as implicit draft (per MASTER.md:
//     medical content stays draft until human-approved), absent
//     partitions/quarantine as vacuous PASS with note, and the synthetic
//     marker as a case-insensitive synthetic scan over caseId/attribution
//     text instead of a source field.
//   - The rubric check validates key-subset only (truth keys are a subset of
//     task ids); it does not adjudicate accepted-grade-set ambiguity (for
//     example null gradeExpected) or scoring tolerance.
//   - The hash check prints file digests for change detection; it does not
//     re-verify per-asset media bytes against manifest sha256 entries.
//   - The quarantine check is script-level only (JSON id list); it does not
//     query any database quarantine table.
//
// Style: single quotes, semicolons, Unix LF, plain node (no dependencies).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const STAGES = ['demo', 'release12', 'release36', 'release60'];
const STAGE_MIN = { demo: 0, release12: 12, release36: 36, release60: 60 };
const DEFAULT_MANIFEST = 'public/lab-demo/public-manifest.json';
const DEFAULT_PRIVATE = 'lab-demo/private/private-pack.json';

// NOTE (required duplication): ANSWER_BEARING_KEYS is copied verbatim from
// scripts/content/compile.mjs (the brief names scripts/imaging/compile.mjs,
// but the compiler actually lives at scripts/content/compile.mjs in this
// repo). It is duplicated here — not imported — so this pilot gate keeps
// failing closed even if the compiler moves or its list changes.
const ANSWER_BEARING_KEYS = [
  'answers',
  'answer',
  'correctOptionId',
  'correctOption',
  'diagnosis',
  'finding',
  'findings',
  'mask',
  'masks',
  'truth',
  'label',
  'labels',
];

function usage() {
  console.log([
    'pilot validate — stage-gated imaging pack checks',
    '',
    'Usage:',
    '  node scripts/pilot/validate.mjs [--stage demo|release12|release36|release60]',
    '    [--manifest PATH] [--private PATH] [--quarantine PATH]',
    '  node scripts/pilot/validate.mjs --help',
    '',
    'Defaults: --stage demo, --manifest ' + DEFAULT_MANIFEST + ',',
    '  --private ' + DEFAULT_PRIVATE + '.',
    '--quarantine is optional; when omitted check 8 is a vacuous PASS.',
  ].join('\n'));
}

function failUsage(message) {
  console.error('pilot validate: ' + message);
  console.error('Run with --help for usage.');
  process.exit(2);
}

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  usage();
  process.exit(0);
}
let stage = 'demo';
let manifestPath = DEFAULT_MANIFEST;
let privatePath = DEFAULT_PRIVATE;
let quarantinePath = null;
for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === '--stage' && i + 1 < rawArgs.length) {
    stage = rawArgs[(i += 1)];
  } else if (arg === '--manifest' && i + 1 < rawArgs.length) {
    manifestPath = rawArgs[(i += 1)];
  } else if (arg === '--private' && i + 1 < rawArgs.length) {
    privatePath = rawArgs[(i += 1)];
  } else if (arg === '--quarantine' && i + 1 < rawArgs.length) {
    quarantinePath = rawArgs[(i += 1)];
  } else {
    failUsage('unknown argument: ' + arg);
  }
}
if (!STAGES.includes(stage)) {
  failUsage('unknown --stage ' + stage + ' (expected one of ' + STAGES.join(', ') + ').');
}

async function readJsonDoc(label, file) {
  let text = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    console.error('pilot validate: cannot read ' + label + ' file ' + file + ': ' + (err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }
  try {
    return { text, doc: JSON.parse(text) };
  } catch (err) {
    console.error('pilot validate: invalid JSON in ' + label + ' file ' + file + ': ' + (err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }
  return null;
}

const manifestFile = path.resolve(manifestPath);
const privateFile = path.resolve(privatePath);
const manifestWrap = await readJsonDoc('manifest', manifestFile);
const privateWrap = await readJsonDoc('private', privateFile);
const manifest = manifestWrap.doc;
const privateDoc = privateWrap.doc;
const asArray = (v) => (Array.isArray(v) ? v : []);
const publicCases = Array.isArray(manifest) ? manifest : asArray(manifest.cases);
const privateCases = Array.isArray(privateDoc) ? privateDoc : asArray(privateDoc.cases);

function caseIdOf(c) {
  return c && typeof c.caseId === 'string' ? c.caseId : '';
}

function isSyntheticMarked(value) {
  if (value === undefined || value === null) {
    return false;
  }
  return /synthetic/i.test(String(value));
}

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + id + '/8 ' + name + ' - ' + detail);
}

// 1. Inventory count vs stage target.
{
  const min = STAGE_MIN[stage];
  const pubIds = publicCases.map(caseIdOf);
  const countsEqual = publicCases.length === privateCases.length;
  let pass = false;
  let detail = '';
  if (stage === 'demo') {
    const marked = pubIds.filter((id) => isSyntheticMarked(id));
    pass = publicCases.length > 0 && countsEqual && marked.length === pubIds.length;
    detail = 'public=' + publicCases.length + ' private=' + privateCases.length + ' synthetic-marked=' + marked.length + '/' + pubIds.length + ' (demo requires equal counts, all synthetic)';
  } else {
    pass = publicCases.length >= min && privateCases.length >= min && countsEqual;
    detail = 'public=' + publicCases.length + ' private=' + privateCases.length + ' minimum=' + min + ' countsEqual=' + countsEqual;
  }
  record('1', 'inventory', pass, detail);
}

// 2. Partition disjointness + public/private caseId set identity.
{
  const pubSet = new Set(publicCases.map(caseIdOf));
  const privSet = new Set(privateCases.map(caseIdOf));
  const missingInPrivate = [...pubSet].filter((id) => !privSet.has(id));
  const missingInPublic = [...privSet].filter((id) => !pubSet.has(id));
  const setsEqual = missingInPrivate.length === 0 && missingInPublic.length === 0;
  let partitionsNote = 'no partitions field in manifest; vacuous PASS (subset rule not yet published)';
  let partitionsOk = true;
  const partitionsField = !Array.isArray(manifest) && manifest ? manifest.partitions : undefined;
  if (partitionsField !== undefined) {
    let table = null;
    if (typeof partitionsField === 'string') {
      const partFile = path.resolve(path.dirname(manifestFile), partitionsField);
      const wrap = await readJsonDoc('partitions', partFile);
      const pdoc = wrap.doc;
      if (pdoc && typeof pdoc === 'object' && !Array.isArray(pdoc) && pdoc.partitions && typeof pdoc.partitions === 'object') {
        table = pdoc.partitions;
      } else {
        table = pdoc;
      }
    } else if (partitionsField && typeof partitionsField === 'object') {
      if (partitionsField.partitions && typeof partitionsField.partitions === 'object') {
        table = partitionsField.partitions;
      } else {
        table = partitionsField;
      }
    }
    if (!table || typeof table !== 'object' || Array.isArray(table)) {
      partitionsOk = false;
      partitionsNote = 'partitions field present but not a name-to-caseId-array map';
    } else {
      const seen = new Map();
      const unknown = [];
      const entries = Object.entries(table);
      for (const [name, ids] of entries) {
        if (!Array.isArray(ids)) {
          partitionsOk = false;
          partitionsNote = 'partition ' + name + ' is not an array';
          break;
        }
        for (const id of ids) {
          if (!pubSet.has(id)) {
            unknown.push(name + ':' + String(id));
          }
          if (seen.has(id)) {
            partitionsOk = false;
            partitionsNote = 'duplicate case ' + String(id) + ' in partitions ' + seen.get(id) + ' + ' + name;
          } else {
            seen.set(id, name);
          }
        }
        if (!partitionsOk) {
          break;
        }
      }
      if (partitionsOk && unknown.length > 0) {
        partitionsOk = false;
        partitionsNote = 'partition ids missing from manifest: ' + unknown.join(', ');
      }
      if (partitionsOk && Array.isArray(table.guided) && Array.isArray(table.practice)) {
        const practiceSet = new Set(table.practice);
        const outside = table.guided.filter((id) => !practiceSet.has(id));
        if (outside.length > 0) {
          partitionsOk = false;
          partitionsNote = 'guided not subset of practice: ' + outside.join(', ');
        }
      }
      if (partitionsOk) {
        const names = Object.keys(table).map((n) => n + '=' + table[n].length).join(' ');
        partitionsNote = 'disjoint partitions ok (' + names + ')';
      }
    }
  }
  let detail = 'setsIdentical=' + setsEqual;
  if (!setsEqual) {
    detail += ' missingInPrivate=[' + missingInPrivate.join(', ') + '] missingInPublic=[' + missingInPublic.join(', ') + ']';
  }
  detail += '; ' + partitionsNote;
  record('2', 'partitions', setsEqual && partitionsOk, detail);
}

// 3. Rights: attribution everywhere; synthetic marker (demo) or rights (release).
{
  const noAttrib = [];
  const nonSynthetic = [];
  for (const c of publicCases) {
    const id = caseIdOf(c) || '?';
    const attrib = c ? c.attribution : undefined;
    if (typeof attrib !== 'string' || attrib.length === 0) {
      noAttrib.push(id);
    }
    if (!isSyntheticMarked(JSON.stringify(c))) {
      nonSynthetic.push(id);
    }
  }
  const attribOk = noAttrib.length === 0;
  let pass = false;
  let detail = '';
  if (stage === 'demo') {
    pass = attribOk && nonSynthetic.length === 0;
    detail = 'attribution=' + (publicCases.length - noAttrib.length) + '/' + publicCases.length + ' synthetic-marked=' + (publicCases.length - nonSynthetic.length) + '/' + publicCases.length;
    if (nonSynthetic.length > 0) {
      detail += ' non-synthetic: ' + nonSynthetic.join(', ');
    }
    if (noAttrib.length > 0) {
      detail += ' missing-attribution: ' + noAttrib.join(', ');
    }
    detail += ' (no source/rights fields in demo manifests; marker via text scan)';
  } else {
    const manifestRights = !Array.isArray(manifest) && manifest && Array.isArray(manifest.rights) ? manifest.rights : [];
    const covered = new Set(manifestRights.map((r) => (r && (r.caseId || r.id)) || ''));
    const uncovered = [];
    for (const c of publicCases) {
      const id = caseIdOf(c) || '?';
      const rights = c ? c.rights : undefined;
      const rightsText = rights === undefined || rights === null ? '' : JSON.stringify(rights);
      const ok = (rightsText.length > 2 && !isSyntheticMarked(rightsText)) || covered.has(id);
      if (!ok) {
        uncovered.push(id);
      }
    }
    pass = attribOk && uncovered.length === 0;
    detail = 'attribution=' + (publicCases.length - noAttrib.length) + '/' + publicCases.length + ' non-synthetic-rights=' + (publicCases.length - uncovered.length) + '/' + publicCases.length;
    if (uncovered.length > 0) {
      detail += ' missing/non-synthetic-rights: ' + uncovered.join(', ');
    }
  }
  record('3', 'rights', pass, detail);
}

// 4. Reviews: scope or draft flag per case + reviewer/date/scope coverage.
{
  let withReviewer = 0;
  let withDate = 0;
  let withScope = 0;
  const bad = [];
  for (const c of publicCases) {
    const id = caseIdOf(c) || '?';
    const review = c ? c.review : undefined;
    const scope = review ? review.scope : undefined;
    const hasScope = Array.isArray(scope) && scope.length > 0;
    const reviewer = review ? (review.reviewerId || review.reviewer) : undefined;
    const hasReviewer = typeof reviewer === 'string' && reviewer.length > 0;
    const date = review ? (review.reviewedAt || review.date) : undefined;
    const hasDate = typeof date === 'string' && date.length > 0;
    if (hasScope) {
      withScope += 1;
    }
    if (hasReviewer) {
      withReviewer += 1;
    }
    if (hasDate) {
      withDate += 1;
    }
    let ok = false;
    if (stage === 'demo') {
      const isDraft = review ? review.status === 'draft' : false;
      ok = hasScope || isDraft || review === undefined;
    } else {
      const blocked = review ? (review.status === 'draft' || review.status === 'rejected' || review.status === 'quarantined') : true;
      ok = hasScope && hasReviewer && hasDate && !blocked;
    }
    if (!ok) {
      bad.push(id);
    }
  }
  const n = publicCases.length;
  const pct = (x) => (n === 0 ? 'n/a' : Math.round((x / n) * 100) + '%');
  let detail = 'reviewer=' + pct(withReviewer) + ' date=' + pct(withDate) + ' scope=' + pct(withScope) + ' (' + withReviewer + '/' + withDate + '/' + withScope + ' of ' + n + ')';
  if (bad.length > 0) {
    detail += ' failing: ' + bad.join(', ');
  }
  if (stage === 'demo') {
    detail += ' (absent review counts as implicit draft)';
  }
  record('4', 'reviews', bad.length === 0, detail);
}

// 5. Hashes: recompute sha256 of both manifest files (consistency check).
{
  const manifestHash = createHash('sha256').update(manifestWrap.text, 'utf8').digest('hex');
  const privateHash = createHash('sha256').update(privateWrap.text, 'utf8').digest('hex');
  record('5', 'hashes', true, 'manifest sha256=' + manifestHash + ' private sha256=' + privateHash);
}

// 6. Rubric consistency: truth keys subset of task ids + version pins.
{
  const pinProblems = [];
  const pinOf = (doc, label) => {
    const version = !Array.isArray(doc) && doc ? doc.version : undefined;
    const schemaVersion = !Array.isArray(doc) && doc ? doc.schemaVersion : undefined;
    const release = !Array.isArray(doc) && doc ? (doc.releaseId || doc.release || doc.packId) : undefined;
    if (typeof version !== 'string' || version.length === 0) {
      pinProblems.push(label + ': version missing/empty');
    }
    if (typeof schemaVersion !== 'string' || schemaVersion.length === 0) {
      pinProblems.push(label + ': schemaVersion missing/empty');
    }
    if (typeof release !== 'string' || release.length === 0) {
      pinProblems.push(label + ': release/releaseId missing/empty');
    }
    return release;
  };
  const pubRelease = pinOf(manifest, 'manifest');
  const privRelease = pinOf(privateDoc, 'private');
  if (typeof pubRelease === 'string' && typeof privRelease === 'string' && pubRelease !== privRelease) {
    pinProblems.push('release mismatch: manifest=' + pubRelease + ' private=' + privRelease);
  }
  const pubTasksByCase = new Map();
  for (const c of publicCases) {
    const tasks = c && Array.isArray(c.tasks) ? c.tasks : [];
    pubTasksByCase.set(caseIdOf(c), new Set(tasks.map((t) => (t && t.taskId) || '')));
  }
  const rubricProblems = [];
  for (const t of privateCases) {
    const id = caseIdOf(t) || '?';
    const taskIds = pubTasksByCase.get(caseIdOf(t));
    if (!taskIds) {
      rubricProblems.push(id + ': no public case');
      continue;
    }
    const truthKeys = [];
    if (t && t.answers && typeof t.answers === 'object') {
      truthKeys.push(...Object.keys(t.answers));
    }
    if (t && t.gradeExpected && typeof t.gradeExpected === 'object') {
      truthKeys.push(...Object.keys(t.gradeExpected));
    }
    if (t && t.localization && typeof t.localization.taskId === 'string') {
      truthKeys.push(t.localization.taskId);
    }
    for (const key of truthKeys) {
      if (!taskIds.has(key)) {
        rubricProblems.push(id + ': truth key not a task id: ' + key);
      }
    }
  }
  const problems = pinProblems.concat(rubricProblems);
  let detail = '';
  if (problems.length === 0) {
    const pubVersion = !Array.isArray(manifest) && manifest ? manifest.version : '?';
    const pubSchema = !Array.isArray(manifest) && manifest ? manifest.schemaVersion : '?';
    detail = 'pins ok release=' + pubRelease + ' version=' + pubVersion + ' schema=' + pubSchema + '; truth keys subset of task ids in ' + privateCases.length + ' cases';
  } else {
    detail = problems.join('; ');
  }
  record('6', 'rubric', problems.length === 0, detail);
}

// 7. Answer separation: public manifest must not carry answer-bearing keys.
{
  const hits = [];
  const walk = (value, trail) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, trail + '[' + i + ']'));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (ANSWER_BEARING_KEYS.includes(k)) {
          hits.push(trail + '.' + k);
        }
        walk(v, trail + '.' + k);
      }
    }
  };
  walk(manifest, '$');
  const detail = hits.length === 0
    ? 'no answer-bearing keys in public manifest (' + ANSWER_BEARING_KEYS.length + ' keys scanned)'
    : 'leaked keys: ' + hits.join(', ');
  record('7', 'separation', hits.length === 0, detail);
}

// 8. Quarantine adjacency (script-level): quarantined ids excluded from pools.
{
  if (!quarantinePath) {
    record('8', 'quarantine', true, 'no --quarantine file passed; vacuous PASS');
  } else {
    const qFile = path.resolve(quarantinePath);
    const wrap = await readJsonDoc('quarantine', qFile);
    const qdoc = wrap.doc;
    let ids = [];
    if (Array.isArray(qdoc)) {
      ids = qdoc;
    } else if (qdoc && typeof qdoc === 'object') {
      const cand = qdoc.quarantined || qdoc.quarantine || qdoc.releaseIds || qdoc.caseIds || qdoc.quarantinedCaseIds || qdoc.quarantinedReleaseIds || [];
      ids = Array.isArray(cand) ? cand : [];
    }
    const qset = new Set(ids.map((x) => String(x)));
    const pool = new Set(publicCases.map(caseIdOf));
    const rel = !Array.isArray(manifest) && manifest ? (manifest.releaseId || manifest.release) : undefined;
    if (typeof rel === 'string') {
      pool.add(rel);
    }
    const hits = [...qset].filter((id) => pool.has(id));
    const detail = hits.length === 0
      ? 'quarantined=' + qset.size + ' none present in practice pool'
      : 'quarantined ids present in pool: ' + hits.join(', ');
    record('8', 'quarantine', hits.length === 0, detail);
  }
}

const passed = results.filter((r) => r.pass).length;
console.log('pilot validate: ' + passed + '/' + results.length + ' checks passed (stage=' + stage + ' manifest=' + manifestFile + ' private=' + privateFile + ').');
process.exit(passed === results.length ? 0 : 1);
