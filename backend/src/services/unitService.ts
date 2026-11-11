import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

type Queryable = Pool | PoolClient;

export interface UnitMaster {
  id: string;
  name: string;
  name_key: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function normalizeUnitName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  // Format Title Case jika huruf kecil semua, atau pertahankan akronim (seperti Pcs, KG)
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function unitKey(name: string): string {
  const norm = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm || name.trim().toLowerCase();
}

export class UnitService {
  static async getAll(activeOnly = true): Promise<UnitMaster[]> {
    const where = activeOnly ? 'WHERE is_active = TRUE' : '';
    const res = await query(`
      SELECT * FROM units
      ${where}
      ORDER BY name ASC
    `);
    return res.rows;
  }

  static async findOrCreate(
    rawName: string,
    description?: string,
    db: Queryable = pool
  ): Promise<{ unit: UnitMaster; created: boolean }> {
    const name = normalizeUnitName(rawName || '');
    if (!name) throw new Error('Nama satuan wajib diisi');
    if (name.length > 50) throw new Error('Nama satuan maksimal 50 karakter');

    const key = unitKey(name);

    const inserted = await db.query(
      `INSERT INTO units (id, name, name_key, description, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (name_key) DO NOTHING
       RETURNING *`,
      [generateUUIDv7(), name, key, description ? description.trim() : null]
    );

    if (inserted.rows[0]) {
      return { unit: inserted.rows[0], created: true };
    }

    const existing = await db.query('SELECT * FROM units WHERE name_key = $1', [key]);
    if (!existing.rows[0]) {
      throw new Error('Gagal memproses data satuan');
    }

    return { unit: existing.rows[0], created: false };
  }
}
