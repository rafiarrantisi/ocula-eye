import { createPostgresRepositories, type Repositories } from './attemptRepository.ts';
import { createDemoRepositories } from './demoStore.ts';
import { getSql } from './db.ts';

export function isDemoStore(): boolean {
  return process.env.LAB_DEMO_STORE === '1';
}

/** Postgres by default (503 when unconfigured). File-backed synthetic demo
 * store only under explicit LAB_DEMO_STORE=1; the demo store itself refuses
 * non-synthetic releases. */
export function resolveRepositories(): Repositories {
  if (isDemoStore()) return createDemoRepositories();
  return createPostgresRepositories(getSql());
}
