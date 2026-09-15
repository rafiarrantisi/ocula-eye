import { describe, expect, it } from 'vitest';
import {
  COHORT_HEADER,
  COHORT_MAX_BYTES,
  COHORT_MAX_ROWS,
  parseCohortCsv,
} from '../../lib/domain/faculty/csvImport.ts';

const CRLF = String.fromCharCode(13, 10);

function dataRow(email: string, name: string, pathway: string): string {
  return `${email},${name},${pathway}`;
}

function validFile(lines: string[]): string {
  return [COHORT_HEADER, ...lines].join('\n');
}

describe('header validation', () => {
  it('accepts the exact header with valid rows', () => {
    const text = validFile([
      dataRow('ana@example.com', 'Ana', 'resident_foundation'),
      dataRow('budi@example.com', 'Budi', 'koas_core'),
    ]);
    expect(parseCohortCsv(text)).toEqual({
      rows: [
        { email: 'ana@example.com', displayName: 'Ana', pathway: 'resident_foundation', line: 2 },
        { email: 'budi@example.com', displayName: 'Budi', pathway: 'koas_core', line: 3 },
      ],
      invalid: [],
      duplicates: [],
    });
  });

  it('header-only file yields an empty result', () => {
    expect(parseCohortCsv(COHORT_HEADER)).toEqual({ rows: [], invalid: [], duplicates: [] });
  });

  it('empty file is an invalid header', () => {
    expect(parseCohortCsv('')).toEqual({
      rows: [],
      invalid: [{ line: 1, reason: 'invalid_header' }],
      duplicates: [],
    });
  });

  it('wrong column order is rejected', () => {
    const text = ['display_name,email,learner_pathway', dataRow('a@example.com', 'A', 'koas_core')].join('\n');
    const result = parseCohortCsv(text);
    expect(result.rows).toEqual([]);
    expect(result.invalid).toEqual([{ line: 1, reason: 'invalid_header' }]);
  });

  it('missing column is rejected', () => {
    const result = parseCohortCsv('email,display_name\na@example.com,A');
    expect(result.rows).toEqual([]);
    expect(result.invalid).toEqual([{ line: 1, reason: 'invalid_header' }]);
  });

  it('extra nik column is rejected by the unexpected-column rule', () => {
    const text = [
      'email,display_name,learner_pathway,nik',
      `${dataRow('a@example.com', 'A', 'koas_core')},123`,
    ].join('\n');
    expect(parseCohortCsv(text)).toEqual({
      rows: [],
      invalid: [{ line: 1, reason: 'unexpected_column:nik' }],
      duplicates: [],
    });
  });

  it('uppercase NIK column is rejected by the same rule', () => {
    const result = parseCohortCsv('email,NIK,learner_pathway');
    expect(result.invalid).toEqual([{ line: 1, reason: 'unexpected_column:NIK' }]);
  });

  it('patient-identifier-looking column is rejected by the same rule', () => {
    const result = parseCohortCsv('email,display_name,learner_pathway,patient_id');
    expect(result.invalid).toEqual([{ line: 1, reason: 'unexpected_column:patient_id' }]);
  });
});

describe('row validation', () => {
  it('flags bad emails but keeps valid sibling rows', () => {
    const text = validFile([
      dataRow('plainaddress', 'Bad One', 'koas_core'),
      dataRow('no-tld@host', 'Bad Two', 'koas_core'),
      dataRow('@missing-local.com', 'Bad Three', 'koas_core'),
      dataRow('good@example.com', 'Good', 'koas_core'),
    ]);
    const result = parseCohortCsv(text);
    expect(result.rows).toEqual([
      { email: 'good@example.com', displayName: 'Good', pathway: 'koas_core', line: 5 },
    ]);
    expect(result.invalid).toEqual([
      { line: 2, reason: 'invalid_email' },
      { line: 3, reason: 'invalid_email' },
      { line: 4, reason: 'invalid_email' },
    ]);
  });

  it('accepts plus-addressed multi-label emails', () => {
    const text = validFile([dataRow('first.last+tag@example.co.id', 'Plus', 'koas_core')]);
    const result = parseCohortCsv(text);
    expect(result.invalid).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('rejects empty and overlong display names', () => {
    const long120 = 'n'.repeat(120);
    const long121 = 'n'.repeat(121);
    const text = validFile([
      dataRow('a@example.com', '', 'koas_core'),
      dataRow('b@example.com', long121, 'koas_core'),
      dataRow('c@example.com', long120, 'koas_core'),
    ]);
    const result = parseCohortCsv(text);
    expect(result.invalid).toEqual([
      { line: 2, reason: 'invalid_display_name' },
      { line: 3, reason: 'invalid_display_name' },
    ]);
    expect(result.rows).toEqual([
      { email: 'c@example.com', displayName: long120, pathway: 'koas_core', line: 4 },
    ]);
  });

  it('rejects unknown pathways and accepts both valid ones', () => {
    const text = validFile([
      dataRow('a@example.com', 'A', 'resident'),
      dataRow('b@example.com', 'B', 'resident_foundation'),
      dataRow('c@example.com', 'C', 'koas_core'),
    ]);
    const result = parseCohortCsv(text);
    expect(result.invalid).toEqual([{ line: 2, reason: 'invalid_pathway' }]);
    expect(result.rows.map((row) => row.email)).toEqual(['b@example.com', 'c@example.com']);
  });

  it('rejects rows with the wrong field count', () => {
    const text = validFile(['a@example.com,Only Two', 'a@example.com,B,koas_core,extra']);
    expect(parseCohortCsv(text).invalid).toEqual([
      { line: 2, reason: 'wrong_field_count' },
      { line: 3, reason: 'wrong_field_count' },
    ]);
  });

  it('parses a quoted display name containing a comma', () => {
    const text = validFile(['a@example.com,"Doe, Jane",koas_core']);
    expect(parseCohortCsv(text).rows).toEqual([
      { email: 'a@example.com', displayName: 'Doe, Jane', pathway: 'koas_core', line: 2 },
    ]);
  });

  it('parses CRLF input with correct line numbers', () => {
    const text = [COHORT_HEADER, dataRow('a@example.com', 'A', 'koas_core'), 'not-an-email,B,koas_core'].join(CRLF);
    const result = parseCohortCsv(text);
    expect(result.rows).toEqual([
      { email: 'a@example.com', displayName: 'A', pathway: 'koas_core', line: 2 },
    ]);
    expect(result.invalid).toEqual([{ line: 3, reason: 'invalid_email' }]);
  });

  it('skips blank lines without counting them', () => {
    const text = [COHORT_HEADER, '', dataRow('a@example.com', 'A', 'koas_core'), ''].join('\n');
    const result = parseCohortCsv(text);
    expect(result.rows).toEqual([
      { email: 'a@example.com', displayName: 'A', pathway: 'koas_core', line: 3 },
    ]);
    expect(result.invalid).toEqual([]);
  });
});

describe('caps', () => {
  function manyRows(count: number): string[] {
    const lines: string[] = [];
    for (let i = 0; i < count; i += 1) {
      lines.push(dataRow(`user${i}@example.com`, `Learner ${i}`, 'koas_core'));
    }
    return lines;
  }

  it(`accepts exactly ${COHORT_MAX_ROWS} data rows`, () => {
    const result = parseCohortCsv(validFile(manyRows(COHORT_MAX_ROWS)));
    expect(result.rows).toHaveLength(COHORT_MAX_ROWS);
    expect(result.invalid).toEqual([]);
  });

  it('rejects files above the row cap as a whole', () => {
    const result = parseCohortCsv(validFile(manyRows(COHORT_MAX_ROWS + 1)));
    expect(result.rows).toEqual([]);
    expect(result.invalid).toEqual([{ line: 0, reason: 'too_many_rows' }]);
    expect(result.duplicates).toEqual([]);
  });

  it('rejects files above the byte cap before anything else', () => {
    const chunk = 'a@b.co,x,resident_foundation\n';
    const text = `${COHORT_HEADER}\n${chunk.repeat(20000)}`;
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(COHORT_MAX_BYTES);
    expect(parseCohortCsv(text)).toEqual({
      rows: [],
      invalid: [{ line: 0, reason: 'file_too_large' }],
      duplicates: [],
    });
  });
});

describe('duplicates', () => {
  it('flags a repeated email while keeping both valid rows', () => {
    const text = validFile([
      dataRow('dup@example.com', 'One', 'koas_core'),
      dataRow('solo@example.com', 'Solo', 'koas_core'),
      dataRow('dup@example.com', 'Two', 'resident_foundation'),
    ]);
    const result = parseCohortCsv(text);
    expect(result.rows).toHaveLength(3);
    expect(result.invalid).toEqual([]);
    expect(result.duplicates).toEqual(['dup@example.com']);
  });

  it('sorts duplicates and dedupes case-insensitively to lowercase', () => {
    const text = validFile([
      dataRow('b@example.com', 'B1', 'koas_core'),
      dataRow('a@example.com', 'A1', 'koas_core'),
      dataRow('B@example.com', 'B2', 'koas_core'),
      dataRow('A@EXAMPLE.com', 'A2', 'koas_core'),
    ]);
    expect(parseCohortCsv(text).duplicates).toEqual(['a@example.com', 'b@example.com']);
  });

  it('ignores invalid rows when flagging duplicates', () => {
    const text = validFile(['not-an-email,X,koas_core', 'not-an-email,Y,koas_core']);
    const result = parseCohortCsv(text);
    expect(result.rows).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });
});

describe('determinism', () => {
  it('returns identical output for identical input', () => {
    const text = validFile([
      dataRow('b@example.com', 'B', 'koas_core'),
      dataRow('a@example.com', 'A', 'resident_foundation'),
      dataRow('b@example.com', 'B again', 'koas_core'),
      'broken-row',
    ]);
    expect(parseCohortCsv(text)).toEqual(parseCohortCsv(text));
  });
});
