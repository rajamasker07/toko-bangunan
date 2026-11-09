import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { brandKey, normalizeBrandName } from '../utils/brand.js';

type Queryable = Pool | PoolClient;

export interface Brand {
  id: string;
  name: string;
  name_key: string;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

/** Error khusus untuk merek duplikat (dipetakan ke HTTP 409 oleh controller) */
export class DuplicateBrandError extends Error {
  constructor(public existing: Brand) {
    super(`Merek "${existing.name}" sudah terdaftar.`);
    this.name = 'DuplicateBrandError';
  }
}

export class BrandService {
  static async getAll(): Promise<Brand[]> {
    const res = await query(`
      SELECT b.*, COUNT(p.id)::int AS product_count
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id
      GROUP BY b.id
      ORDER BY b.name ASC
    `);
    return res.rows;
  }

  static async findByName(name: string, db: Queryable = pool): Promise<Brand | null> {
    const res = await db.query('SELECT * FROM brands WHERE name_key = $1', [brandKey(name)]);
    return res.rows[0] || null;
  }

  /**
   * Ambil merek yang sudah ada (berdasarkan name_key) atau buat baru jika belum ada.
   * Aman dari race-condition berkat UNIQUE index + ON CONFLICT DO NOTHING.
   */
  static async findOrCreate(rawName: string, db: Queryable = pool): Promise<{ brand: Brand; created: boolean }> {
    const name = normalizeBrandName(rawName || '');
    if (!name) throw new Error('Nama merek wajib diisi');
    if (name.length > 100) throw new Error('Nama merek maksimal 100 karakter');

    const key = brandKey(name);
    const inserted = await db.query(
      `INSERT INTO brands (id, name, name_key) VALUES ($1, $2, $3)
       ON CONFLICT (name_key) DO NOTHING
       RETURNING *`,
      [generateUUIDv7(), name, key]
    );
    if (inserted.rows[0]) return { brand: inserted.rows[0], created: true };

    const existing = await db.query('SELECT * FROM brands WHERE name_key = $1', [key]);
    return { brand: existing.rows[0], created: false };
  }

  static async update(id: string, rawName: string): Promise<Brand | null> {
    const name = normalizeBrandName(rawName || '');
    if (!name) throw new Error('Nama merek wajib diisi');

    const key = brandKey(name);
    const dup = await query('SELECT * FROM brands WHERE name_key = $1 AND id <> $2', [key, id]);
    if (dup.rows[0]) throw new DuplicateBrandError(dup.rows[0]);

    const res = await query(
      `UPDATE brands SET name = $1, name_key = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [name, key, id]
    );
    return res.rows[0] || null;
  }

  /** Hapus merek. Produk terkait otomatis menjadi tanpa merek (FK ON DELETE SET NULL). */
  static async delete(id: string): Promise<Brand | null> {
    const res = await query('DELETE FROM brands WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  }
}
