import { describe, expect, it } from 'vitest';
import { buildAssignmentExport, toCsvCell } from '../../lib/domain/faculty/csvExport.ts';

const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

describe('toCsvCell formula-injection guard', () => {
  const vectors: [string, string][] = [
    ['=cmd|"/c calc"!A0', `"'=cmd|""/c calc""!A0"`],
    ['+1+1', "'+1+1"],
    ['@x', "'@x"],
    ['-2', "'-2"],
    [`${TAB}abc`, `'${TAB}abc`],
    [`${CR}abc`, `"'${CR}abc"`],
  ];

  for (const [input, expected] of vectors) {
    it(`prefixes ${JSON.stringify(input)}`, () => {
      expect(toCsvCell(input)).toBe(expected);
    });
  }

  it('leaves trigger characters mid-cell untouched', () => {
    expect(toCsvCell('well-known')).toBe('well-known');
    expect(toCsvCell('1+1')).toBe('1+1');
    expect(toCsvCell(' a=b')).toBe(' a=b');
  });

  it('still quotes a guarded cell that contains a comma', () => {
    expect(toCsvCell('=a,b')).toBe(`"'=a,b"`);
  });
});

describe('toCsvCell quoting', () => {
  it('passes plain cells through', () => {
    expect(toCsvCell('abc')).toBe('abc');
    expect(toCsvCell('')).toBe('');
  });

  it('stringifies scalars and empties nullish values', () => {
    expect(toCsvCell(42)).toBe('42');
    expect(toCsvCell(0)).toBe('0');
    expect(toCsvCell(true)).toBe('true');
    expect(toCsvCell(false)).toBe('false');
    expect(toCsvCell(null)).toBe('');
    expect(toCsvCell(undefined)).toBe('');
  });

  it('quotes cells with commas, quotes, LF, or CR and doubles quotes', () => {
    expect(toCsvCell('a,b')).toBe('"a,b"');
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(toCsvCell(`a${LF}b`)).toBe(`"a${LF}b"`);
    expect(toCsvCell(`a${CR}b`)).toBe(`"a${CR}b"`);
  });
});

describe('buildAssignmentExport', () => {
  it('emits header plus rows joined by CRLF with version passthrough', () => {
    const output = buildAssignmentExport(
      [
        { email: 'a@example.com', display_name: 'Ana', rubric_version: 'v2026.09' },
        { email: 'b@example.com', display_name: 'Doe, Jane', rubric_version: 'v2026.09' },
      ],
      ['email', 'display_name', 'rubric_version'],
    );
    expect(output).toBe(
      ['email,display_name,rubric_version', 'a@example.com,Ana,v2026.09', 'b@example.com,"Doe, Jane",v2026.09'].join(
        CRLF,
      ),
    );
  });

  it('uses column order, emits empty cells for missing keys, ignores extras', () => {
    const output = buildAssignmentExport([{ b: '2', extra: 'x' }], ['b', 'a']);
    expect(output).toBe(['b,a', '2,'].join(CRLF));
  });

  it('guards formula cells inside the export', () => {
    const output = buildAssignmentExport([{ email: '=2+5+cmd', display_name: 'Evil' }], ['email', 'display_name']);
    expect(output).toBe(['email,display_name', "'=2+5+cmd,Evil"].join(CRLF));
  });

  it('header-only export is just the header', () => {
    expect(buildAssignmentExport([], ['email'])).toBe('email');
  });

  it('joins lines with CRLF and keeps quoted newlines inside cells', () => {
    const output = buildAssignmentExport([{ a: `x${LF}y`, b: '1' }], ['a', 'b']);
    expect(output).toBe(['a,b', `"x${LF}y",1`].join(CRLF));
    expect(output.split(CRLF)).toHaveLength(2);
  });
});
