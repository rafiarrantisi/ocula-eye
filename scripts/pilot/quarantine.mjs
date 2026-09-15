// PART06 pilot quarantine CLI. Manages institute-level release holds.
//
//   node scripts/pilot/quarantine.mjs --release <id> --reason <r> --notice <n> [--demo-file PATH]
//   node scripts/pilot/quarantine.mjs --release <id> --clear [--demo-file PATH]
//   node scripts/pilot/quarantine.mjs --show [--demo-file PATH]
//
// Demo-file mode (LAB_DEMO_PATH or --demo-file) reads/writes the demo JSON
// directly. Postgres mode (no --demo-file) prints parameterized SQL to pipe
// into psql, because this script takes zero dependencies:
//   node scripts/pilot/quarantine.mjs --release X --reason Y --notice Z | psql "$DATABASE_URL" -f -
// A quarantined release refuses NEW attempts with the stored notice; history
// (existing attempts, reports) is preserved. Clearing never deletes history.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function usage() {
  console.error('usage: quarantine.mjs --release <id> (--reason <r> --notice <n> | --clear) [--demo-file PATH]');
  console.error('       quarantine.mjs --show [--demo-file PATH]');
  process.exit(2);
}

const args = process.argv.slice(2);
function take(flag) {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) usage();
  return v;
}
const releaseId = take('--release');
const reason = take('--reason');
const notice = take('--notice');
const demoFile = take('--demo-file') ?? process.env.LAB_DEMO_PATH ?? null;
const clear = args.includes('--clear');
const show = args.includes('--show');

if (show && releaseId) usage();
if (!show && !releaseId) usage();
if (!show && !clear && (!reason || !notice)) usage();

function loadDemo(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function saveDemo(path, db) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

if (demoFile) {
  const path = resolve(demoFile);
  const db = loadDemo(path);
  if (typeof db !== 'object' || db === null) {
    console.error('quarantine: demo file is not a JSON object');
    process.exit(1);
  }
  if (!db.quarantine || typeof db.quarantine !== 'object') db.quarantine = {};
  if (show) {
    for (const row of Object.values(db.quarantine)) {
      console.log(`${row.releaseId}\t${row.reason}\t${row.createdAt}`);
    }
  } else if (clear) {
    delete db.quarantine[releaseId];
    saveDemo(path, db);
    console.log(`cleared ${releaseId} (history preserved)`);
  } else {
    db.quarantine[releaseId] = {
      releaseId, reason, notice, createdAt: new Date().toISOString(),
    };
    saveDemo(path, db);
    console.log(`quarantined ${releaseId}`);
  }
} else if (show) {
  console.log('SELECT "release_id", "reason", "created_at" FROM "release_quarantine" ORDER BY "created_at";');
} else if (clear) {
  console.log(`-- Clearing ${releaseId}. History is preserved; only the hold is removed.`);
  console.log(`DELETE FROM "release_quarantine" WHERE "release_id" = ${q(releaseId)};`);
} else {
  console.log(`-- Quarantining ${releaseId}. New attempts will be refused with the notice below.`);
  console.log(`INSERT INTO "release_quarantine" ("release_id", "reason", "notice") VALUES (${q(releaseId)}, ${q(reason)}, ${q(notice)})`);
  console.log(`ON CONFLICT ("release_id") DO UPDATE SET "reason" = EXCLUDED."reason", "notice" = EXCLUDED."notice";`);
}
