// db:migrate — applies pending versioned SQL migrations from
// db/migrations/ in _journal.json order, using postgres-js + DATABASE_URL.
// Additive only: migration files contain CREATE TABLE IF NOT EXISTS and never
// DROP/ALTER away data. Tracks applied versions in the __migrations journal
// table. Exits 2 when DATABASE_URL is absent.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(2, 'db:migrate: DATABASE_URL is required (no database configured; refusing to migrate).');
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const journalRaw = await readFile(path.join(migrationsDir, '_journal.json'), 'utf8');
  const journal = JSON.parse(journalRaw);
  const entries = Array.isArray(journal?.entries) ? [...journal.entries].sort((a, b) => a.idx - b.idx) : [];
  if (entries.length === 0) fail(1, 'db:migrate: journal has no entries; nothing to apply.');

  await sql`CREATE TABLE IF NOT EXISTS "__migrations" ("version" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`;
  const appliedRows = await sql`SELECT "version" FROM "__migrations"`;
  const applied = new Set(appliedRows.map((r) => r.version));

  // Additive-only guard: every journal entry must resolve to a file inside
  // db/migrations (no traversal), and SQL must not contain destructive verbs.
  const files = new Set(await readdir(migrationsDir));
  let appliedCount = 0;
  for (const entry of entries) {
    const file = String(entry.file ?? '');
    const resolved = path.resolve(migrationsDir, file);
    if (!resolved.startsWith(migrationsDir + path.sep) || !files.has(file)) {
      fail(1, `db:migrate: journal entry escapes migrations dir: ${file}`);
    }
    if (applied.has(entry.version)) {
      console.log(`db:migrate: skip ${entry.version} (already applied)`);
      continue;
    }
    const text = await readFile(resolved, 'utf8');
    if (/\bDROP\s+(TABLE|TYPE|INDEX)|TRUNCATE\b/i.test(text)) {
      fail(1, `db:migrate: refusing destructive migration ${entry.version} (additive only).`);
    }
    console.log(`db:migrate: applying ${entry.version} (${file})`);
    await sql.unsafe(text);
    await sql`INSERT INTO "__migrations" ("version") VALUES (${entry.version})`;
    appliedCount += 1;
  }
  console.log(`db:migrate: done, ${appliedCount} newly applied.`);
} catch (err) {
  console.error(`db:migrate: failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  await sql.end();
}
