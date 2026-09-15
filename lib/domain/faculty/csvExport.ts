// Pure CSV export helpers for the faculty slice. Formula-injection guard:
// any cell whose first character is =, +, -, @, tab, or CR is prefixed with
// a single quote before RFC4180 quoting is applied. Version-like fields pass
// through untouched like every other value. Control characters are built
// with fromCharCode so this file contains no raw control bytes.

const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

const FORMULA_PREFIXES: ReadonlySet<string> = new Set(['=', '+', '-', '@', TAB, CR]);

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

export function toCsvCell(value: unknown): string {
  let text = cellText(value);
  if (text.length > 0 && FORMULA_PREFIXES.has(text[0])) {
    text = `'${text}`;
  }
  if (text.includes(',') || text.includes('"') || text.includes(CR) || text.includes(LF)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildAssignmentExport(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map((column) => toCsvCell(column)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => toCsvCell(row[column])).join(','));
  }
  return lines.join(CRLF);
}
