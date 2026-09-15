import postgres from 'postgres';

// Postgres-js singleton for the PART03 imaging slice. DATABASE_URL is
// required; we throw an honest error otherwise. This module never runs
// migrations — schema changes apply only via `npm run db:migrate`.

let cached: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set; the imaging slice needs a Postgres database. Set DATABASE_URL and run `npm run db:migrate`.',
    );
  }
  cached = postgres(url, { max: 5, idle_timeout: 20 });
  return cached;
}

export function resetDbForTests(): void {
  cached = null;
}
