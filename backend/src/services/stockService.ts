import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export type StockActionType = 
  | 'STOCK_OPNAME'       // Penyesuaian fisik opname
  | 'PURCHASE_RESTOCK'   // Barang masuk / restock dari supplier
  | 'SALE_DEDUCT'        // Barang keluar / penjualan
  | 'DAMAGED_EXPIRED'    // Barang rusak / pecah / cacat
  | 'RETURN_IN'          // Retur dari pelanggan
  | 'RETURN_OUT'         // Retur ke supplier
  | 'MANUAL_ADJUSTMENT'  // Penyesuaian manual lainnya
  | 'RESERVATION_HOLD'   // Penahanan stok untuk reservasi titip barang
  | 'RESERVATION_PICKUP' // Pengambilan stok barang titipan oleh pelanggan
  | 'RESERVATION_RELEASE'; // Pelepasan penahanan stok karena reservasi batal

export interface AdjustStockInput {
  variant_id: string;
  adjustment_mode: 'SET' | 'ADD' | 'SUBTRACT'; 
  amount: number; // Value: If SET, this is the new total stock. If ADD/SUBTRACT, this is quantity change.
  movement_type: StockActionType;
  reference_no?: string;
  notes: string;
  created_by?: string;
}

export class StockService {
  /**
   * Adjust stock atomically with transactional history log
   */
  static async adjustStock(input: AdjustStockInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch variant and product info with FOR UPDATE lock
      const variantRes = await client.query(
        `SELECT pv.*, p.name as product_name 
         FROM product_variants pv 
         JOIN products p ON pv.product_id = p.id 
         WHERE pv.id = $1 
         FOR UPDATE`,
        [input.variant_id]
      );

      if (variantRes.rows.length === 0) {
        throw new Error('Varian produk tidak ditemukan.');
      }

      const variant = variantRes.rows[0];
      const previousStock = Number(variant.current_stock);
      let newStock = previousStock;
      let quantityChange = 0;

      if (input.adjustment_mode === 'SET') {
        newStock = Number(input.amount);
        quantityChange = newStock - previousStock;
      } else if (input.adjustment_mode === 'ADD') {
        quantityChange = Number(input.amount);
        newStock = previousStock + quantityChange;
      } else if (input.adjustment_mode === 'SUBTRACT') {
        quantityChange = -Math.abs(Number(input.amount));
        newStock = previousStock + quantityChange;
      }

      if (newStock < 0) {
        throw new Error(`Stok tidak boleh bernilai negatif! (Stok saat ini: ${previousStock}, Pengurangan: ${Math.abs(quantityChange)})`);
      }

      // 2. Update variant stock
      await client.query(
        `UPDATE product_variants 
         SET current_stock = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [newStock, input.variant_id]
      );

      // 3. Create UUIDv7 for transaction log
      const movementId = generateUUIDv7();
      const refNo = input.reference_no || `ADJ-${Date.now().toString().slice(-6)}`;
      const creator = input.created_by || 'Admin';

      await client.query(
        `INSERT INTO stock_movements (
          id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          movementId,
          variant.product_id,
          input.variant_id,
          input.movement_type,
          previousStock,
          quantityChange,
          newStock,
          refNo,
          input.notes,
          creator
        ]
      );

      await client.query('COMMIT');

      return {
        movement_id: movementId,
        product_id: variant.product_id,
        variant_id: input.variant_id,
        product_name: variant.product_name,
        variant_name: variant.variant_name,
        previous_stock: previousStock,
        quantity_change: quantityChange,
        current_stock: newStock,
        movement_type: input.movement_type,
        reference_no: refNo,
        notes: input.notes
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get stock movement logs with filtering & pagination
   */
  static async getStockMovements(filters?: {
    variantId?: string;
    productId?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.variantId) {
      params.push(filters.variantId);
      conditions.push(`sm.variant_id = $${params.length}`);
    }

    if (filters?.productId) {
      params.push(filters.productId);
      conditions.push(`sm.product_id = $${params.length}`);
    }

    if (filters?.type && filters.type !== 'ALL') {
      params.push(filters.type);
      conditions.push(`sm.movement_type = $${params.length}`);
    }

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(p.name) LIKE $${params.length} OR 
        LOWER(pv.variant_name) LIKE $${params.length} OR 
        LOWER(COALESCE(sm.reference_no, '')) LIKE $${params.length} OR 
        LOWER(COALESCE(sm.notes, '')) LIKE $${params.length}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const sql = `
      SELECT 
        sm.*,
        p.name as product_name,
        pv.variant_name,
        pv.sku as variant_sku
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN product_variants pv ON sm.variant_id = pv.id
      ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const countSql = `
      SELECT COUNT(*) as total 
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN product_variants pv ON sm.variant_id = pv.id
      ${whereClause}
    `;

    const [rowsRes, countRes] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2))
    ]);

    return {
      total: parseInt(countRes.rows[0].total, 10),
      items: rowsRes.rows
    };
  }
}
