// Pure cohort CSV import validation for the faculty slice.
// Deterministic, no I/O, no clock, no network.
//
// File rules:
// - Total UTF-8 bytes must be <= COHORT_MAX_BYTES (whole-file rejection).
// - Header must be exactly `email,display_name,learner_pathway`. Any other
//   column (including NIK / patient-identifier-looking columns) rejects the
//   file under the same unexpected-column rule.
// - At most COHORT_MAX_ROWS data rows (whole-file rejection above that).
// Row rules: RFC-ish email (syntax only, no DNS), display_name 1..120 chars,
// pathway in {resident_foundation, koas_core}. Duplicate emails are reported
// (lowercased) in `duplicates`; every row that passes field validation is
// still present in `rows`. Blank lines are skipped and never counted.

export type LearnerPathway = 'resident_foundation' | 'koas_core';

export interface CohortRow {
  email: string;
  displayName: string;
  pathway: LearnerPathway;
  line: number;
}

export interface CohortInvalid {
  line: number;
  reason: string;
}

export interface CohortImportResult {
  rows: CohortRow[];
  invalid: CohortInvalid[];
  duplicates: string[];
}

export const COHORT_MAX_ROWS = 200;
export const COHORT_MAX_BYTES = 262144;
export const COHORT_HEADER = 'email,display_name,learner_pathway';

const EXPECTED_COLUMNS: readonly string[] = ['email', 'display_name', 'learner_pathway'];
const VALID_PATHWAYS: ReadonlySet<string> = new Set(['resident_foundation', 'koas_core']);
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 120;

interface RawDataRecord {
  fields: string[];
  line: number;
}

// Single-line RFC4180 field split: quoted fields may contain commas or
// doubled quotes; records never span lines. Deterministic.
function parseLine(lineText: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < lineText.length) {
    const ch = lineText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (lineText[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      if (field === '') {
        inQuotes = true;
      } else {
        field += ch;
      }
      i += 1;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  fields.push(field);
  return fields;
}

function checkHeader(cells: string[]): string | null {
  if (cells.length === 1 && cells[0] === '') {
    return 'invalid_header';
  }
  for (const cell of cells) {
    if (!EXPECTED_COLUMNS.includes(cell)) {
      return `unexpected_column:${cell}`;
    }
  }
  if (cells.length !== EXPECTED_COLUMNS.length) {
    return 'invalid_header';
  }
  for (let i = 0; i < EXPECTED_COLUMNS.length; i += 1) {
    if (cells[i] !== EXPECTED_COLUMNS[i]) {
      return 'invalid_header';
    }
  }
  return null;
}

function validateRecord(fields: string[]): string | null {
  if (fields.length !== EXPECTED_COLUMNS.length) {
    return 'wrong_field_count';
  }
  const email = fields[0].trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'invalid_email';
  }
  const displayName = fields[1].trim();
  const nameLength = [...displayName].length;
  if (nameLength < 1 || nameLength > MAX_DISPLAY_NAME_LENGTH) {
    return 'invalid_display_name';
  }
  if (!VALID_PATHWAYS.has(fields[2].trim())) {
    return 'invalid_pathway';
  }
  return null;
}

export function parseCohortCsv(text: string): CohortImportResult {
  if (new TextEncoder().encode(text).length > COHORT_MAX_BYTES) {
    return { rows: [], invalid: [{ line: 0, reason: 'file_too_large' }], duplicates: [] };
  }
  const withoutBom = text.startsWith('﻿') ? text.slice(1) : text;
  const normalized = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const physicalLines = normalized.split('\n');
  const headerCells = parseLine(physicalLines[0] ?? '').map((cell) => cell.trim());
  const headerReason = checkHeader(headerCells);
  if (headerReason !== null) {
    return { rows: [], invalid: [{ line: 1, reason: headerReason }], duplicates: [] };
  }
  const pending: RawDataRecord[] = [];
  for (let idx = 1; idx < physicalLines.length; idx += 1) {
    const raw = physicalLines[idx];
    if (raw.trim() === '') {
      continue;
    }
    pending.push({ fields: parseLine(raw), line: idx + 1 });
  }
  if (pending.length > COHORT_MAX_ROWS) {
    return { rows: [], invalid: [{ line: 0, reason: 'too_many_rows' }], duplicates: [] };
  }
  const rows: CohortRow[] = [];
  const invalid: CohortInvalid[] = [];
  const counts = new Map<string, number>();
  for (const record of pending) {
    const problem = validateRecord(record.fields);
    if (problem !== null) {
      invalid.push({ line: record.line, reason: problem });
      continue;
    }
    const email = record.fields[0].trim();
    const displayName = record.fields[1].trim();
    const pathway = record.fields[2].trim() as LearnerPathway;
    rows.push({ email, displayName, pathway, line: record.line });
    const key = email.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([email]) => email)
    .sort();
  return { rows, invalid, duplicates };
}
