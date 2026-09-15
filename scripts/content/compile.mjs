// scripts/content/compile.mjs — compiles an imaging teaching source pack into
// a PUBLIC manifest (safe for clients) and a PRIVATE pack (server-only truth).
//
// SOURCE PACK DIR FORMAT (defined here; the imaging slice owns this contract):
//   <source>/
//     pack.json            { "releaseId": string, "version": string }
//     cases.source.json    [ {
//                            "caseId": string, "title": string,
//                            "modality": string,
//                            "tasks": [ { "taskId": string,
//                                         "kind": "single_choice" | "multi_choice" | "free_text",
//                                         "prompt": string,
//                                         "options"?: [ { "id": string, "text": string } ] } ],
//                            "media": [ { "file": string, "attribution"?: string } ],
//                            "attribution"?: string,
//                            "review"?: { status, scope, ... } (validated by
//                                       lib/domain/content/schema.ts reviewSchema)
//                          } ]
//     truth.private.json   { "cases": [ { "caseId": string,
//                                         "answers": { [taskId]: optionId },
//                                         "diagnosis"?: string,
//                                         "masks"?: string[] } ] }
//     media/               .png/.jpg/.jpeg files referenced by cases.source.json
//
// PUBLIC OUTPUT (public-manifest.json): release/version, per-case tasks WITHOUT
// answers, media metadata (content-hashed asset name, bytes, sha256,
// dimensions) + attribution. NEVER answers, masks, truth, or diagnostic
// filenames. PRIVATE OUTPUT (private-pack.json): release/version + per-case
// truth for server-side scoring only.
//
// Validation: structural checks here + reviewSchema from
// lib/domain/content/schema.ts + lib/domain/imaging/* schemas when present
// (parallel-agent owned; absence is noted and skipped, never fatal).
// Separation is asserted by scanning the public output for answer-bearing
// keys; any hit fails the build (exit 1).
//
// Usage:
//   node scripts/content/compile.mjs --source <dir> --out <dir>
//   node scripts/content/compile.mjs --help
// Prints the sha256 of both outputs on success.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reviewSchema } from '../../lib/domain/content/schema.ts';

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
  console.log(`content compile — imaging source pack -> public-manifest.json + private-pack.json

Usage:
  node scripts/content/compile.mjs --source <dir> --out <dir>
  node scripts/content/compile.mjs --help

Options:
  --source <dir>   Source pack dir (pack.json, cases.source.json,
                   truth.private.json, media/). Required.
  --out <dir>      Output dir for public-manifest.json + private-pack.json.
                   Also accepted as --output. Required.
  --help           Print this help and exit 0.`);
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function sha256HexString(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sniffPng(buf) {
  if (buf.length < 33) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function sniffJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return null;
    const marker = buf[pos + 1];
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const len = buf.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > buf.length) return null;
    if (sof.has(marker)) {
      if (len < 7) return null;
      return { height: buf.readUInt16BE(pos + 5), width: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + len;
  }
  return null;
}

/** Walk an object tree collecting any answer-bearing key names. */
function findLeakedKeys(value, trail = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findLeakedKeys(v, `${trail}[${i}]`, hits));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (ANSWER_BEARING_KEYS.includes(k)) hits.push(`${trail}.${k}`);
      findLeakedKeys(v, `${trail}.${k}`, hits);
    }
  }
  return hits;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}
let source = null;
let out = null;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--source' && i + 1 < args.length) {
    source = args[(i += 1)];
  } else if ((arg === '--out' || arg === '--output') && i + 1 < args.length) {
    out = args[(i += 1)];
  } else {
    fail(2, `content compile: unknown argument: ${arg}\nRun with --help for usage.`);
  }
}
if (!source) fail(2, 'content compile: --source <dir> is required.\nRun with --help for usage.');
if (!out) fail(2, 'content compile: --out <dir> is required.\nRun with --help for usage.');

const sourceDir = path.resolve(source);
const outDir = path.resolve(out);

async function readJson(name) {
  try {
    return JSON.parse(await readFile(path.join(sourceDir, name), 'utf8'));
  } catch (err) {
    fail(1, `content compile: cannot read ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const pack = await readJson('pack.json');
const casesSource = await readJson('cases.source.json');
const truthDoc = await readJson('truth.private.json');

const issues = [];
if (!pack || typeof pack.releaseId !== 'string' || !pack.releaseId) {
  issues.push('pack.json: releaseId (string) is required');
}
if (!pack || typeof pack.version !== 'string' || !pack.version) {
  issues.push('pack.json: version (string) is required');
}
if (!Array.isArray(casesSource) || casesSource.length === 0) {
  issues.push('cases.source.json: non-empty array is required');
}
if (!truthDoc || !Array.isArray(truthDoc.cases)) {
  issues.push('truth.private.json: { cases: [...] } is required');
}

// Parallel-agent imaging schemas: use when present, note the skip otherwise.
let imagingSchemas = null;
try {
  imagingSchemas = await import('../../lib/domain/imaging/schema.ts');
} catch {
  console.log('content compile: lib/domain/imaging/* absent (parallel slice); local checks only.');
}
if (imagingSchemas?.validateImagingPack) {
  for (const issue of imagingSchemas.validateImagingPack({ pack, cases: casesSource, truth: truthDoc })) {
    issues.push(`imaging-schema: ${issue}`);
  }
}

const seenCases = new Set();
const truthByCase = new Map();
for (const t of truthDoc.cases ?? []) {
  if (t && typeof t.caseId === 'string') truthByCase.set(t.caseId, t);
}

const publicCases = [];
for (const c of casesSource ?? []) {
  const where = `case ${c?.caseId ?? '?'}`;
  if (!c || typeof c.caseId !== 'string' || !c.caseId) {
    issues.push(`${where}: caseId is required`);
    continue;
  }
  if (seenCases.has(c.caseId)) issues.push(`${where}: duplicate caseId`);
  seenCases.add(c.caseId);
  if (typeof c.title !== 'string' || !c.title) issues.push(`${where}: title is required`);
  if (typeof c.modality !== 'string' || !c.modality) issues.push(`${where}: modality is required`);
  if (c.review !== undefined) {
    const parsed = reviewSchema.safeParse(c.review);
    if (!parsed.success) issues.push(`${where}: review: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  // Source cases must not carry truth inline; truth lives in truth.private.json.
  const leaks = findLeakedKeys({ tasks: c.tasks, media: c.media });
  if (leaks.length > 0) issues.push(`${where}: answer-bearing keys in source: ${leaks.join(', ')}`);
  if (!Array.isArray(c.tasks) || c.tasks.length === 0) {
    issues.push(`${where}: tasks (non-empty array) is required`);
    continue;
  }
  const seenTasks = new Set();
  for (const t of c.tasks) {
    if (!t || typeof t.taskId !== 'string' || !t.taskId) {
      issues.push(`${where}: task.taskId is required`);
      continue;
    }
    if (seenTasks.has(t.taskId)) issues.push(`${where}: duplicate taskId ${t.taskId}`);
    seenTasks.add(t.taskId);
    if (typeof t.prompt !== 'string' || !t.prompt) issues.push(`${where}: task ${t.taskId}: prompt is required`);
    if (t.options !== undefined) {
      if (!Array.isArray(t.options) || t.options.length < 2) {
        issues.push(`${where}: task ${t.taskId}: options needs >= 2 entries`);
      }
    }
  }
  const truth = truthByCase.get(c.caseId);
  if (!truth) {
    issues.push(`${where}: missing truth entry in truth.private.json`);
  } else if (!truth.answers || typeof truth.answers !== 'object') {
    issues.push(`${where}: truth.answers object is required`);
  } else {
    for (const taskId of Object.keys(truth.answers)) {
      if (!seenTasks.has(taskId)) issues.push(`${where}: truth answers unknown task ${taskId}`);
    }
  }
  if (!Array.isArray(c.media)) {
    issues.push(`${where}: media array is required`);
    continue;
  }
  const publicMedia = [];
  for (const m of c.media) {
    if (!m || typeof m.file !== 'string' || !m.file) {
      issues.push(`${where}: media.file is required`);
      continue;
    }
    if (m.file.includes('..') || path.isAbsolute(m.file) || m.file.includes('\\')) {
      issues.push(`${where}: media.file escapes pack: ${m.file}`);
      continue;
    }
    let data;
    try {
      data = await readFile(path.join(sourceDir, 'media', m.file));
    } catch {
      issues.push(`${where}: media file missing: ${m.file}`);
      continue;
    }
    const ext = path.extname(m.file).toLowerCase();
    const dims = ext === '.png' ? sniffPng(data) : ext === '.jpg' || ext === '.jpeg' ? sniffJpeg(data) : null;
    if (!dims) {
      issues.push(`${where}: media undecodable: ${m.file}`);
      continue;
    }
    const sha256 = createHash('sha256').update(data).digest('hex');
    publicMedia.push({
      asset: `${sha256.slice(0, 16)}${ext}`,
      bytes: data.length,
      sha256,
      width: dims.width,
      height: dims.height,
      attribution: typeof m.attribution === 'string' ? m.attribution : undefined,
    });
  }
  publicCases.push({
    caseId: c.caseId,
    title: c.title,
    modality: c.modality,
    tasks: c.tasks.map((t) => ({
      taskId: t.taskId,
      kind: t.kind,
      prompt: t.prompt,
      options: t.options,
    })),
    media: publicMedia,
    attribution: typeof c.attribution === 'string' ? c.attribution : undefined,
  });
}

if (issues.length > 0) {
  for (const issue of issues) console.error(`content compile: ${issue}`);
  process.exit(1);
}

const publicManifest = {
  releaseId: pack.releaseId,
  version: pack.version,
  schemaVersion: 'imaging-1',
  cases: publicCases,
};
const privatePack = {
  releaseId: pack.releaseId,
  version: pack.version,
  schemaVersion: 'imaging-1',
  cases: [...truthByCase.values()],
};

// Separation assert: the public output must not contain answer-bearing keys.
const hits = findLeakedKeys(publicManifest);
if (hits.length > 0) {
  console.error(`content compile: SEPARATION FAILURE, public output carries truth keys: ${hits.join(', ')}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const publicText = `${JSON.stringify(publicManifest, null, 2)}\n`;
const privateText = `${JSON.stringify(privatePack, null, 2)}\n`;
await writeFile(path.join(outDir, 'public-manifest.json'), publicText, 'utf8');
await writeFile(path.join(outDir, 'private-pack.json'), privateText, 'utf8');
console.log(`content compile: public-manifest.json sha256=${sha256HexString(publicText)}`);
console.log(`content compile: private-pack.json sha256=${sha256HexString(privateText)}`);
console.log(`content compile: ok (${publicCases.length} cases, separation assert passed).`);
