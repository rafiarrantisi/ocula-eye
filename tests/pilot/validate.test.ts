import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'pilot', 'validate.mjs');
// Real demo files: the brief names private/lab-demo/full-pack.json, but the
// repo stores private truth at lab-demo/private/private-pack.json (recorded
// as a limitation in the script header), so tests pass explicit paths.
const PUBLIC = path.join(ROOT, 'public', 'lab-demo', 'public-manifest.json');
const PRIVATE = path.join(ROOT, 'lab-demo', 'private', 'private-pack.json');

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('pilot validate gate', () => {
  it('passes on the real synthetic demo pack (stage demo)', () => {
    const res = run(['--stage', 'demo', '--manifest', PUBLIC, '--private', PRIVATE]);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/8\/8 checks passed/);
  });
  it('fails the honest gate for release60 on the 12-case demo pack', () => {
    const res = run(['--stage', 'release60', '--manifest', PUBLIC, '--private', PRIVATE]);
    expect(res.status).not.toBe(0);
    expect(res.stdout).toMatch(/\[FAIL\]/);
  });
  it('fails answer-separation when an answer key is injected into the public manifest', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pilot-validate-'));
    const tampered = path.join(dir, 'public-manifest.json');
    const doc = JSON.parse(readFileSync(PUBLIC, 'utf8'));
    doc.cases[0].answers = { [doc.cases[0].tasks[0].taskId]: 'grade-0' };
    writeFileSync(tampered, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    const res = run(['--stage', 'demo', '--manifest', tampered, '--private', PRIVATE]);
    expect(res.status).not.toBe(0);
    expect(res.stdout).toMatch(/separation/i);
  });
});
