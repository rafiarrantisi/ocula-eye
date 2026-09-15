// Generates a fully SYNTHETIC 12-case demo pack (no clinical data) and
// compiles it with scripts/content/compile.mjs:
//   lab-demo/source/      (gitignored: generator input incl. synthetic truth)
//   public/lab-demo/      (committed: public-manifest.json + hashed PNG media)
//   lab-demo/private/     (gitignored: private-pack.json for the server)
// Deterministic (seeded); rerunning reproduces byte-identical media.
// Usage: node scripts/imaging/demo-pack.mjs [--only-media|--only-compile]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'lab-demo', 'source');
const PUBLIC = path.join(ROOT, 'public', 'lab-demo');
const PRIVATE = path.join(ROOT, 'lab-demo', 'private');
const W = 1000;
const RELEASE = 'demo-synthetic-0.1.0';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minimal PNG writer (8-bit RGB, filter 0). No dependencies.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(pixels) {
  const raw = Buffer.alloc(W * (W * 3 + 1));
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      const p = (y * W + x) * 3;
      raw[o] = pixels[p]; raw[o + 1] = pixels[p + 1]; raw[o + 2] = pixels[p + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- raster helpers (pixel units) ---
function makeCanvas() {
  return { buf: Buffer.alloc(W * W * 3, 0), };
}
function dot(cv, cx, cy, r, col) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(W - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const o = (y * W + x) * 3;
        cv.buf[o] = col[0]; cv.buf[o + 1] = col[1]; cv.buf[o + 2] = col[2];
      }
    }
  }
}
function ellipse(cv, cx, cy, rx, ry, col) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(W - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
        const o = (y * W + x) * 3;
        cv.buf[o] = col[0]; cv.buf[o + 1] = col[1]; cv.buf[o + 2] = col[2];
      }
    }
  }
}
function stroke(cv, pts, w, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) dot(cv, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, w / 2, col);
  }
}

const RETINA = [122, 44, 22];
const VESSEL = [140, 28, 28];
const DISC = [232, 200, 148];
const MACULA = [74, 24, 14];
const LESION = {
  microaneurysm: [255, 70, 60],
  hemorrhage: [200, 20, 20],
  hard_exudate: [255, 214, 10],
  cotton_wool_spot: [245, 238, 225],
};

// Lesion plan per case: [nx, ny, classId]. px = n * 1000.
const LESIONS = {
  'synthetic-loc-1': [[0.62, 0.42, 'microaneurysm']],
  'synthetic-loc-2': [[0.35, 0.55, 'hemorrhage'], [0.68, 0.6, 'hemorrhage']],
  'synthetic-loc-3': [[0.46, 0.42, 'hard_exudate'], [0.54, 0.46, 'hard_exudate'], [0.5, 0.52, 'hard_exudate'], [0.58, 0.4, 'hard_exudate'], [0.44, 0.5, 'hard_exudate']],
  'synthetic-loc-4': [[0.45, 0.58, 'cotton_wool_spot']],
  'synthetic-loc-5': [[0.6, 0.38, 'microaneurysm'], [0.36, 0.62, 'hemorrhage'], [0.52, 0.5, 'hard_exudate']],
  'synthetic-loc-6': [],
};

function octagon(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    pts.push([+(cx + (r * Math.cos(a))).toFixed(4), +(cy + (r * Math.sin(a))).toFixed(4)]);
  }
  return pts;
}

function renderFundus(caseId, seed, discLeft) {
  const rnd = mulberry32(seed);
  const cv = makeCanvas();
  dot(cv, 500, 500, 430, RETINA);
  // arcade vessels from the disc
  const dx = discLeft ? 300 : 700;
  dot(cv, dx, 500, 85, DISC);
  for (const [ang, len] of [[-0.5, 380], [0.15, 420], [0.6, 360], [2.6, 380], [3.4, 340]]) {
    const pts = [];
    const jitter = (rnd() - 0.5) * 0.06;
    for (let t = 0; t <= 8; t++) {
      const r = 60 + (len * t) / 8;
      pts.push([dx + r * Math.cos(ang + jitter + 0.12 * Math.sin(t)), 500 + r * Math.sin(ang + jitter + 0.1 * t)]);
    }
    stroke(cv, pts, 15 - len / 90, VESSEL);
  }
  // Deterministic grain so every synthetic case has unique bytes.
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 420;
    dot(cv, 500 + r * Math.cos(a), 500 + r * Math.sin(a), 1, [100 + Math.floor(rnd() * 40), 34, 18]);
  }
  ellipse(cv, discLeft ? 660 : 340, 520, 70, 55, MACULA);
  for (const [nx, ny, cls] of LESIONS[caseId] ?? []) {
    const x = nx * W, y = ny * W;
    if (cls === 'microaneurysm') dot(cv, x, y, 5 + rnd() * 2, LESION[cls]);
    else if (cls === 'hemorrhage') ellipse(cv, x, y, 12 + rnd() * 10, 9 + rnd() * 8, LESION[cls]);
    else if (cls === 'hard_exudate') dot(cv, x, y, 3 + rnd() * 3, LESION[cls]);
    else ellipse(cv, x, y, 26 + rnd() * 8, 16 + rnd() * 6, LESION[cls]);
  }
  return writePng(cv.buf);
}

const GRADES = ['grade-0', 'grade-1', 'grade-2', 'grade-3', 'grade-4'];

function buildSource() {
  const cases = [];
  const truth = [];
  const locIds = Object.keys(LESIONS);
  locIds.forEach((caseId, i) => {
    const laterality = i % 2 === 0 ? 'OD' : 'OS';
    const lesions = LESIONS[caseId];
    const classes = [...new Set(lesions.map((l) => l[2]))];
    cases.push({
      caseId, title: `Kasus sintetis ${i + 1} (lokalisasi)`, modality: 'fundus',
      tasks: [{
        taskId: `${caseId}-loc`, kind: 'localization', prompt: 'Tandai semua temuan pada kelas yang diizinkan di dalam wilayah tugas.',
        permittedClasses: classes.length ? classes : ['microaneurysm', 'hemorrhage'],
        roi: { polygon: [[0.06, 0.06], [0.94, 0.06], [0.94, 0.94], [0.06, 0.94]] },
        maxMarks: 5,
      }],
      media: [{ file: `${caseId}.png`, attribution: 'Synthetic demo image generated locally; not clinical data.' }],
      attribution: 'Synthetic demo case for pipeline testing only.',
    });
    truth.push({
      caseId,
      answers: {},
      laterality,
      localization: {
        taskId: `${caseId}-loc`,
        roi: { polygon: [[0.06, 0.06], [0.94, 0.06], [0.94, 0.94], [0.06, 0.94]] },
        targets: lesions.map(([nx, ny, cls], k) => ({
          id: `${caseId}-t${k}`, classId: cls, polygon: octagon(nx, ny, 0.028), cx: nx, cy: ny,
        })),
        ignored: i === 4 ? [{ polygon: octagon(0.8, 0.8, 0.03), reason: 'synthetic ambiguity demo' }] : [],
        acceptedClasses: classes.length ? classes : ['microaneurysm', 'hemorrhage'],
      },
      rationale: 'Kasus sintetis: kebenaran dibuat oleh generator yang sama dengan citra.',
    });
  });
  const gradePlan = [
    { accepted: ['grade-2'], feats: [['feat-a', 'Eksudat keras tampak', ['ya', 'tidak'], 'ya']] },
    { accepted: ['grade-3'], feats: [['feat-b', 'Perdarahan tampak', ['ya', 'tidak'], 'ya']] },
    { accepted: ['grade-2', 'grade-3'], feats: [['feat-c', 'Cotton-wool spot tampak', ['ya', 'tidak'], 'tidak']] },
    { accepted: ['grade-1'], feats: [] },
    { accepted: ['grade-4'], feats: [['feat-e', 'Neovaskularisasi tampak', ['ya', 'tidak'], 'tidak']] },
    { accepted: ['grade-0'], feats: [['feat-f', 'Mikroaneurisma tampak', ['ya', 'tidak'], 'tidak']] },
  ];
  gradePlan.forEach((g, i) => {
    const caseId = `synthetic-grade-${i + 1}`;
    const tasks = [{
      taskId: `${caseId}-grade`, kind: 'grade', prompt: 'Pilih tingkat yang disepakati untuk citra sintetis ini.',
      options: GRADES.map((id) => ({ id, text: id })),
      allowNotAssessable: false,
    }];
    const answers = { [`${caseId}-grade`]: g.accepted[0] };
    for (const [fid, prompt, opts, correct] of g.feats) {
      tasks.push({ taskId: `${caseId}-${fid}`, kind: 'feature', prompt, options: opts.map((id) => ({ id, text: id })) });
      answers[`${caseId}-${fid}`] = correct;
    }
    cases.push({
      caseId, title: `Kasus sintetis ${i + 7} (gradasi)`, modality: 'fundus',
      tasks, media: [{ file: `${caseId}.png`, attribution: 'Synthetic demo image generated locally; not clinical data.' }],
      attribution: 'Synthetic demo case for pipeline testing only.',
    });
    truth.push({
      caseId, answers,
      gradeExpected: { [`${caseId}-grade`]: g.accepted.length === 1 ? g.accepted[0] : null },
      rationale: 'Kasus sintetis: jawaban ditetapkan generator; rentang yang diterima menguji ambiguitas.',
    });
  });
  return { cases, truth };
}

function main() {
  const only = process.argv[2] === '--only-media' ? 'media' : process.argv[2] === '--only-compile' ? 'compile' : 'all';
    mkdirSync(path.join(SOURCE, 'media'), { recursive: true });
    mkdirSync(PUBLIC, { recursive: true });
    mkdirSync(PRIVATE, { recursive: true });
  if (only !== 'compile') {
    const { cases, truth } = buildSource();
    writeFileSync(path.join(SOURCE, 'pack.json'), JSON.stringify({ releaseId: RELEASE, version: '0.1.0' }, null, 2));
    writeFileSync(path.join(SOURCE, 'cases.source.json'), JSON.stringify(cases, null, 2));
    writeFileSync(path.join(SOURCE, 'truth.private.json'), JSON.stringify({ cases: truth }, null, 2));
    const mediaIds = [...Object.keys(LESIONS), ...Array.from({ length: 6 }, (_, i) => `synthetic-grade-${i + 1}`)];
    mediaIds.forEach((caseId, i) => {
      writeFileSync(path.join(SOURCE, 'media', `${caseId}.png`), renderFundus(caseId, 1000 + i, i % 2 === 0));
    });
    console.log(`demo source: ${cases.length} cases, media rendered.`);
  }
  if (only !== 'media') {
    const tmp = path.join(ROOT, 'lab-demo', '.tmp-compile');
    mkdirSync(tmp, { recursive: true });
    const res = spawnSync(process.execPath, ['scripts/content/compile.mjs', '--source', SOURCE, '--out', tmp], { encoding: 'utf8' });
    process.stdout.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
    if (res.status !== 0) process.exit(res.status ?? 1);
    const manifest = JSON.parse(readFileSync(path.join(tmp, 'public-manifest.json'), 'utf8'));
    writeFileSync(path.join(ROOT, 'public', 'lab-demo', 'public-manifest.json'), JSON.stringify(manifest, null, 2));
    // Media files are content-addressed by the compiler (<sha16><ext>); mirror
    // the same mapping here so the committed public dir is self-contained.
    // Clear stale hashed media first (hashes change when pixels change).
    for (const f of readdirSync(path.join(ROOT, 'public', 'lab-demo'))) {
      if (/^[0-9a-f]{16}\.(png|jpg|jpeg)$/.test(f)) {
        rmSync(path.join(ROOT, 'public', 'lab-demo', f));
      }
    }
    for (const c of manifest.cases) {
      for (const m of c.media ?? []) {
        const match = /^([0-9a-f]{16})(\.(png|jpg|jpeg))$/.exec(m.asset ?? '');
        if (!match) continue;
        const [, digest, ext] = match;
        for (const f of readdirSync(path.join(SOURCE, 'media'))) {
          if (!f.endsWith(ext)) continue;
          const data = readFileSync(path.join(SOURCE, 'media', f));
          if (createHash('sha256').update(data).digest('hex').slice(0, 16) === digest) {
            copyFileSync(path.join(SOURCE, 'media', f), path.join(ROOT, 'public', 'lab-demo', m.asset));
            break;
          }
        }
      }
    }
    copyFileSync(path.join(tmp, 'private-pack.json'), path.join(PRIVATE, 'private-pack.json'));
    console.log('demo pack compiled: public manifest committed, private truth gitignored.');
  }
}

main();
