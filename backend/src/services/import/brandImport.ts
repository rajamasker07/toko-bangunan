import type {
  ImportCellIssue,
  ImportCommitSummary,
  ImportDuplicateMode,
  ImportPreviewRow,
  ImportRowAction,
  ParsedSpreadsheetRow,
} from '../../types/import.js';
import { brandKey, normalizeBrandName } from '../../utils/brand.js';
import { parseTextCell } from '../../utils/spreadsheetParser.js';
import { generateUUIDv7 } from '../../utils/uuid.js';
import { cleanRawSpreadsheetValues, deriveRowStatus, type Queryable } from './shared.js';

interface ExistingBrand {
  id: string;
  name: string;
  name_key: string;
}

export async function runBrandImport(
  rows: ParsedSpreadsheetRow[],
  mode: ImportDuplicateMode,
  db: Queryable,
  options: { commit: boolean; skipInvalidRows?: boolean }
): Promise<{
  previewRows: ImportPreviewRow[];
  commitSummary: ImportCommitSummary;
}> {
  const existingRes = await db.query('SELECT id, name, name_key FROM brands');
  const existingMap = new Map<string, ExistingBrand>();
  for (const b of existingRes.rows as ExistingBrand[]) {
    existingMap.set(b.name_key, b);
  }

  const seenInFile = new Map<string, number>();
  const previewRows: ImportPreviewRow[] = [];

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const messages: ImportCellIssue[] = [];
    const rawName = parseTextCell(row.values.nama_merek);

    let action: ImportRowAction = 'invalid';
    let normalizedName: string | null = null;
    let key: string | null = null;

    if (!rawName) {
      messages.push({
        severity: 'error',
        field: 'nama_merek',
        code: 'REQUIRED',
        message: 'Nama merek wajib diisi.',
      });
    } else {
      normalizedName = normalizeBrandName(rawName);
      if (!normalizedName) {
        messages.push({
          severity: 'error',
          field: 'nama_merek',
          code: 'REQUIRED',
          message: 'Nama merek wajib diisi.',
        });
      } else if (normalizedName.length > 100) {
        messages.push({
          severity: 'error',
          field: 'nama_merek',
          code: 'MAX_LENGTH',
          message: 'Nama merek maksimal 100 karakter.',
        });
      } else {
        key = brandKey(normalizedName);
        if (key.length > 100) {
          messages.push({
            severity: 'error',
            field: 'nama_merek',
            code: 'MAX_LENGTH',
            message: 'Kunci normalisasi merek melebihi 100 karakter.',
          });
        }
      }
    }

    if (messages.some((m) => m.severity === 'error')) {
      action = 'invalid';
      failedCount++;
    } else if (key && normalizedName) {
      const prevRowNum = seenInFile.get(key);
      if (prevRowNum !== undefined) {
        action = 'skip';
        messages.push({
          severity: 'warning',
          field: 'nama_merek',
          code: 'DUPLICATE_IN_FILE',
          message: `Duplikat merek dengan baris ${prevRowNum} dalam file; baris ini dilewati.`,
        });
        skippedCount++;
      } else {
        seenInFile.set(key, row.row_number);
        const existing = existingMap.get(key);

        if (existing) {
          if (mode === 'skip') {
            action = 'skip';
            messages.push({
              severity: 'warning',
              field: 'nama_merek',
              code: 'ALREADY_EXISTS',
              message: `Merek "${existing.name}" sudah terdaftar, dilewati (mode skip).`,
            });
            skippedCount++;
          } else {
            action = 'update';
            if (options.commit) {
              await db.query(
                `UPDATE brands SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [normalizedName, existing.id]
              );
              existing.name = normalizedName;
            }
            updatedCount++;
          }
        } else {
          action = 'create';
          if (options.commit) {
            const id = generateUUIDv7();
            const inserted = await db.query(
              `INSERT INTO brands (id, name, name_key)
               VALUES ($1, $2, $3)
               ON CONFLICT (name_key) DO NOTHING
               RETURNING id, name, name_key`,
              [id, normalizedName, key]
            );
            if (inserted.rows[0]) {
              existingMap.set(key, inserted.rows[0] as ExistingBrand);
              createdCount++;
            } else {
              skippedCount++;
            }
          } else {
            existingMap.set(key, {
              id: `virtual-brand-${row.row_number}`,
              name: normalizedName,
              name_key: key,
            });
            createdCount++;
          }
        }
      }
    }

    previewRows.push({
      row_number: row.row_number,
      status: deriveRowStatus(action, messages),
      action,
      identifier: key,
      label: normalizedName || rawName,
      raw: cleanRawSpreadsheetValues(row.values),
      normalized: normalizedName ? { name: normalizedName, name_key: key } : undefined,
      messages,
    });
  }

  return {
    previewRows,
    commitSummary: {
      total_rows: rows.length,
      processed_rows: createdCount + updatedCount + skippedCount,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
    },
  };
}
