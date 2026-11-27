import type { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { ExportService } from '../services/exportService.js';
import type { ExportEntityType, ExportFileFormat } from '../types/export.js';
import { AppHttpError, sendErrorResponse } from '../utils/errors.js';

function getTimestampSuffix(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export class ExportController {
  /**
   * GET /api/export/stats
   * Mengambil statistik record tabel dan metadata database
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await ExportService.getExportStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  /**
   * GET /api/export/:entity
   * Ekspor data spesifik per-entitas (products, suppliers, categories, brands, units, etc)
   */
  static async exportEntity(req: Request, res: Response): Promise<void> {
    try {
      const entity = req.params.entity as ExportEntityType;
      const validEntities: ExportEntityType[] = [
        'products',
        'suppliers',
        'categories',
        'brands',
        'units',
        'supplier_invoices',
        'stock_movements',
        'reservations',
      ];

      if (!validEntities.includes(entity)) {
        throw new AppHttpError(400, `Entitas ekspor "${entity}" tidak dikenal`);
      }

      const format = ((req.query.format as string) || 'xlsx').toLowerCase() as ExportFileFormat;
      const canViewBuyPrice = req.user ? hasPermission(req.user.role, 'products:view_buy_price') : false;

      const dataset = await ExportService.getDatasetByEntity(entity, canViewBuyPrice);
      const timestamp = getTimestampSuffix();

      if (format === 'csv') {
        const buffer = ExportService.exportToCsv(dataset);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bangunjaya-export-${entity}-${timestamp}.csv"`
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.status(200).send(buffer);
        return;
      }

      if (format === 'json') {
        const jsonContent = ExportService.exportToJson(dataset);
        const buffer = Buffer.from(jsonContent, 'utf-8');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bangunjaya-export-${entity}-${timestamp}.json"`
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.status(200).send(buffer);
        return;
      }

      // Default format: XLSX
      const buffer = await ExportService.exportToExcel(dataset);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bangunjaya-export-${entity}-${timestamp}.xlsx"`
      );
      res.setHeader('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  /**
   * GET /api/export/full-workbook
   * Ekspor Full Excel Workbook (multi-sheets) atau Full JSON Snapshot
   */
  static async exportFullWorkbook(req: Request, res: Response): Promise<void> {
    try {
      const format = ((req.query.format as string) || 'xlsx').toLowerCase();
      const canViewBuyPrice = req.user ? hasPermission(req.user.role, 'products:view_buy_price') : false;
      const timestamp = getTimestampSuffix();

      if (format === 'json') {
        const jsonContent = await ExportService.exportFullJsonSnapshot(canViewBuyPrice);
        const buffer = Buffer.from(jsonContent, 'utf-8');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bangunjaya-full-backup-${timestamp}.json"`
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.status(200).send(buffer);
        return;
      }

      // Default XLSX Multi-Sheet
      const buffer = await ExportService.exportFullWorkbookExcel(canViewBuyPrice);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bangunjaya-full-backup-${timestamp}.xlsx"`
      );
      res.setHeader('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  /**
   * GET /api/export/database/sql
   * Ekspor Full Database PostgreSQL SQL Dump (.sql) langsung dapat di-import
   */
  static async exportDatabaseSql(req: Request, res: Response): Promise<void> {
    try {
      const timestamp = getTimestampSuffix();
      const sqlDump = await ExportService.generateDatabaseSqlDump();
      const buffer = Buffer.from(sqlDump, 'utf-8');

      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bangunjaya-database-dump-${timestamp}.sql"`
      );
      res.setHeader('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }

  /**
   * POST /api/export/database/restore
   * Restore database dari file SQL dump yang diunggah (khusus Owner)
   */
  static async restoreDatabase(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'owner') {
        throw new AppHttpError(
          403,
          'Operasi pemulihan (restore) database hanya dapat dilakukan oleh akun dengan peran Owner.',
          'FORBIDDEN_RESTORE'
        );
      }

      let sqlScript = '';
      if (req.file) {
        sqlScript = req.file.buffer.toString('utf-8');
      } else if (typeof req.body?.sql === 'string' && req.body.sql.trim().length > 0) {
        sqlScript = req.body.sql;
      } else {
        throw new AppHttpError(
          400,
          'File SQL (.sql) dump wajib diunggah pada field "file" atau "sql".',
          'MISSING_SQL_FILE'
        );
      }

      const result = await ExportService.restoreDatabaseFromSql(sqlScript, req.user.id);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  }
}
