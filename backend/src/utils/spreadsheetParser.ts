import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import type {
  ImportFileFormat,
  ParsedSpreadsheet,
  ParsedSpreadsheetRow,
} from '../types/import.js';
import { AppHttpError } from './errors.js';

export const MAX_IMPORT_ROWS = 2000;

export type CellScalar = string | number | boolean | null;

/**
 * Normalisasi header kolom agar toleran terhadap spasi, tanda '*', huruf besar, dan simbol.
 * Contoh: "SKU Produk *" -> "sku_produk", "No. HP Sales" -> "no_hp_sales"
 */
export function normalizeHeaderKey(rawHeader: string): string {
  return String(rawHeader || '')
    .replace(/^\uFEFF/, '')
    .replace(/\*+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function parseTextCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value).trim();
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/**
 * Parse angka dari format Excel numeric maupun string lokal Indonesia/Internasional
 * Contoh valid: 68000, "68.000", "68,000", "Rp 68.000", "1.250,50", "1,5", "1.5"
 */
export function parseLocaleNumber(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, error: 'Nilai angka tidak valid' };
  }
  if (typeof value === 'boolean') {
    return { ok: false, error: 'Nilai harus berupa angka, bukan boolean' };
  }

  let raw = String(value).trim();
  if (!raw) return { ok: true, value: null };

  // Hapus simbol mata uang & spasi
  raw = raw.replace(/^(rp|idr)\s*/i, '').replace(/\s+/g, '');
  if (!raw) return { ok: true, value: null };

  let sign = 1;
  if (raw.startsWith('-')) {
    sign = -1;
    raw = raw.slice(1);
  } else if (raw.startsWith('+')) {
    raw = raw.slice(1);
  }

  if (!raw) {
    return { ok: false, error: `Format angka tidak valid ("${String(value)}")` };
  }

  let normalized = raw;

  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    // Format ribuan titik (mis. 68.000 atau 1.250.000)
    normalized = raw.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    // Format ribuan koma (mis. 68,000 atau 1,250,000)
    normalized = raw.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(raw)) {
    // Format Indonesia: titik ribuan + koma desimal (mis. 1.250,50)
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(raw)) {
    // Format US: koma ribuan + titik desimal (mis. 1,250.50)
    normalized = raw.replace(/,/g, '');
  } else if (/^\d+,\d+$/.test(raw)) {
    // Desimal koma (mis. 1,5 atau 12,25)
    normalized = raw.replace(',', '.');
  } else if (!/^\d+(\.\d+)?$/.test(raw)) {
    return { ok: false, error: `Format angka tidak valid ("${String(value)}")` };
  }

  const parsed = Number(normalized) * sign;
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `Nilai angka di luar batas ("${String(value)}")` };
  }

  return { ok: true, value: parsed };
}

export function parseBooleanFlag(
  value: unknown,
  defaultValue: boolean
): { ok: true; value: boolean } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: defaultValue };
  }
  if (typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    if (value === 1) return { ok: true, value: true };
    if (value === 0) return { ok: true, value: false };
    return { ok: false, error: `Nilai status/flag tidak valid ("${value}")` };
  }

  const norm = String(value).trim().toLowerCase();
  if (!norm) return { ok: true, value: defaultValue };

  if (['true', '1', 'ya', 'yes', 'y', 'aktif', 'active'].includes(norm)) {
    return { ok: true, value: true };
  }
  if (['false', '0', 'tidak', 'tdk', 'no', 'n', 'nonaktif', 'non-aktif', 'inactive'].includes(norm)) {
    return { ok: true, value: false };
  }

  return {
    ok: false,
    error: `Nilai "${String(value)}" tidak valid (gunakan YA/TIDAK atau AKTIF/NONAKTIF)`,
  };
}

export interface ParsedSalesPhone {
  number: string;
  label?: string;
  is_primary?: boolean;
}

/**
 * Parse nomor HP sales dari sel spreadsheet.
 * Mendukung pemisah ';' atau '|' serta label opsional dalam kurung:
 * "0812-1111-2222 (WhatsApp); 0815-9999-0000 (Telepon Kantor)"
 */
export function parseSalesPhones(raw: string | null): ParsedSalesPhone[] {
  if (!raw || !raw.trim()) return [];
  const parts = raw
    .split(/[;|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const phones: ParsedSalesPhone[] = [];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    const match = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (match) {
      const number = match[1].trim();
      const label = match[2].trim();
      if (number) {
        phones.push({
          number,
          label: label || (idx === 0 ? 'WhatsApp' : 'Alternatif'),
          is_primary: idx === 0,
        });
      }
    } else {
      phones.push({
        number: part,
        label: idx === 0 ? 'WhatsApp' : 'Alternatif',
        is_primary: idx === 0,
      });
    }
  }
  return phones;
}

function extractExcelCellValue(rawVal: ExcelJS.CellValue): CellScalar {
  if (rawVal === null || rawVal === undefined) return null;

  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof rawVal === 'number') {
    return Number.isFinite(rawVal) ? rawVal : null;
  }

  if (typeof rawVal === 'boolean') {
    return rawVal;
  }

  if (rawVal instanceof Date) {
    return Number.isNaN(rawVal.getTime()) ? null : rawVal.toISOString();
  }

  if (typeof rawVal === 'object') {
    if ('richText' in rawVal && Array.isArray(rawVal.richText)) {
      const text = rawVal.richText.map((item) => item.text || '').join('').trim();
      return text.length > 0 ? text : null;
    }
    if ('text' in rawVal && typeof rawVal.text === 'string') {
      const text = rawVal.text.trim();
      return text.length > 0 ? text : null;
    }
    if ('error' in rawVal && !('result' in rawVal)) {
      return null;
    }
    if ('result' in rawVal) {
      if (rawVal.result === undefined || rawVal.result === null) return null;
      if (typeof rawVal.result === 'object' && 'error' in rawVal.result) return null;
      return extractExcelCellValue(rawVal.result as ExcelJS.CellValue);
    }
  }

  const fallback = String(rawVal).trim();
  return fallback.length > 0 ? fallback : null;
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);

  if (!firstLine) return ',';

  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
      else if (ch === '\t') tabs++;
    }
  }

  if (semicolons > commas && semicolons >= tabs) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  return ',';
}

function parseCsvBuffer(buffer: Buffer): ParsedSpreadsheet {
  const text = buffer.toString('utf8');
  if (!text.replace(/^\uFEFF/, '').trim()) {
    throw new AppHttpError(400, 'File CSV kosong.', 'EMPTY_IMPORT_FILE');
  }

  const delimiter = detectCsvDelimiter(text);
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (err: any) {
    throw new AppHttpError(
      400,
      `Gagal membaca file CSV: ${err?.message || 'format tidak valid'}`,
      'INVALID_FILE_FORMAT'
    );
  }

  if (!records || records.length === 0) {
    throw new AppHttpError(400, 'File CSV tidak memiliki baris header.', 'EMPTY_IMPORT_FILE');
  }

  const rawHeaders = records[0];
  const headers: string[] = [];
  const headerIndexMap: Array<{ index: number; key: string }> = [];

  for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
    const norm = normalizeHeaderKey(rawHeaders[colIdx] || '');
    if (!norm) continue;
    if (headers.includes(norm)) {
      throw new AppHttpError(
        400,
        `Header kolom duplikat ditemukan di file CSV: "${norm}".`,
        'INVALID_TEMPLATE_HEADERS'
      );
    }
    headers.push(norm);
    headerIndexMap.push({ index: colIdx, key: norm });
  }

  if (headers.length === 0) {
    throw new AppHttpError(
      400,
      'Header kolom CSV tidak terbaca atau kosong.',
      'INVALID_TEMPLATE_HEADERS'
    );
  }

  const rows: ParsedSpreadsheetRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const values: Record<string, CellScalar> = {};
    let hasValue = false;

    for (const { index, key } of headerIndexMap) {
      const rawCell = rec[index];
      const val = rawCell !== undefined && String(rawCell).trim() !== '' ? String(rawCell).trim() : null;
      values[key] = val;
      if (val !== null) hasValue = true;
    }

    if (!hasValue) continue;

    rows.push({
      row_number: i + 1,
      values,
    });

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppHttpError(
        413,
        `Jumlah baris data melebihi batas maksimal ${MAX_IMPORT_ROWS} baris per file. Silakan pecah file menjadi beberapa bagian.`,
        'TOO_MANY_ROWS'
      );
    }
  }

  if (rows.length === 0) {
    throw new AppHttpError(
      400,
      'File CSV hanya berisi header tanpa baris data.',
      'EMPTY_IMPORT_FILE'
    );
  }

  return { headers, rows };
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuf = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as unknown as ExcelJS.Buffer;
    await workbook.xlsx.load(arrayBuf);
  } catch (err: any) {
    throw new AppHttpError(
      400,
      `Gagal membaca file Excel (.xlsx): ${err?.message || 'file rusak atau terenkripsi'}`,
      'INVALID_FILE_FORMAT'
    );
  }

  const worksheet =
    workbook.worksheets.find((ws) => ws.state !== 'hidden' && ws.rowCount > 0) ??
    workbook.worksheets[0];

  if (!worksheet || worksheet.rowCount === 0) {
    throw new AppHttpError(400, 'Worksheet Excel kosong.', 'EMPTY_IMPORT_FILE');
  }

  let headerRowNumber: number | null = null;
  const headers: string[] = [];
  const headerColMap: Array<{ col: number; key: string }> = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRowNumber !== null) return;

    const candidateCols: Array<{ col: number; key: string }> = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const scalar = extractExcelCellValue(cell.value);
      if (scalar === null) return;
      const norm = normalizeHeaderKey(String(scalar));
      if (!norm) return;
      candidateCols.push({ col: colNumber, key: norm });
    });

    if (candidateCols.length > 0) {
      headerRowNumber = rowNumber;
      for (const item of candidateCols) {
        if (headers.includes(item.key)) {
          throw new AppHttpError(
            400,
            `Header kolom duplikat ditemukan di file Excel: "${item.key}".`,
            'INVALID_TEMPLATE_HEADERS'
          );
        }
        headers.push(item.key);
        headerColMap.push(item);
      }
    }
  });

  if (headerRowNumber === null || headers.length === 0) {
    throw new AppHttpError(
      400,
      'Header kolom Excel tidak ditemukan.',
      'INVALID_TEMPLATE_HEADERS'
    );
  }

  const rows: ParsedSpreadsheetRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber!) return;

    const values: Record<string, CellScalar> = {};
    let hasValue = false;

    for (const { col, key } of headerColMap) {
      const cell = row.getCell(col);
      const scalar = extractExcelCellValue(cell.value);
      values[key] = scalar;
      if (scalar !== null) hasValue = true;
    }

    if (!hasValue) return;

    rows.push({
      row_number: rowNumber,
      values,
    });

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppHttpError(
        413,
        `Jumlah baris data melebihi batas maksimal ${MAX_IMPORT_ROWS} baris per file. Silakan pecah file menjadi beberapa bagian.`,
        'TOO_MANY_ROWS'
      );
    }
  });

  if (rows.length === 0) {
    throw new AppHttpError(
      400,
      'File Excel hanya berisi header tanpa baris data.',
      'EMPTY_IMPORT_FILE'
    );
  }

  return { headers, rows };
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  format: ImportFileFormat
): Promise<ParsedSpreadsheet> {
  if (format === 'csv') {
    return parseCsvBuffer(buffer);
  }
  return parseXlsxBuffer(buffer);
}

export function escapeCsvValue(value: CellScalar | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Neutralize spreadsheet formula triggers on exported strings
  if (/^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
