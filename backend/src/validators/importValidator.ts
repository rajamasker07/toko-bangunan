import { z } from 'zod';
import type {
  ImportDuplicateMode,
  ImportEntityType,
  ImportFileFormat,
} from '../types/import.js';
import { AppHttpError } from '../utils/errors.js';

export const importEntitySchema = z.enum([
  'products',
  'suppliers',
  'categories',
  'brands',
]);

export const importFormatSchema = z.enum(['xlsx', 'csv']);

export const importModeSchema = z.enum(['skip', 'upsert']);

export function parseImportEntity(raw: unknown): ImportEntityType {
  const res = importEntitySchema.safeParse(
    typeof raw === 'string' ? raw.trim().toLowerCase() : raw
  );
  if (!res.success) {
    throw new AppHttpError(
      400,
      'Tipe entitas import tidak valid. Gunakan: products, suppliers, categories, atau brands.',
      'INVALID_IMPORT_ENTITY'
    );
  }
  return res.data;
}

export function parseImportFormat(raw: unknown): ImportFileFormat {
  if (raw === undefined || raw === null || raw === '') return 'xlsx';
  const res = importFormatSchema.safeParse(
    typeof raw === 'string' ? raw.trim().toLowerCase() : raw
  );
  if (!res.success) {
    throw new AppHttpError(
      400,
      'Format template tidak valid. Pilih xlsx atau csv.',
      'INVALID_FILE_FORMAT'
    );
  }
  return res.data;
}

export function parseDuplicateMode(raw: unknown): ImportDuplicateMode {
  if (raw === undefined || raw === null || raw === '') return 'skip';
  const res = importModeSchema.safeParse(
    typeof raw === 'string' ? raw.trim().toLowerCase() : raw
  );
  if (!res.success) {
    throw new AppHttpError(
      400,
      'Mode duplikat tidak valid. Pilih skip atau upsert.',
      'INVALID_DUPLICATE_MODE'
    );
  }
  return res.data;
}

export function parseSkipInvalidRows(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const norm = raw.trim().toLowerCase();
    return norm === 'true' || norm === '1' || norm === 'yes';
  }
  return false;
}

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidOptionalEmail(value: string | null): boolean {
  if (!value) return true;
  return value.length <= 100 && SIMPLE_EMAIL_REGEX.test(value);
}
