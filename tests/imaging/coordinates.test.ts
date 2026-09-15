import { describe, expect, it } from 'vitest';
import {
  fromPixels,
  toCanonicalPixels,
  validateMark,
} from '../../lib/domain/imaging/coordinates.ts';
import type { Affine3x3 } from '../../lib/domain/imaging/coordinates.ts';

const W = 1000;
const H = 800;

describe('corners and center (identity)', () => {
  it('maps corners and center to backing pixels', () => {
    expect(toCanonicalPixels({ x: 0, y: 0 }, W, H)).toEqual({ px: 0, py: 0 });
    expect(toCanonicalPixels({ x: 1, y: 1 }, W, H)).toEqual({ px: 1000, py: 800 });
    expect(toCanonicalPixels({ x: 1, y: 0 }, W, H)).toEqual({ px: 1000, py: 0 });
    expect(toCanonicalPixels({ x: 0, y: 1 }, W, H)).toEqual({ px: 0, py: 800 });
    expect(toCanonicalPixels({ x: 0.5, y: 0.5 }, W, H)).toEqual({ px: 500, py: 400 });
  });
  it('inverts pixels back to canonical', () => {
    expect(fromPixels(0, 0, W, H)).toEqual({ x: 0, y: 0 });
    expect(fromPixels(1000, 800, W, H)).toEqual({ x: 1, y: 1 });
    expect(fromPixels(500, 400, W, H)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('affine crop round-trip', () => {
  // 2x zoom into a cropped quarter: view origin sits at canonical (0.25, 0.125).
  const crop: Affine3x3 = [2, 0, -0.5, 0, 2, -0.25, 0, 0, 1];
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.5, y: 0.5 },
    { x: 0.3, y: 0.7 },
    { x: 0.99, y: 0.01 },
  ];
  it.each(points)('round-trips %o within 1 canonical pixel at 1000px', (p) => {
    const pix = toCanonicalPixels(p, W, H, crop);
    const back = fromPixels(pix.px, pix.py, W, H, crop);
    expect(Math.abs(back.x - p.x)).toBeLessThan(1 / 1000);
    expect(Math.abs(back.y - p.y)).toBeLessThan(1 / 1000);
  });
  it('crop maps the region origin to view origin', () => {
    const pix = toCanonicalPixels({ x: 0.25, y: 0.125 }, W, H, crop);
    expect(pix.px).toBeCloseTo(0, 10);
    expect(pix.py).toBeCloseTo(0, 10);
  });
});

describe('validateMark rejection', () => {
  it('accepts corners and center', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 },
    ]) {
      expect(validateMark({ id: 'a', ...p, classId: 'hemorrhage' })).toEqual([]);
    }
  });
  it('rejects out-of-bounds coordinates', () => {
    const left = validateMark({ id: 'a', x: -0.01, y: 0.5, classId: 'hemorrhage' });
    expect(left).toContainEqual({ field: 'x', code: 'out-of-bounds' });
    const right = validateMark({ id: 'a', x: 1.5, y: 0.5, classId: 'hemorrhage' });
    expect(right).toContainEqual({ field: 'x', code: 'out-of-bounds' });
    const below = validateMark({ id: 'a', x: 0.5, y: 2, classId: 'hemorrhage' });
    expect(below).toContainEqual({ field: 'y', code: 'out-of-bounds' });
  });
  it('rejects non-finite coordinates', () => {
    expect(validateMark({ id: 'a', x: NaN, y: 0.5, classId: 'hemorrhage' })).toContainEqual({
      field: 'x',
      code: 'not-finite',
    });
    expect(validateMark({ id: 'a', x: 0.5, y: Infinity, classId: 'hemorrhage' })).toContainEqual({
      field: 'y',
      code: 'not-finite',
    });
  });
  it('rejects wrong shapes', () => {
    expect(validateMark(null)).toContainEqual({ field: '(mark)', code: 'wrong-shape' });
    expect(validateMark({ id: '', x: 0.5, y: 0.5, classId: 'hemorrhage' })).toContainEqual({
      field: 'id',
      code: 'wrong-shape',
    });
    expect(validateMark({ id: 'a', x: 0.5, y: 0.5, classId: '' })).toContainEqual({
      field: 'classId',
      code: 'wrong-shape',
    });
  });
  it('accepts a sane task budget, rejects a malformed one', () => {
    const mark = { id: 'a', x: 0.5, y: 0.5, classId: 'hemorrhage' };
    expect(validateMark(mark, { maxMarks: 30 })).toEqual([]);
    expect(validateMark(mark, { maxMarks: 0 })).toContainEqual({
      field: 'maxMarks',
      code: 'wrong-shape',
    });
  });
});

describe('DPR independence', () => {
  const mark = { x: 0.25, y: 0.75 };
  it('scales linearly across 1x/2x/3x backing stores', () => {
    const lo = toCanonicalPixels(mark, 500, 400);
    const mid = toCanonicalPixels(mark, 1000, 800);
    const hi = toCanonicalPixels(mark, 1500, 1200);
    expect(lo).toEqual({ px: 125, py: 300 });
    expect(mid.px / lo.px).toBeCloseTo(2, 12);
    expect(mid.py / lo.py).toBeCloseTo(2, 12);
    expect(hi.px / lo.px).toBeCloseTo(3, 12);
    expect(hi.py / lo.py).toBeCloseTo(3, 12);
  });
  it('recovers the same canonical mark at every backing size', () => {
    for (const [w, h] of [
      [500, 400],
      [1000, 800],
      [1500, 1200],
    ] as const) {
      const pix = toCanonicalPixels(mark, w, h);
      const back = fromPixels(pix.px, pix.py, w, h);
      expect(Math.abs(back.x - mark.x)).toBeLessThan(1e-12);
      expect(Math.abs(back.y - mark.y)).toBeLessThan(1e-12);
    }
  });
});
