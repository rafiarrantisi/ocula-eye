// Pure normalized image-coordinate helpers (teaching overlay geometry).
// Canonical space is normalized [0, 1] x [0, 1] with origin at the top-left
// of the full image. No React, Three, DOM, clock, network or LLM imports.
// Deterministic: same input always yields the same output.
export interface PointMark {
  id: string;
  x: number;
  y: number;
  classId: string;
}

/** Row-major 3x3 homogeneous matrix mapping canonical space to view space. */
export type Affine3x3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY_AFFINE: Affine3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface InputError {
  field: string;
  code: string;
}

export interface CanonicalPixels {
  px: number;
  py: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function applyMatrix(m: Affine3x3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

function invertMatrix(m: Affine3x3): Affine3x3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const det = a * A + d * B + g * C;
  if (!Number.isFinite(det) || det === 0) throw new RangeError('singular-transform');
  const invDet = 1 / det;
  return [
    A * invDet,
    B * invDet,
    C * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

function checkSize(value: number, field: string): void {
  if (!isFiniteNumber(value) || value <= 0) throw new RangeError(`${field}-must-be-positive`);
}

/** Canonical normalized mark -> backing-store pixel position. */
export function toCanonicalPixels(
  mark: { x: number; y: number },
  width: number,
  height: number,
  transform: Affine3x3 = IDENTITY_AFFINE,
): CanonicalPixels {
  checkSize(width, 'width');
  checkSize(height, 'height');
  const v = applyMatrix(transform, mark.x, mark.y);
  return { px: v.x * width, py: v.y * height };
}

/** Backing-store pixel position -> canonical normalized coordinates. */
export function fromPixels(
  px: number,
  py: number,
  width: number,
  height: number,
  transform: Affine3x3 = IDENTITY_AFFINE,
): NormalizedPoint {
  checkSize(width, 'width');
  checkSize(height, 'height');
  const inv = invertMatrix(transform);
  return applyMatrix(inv, px / width, py / height);
}

/**
 * Structural + range validation for a single learner mark.
 * Never clamps; reports every problem as { field, code }.
 * Codes: 'wrong-shape' (structural), 'not-finite', 'out-of-bounds'.
 */
export function validateMark(mark: unknown, task?: { maxMarks?: number }): InputError[] {
  const errors: InputError[] = [];
  if (typeof mark !== 'object' || mark === null) {
    return [{ field: '(mark)', code: 'wrong-shape' }];
  }
  const rec = mark as Record<string, unknown>;
  if (typeof rec.id !== 'string' || rec.id.length === 0) {
    errors.push({ field: 'id', code: 'wrong-shape' });
  }
  for (const field of ['x', 'y'] as const) {
    const v = rec[field];
    if (!isFiniteNumber(v)) errors.push({ field, code: 'not-finite' });
    else if (v < 0 || v > 1) errors.push({ field, code: 'out-of-bounds' });
  }
  if (typeof rec.classId !== 'string' || rec.classId.length === 0) {
    errors.push({ field: 'classId', code: 'wrong-shape' });
  }
  if (task !== undefined && task.maxMarks !== undefined) {
    const mm = task.maxMarks;
    if (!isFiniteNumber(mm) || !Number.isInteger(mm) || mm < 1 || mm > 30) {
      errors.push({ field: 'maxMarks', code: 'wrong-shape' });
    }
  }
  return errors;
}
