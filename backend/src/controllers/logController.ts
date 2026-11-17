import type { Request, Response } from 'express';
import { LogService } from '../services/logService.js';
import { sendErrorResponse } from '../utils/errors.js';
import type { LogFilterOptions } from '../types/log.js';

export class LogController {
  static async listLogs(req: Request, res: Response): Promise<void> {
    try {
      const options: LogFilterOptions = {
        level: req.query.level as any,
        category: req.query.category as string,
        search: req.query.search as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      };

      const result = LogService.getLogs(options);
      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = LogService.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async listFiles(_req: Request, res: Response): Promise<void> {
    try {
      const files = LogService.listFiles();
      res.json({
        success: true,
        data: files,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const rawParam = req.params.filename;
      const filename = String(Array.isArray(rawParam) ? rawParam[0] : rawParam || '');
      const filePath = LogService.getSafeFilePath(filename);

      res.download(filePath, filename, (err) => {
        if (err && !res.headersSent) {
          sendErrorResponse(res, err);
        }
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async clearBuffer(_req: Request, res: Response): Promise<void> {
    try {
      LogService.clearBuffer();
      res.json({
        success: true,
        message: 'Buffer memori log berhasil dibersihkan.',
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async rotateFiles(_req: Request, res: Response): Promise<void> {
    try {
      LogService.rotateLogs();
      res.json({
        success: true,
        message: 'Rotasi file log berhasil dieksekusi.',
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }
}
