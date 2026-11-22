import type { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { ImportService } from '../services/importService.js';
import { ImportTemplateService } from '../services/importTemplateService.js';
import type {
  ImportDuplicateMode,
  ImportEntityType,
  ImportExecutionContext,
} from '../types/import.js';
import { AppHttpError, sendErrorResponse } from '../utils/errors.js';
import {
  parseDuplicateMode,
  parseImportEntity,
  parseImportFormat,
  parseSkipInvalidRows,
} from '../validators/importValidator.js';

function assertEntityImportPermission(
  role: string,
  entity: ImportEntityType,
  mode?: ImportDuplicateMode
): void {
  if (entity === 'products') {
    if (!hasPermission(role, 'products:create')) {
      throw new AppHttpError(
        403,
        'Anda tidak memiliki izin "products:create" untuk mengimport produk.',
        'FORBIDDEN'
      );
    }
    if (mode === 'upsert' && !hasPermission(role, 'products:update')) {
      throw new AppHttpError(
        403,
        'Mode upsert produk memerlukan izin "products:update".',
        'FORBIDDEN'
      );
    }
    return;
  }

  if (!hasPermission(role, 'master:write')) {
    throw new AppHttpError(
      403,
      'Anda tidak memiliki izin "master:write" untuk mengimport data master.',
      'FORBIDDEN'
    );
  }
}

function buildImportContext(req: Request): ImportExecutionContext {
  const role = req.user!.role;
  return {
    userId: req.user!.id,
    createdBy: req.user!.full_name || req.user!.username || 'Admin',
    allowBuyPrice: hasPermission(role, 'products:view_buy_price'),
    allowPricingWrite: hasPermission(role, 'pricing:write'),
    filename: req.file?.originalname || null,
  };
}

export class ImportController {
  static async downloadTemplate(req: Request, res: Response): Promise<void> {
    try {
      const entity = parseImportEntity(req.params.entity);
      const format = parseImportFormat(req.query.format);

      assertEntityImportPermission(req.user!.role, entity);

      const { buffer, contentType, filename } =
        await ImportTemplateService.generateTemplateBuffer(entity, format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  static async preview(req: Request, res: Response): Promise<void> {
    try {
      const entity = parseImportEntity(req.params.entity);
      const mode = parseDuplicateMode(req.body?.mode ?? req.query?.mode);

      assertEntityImportPermission(req.user!.role, entity, mode);

      if (!req.file) {
        throw new AppHttpError(
          400,
          'File import wajib diunggah pada field "file".',
          'MISSING_IMPORT_FILE'
        );
      }

      const ctx = buildImportContext(req);
      const result = await ImportService.preview(entity, req.file, mode, ctx);

      res.status(200).json({
        success: true,
        message:
          result.summary.error_rows > 0
            ? `Preview selesai: ${result.summary.valid_rows} valid, ${result.summary.error_rows} baris error.`
            : `Preview selesai: seluruh ${result.summary.valid_rows} baris siap diimport.`,
        data: result,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  static async commit(req: Request, res: Response): Promise<void> {
    try {
      const entity = parseImportEntity(req.params.entity);
      const mode = parseDuplicateMode(req.body?.mode ?? req.query?.mode);
      const skipInvalidRows = parseSkipInvalidRows(
        req.body?.skip_invalid_rows ?? req.query?.skip_invalid_rows
      );

      assertEntityImportPermission(req.user!.role, entity, mode);

      if (!req.file) {
        throw new AppHttpError(
          400,
          'File import wajib diunggah pada field "file".',
          'MISSING_IMPORT_FILE'
        );
      }

      const ctx = buildImportContext(req);
      const result = await ImportService.commit(
        entity,
        req.file,
        mode,
        skipInvalidRows,
        ctx
      );

      if (!result.committed) {
        res.status(422).json({
          success: false,
          code: 'IMPORT_VALIDATION_FAILED',
          message: `Import dibatalkan karena terdapat ${result.summary.failed_count} baris error. Perbaiki file atau aktifkan lewati baris error.`,
          details: { errors: result.errors },
          data: result,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Import ${entity} selesai: ${result.summary.created_count} dibuat, ${result.summary.updated_count} diperbarui, ${result.summary.skipped_count} dilewati.`,
        data: result,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }
}
