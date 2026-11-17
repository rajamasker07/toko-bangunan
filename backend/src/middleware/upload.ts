import path from 'node:path';
import multer from 'multer';
import type { ImportFileFormat } from '../types/import.js';
import { AppHttpError } from '../utils/errors.js';

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
]);

const ALLOWED_CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

export const importFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (ext === '.xlsx') {
      if (!mime || ALLOWED_XLSX_MIMES.has(mime)) {
        cb(null, true);
        return;
      }
      cb(
        new AppHttpError(
          400,
          'MIME type file .xlsx tidak dikenali. Gunakan file Excel (.xlsx) yang valid.',
          'UNSUPPORTED_FILE_TYPE'
        )
      );
      return;
    }

    if (ext === '.csv') {
      if (!mime || ALLOWED_CSV_MIMES.has(mime)) {
        cb(null, true);
        return;
      }
      cb(
        new AppHttpError(
          400,
          'MIME type file .csv tidak dikenali. Gunakan file CSV (.csv) yang valid.',
          'UNSUPPORTED_FILE_TYPE'
        )
      );
      return;
    }

    if (ext === '.xls' || ext === '.xlsm' || ext === '.ods') {
      cb(
        new AppHttpError(
          400,
          `Format file ${ext} tidak didukung. Simpan file sebagai Excel (.xlsx) atau CSV (.csv).`,
          'UNSUPPORTED_FILE_TYPE'
        )
      );
      return;
    }

    cb(
      new AppHttpError(
        400,
        'Format file tidak didukung. Hanya file Excel (.xlsx) dan CSV (.csv) yang diizinkan.',
        'UNSUPPORTED_FILE_TYPE'
      )
    );
  },
});

export const MAX_SQL_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const sqlFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SQL_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.sql') {
      cb(null, true);
      return;
    }
    cb(
      new AppHttpError(
        400,
        'Hanya file SQL (.sql) yang diizinkan untuk restore database.',
        'UNSUPPORTED_FILE_TYPE'
      )
    );
  },
});

function isZipMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * Validasi format file aktual menggunakan ekstensi dan signature byte (magic bytes).
 */
export function detectAndValidateFileFormat(file: Express.Multer.File): ImportFileFormat {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppHttpError(400, 'File import kosong (0 byte).', 'EMPTY_IMPORT_FILE');
  }

  const ext = path.extname(file.originalname || '').toLowerCase();

  if (ext === '.xlsx') {
    if (!isZipMagicBytes(file.buffer)) {
      throw new AppHttpError(
        400,
        'File .xlsx tidak valid atau rusak (signature OOXML tidak cocok).',
        'UNSUPPORTED_FILE_TYPE'
      );
    }
    return 'xlsx';
  }

  if (ext === '.csv') {
    if (isZipMagicBytes(file.buffer) || file.buffer.includes(0x00)) {
      throw new AppHttpError(
        400,
        'Isi file .csv terlihat seperti file biner/Excel terkompresi, bukan teks CSV.',
        'UNSUPPORTED_FILE_TYPE'
      );
    }
    return 'csv';
  }

  throw new AppHttpError(
    400,
    'Format file tidak didukung. Hanya file .xlsx dan .csv yang diizinkan.',
    'UNSUPPORTED_FILE_TYPE'
  );
}
