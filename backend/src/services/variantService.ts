import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { EmbeddingService } from './embeddingService.js';
import { PriceHistoryService } from './priceHistoryService.js';
import { AppHttpError } from '../utils/errors.js';
import { isValidUuid } from '../utils/idempotency.js';
import { roundStockQty } from '../validators/stockValidator.js';

export class VariantService {
  /**
   * Ambil detail satu varian beserta daftar konversi satuan, kalkulasi stok tersedia,
   * serta informasi logistik produk induk untuk scan QR instan (bangunjaya://v/:id).
   */
  static async getVariantById(
    id: string,
    options?: { includeBuyPrice?: boolean }
  ) {
    const trimmedId = typeof id === 'string' ? id.trim() : '';
    if (!isValidUuid(trimmedId)) {
      throw new AppHttpError(
        400,
        'Format ID varian produk (variant_id) tidak valid.',
        'INVALID_VARIANT_ID'
      );
    }

    const includeBuyPrice = options?.includeBuyPrice ?? true;

    const sql = `
      SELECT
        pv.id,
        pv.product_id,
        pv.variant_name,
        pv.sku,
        pv.barcode,
        pv.current_stock,
        COALESCE(pv.reserved_stock, 0) AS reserved_stock,
        pv.min_stock,
        pv.is_active,
        COALESCE(pv.attributes, '{}'::jsonb) AS attributes,
        pv.created_at,
        pv.updated_at,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', vu.id,
                'variant_id', vu.variant_id,
                'unit_name', vu.unit_name,
                'conversion_factor', vu.conversion_factor,
                'is_base_unit', vu.is_base_unit,
                'buy_price', vu.buy_price,
                'sell_price', vu.sell_price,
                'wholesale_price', vu.wholesale_price
              ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
            )
            FROM variant_units vu
            WHERE vu.variant_id = pv.id
          ),
          '[]'::json
        ) AS units,
        json_build_object(
          'id', p.id,
          'name', p.name,
          'sku', p.sku,
          'barcode', p.barcode,
          'category_id', p.category_id,
          'category_name', c.name,
          'brand_id', p.brand_id,
          'brand', b.name,
          'supplier_id', p.supplier_id,
          'supplier_name', s.name,
          'supplier_code', s.code,
          'description', p.description,
          'has_variants', p.has_variants,
          'is_active', p.is_active,
          'min_stock_alert', p.min_stock_alert,
          'weight', p.weight,
          'length', p.length,
          'width', p.width,
          'height', p.height,
          'material', p.material,
          'specifications', p.specifications
        ) AS product
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE pv.id = $1
    `;

    const res = await query(sql, [trimmedId]);
    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    const currentStock = roundStockQty(Number(row.current_stock));
    const reservedStock = roundStockQty(Number(row.reserved_stock || 0));
    const availableStock = roundStockQty(currentStock - reservedStock);
    const minStock = roundStockQty(Number(row.min_stock || 0));

    const rawUnits: any[] = Array.isArray(row.units) ? row.units : [];
    const sanitizedUnits = rawUnits.map((u) => ({
      ...u,
      conversion_factor: Number(u.conversion_factor),
      buy_price: includeBuyPrice ? Number(u.buy_price || 0) : null,
      sell_price: Number(u.sell_price || 0),
      wholesale_price:
        u.wholesale_price !== null && u.wholesale_price !== undefined
          ? Number(u.wholesale_price)
          : null,
    }));

    return {
      id: row.id,
      product_id: row.product_id,
      variant_name: row.variant_name,
      sku: row.sku,
      barcode: row.barcode,
      current_stock: currentStock,
      reserved_stock: reservedStock,
      available_stock: availableStock,
      min_stock: minStock,
      is_low_stock: availableStock <= minStock,
      is_out_of_stock: availableStock <= 0,
      is_active: row.is_active,
      attributes: row.attributes || {},
      units: sanitizedUnits,
      product: row.product,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private static async syncProductByVariantId(variantId: string) {
    try {
      const res = await query('SELECT product_id FROM product_variants WHERE id = $1', [variantId]);
      if (res.rows[0]?.product_id) {
        EmbeddingService.syncProductEmbedding(res.rows[0].product_id).catch(() => {});
      }
    } catch {}
  }

  private static async syncProductByUnitId(unitId: string) {
    try {
      const res = await query(
        `SELECT pv.product_id FROM variant_units vu 
         JOIN product_variants pv ON vu.variant_id = pv.id 
         WHERE vu.id = $1`,
        [unitId]
      );
      if (res.rows[0]?.product_id) {
        EmbeddingService.syncProductEmbedding(res.rows[0].product_id).catch(() => {});
      }
    } catch {}
  }

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
      attributes?: Record<string, string>;
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
        `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock, attributes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [variantId, productId, data.variant_name, sku, data.barcode || null, initialStock, minStock, JSON.stringify(data.attributes || {})]
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

          await PriceHistoryService.recordChange(client, {
            productId,
            variantId,
            variantUnitId: unitId,
            unitName: u.unit_name,
            newBuyPrice: allowBuyPrice ? Number(u.buy_price) || 0 : 0,
            newSellPrice: Number(u.sell_price) || 0,
            newWholesalePrice: u.wholesale_price ? Number(u.wholesale_price) : null,
            changeSource: 'INITIAL_PRICE',
            referenceNo: `ADD-${sku}`,
            reason: 'Harga awal varian baru',
            userId: actorId,
            createdBy: actorName,
          });
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

      EmbeddingService.syncProductEmbedding(productId).catch(() => {});

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
    attributes?: Record<string, string>;
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
    if (data.attributes !== undefined) {
      values.push(JSON.stringify(data.attributes || {}));
      fields.push(`attributes = $${values.length}`);
    }

    if (fields.length === 0) return null;

    values.push(variantId);
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const res = await query(sql, values);
    this.syncProductByVariantId(variantId);
    return res.rows[0];
  }

  /**
   * Delete variant
   */
  static async deleteVariant(variantId: string) {
    const pRes = await query('SELECT product_id FROM product_variants WHERE id = $1', [variantId]);
    const productId = pRes.rows[0]?.product_id;

    const res = await query('DELETE FROM product_variants WHERE id = $1 RETURNING *', [variantId]);
    if (productId) {
      EmbeddingService.syncProductEmbedding(productId).catch(() => {});
    }
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
    this.syncProductByVariantId(variantId);
    return res.rows[0];
  }

  /**
   * Add unit price to variant with transactional price history logging
   */
  static async addUnit(
    variantId: string,
    unit: {
      unit_name: string;
      conversion_factor?: number;
      is_base_unit?: boolean;
      buy_price?: number;
      sell_price: number;
      wholesale_price?: number | null;
      reason?: string;
      reference_no?: string;
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
      const buyPrice = allowBuyPrice ? Number(unit.buy_price) || 0 : 0;
      const sellPrice = Number(unit.sell_price) || 0;
      const wholesalePrice = unit.wholesale_price ? Number(unit.wholesale_price) : null;
      const actorName = (options?.createdBy || 'Admin').slice(0, 100);
      const actorId = options?.userId || null;

      // Ambil product_id & supplier_id
      const varRes = await client.query(
        `SELECT pv.product_id, p.supplier_id FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.id = $1`,
        [variantId]
      );
      if (varRes.rows.length === 0) {
        throw new Error('Varian tidak ditemukan');
      }
      const { product_id: productId, supplier_id: supplierId } = varRes.rows[0];

      const id = generateUUIDv7();
      const res = await client.query(
        `INSERT INTO variant_units (
          id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          id,
          variantId,
          unit.unit_name,
          Number(unit.conversion_factor) || 1,
          Boolean(unit.is_base_unit),
          buyPrice,
          sellPrice,
          wholesalePrice,
        ]
      );

      await PriceHistoryService.recordChange(client, {
        productId,
        variantId,
        variantUnitId: id,
        unitName: unit.unit_name,
        supplierId,
        newBuyPrice: buyPrice,
        newSellPrice: sellPrice,
        newWholesalePrice: wholesalePrice,
        changeSource: 'INITIAL_PRICE',
        referenceNo: unit.reference_no,
        reason: unit.reason || 'Penambahan satuan baru',
        userId: actorId,
        createdBy: actorName,
      });

      await client.query('COMMIT');

      this.syncProductByVariantId(variantId);
      return res.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update unit price with transactional price history logging & RBAC protection
   */
  static async updateUnit(
    unitId: string,
    unit: {
      unit_name?: string;
      conversion_factor?: number;
      is_base_unit?: boolean;
      buy_price?: number;
      sell_price?: number;
      wholesale_price?: number | null;
      reason?: string;
      reference_no?: string;
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

      // 1. Fetch existing unit with FOR UPDATE
      const existingRes = await client.query(
        `SELECT vu.*, pv.product_id, pv.id as variant_id, p.supplier_id
         FROM variant_units vu
         JOIN product_variants pv ON vu.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE vu.id = $1
         FOR UPDATE`,
        [unitId]
      );

      if (existingRes.rows.length === 0) {
        throw new Error('Satuan tidak ditemukan');
      }

      const existing = existingRes.rows[0];
      const oldBuy = Number(existing.buy_price) || 0;
      const oldSell = Number(existing.sell_price) || 0;
      const oldWholesale = existing.wholesale_price !== null ? Number(existing.wholesale_price) : null;

      // Tentukan nilai baru
      const targetUnitName = unit.unit_name !== undefined ? unit.unit_name.trim() : existing.unit_name;
      const targetBuy =
        unit.buy_price !== undefined
          ? allowBuyPrice
            ? Number(unit.buy_price) || 0
            : oldBuy
          : oldBuy;
      const targetSell = unit.sell_price !== undefined ? Number(unit.sell_price) : oldSell;
      const targetWholesale =
        unit.wholesale_price !== undefined
          ? unit.wholesale_price !== null
            ? Number(unit.wholesale_price)
            : null
          : oldWholesale;

      const fields: string[] = [];
      const values: any[] = [];

      if (unit.unit_name !== undefined) {
        values.push(targetUnitName);
        fields.push(`unit_name = $${values.length}`);
      }
      if (unit.conversion_factor !== undefined) {
        values.push(Number(unit.conversion_factor) || 1);
        fields.push(`conversion_factor = $${values.length}`);
      }
      if (unit.is_base_unit !== undefined) {
        values.push(Boolean(unit.is_base_unit));
        fields.push(`is_base_unit = $${values.length}`);
      }
      if (unit.buy_price !== undefined && allowBuyPrice) {
        values.push(targetBuy);
        fields.push(`buy_price = $${values.length}`);
      }
      if (unit.sell_price !== undefined) {
        values.push(targetSell);
        fields.push(`sell_price = $${values.length}`);
      }
      if (unit.wholesale_price !== undefined) {
        values.push(targetWholesale);
        fields.push(`wholesale_price = $${values.length}`);
      }

      if (fields.length > 0) {
        values.push(unitId);
        fields.push('updated_at = CURRENT_TIMESTAMP');
        const sql = `UPDATE variant_units SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
        await client.query(sql, values);
      }

      // 2. Catat histori jika ada harga yang berubah
      const buyChanged = allowBuyPrice && unit.buy_price !== undefined && Math.abs(targetBuy - oldBuy) > 0.001;
      const sellChanged = unit.sell_price !== undefined && Math.abs(targetSell - oldSell) > 0.001;
      const wholesaleChanged = unit.wholesale_price !== undefined && targetWholesale !== oldWholesale;

      if (buyChanged || sellChanged || wholesaleChanged) {
        await PriceHistoryService.recordChange(client, {
          productId: existing.product_id,
          variantId: existing.variant_id,
          variantUnitId: unitId,
          unitName: targetUnitName,
          supplierId: existing.supplier_id,
          oldBuyPrice: oldBuy,
          newBuyPrice: targetBuy,
          oldSellPrice: oldSell,
          newSellPrice: targetSell,
          oldWholesalePrice: oldWholesale,
          newWholesalePrice: targetWholesale,
          changeSource: 'MANUAL_EDIT',
          referenceNo: unit.reference_no,
          reason: unit.reason || 'Perubahan harga satuan',
          userId: actorId,
          createdBy: actorName,
        });
      }

      await client.query('COMMIT');

      this.syncProductByUnitId(unitId);

      const finalRes = await query('SELECT * FROM variant_units WHERE id = $1', [unitId]);
      return finalRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete unit price
   */
  static async deleteUnit(unitId: string) {
    const pRes = await query(
      `SELECT pv.product_id FROM variant_units vu 
       JOIN product_variants pv ON vu.variant_id = pv.id 
       WHERE vu.id = $1`,
      [unitId]
    );
    const productId = pRes.rows[0]?.product_id;

    const res = await query('DELETE FROM variant_units WHERE id = $1 RETURNING *', [unitId]);
    if (productId) {
      EmbeddingService.syncProductEmbedding(productId).catch(() => {});
    }
    return res.rows[0];
  }

  /**
   * Bulk update attributes for multiple variants of a product
   */
  static async bulkUpdateAttributes(
    productId: string,
    updates: Array<{ variant_id: string; attributes: Record<string, string> }>,
    variantOptions?: string[]
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of updates) {
        await client.query(
          `UPDATE product_variants 
           SET attributes = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND product_id = $3`,
          [JSON.stringify(item.attributes || {}), item.variant_id, productId]
        );
      }

      if (variantOptions && Array.isArray(variantOptions)) {
        await client.query(
          `UPDATE products 
           SET variant_options = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [JSON.stringify(variantOptions), productId]
        );
      } else {
        // Collect all distinct attribute keys from all variants of this product
        const allVarsRes = await client.query(
          `SELECT attributes FROM product_variants WHERE product_id = $1`,
          [productId]
        );
        const keysSet = new Set<string>();
        for (const row of allVarsRes.rows) {
          if (row.attributes && typeof row.attributes === 'object') {
            Object.keys(row.attributes).forEach((k) => {
              if (k && k.trim()) keysSet.add(k.trim());
            });
          }
        }
        await client.query(
          `UPDATE products 
           SET variant_options = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [JSON.stringify(Array.from(keysSet)), productId]
        );
      }

      await client.query('COMMIT');
      EmbeddingService.syncProductEmbedding(productId).catch(() => {});
      return { count: updates.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
