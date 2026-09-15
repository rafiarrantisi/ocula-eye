import { sha256Hex } from './hash.ts';

// Canonical JSON: sorted object keys (recursive), UTF-8, no whitespace.
// Hashing detects change, never clinical validity.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
