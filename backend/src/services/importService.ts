import { pool } from '../config/db.js';
import { detectAndValidateFileFormat } from '../middleware/upload.js';
import type {
  ImportCommitErrorItem,
  ImportCommitResult,
  ImportDuplicateMode,
  ImportEntityType,
  ImportExecutionContext,
  ImportPreviewResult,
  ImportPreviewRow,
  ParsedSpreadsheetRow,
} from '../types/import.js';
import { AppHttpError } from '../utils/errors.js';
import { parseSpreadsheetBuffer } from '../utils/spreadsheetParser.js';
import { runBrandImport } from './import/brandImport.js';
import { runCategoryImport } from './import/categoryImport.js';
import { runProductImport } from './import/productImport.js';
import {
  buildPreviewSummary,
  extractCommitErrorsFromPreview,
  type Queryable,
} from './import/shared.js';
import { runSupplierImport } from './import/supplierImport.js';
import { ImportTemplateService } from './importTemplateService.js';

function mapPostgresError(err: any): AppHttpError | null {
  const code = err?.code;
  if (code === '23505') {
    const detail = err?.detail ? ` (${String(err.detail)})` : '';
    return new AppHttpError(
      409,
      `Konflik data duplikat di database saat menyimpan import${detail}.`,
      'IMPORT_CONFLICT'
    );
  }
  if (code === '23503') {
    return new AppHttpError(
      400,
      'Referensi relasi data tidak ditemukan di database (foreign key violation).',
      'IMPORT_VALIDATION_FAILED'
    );
  }
  if (code === '22P02' || code === '22001' || code === '22003') {
    return new AppHttpError(
      400,
      'Terdapat nilai kolom yang panjang atau formatnya tidak sesuai tipe data database.',
      'IMPORT_VALIDATION_FAILED'
    );
  }
  return null;
}

async function executeEntityPipeline(
  entity: ImportEntityType,
  rows: ParsedSpreadsheetRow[],
  mode: ImportDuplicateMode,
  db: Queryable,
  ctx: ImportExecutionContext,
  options: { commit: boolean; skipInvalidRows?: boolean }
) {
  switch (entity) {
    case 'brands': {
      const res = await runBrandImport(rows, mode, db, options);
      return {
        previewRows: res.previewRows,
        commitSummary: res.commitSummary,
        autoCreateDependencies: undefined,
      };
    }
    case 'categories': {
      const res = await runCategoryImport(rows, mode, db, options);
      return {
        previewRows: res.previewRows,
        commitSummary: res.commitSummary,
        autoCreateDependencies: {
          categories: res.autoCreatedCategories,
          brands: [],
          units: [],
        },
      };
    }
    case 'suppliers': {
      const res = await runSupplierImport(rows, mode, db, options);
      return {
        previewRows: res.previewRows,
        commitSummary: res.commitSummary,
        autoCreateDependencies: undefined,
      };
    }
    case 'products': {
      const res = await runProductImport(rows, mode, db, ctx, options);
      return {
        previewRows: res.previewRows,
        commitSummary: res.commitSummary,
        autoCreateDependencies: res.autoCreateDependencies,
      };
    }
  }
}

export class ImportService {
  static async preview(
    entity: ImportEntityType,
    file: Express.Multer.File,
    mode: ImportDuplicateMode,
    ctx: ImportExecutionContext
  ): Promise<ImportPreviewResult> {
    const fileFormat = detectAndValidateFileFormat(file);
    const parsed = await parseSpreadsheetBuffer(file.buffer, fileFormat);
    const { columns, rows } = ImportTemplateService.normalizeSpreadsheetToSchema(entity, parsed);

    const outcome = await executeEntityPipeline(entity, rows, mode, pool, ctx, {
      commit: false,
    });

    return {
      entity,
      file_name: file.originalname || `import.${fileFormat}`,
      file_format: fileFormat,
      mode,
      summary: buildPreviewSummary(outcome.previewRows, outcome.autoCreateDependencies),
      columns,
      rows: outcome.previewRows,
      truncated: false,
    };
  }

  static async commit(
    entity: ImportEntityType,
    file: Express.Multer.File,
    mode: ImportDuplicateMode,
    skipInvalidRows: boolean,
    ctx: ImportExecutionContext
  ): Promise<ImportCommitResult> {
    const fileFormat = detectAndValidateFileFormat(file);
    const parsed = await parseSpreadsheetBuffer(file.buffer, fileFormat);
    const { rows } = ImportTemplateService.normalizeSpreadsheetToSchema(entity, parsed);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (!skipInvalidRows) {
        const dryCheck = await executeEntityPipeline(entity, rows, mode, client, ctx, {
          commit: false,
        });
        const validationErrors = extractCommitErrorsFromPreview(dryCheck.previewRows);
        if (validationErrors.length > 0) {
          await client.query('ROLLBACK');
          const failedRowsCount = dryCheck.previewRows.filter(
            (r: ImportPreviewRow) => r.status === 'error'
          ).length;
          return {
            entity,
            mode,
            committed: false,
            summary: {
              total_rows: rows.length,
              processed_rows: 0,
              created_count: 0,
              updated_count: 0,
              skipped_count: 0,
              failed_count: failedRowsCount,
            },
            errors: validationErrors,
          };
        }
      }

      const committedOutcome = await executeEntityPipeline(entity, rows, mode, client, ctx, {
        commit: true,
        skipInvalidRows,
      });

      const commitErrors: ImportCommitErrorItem[] = extractCommitErrorsFromPreview(
        committedOutcome.previewRows
      );

      await client.query('COMMIT');

      return {
        entity,
        mode,
        committed: true,
        summary: committedOutcome.commitSummary,
        errors: commitErrors,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const mapped = mapPostgresError(error);
      if (mapped) throw mapped;
      throw error;
    } finally {
      client.release();
    }
  }
}
