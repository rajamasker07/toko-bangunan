import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

type Queryable = Pool | PoolClient;

export interface SalesPhone {
  number: string;
  label?: string; // e.g. "WhatsApp", "HP Utama", "Telepon Kantor", "HP Pribadi"
  is_primary?: boolean;
}

export interface SupplierSales {
  id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  phones: SalesPhone[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierSalesInput {
  name: string;
  email?: string | null;
  is_active?: boolean;
  phones?: Array<SalesPhone | string>;
  notes?: string | null;
}

export interface UpdateSupplierSalesInput {
  name?: string;
  email?: string | null;
  is_active?: boolean;
  phones?: Array<SalesPhone | string>;
  notes?: string | null;
}

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
  sales?: SupplierSales[];
  sales_count?: number;
  active_sales_count?: number;
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

function normalizePhones(phones?: Array<SalesPhone | string>): SalesPhone[] {
  if (!Array.isArray(phones)) return [];
  const result: SalesPhone[] = [];
  for (let idx = 0; idx < phones.length; idx++) {
    const p = phones[idx];
    if (typeof p === 'string') {
      const trimmed = p.trim();
      if (trimmed) {
        result.push({
          number: trimmed,
          label: idx === 0 ? 'Utama' : 'Alternatif',
          is_primary: idx === 0,
        });
      }
    } else if (typeof p === 'object' && p !== null) {
      const num = String(p.number || '').trim();
      if (num) {
        result.push({
          number: num,
          label: p.label?.trim() || (idx === 0 ? 'Utama' : 'Alternatif'),
          is_primary: Boolean(p.is_primary ?? idx === 0),
        });
      }
    }
  }
  return result;
}

export class SupplierService {
  /**
   * List all suppliers with product count and sales array
   */
  static async getAll(filters?: { search?: string; isActive?: boolean }): Promise<Supplier[]> {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      const pIdx = params.length;
      conditions.push(`(
        LOWER(s.name) LIKE $${pIdx} OR
        LOWER(COALESCE(s.code, '')) LIKE $${pIdx} OR
        LOWER(COALESCE(s.contact_person, '')) LIKE $${pIdx} OR
        LOWER(COALESCE(s.phone, '')) LIKE $${pIdx} OR
        LOWER(COALESCE(s.city, '')) LIKE $${pIdx} OR
        EXISTS (
          SELECT 1 FROM supplier_sales ss 
          WHERE ss.supplier_id = s.id 
            AND (
              LOWER(ss.name) LIKE $${pIdx} OR
              ss.phones::text LIKE $${pIdx} OR
              LOWER(COALESCE(ss.email, '')) LIKE $${pIdx}
            )
        )
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
        COUNT(DISTINCT p.id)::int AS product_count,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ss.id,
                'supplier_id', ss.supplier_id,
                'name', ss.name,
                'email', ss.email,
                'is_active', ss.is_active,
                'phones', ss.phones,
                'notes', ss.notes,
                'created_at', ss.created_at,
                'updated_at', ss.updated_at
              ) ORDER BY ss.is_active DESC, ss.name ASC
            )
            FROM supplier_sales ss
            WHERE ss.supplier_id = s.id
          ),
          '[]'::json
        ) AS sales
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
      ${whereClause}
      GROUP BY s.id
      ORDER BY s.name ASC
    `;

    const res = await query(sql, params);
    return res.rows.map((row) => ({
      ...row,
      sales: row.sales || [],
      sales_count: (row.sales || []).length,
      active_sales_count: (row.sales || []).filter((s: SupplierSales) => s.is_active).length,
    }));
  }

  /**
   * Get single supplier by ID
   */
  static async getById(id: string): Promise<Supplier | null> {
    const res = await query(
      `SELECT 
        s.*,
        COUNT(DISTINCT p.id)::int AS product_count,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ss.id,
                'supplier_id', ss.supplier_id,
                'name', ss.name,
                'email', ss.email,
                'is_active', ss.is_active,
                'phones', ss.phones,
                'notes', ss.notes,
                'created_at', ss.created_at,
                'updated_at', ss.updated_at
              ) ORDER BY ss.is_active DESC, ss.name ASC
            )
            FROM supplier_sales ss
            WHERE ss.supplier_id = s.id
          ),
          '[]'::json
        ) AS sales
       FROM suppliers s
       LEFT JOIN products p ON p.supplier_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );

    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      sales: row.sales || [],
      sales_count: (row.sales || []).length,
      active_sales_count: (row.sales || []).filter((s: SupplierSales) => s.is_active).length,
    };
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

    return {
      ...res.rows[0],
      sales: [],
      sales_count: 0,
      active_sales_count: 0,
    };
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

    if (!res.rows[0]) return null;
    return this.getById(id);
  }

  /**
   * Delete supplier
   */
  static async delete(id: string): Promise<Supplier | null> {
    const res = await query('DELETE FROM suppliers WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  }

  // ==========================================
  // SALES REPRESENTATIVES MANAGEMENT METHODS
  // ==========================================

  /**
   * List all sales for a supplier
   */
  static async getSalesBySupplier(supplierId: string, isActive?: boolean): Promise<SupplierSales[]> {
    const params: any[] = [supplierId];
    let sql = `SELECT * FROM supplier_sales WHERE supplier_id = $1`;

    if (isActive !== undefined) {
      params.push(isActive);
      sql += ` AND is_active = $2`;
    }

    sql += ` ORDER BY is_active DESC, name ASC`;
    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Get single sales by ID
   */
  static async getSalesById(salesId: string): Promise<SupplierSales | null> {
    const res = await query(`SELECT * FROM supplier_sales WHERE id = $1`, [salesId]);
    return res.rows[0] || null;
  }

  /**
   * Create new sales representative for a supplier
   */
  static async createSales(supplierId: string, input: CreateSupplierSalesInput): Promise<SupplierSales> {
    // Verify supplier exists
    const supp = await query(`SELECT id, name FROM suppliers WHERE id = $1`, [supplierId]);
    if (supp.rows.length === 0) {
      throw new Error('Supplier tidak ditemukan');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Nama sales wajib diisi');
    }

    const phones = normalizePhones(input.phones);
    const id = generateUUIDv7();
    const isActive = input.is_active !== undefined ? input.is_active : true;

    const res = await query(
      `INSERT INTO supplier_sales (
        id, supplier_id, name, email, is_active, phones, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        supplierId,
        name,
        input.email?.trim() || null,
        isActive,
        JSON.stringify(phones),
        input.notes?.trim() || null,
      ]
    );

    return res.rows[0];
  }

  /**
   * Update sales representative
   */
  static async updateSales(salesId: string, input: UpdateSupplierSalesInput): Promise<SupplierSales | null> {
    const current = await this.getSalesById(salesId);
    if (!current) return null;

    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) {
      throw new Error('Nama sales wajib diisi');
    }

    const email = input.email !== undefined ? (input.email?.trim() || null) : current.email;
    const isActive = input.is_active !== undefined ? input.is_active : current.is_active;
    const phones = input.phones !== undefined ? normalizePhones(input.phones) : current.phones;
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : current.notes;

    const res = await query(
      `UPDATE supplier_sales SET
        name = $1,
        email = $2,
        is_active = $3,
        phones = $4,
        notes = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, email, isActive, JSON.stringify(phones), notes, salesId]
    );

    return res.rows[0] || null;
  }

  /**
   * Toggle active/inactive status of a sales representative
   */
  static async toggleSalesStatus(salesId: string): Promise<SupplierSales | null> {
    const res = await query(
      `UPDATE supplier_sales SET
        is_active = NOT is_active,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [salesId]
    );

    return res.rows[0] || null;
  }

  /**
   * Delete sales representative
   */
  static async deleteSales(salesId: string): Promise<SupplierSales | null> {
    const res = await query(`DELETE FROM supplier_sales WHERE id = $1 RETURNING *`, [salesId]);
    return res.rows[0] || null;
  }
}
