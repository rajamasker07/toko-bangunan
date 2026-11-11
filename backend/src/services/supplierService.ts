import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

type Queryable = Pool | PoolClient;

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

export interface CreateSupplierInput {
  name: string;
  code?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface UpdateSupplierInput {
  name?: string;
  code?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export class SupplierService {
  /**
   * List all suppliers with product count
   */
  static async getAll(filters?: { search?: string; isActive?: boolean }): Promise<Supplier[]> {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(s.name) LIKE $${params.length} OR
        LOWER(COALESCE(s.code, '')) LIKE $${params.length} OR
        LOWER(COALESCE(s.contact_person, '')) LIKE $${params.length} OR
        LOWER(COALESCE(s.phone, '')) LIKE $${params.length} OR
        LOWER(COALESCE(s.city, '')) LIKE $${params.length}
      )`);
    }

    if (filters?.isActive !== undefined) {
      params.push(filters.isActive);
      conditions.push(`s.is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        s.*,
        COUNT(p.id)::int AS product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
      ${whereClause}
      GROUP BY s.id
      ORDER BY s.name ASC
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Get single supplier by ID
   */
  static async getById(id: string): Promise<Supplier | null> {
    const res = await query(
      `SELECT 
        s.*,
        COUNT(p.id)::int AS product_count
       FROM suppliers s
       LEFT JOIN products p ON p.supplier_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Generate default unique code for supplier if not provided
   */
  private static generateDefaultCode(name: string): string {
    const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SUP-${clean || 'MAT'}-${rand}`;
  }

  /**
   * Create new supplier
   */
  static async create(input: CreateSupplierInput, db: Queryable = pool): Promise<Supplier> {
    const name = input.name?.trim();
    if (!name) throw new Error('Nama supplier wajib diisi');

    let code = input.code?.trim() || null;
    if (!code) {
      code = this.generateDefaultCode(name);
    }

    // Check code uniqueness
    const dupCode = await db.query('SELECT id FROM suppliers WHERE LOWER(code) = LOWER($1)', [code]);
    if (dupCode.rows.length > 0) {
      throw new Error(`Kode supplier "${code}" sudah digunakan.`);
    }

    const id = generateUUIDv7();
    const isActive = input.is_active !== undefined ? input.is_active : true;

    const res = await db.query(
      `INSERT INTO suppliers (
        id, name, code, contact_person, phone, email, address, city, notes, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        name,
        code,
        input.contact_person?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.notes?.trim() || null,
        isActive,
      ]
    );

    return res.rows[0];
  }

  /**
   * Update supplier
   */
  static async update(id: string, input: UpdateSupplierInput): Promise<Supplier | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) throw new Error('Nama supplier wajib diisi');

    let code = input.code !== undefined ? (input.code?.trim() || null) : current.code;

    if (code && code.toLowerCase() !== (current.code || '').toLowerCase()) {
      const dup = await query('SELECT id FROM suppliers WHERE LOWER(code) = LOWER($1) AND id <> $2', [code, id]);
      if (dup.rows.length > 0) {
        throw new Error(`Kode supplier "${code}" sudah digunakan.`);
      }
    }

    const contactPerson = input.contact_person !== undefined ? (input.contact_person?.trim() || null) : current.contact_person;
    const phone = input.phone !== undefined ? (input.phone?.trim() || null) : current.phone;
    const email = input.email !== undefined ? (input.email?.trim() || null) : current.email;
    const address = input.address !== undefined ? (input.address?.trim() || null) : current.address;
    const city = input.city !== undefined ? (input.city?.trim() || null) : current.city;
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : current.notes;
    const isActive = input.is_active !== undefined ? input.is_active : current.is_active;

    const res = await query(
      `UPDATE suppliers SET
        name = $1,
        code = $2,
        contact_person = $3,
        phone = $4,
        email = $5,
        address = $6,
        city = $7,
        notes = $8,
        is_active = $9,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [name, code, contactPerson, phone, email, address, city, notes, isActive, id]
    );

    return res.rows[0] || null;
  }

  /**
   * Delete supplier
   */
  static async delete(id: string): Promise<Supplier | null> {
    const res = await query('DELETE FROM suppliers WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  }
}
