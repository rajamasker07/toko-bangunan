import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export class VariantService {
  /**
   * Add variant to an existing product
   */
  static async addVariant(
    productId: string,
    data: {
      variant_name: string;
      sku?: string;
      barcode?: string;
      initial_stock?: number;
      min_stock?: number;
      units?: Array<{
        unit_name: string;
        conversion_factor?: number;
        is_base_unit?: boolean;
        buy_price?: number;
        sell_price: number;
        wholesale_price?: number | null;
      }>;
    },
    options?: {
      userId?: string | null;
      createdBy?: string;
      allowBuyPrice?: boolean;
    }
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const allowBuyPrice = options?.allowBuyPrice ?? true;
      const actorName = (options?.createdBy || 'Admin').slice(0, 100);
      const actorId = options?.userId || null;

      const variantId = generateUUIDv7();
      const sku = data.sku || `VAR-${Date.now().toString().slice(-6)}`;
      const initialStock = Number(data.initial_stock) || 0;
      const minStock = Number(data.min_stock) || 5;

      // Update product has_variants flag to true
      await client.query('UPDATE products SET has_variants = true WHERE id = $1', [productId]);

      await client.query(
        `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [variantId, productId, data.variant_name, sku, data.barcode || null, initialStock, minStock]
      );

      if (data.units && data.units.length > 0) {
        for (const u of data.units) {
          const unitId = generateUUIDv7();
          await client.query(
            `INSERT INTO variant_units (
              id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              unitId,
              variantId,
              u.unit_name,
              Number(u.conversion_factor) || 1,
              Boolean(u.is_base_unit),
              allowBuyPrice ? Number(u.buy_price) || 0 : 0,
              Number(u.sell_price) || 0,
              u.wholesale_price ? Number(u.wholesale_price) : null
            ]
          );
        }
      }

      if (initialStock > 0) {
        const moveId = generateUUIDv7();
        await client.query(
          `INSERT INTO stock_movements (
            id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
          ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal varian baru ditambahkan', $6, $7)`,
          [moveId, productId, variantId, initialStock, `ADD-${sku}`, actorName, actorId]
        );
      }

      await client.query('COMMIT');

      const res = await query('SELECT * FROM product_variants WHERE id = $1', [variantId]);
      return res.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update variant
   */
  static async updateVariant(variantId: string, data: {
    variant_name?: string;
    sku?: string;
    barcode?: string;
    min_stock?: number;
    is_active?: boolean;
  }) {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.variant_name !== undefined) {
      values.push(data.variant_name);
      fields.push(`variant_name = $${values.length}`);
    }
    if (data.sku !== undefined) {
      values.push(data.sku);
      fields.push(`sku = $${values.length}`);
    }
    if (data.barcode !== undefined) {
      values.push(data.barcode);
      fields.push(`barcode = $${values.length}`);
    }
    if (data.min_stock !== undefined) {
      values.push(data.min_stock);
      fields.push(`min_stock = $${values.length}`);
    }
    if (data.is_active !== undefined) {
      values.push(data.is_active);
      fields.push(`is_active = $${values.length}`);
    }

    if (fields.length === 0) return null;

    values.push(variantId);
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const res = await query(sql, values);
    return res.rows[0];
  }

  /**
   * Delete variant
   */
  static async deleteVariant(variantId: string) {
    const res = await query('DELETE FROM product_variants WHERE id = $1 RETURNING *', [variantId]);
    return res.rows[0];
  }

  /**
   * Toggle variant sale status (is_active: masih dijual vs sudah tidak dijual)
   */
  static async toggleVariantStatus(variantId: string) {
    const res = await query(
      `UPDATE product_variants 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [variantId]
    );
    if (!res.rows[0]) throw new Error('Varian tidak ditemukan');
    return res.rows[0];
  }

  /**
   * Add unit price to variant
   */
  static async addUnit(variantId: string, unit: {
    unit_name: string;
    conversion_factor?: number;
    is_base_unit?: boolean;
    buy_price?: number;
    sell_price: number;
    wholesale_price?: number | null;
  }) {
    const id = generateUUIDv7();
    const res = await query(
      `INSERT INTO variant_units (
        id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id,
        variantId,
        unit.unit_name,
        Number(unit.conversion_factor) || 1,
        Boolean(unit.is_base_unit),
        Number(unit.buy_price) || 0,
        Number(unit.sell_price) || 0,
        unit.wholesale_price ? Number(unit.wholesale_price) : null
      ]
    );
    return res.rows[0];
  }

  /**
   * Update unit price
   */
  static async updateUnit(unitId: string, unit: {
    unit_name?: string;
    conversion_factor?: number;
    is_base_unit?: boolean;
    buy_price?: number;
    sell_price?: number;
    wholesale_price?: number | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];

    if (unit.unit_name !== undefined) {
      values.push(unit.unit_name);
      fields.push(`unit_name = $${values.length}`);
    }
    if (unit.conversion_factor !== undefined) {
      values.push(unit.conversion_factor);
      fields.push(`conversion_factor = $${values.length}`);
    }
    if (unit.is_base_unit !== undefined) {
      values.push(unit.is_base_unit);
      fields.push(`is_base_unit = $${values.length}`);
    }
    if (unit.buy_price !== undefined) {
      values.push(unit.buy_price);
      fields.push(`buy_price = $${values.length}`);
    }
    if (unit.sell_price !== undefined) {
      values.push(unit.sell_price);
      fields.push(`sell_price = $${values.length}`);
    }
    if (unit.wholesale_price !== undefined) {
      values.push(unit.wholesale_price);
      fields.push(`wholesale_price = $${values.length}`);
    }

    if (fields.length === 0) return null;

    values.push(unitId);
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE variant_units SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const res = await query(sql, values);
    return res.rows[0];
  }

  /**
   * Delete unit price
   */
  static async deleteUnit(unitId: string) {
    const res = await query('DELETE FROM variant_units WHERE id = $1 RETURNING *', [unitId]);
    return res.rows[0];
  }
}
