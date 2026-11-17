import { logger } from '../utils/logger.js';
import type { LogFilterOptions, LogStats, LogFileInfo, LogEntry } from '../types/log.js';
import { AppHttpError } from '../utils/errors.js';

export class LogService {
  /**
   * Ambil daftar log terbaru dari memory buffer dengan filter dan paginasi
   */
  static getLogs(options: LogFilterOptions = {}): {
    logs: LogEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  } {
    return logger.getRecentLogs(options);
  }

  /**
   * Ambil ringkasan statistik log, status disk file, dan utilisasi memori server
   */
  static getStats(): LogStats {
    return logger.getStats();
  }

  /**
   * Ambil daftar file log fisik yang tersimpan di disk
   */
  static listFiles(): LogFileInfo[] {
    return logger.listLogFiles();
  }

  /**
   * Dapatkan path absolut file log dengan validasi keamanan path-traversal
   */
  static getSafeFilePath(filename: string): string {
    const resolvedPath = logger.resolveSafeLogFilePath(filename);
    if (!resolvedPath) {
      throw new AppHttpError(404, `File log "${filename}" tidak ditemukan atau tidak diizinkan.`, 'LOG_FILE_NOT_FOUND');
    }
    return resolvedPath;
  }

  /**
   * Bersihkan buffer log di memori
   */
  static clearBuffer(): void {
    logger.clearMemoryBuffer();
    logger.info('SYSTEM', 'Log buffer di memori telah dibersihkan oleh pengguna');
  }

  /**
   * Lakukan rotasi file log utama secara manual
   */
  static rotateLogs(): void {
    logger.rotateFile('app.log');
    logger.rotateFile('error.log');
    logger.rotateFile('http.log');
    logger.info('SYSTEM', 'Rotasi manual file log (app.log, error.log, http.log) berhasil dieksekusi');
  }
}
