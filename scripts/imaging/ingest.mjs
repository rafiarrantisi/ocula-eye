// scripts/imaging/ingest.mjs — quarantine-first inventory of a local image
// source dir. Reads NOTHING from the network (no downloads): it walks
// --source, allowlists .png/.jpg/.jpeg, enforces per-file (50MB) and total
// (2GB) caps, sniffs dimensions with pure PNG-IHDR / JPEG-SOF parsers
// (rejects >12000px on either side or undecodable files), sha256-hashes every
// accepted file, and dedups by exact hash.
//
// Usage:
//   node scripts/imaging/ingest.mjs --source <dir> [--output <dir>] [--dry-run]
//   node scripts/imaging/ingest.mjs --help
//
// --dry-run prints the inventory JSON to stdout and writes nothing. A real
// run writes ONLY <output>/inventory.json (creating <output> if needed).
// Exit codes: 0 ok (quarantined files are reported, not fatal), 1 caps/IO
// failure, 2 usage error.
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PER_FILE_MAX = 50 * 1024 * 1024;
const TOTAL_MAX = 2 * 1024 * 1024 * 1024;
const MAX_DIM = 12000;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg']);

function usage() {
  console.log(`imaging ingest — quarantine-first local image inventory (no downloads)

Usage:
  node scripts/imaging/ingest.mjs --source <dir> [--output <dir>] [--dry-run]
  node scripts/imaging/ingest.mjs --help

Options:
  --source <dir>   Local source directory to walk (required).
  --output <dir>   Destination dir for inventory.json (required unless --dry-run).
  --dry-run        Print inventory JSON to stdout; write nothing.
  --help           Print this help and exit 0.

Rules:
  resolve-inside quarantine (symlinks + escapes rejected) | allowlist
  .png/.jpg/.jpeg | per-file <= 50MB | total <= 2GB | pure PNG-IHDR +
  JPEG-SOF sniffers, reject width/height > 12000px or undecodable |
  sha256 inventory + exact-hash dedup.`);
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

/** PNG: 8-byte signature, then IHDR chunk with BE width/height at 16/20. */
function sniffPng(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33) return null;
  for (let i = 0; i < sig.length; i += 1) {
    if (buf[i] !== sig[i]) return null;
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG: SOI then marker scan for the first SOFn carrying dimensions. */
function sniffJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return null;
    let marker = buf[pos + 1];
    // Skip fill bytes.
    while (marker === 0xff) {
      pos += 1;
      if (pos + 1 >= buf.length) return null;
      marker = buf[pos + 1];
    }
    if (marker === 0xd9) return null; // EOI before any SOF.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // Standalone markers carry no length.
      continue;
    }
    if (pos + 4 > buf.length) return null;
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

async function sniffDimensions(absPath, ext) {
  const fh = await open(absPath, 'r');
  try {
    const head = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const buf = head.subarray(0, bytesRead);
    if (ext === '.png') return sniffPng(buf);
    return sniffJpeg(buf);
  } finally {
    await fh.close();
  }
}

async function discover(sourceDir) {
  const found = [];
  const stack = [sourceDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        found.push({ abs, symlink: true });
      } else if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        found.push({ abs, symlink: false });
      }
    }
  }
  return found.map((f) => f.abs).sort();
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

let source = null;
let output = null;
let dryRun = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--source' && i + 1 < args.length) {
    source = args[(i += 1)];
  } else if (arg === '--output' && i + 1 < args.length) {
    output = args[(i += 1)];
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else {
    fail(2, `imaging ingest: unknown argument: ${arg}\nRun with --help for usage.`);
  }
}
if (!source) fail(2, 'imaging ingest: --source <dir> is required.\nRun with --help for usage.');
if (!dryRun && !output) {
  fail(2, 'imaging ingest: --output <dir> is required without --dry-run.\nRun with --help for usage.');
}

const sourceDir = path.resolve(source);
let sourceStat;
try {
  sourceStat = await stat(sourceDir);
} catch {
  fail(1, `imaging ingest: source not readable: ${sourceDir}`);
}
if (!sourceStat.isDirectory()) fail(2, `imaging ingest: --source is not a directory: ${sourceDir}`);

const accepted = [];
const duplicates = [];
const quarantined = [];
const skipped = [];
const seenHash = new Map();
let totalBytes = 0;

const discovered = await discover(sourceDir);
for (const abs of discovered) {
  const resolved = path.resolve(abs);
  if (resolved !== sourceDir && !resolved.startsWith(sourceDir + path.sep)) {
    quarantined.push({ path: abs, reason: 'traversal_escape' });
    continue;
  }
  // lstat first: never follow symlinks out of the source tree.
  let lst;
  try {
    lst = await lstat(resolved);
  } catch {
    quarantined.push({ path: path.relative(sourceDir, resolved), reason: 'unreadable' });
    continue;
  }
  const rel = path.relative(sourceDir, resolved);
  if (lst.isSymbolicLink()) {
    quarantined.push({ path: rel, reason: 'symlink' });
    continue;
  }
  if (!lst.isFile()) continue;
  const ext = path.extname(rel).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    skipped.push({ path: rel, reason: 'extension_allowlist' });
    continue;
  }
  if (lst.size > PER_FILE_MAX) {
    quarantined.push({ path: rel, reason: 'per_file_cap_50mb', bytes: lst.size });
    continue;
  }
  totalBytes += lst.size;
  if (totalBytes > TOTAL_MAX) {
    fail(1, `imaging ingest: total size exceeds 2GB cap at ${rel}.`);
  }
  let dims;
  try {
    dims = await sniffDimensions(resolved, ext);
  } catch {
    dims = null;
  }
  if (!dims || !Number.isFinite(dims.width) || !Number.isFinite(dims.height)) {
    quarantined.push({ path: rel, reason: 'undecodable', bytes: lst.size });
    continue;
  }
  if (dims.width > MAX_DIM || dims.height > MAX_DIM || dims.width === 0 || dims.height === 0) {
    quarantined.push({ path: rel, reason: 'dimensions', width: dims.width, height: dims.height });
    continue;
  }
  const data = await readFile(resolved);
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (seenHash.has(sha256)) {
    duplicates.push({ path: rel, sha256, duplicateOf: seenHash.get(sha256) });
    continue;
  }
  seenHash.set(sha256, rel);
  accepted.push({
    path: rel,
    bytes: lst.size,
    sha256,
    width: dims.width,
    height: dims.height,
    kind: ext === '.png' ? 'png' : 'jpeg',
  });
}

const inventory = {
  tool: 'imaging-ingest',
  source: sourceDir,
  generatedAt: new Date().toISOString(),
  caps: { perFileBytes: PER_FILE_MAX, totalBytes: TOTAL_MAX, maxDimensionPx: MAX_DIM },
  totals: {
    accepted: accepted.length,
    duplicates: duplicates.length,
    quarantined: quarantined.length,
    skipped: skipped.length,
    bytes: totalBytes,
  },
  files: accepted,
  duplicates,
  quarantined,
  skipped,
};

if (dryRun) {
  console.log(JSON.stringify(inventory, null, 2));
} else {
  const outDir = path.resolve(output);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  console.log(`imaging ingest: wrote ${path.join(outDir, 'inventory.json')} (${accepted.length} accepted).`);
}
