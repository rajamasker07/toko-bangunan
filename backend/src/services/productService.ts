import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { BrandService } from './brandService.js';

type Queryable = Pool | PoolClient;

export interface CreateUnitInput {
  unit_name: string;
  conversion_factor?: number;
  is_base_unit?: boolean;
  buy_price?: number;
  sell_price: number;
  wholesale_price?: number | null;
}

export interface CreateVariantInput {
  variant_name: string;
  sku?: string;
  barcode?: string;
  initial_stock?: number;
  min_stock?: number;
  units: CreateUnitInput[];
}

export interface CreateProductInput {
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string | null;
  brand_id?: string | null; // ID merek dari master `brands`
  brand?: string;           // atau nama merek -> otomatis cari/buat (anti-duplikat)
  supplier_id?: string | null; // ID supplier dari master `suppliers`
  description?: string;
  min_stock_alert?: number;
  has_variants?: boolean;
  // Dimensi & spesifikasi fisik toko bangunan
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  material?: string | null;
  specifications?: string | null;
  // If simple product (has_variants = false)
  initial_stock?: number;
  min_stock?: number;
  base_unit_name?: string;
  buy_price?: number;
  sell_price?: number;
  wholesale_price?: number;
  units?: CreateUnitInput[];
  // If multi-variant (has_variants = true)
  variants?: CreateVariantInput[];
}

export class ProductService {
  /**
   * List all products with variant counts, total stock, category info, and low stock status
   */
  static async getProducts(filters?: {
    search?: string;
    categoryId?: string;
    brand?: string;
    stockStatus?: 'all' | 'low' | 'out' | 'normal';
    saleStatus?: 'all' | 'active' | 'inactive';
    limit?: number;
    offset?: number;
  }) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(p.name) LIKE $${params.length} OR
        LOWER(p.sku) LIKE $${params.length} OR
        LOWER(COALESCE(b.name, '')) LIKE $${params.length} OR
        EXISTS (
          SELECT 1 FROM product_variants pv 
          WHERE pv.product_id = p.id AND (
            LOWER(pv.variant_name) LIKE $${params.length} OR 
            LOWER(pv.sku) LIKE $${params.length}
          )
        )
      )`);
    }

    if (filters?.categoryId) {
      params.push(filters.categoryId);
      // Include child categories recursively
      conditions.push(`p.category_id IN (
        WITH RECURSIVE cat_tree AS (
          SELECT id FROM categories WHERE id = $${params.length}
          UNION ALL
          SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM cat_tree
      )`);
    }

    if (filters?.brand) {
      params.push(filters.brand.toLowerCase());
      conditions.push(`LOWER(b.name) = $${params.length}`);
    }

    if (filters?.saleStatus && filters.saleStatus !== 'all') {
      if (filters.saleStatus === 'active') {
        conditions.push(`p.is_active = TRUE`);
      } else if (filters.saleStatus === 'inactive') {
        conditions.push(`p.is_active = FALSE`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        p.*,
        c.name as category_name,
        b.name as brand,
        s.name as supplier_name,
        s.code as supplier_code,
        COALESCE(SUM(pv.current_stock), 0)::numeric as total_stock,
        COALESCE(SUM(COALESCE(pv.reserved_stock, 0)), 0)::numeric as total_reserved_stock,
        COALESCE(SUM(pv.current_stock - COALESCE(pv.reserved_stock, 0)), 0)::numeric as total_available_stock,
        COUNT(pv.id)::int as variant_count,
        BOOL_OR(pv.current_stock <= pv.min_stock) as has_low_stock,
        BOOL_OR(pv.current_stock = 0) as has_out_of_stock,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv2.id,
              'variant_name', pv2.variant_name,
              'sku', pv2.sku,
              'barcode', pv2.barcode,
              'current_stock', pv2.current_stock,
              'reserved_stock', COALESCE(pv2.reserved_stock, 0),
              'available_stock', (pv2.current_stock - COALESCE(pv2.reserved_stock, 0)),
              'min_stock', pv2.min_stock,
              'is_active', pv2.is_active,
              'units', (
                SELECT json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
                ) FROM variant_units vu WHERE vu.variant_id = pv2.id
              )
            ) ORDER BY pv2.created_at ASC
          )
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      ${whereClause}
      GROUP BY p.id, c.name, b.name, s.name, s.code
      ORDER BY p.created_at DESC
    `;

    const res = await query(sql, params);
    let rows = res.rows;

    if (filters?.stockStatus && filters.stockStatus !== 'all') {
      if (filters.stockStatus === 'low') {
        rows = rows.filter(r => r.has_low_stock && Number(r.total_stock) > 0);
      } else if (filters.stockStatus === 'out') {
        rows = rows.filter(r => Number(r.total_stock) <= 0);
      } else if (filters.stockStatus === 'normal') {
        rows = rows.filter(r => !r.has_low_stock && Number(r.total_stock) > 0);
      }
    }

    return rows;
  }

  /**
   * Get single product detail by ID with all variants & unit pricing
   */
  static async getProductById(id: string) {
    const sql = `
      SELECT 
        p.*,
        c.name as category_name,
        b.name as brand,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'variant_name', pv.variant_name,
              'sku', pv.sku,
              'barcode', pv.barcode,
              'current_stock', pv.current_stock,
              'reserved_stock', COALESCE(pv.reserved_stock, 0),
              'available_stock', (pv.current_stock - COALESCE(pv.reserved_stock, 0)),
              'min_stock', pv.min_stock,
              'is_active', pv.is_active,
              'units', (
                SELECT json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
                ) FROM variant_units vu WHERE vu.variant_id = pv.id
              )
            ) ORDER BY pv.created_at ASC
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
        ) as variants,
        s.name as supplier_name,
        s.code as supplier_code
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
      GROUP BY p.id, c.name, b.name, s.name, s.code
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Helper to generate unique SKU if not provided
   */
  private static generateSKU(prefix: string): string {
    const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'PRD';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `${cleanPrefix}-${Date.now().toString().slice(-4)}${randomSuffix}`;
  }

  /**
   * Tentukan brand_id produk:
   * - `brand_id` dikirim  -> dipakai langsung (null/'' = tanpa merek)
   * - `brand` (nama) dikirim -> cari merek setara atau buat baru (tidak pernah menduplikasi)
   * - keduanya tidak dikirim -> undefined (tidak diubah)
   */
  private static async resolveBrandId(
    data: { brand_id?: string | null; brand?: string | null },
    db: Queryable
  ): Promise<string | null | undefined> {
    if (data.brand_id !== undefined) return data.brand_id || null;
    if (data.brand !== undefined) {
      if (!data.brand || !String(data.brand).trim()) return null;
      const { brand } = await BrandService.findOrCreate(String(data.brand), db);
      return brand.id;
    }
    return undefined;
  }

  /**
   * Create product: handles single-variant (auto-create variant) or multi-variant
   */
  static async createProduct(data: CreateProductInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const productId = generateUUIDv7();
      const productSku = data.sku || this.generateSKU(data.name);

      const hasVariants = Boolean(data.has_variants && data.variants && data.variants.length > 0);

      // Resolve merek: pakai brand_id jika ada, atau cari/buat dari nama (anti-duplikat)
      const brandId = await this.resolveBrandId(data, client);

      // 1. Insert Product
      await client.query(
        `INSERT INTO products (
          id, name, sku, barcode, category_id, brand_id, supplier_id, description, min_stock_alert, has_variants,
          weight, length, width, height, material, specifications
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          productId,
          data.name,
          productSku,
          data.barcode || null,
          data.category_id || null,
          brandId ?? null,
          data.supplier_id || null,
          data.description || null,
          data.min_stock_alert ?? 5,
          hasVariants,
          data.weight !== undefined && data.weight !== null ? Number(data.weight) : null,
          data.length !== undefined && data.length !== null ? Number(data.length) : null,
          data.width !== undefined && data.width !== null ? Number(data.width) : null,
          data.height !== undefined && data.height !== null ? Number(data.height) : null,
          data.material ? String(data.material).trim() : null,
          data.specifications ? String(data.specifications).trim() : null,
        ]
      );

      // 2. Insert Variants
      if (!hasVariants) {
        // "produk yang tidak memiliki variant. otomatis membuat 1 variant."
        const variantId = generateUUIDv7();
        const variantSku = `${productSku}-STD`;
        const initialStock = Number(data.initial_stock) || 0;
        const minStock = Number(data.min_stock ?? data.min_stock_alert ?? 5);

        await client.query(
          `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [variantId, productId, 'Standar', variantSku, data.barcode || null, initialStock, minStock]
        );

        // Satuan harga for single variant
        const baseUnitName = data.base_unit_name || 'Pcs';
        const buyPrice = Number(data.buy_price) || 0;
        const sellPrice = Number(data.sell_price) || 0;
        const wholesalePrice = data.wholesale_price ? Number(data.wholesale_price) : null;

        // If multiple units passed for single variant:
        const unitsToInsert = (data.units && data.units.length > 0)
          ? data.units
          : [{
              unit_name: baseUnitName,
              conversion_factor: 1,
              is_base_unit: true,
              buy_price: buyPrice,
              sell_price: sellPrice,
              wholesale_price: wholesalePrice
            }];

        for (const u of unitsToInsert) {
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
              Number(u.buy_price) || 0,
              Number(u.sell_price) || 0,
              u.wholesale_price ? Number(u.wholesale_price) : null
            ]
          );
        }

        // Log initial stock movement
        if (initialStock > 0) {
          const moveId = generateUUIDv7();
          await client.query(
            `INSERT INTO stock_movements (
              id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by
            ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal produk baru', 'Admin')`,
            [moveId, productId, variantId, initialStock, `INIT-${productSku}`]
          );
        }
      } else {
        // Multi-variant creation
        for (let idx = 0; idx < data.variants!.length; idx++) {
          const v = data.variants![idx];
          const variantId = generateUUIDv7();
          const variantSku = v.sku || `${productSku}-V${idx + 1}`;
          const initialStock = Number(v.initial_stock) || 0;
          const minStock = Number(v.min_stock ?? data.min_stock_alert ?? 5);

          await client.query(
            `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [variantId, productId, v.variant_name, variantSku, v.barcode || null, initialStock, minStock]
          );

          // Units for this variant
          if (v.units && v.units.length > 0) {
            for (const u of v.units) {
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
                  Number(u.buy_price) || 0,
                  Number(u.sell_price) || 0,
                  u.wholesale_price ? Number(u.wholesale_price) : null
                ]
              );
            }
          }

          // Log initial stock movement
          if (initialStock > 0) {
            const moveId = generateUUIDv7();
            await client.query(
              `INSERT INTO stock_movements (
                id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by
              ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal varian baru', 'Admin')`,
              [moveId, productId, variantId, initialStock, `INIT-${variantSku}`]
            );
          }
        }
      }

      await client.query('COMMIT');
      return this.getProductById(productId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update Product basic info
   */
  static async updateProduct(id: string, data: {
    name?: string;
    sku?: string;
    barcode?: string;
    category_id?: string | null;
    brand_id?: string | null;
    brand?: string | null;
    supplier_id?: string | null;
    description?: string;
    min_stock_alert?: number;
    is_active?: boolean;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    material?: string | null;
    specifications?: string | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];

    const brandId = await this.resolveBrandId(data, pool);
    if (brandId !== undefined) {
      values.push(brandId);
      fields.push(`brand_id = $${values.length}`);
    }

    if (data.supplier_id !== undefined) {
      values.push(data.supplier_id || null);
      fields.push(`supplier_id = $${values.length}`);
    }

    if (data.name !== undefined) {
      values.push(data.name);
      fields.push(`name = $${values.length}`);
    }
    if (data.sku !== undefined) {
      values.push(data.sku);
      fields.push(`sku = $${values.length}`);
    }
    if (data.barcode !== undefined) {
      values.push(data.barcode);
      fields.push(`barcode = $${values.length}`);
    }
    if (data.category_id !== undefined) {
      values.push(data.category_id);
      fields.push(`category_id = $${values.length}`);
    }
    if (data.description !== undefined) {
      values.push(data.description);
      fields.push(`description = $${values.length}`);
    }
    if (data.min_stock_alert !== undefined) {
      values.push(data.min_stock_alert);
      fields.push(`min_stock_alert = $${values.length}`);
    }
    if (data.is_active !== undefined) {
      values.push(data.is_active);
      fields.push(`is_active = $${values.length}`);
    }
    if (data.weight !== undefined) {
      values.push(data.weight !== null ? Number(data.weight) : null);
      fields.push(`weight = $${values.length}`);
    }
    if (data.length !== undefined) {
      values.push(data.length !== null ? Number(data.length) : null);
      fields.push(`length = $${values.length}`);
    }
    if (data.width !== undefined) {
      values.push(data.width !== null ? Number(data.width) : null);
      fields.push(`width = $${values.length}`);
    }
    if (data.height !== undefined) {
      values.push(data.height !== null ? Number(data.height) : null);
      fields.push(`height = $${values.length}`);
    }
    if (data.material !== undefined) {
      values.push(data.material ? String(data.material).trim() : null);
      fields.push(`material = $${values.length}`);
    }
    if (data.specifications !== undefined) {
      values.push(data.specifications ? String(data.specifications).trim() : null);
      fields.push(`specifications = $${values.length}`);
    }

    if (fields.length === 0) return this.getProductById(id);

    values.push(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    await query(sql, values);
    return this.getProductById(id);
  }

  /**
   * Delete product
   */
  static async deleteProduct(id: string) {
    const res = await query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
  }

  /**
   * Toggle product sale status (is_active: masih dijual vs sudah tidak dijual)
   */
  static async toggleProductStatus(id: string) {
    const res = await query(
      `UPDATE products 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    if (!res.rows[0]) throw new Error('Produk tidak ditemukan');
    return this.getProductById(id);
  }
}
