import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { AppHttpError } from '../utils/errors.js';
import { PriceHistoryService } from './priceHistoryService.js';
import {
  ALLOWED_MOVEMENTS_BY_MODE,
  MANUAL_STOCK_ACTION_TYPES,
  STOCK_ACTION_TYPES,
  STOCK_ADJUSTMENT_MODES,
  SYSTEM_ONLY_STOCK_ACTION_TYPES,
  roundStockQty,
  validateAdjustStockInput,
  type ManualStockActionType,
  type PriceUpdateOnRestock,
  type StockActionType,
  type StockAdjustmentMode,
  type SystemOnlyStockActionType,
} from '../validators/stockValidator.js';

export {
  ALLOWED_MOVEMENTS_BY_MODE,
  MANUAL_STOCK_ACTION_TYPES,
  STOCK_ACTION_TYPES,
  STOCK_ADJUSTMENT_MODES,
  SYSTEM_ONLY_STOCK_ACTION_TYPES,
};
export type {
  ManualStockActionType,
  PriceUpdateOnRestock,
  StockActionType,
  StockAdjustmentMode,
  SystemOnlyStockActionType,
};

export interface AdjustStockInput {
  variant_id: string;
  adjustment_mode: StockAdjustmentMode;
  amount: number; // Value: If SET, this is the new total stock. If ADD/SUBTRACT, this is quantity change.
  movement_type: StockActionType;
  reference_no?: string;
  notes: string;
  user_id?: string | null;
  created_by?: string;
  price_update?: PriceUpdateOnRestock;
  allow_buy_price?: boolean;
}

export class StockService {
  /**
   * Adjust stock atomically with transactional history log
   */
  static async adjustStock(input: AdjustStockInput) {
    // 0. Validasi ketat input & enum sebelum meminjam koneksi DB (defense-in-depth)
    const validated = validateAdjustStockInput(input);

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
        [validated.variant_id]
      );

      if (variantRes.rows.length === 0) {
        throw new AppHttpError(404, 'Varian produk tidak ditemukan.', 'VARIANT_NOT_FOUND');
      }

      const variant = variantRes.rows[0];
      const previousStock = roundStockQty(Number(variant.current_stock));
      const reservedStock = roundStockQty(Number(variant.reserved_stock || 0));
      let newStock = previousStock;
      let quantityChange = 0;

      if (validated.adjustment_mode === 'SET') {
        newStock = validated.amount;
        quantityChange = roundStockQty(newStock - previousStock);
      } else if (validated.adjustment_mode === 'ADD') {
        quantityChange = validated.amount;
        newStock = roundStockQty(previousStock + quantityChange);
      } else {
        quantityChange = -validated.amount;
        newStock = roundStockQty(previousStock + quantityChange);
      }

      if (newStock < 0) {
        throw new AppHttpError(
          400,
          `Stok tidak boleh bernilai negatif! (Stok saat ini: ${previousStock}, Pengurangan: ${Math.abs(quantityChange)})`,
          'NEGATIVE_STOCK_NOT_ALLOWED'
        );
      }

      // Guardrail: SET / SUBTRACT tidak boleh membuat stok fisik < stok yang sedang ditahan/dititipkan
      // Mode ADD tetap diizinkan agar data defisit lama (current_stock < reserved_stock) bisa dipulihkan via restock.
      if (
        (validated.adjustment_mode === 'SET' || validated.adjustment_mode === 'SUBTRACT') &&
        reservedStock > 0 &&
        newStock < reservedStock
      ) {
        const availableBefore = Math.max(0, roundStockQty(previousStock - reservedStock));
        throw new AppHttpError(
          400,
          `Stok akhir (${newStock}) tidak boleh kurang dari stok yang sedang ditahan/dititipkan pelanggan (${reservedStock}). Stok fisik saat ini: ${previousStock}, stok bebas tersedia: ${availableBefore}. Selesaikan pengambilan atau batalkan reservasi terkait terlebih dahulu.`,
          'STOCK_BELOW_RESERVED'
        );
      }

      // 2. Update variant stock
      await client.query(
        `UPDATE product_variants 
         SET current_stock = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [newStock, validated.variant_id]
      );

      // 3. Create UUIDv7 for transaction log
      const movementId = generateUUIDv7();
      const refNo = validated.reference_no || `ADJ-${Date.now().toString().slice(-6)}`;
      const creator = (input.created_by || 'Admin').slice(0, 100);
      const userId = input.user_id || null;

      await client.query(
        `INSERT INTO stock_movements (
          id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          movementId,
          variant.product_id,
          validated.variant_id,
          validated.movement_type,
          previousStock,
          quantityChange,
          newStock,
          refNo,
          validated.notes,
          creator,
          userId
        ]
      );

      // 4. Update harga jika disediakan saat RESTOCK
      let priceUpdated = false;
      if (validated.price_update && validated.movement_type === 'PURCHASE_RESTOCK') {
        const pu = validated.price_update;
        const unitRes = await client.query(
          `SELECT vu.*, p.supplier_id
           FROM variant_units vu
           JOIN product_variants pv ON vu.variant_id = pv.id
           JOIN products p ON pv.product_id = p.id
           WHERE vu.id = $1 AND vu.variant_id = $2
           FOR UPDATE`,
          [pu.unit_id, validated.variant_id]
        );

        if (unitRes.rows.length > 0) {
          const uRow = unitRes.rows[0];
          const oldBuy = Number(uRow.buy_price) || 0;
          const oldSell = Number(uRow.sell_price) || 0;
          const oldWholesale = uRow.wholesale_price !== null ? Number(uRow.wholesale_price) : null;

          const allowBuy = input.allow_buy_price ?? true;
          const buyInput = pu.buy_price !== undefined ? pu.buy_price : pu.new_buy_price;
          const sellInput = pu.sell_price !== undefined ? pu.sell_price : pu.new_sell_price;
          const wholesaleInput = pu.wholesale_price !== undefined ? pu.wholesale_price : pu.new_wholesale_price;

          const targetBuy = (buyInput !== undefined && allowBuy) ? Number(buyInput) || 0 : oldBuy;
          const targetSell = sellInput !== undefined ? Number(sellInput) || 0 : oldSell;
          const targetWholesale = wholesaleInput !== undefined ? (wholesaleInput !== null ? Number(wholesaleInput) : null) : oldWholesale;

          const buyChanged = allowBuy && buyInput !== undefined && Math.abs(targetBuy - oldBuy) > 0.001;
          const sellChanged = sellInput !== undefined && Math.abs(targetSell - oldSell) > 0.001;
          const wholesaleChanged = wholesaleInput !== undefined && targetWholesale !== oldWholesale;

          if (buyChanged || sellChanged || wholesaleChanged) {
            await client.query(
              `UPDATE variant_units
               SET buy_price = $1, sell_price = $2, wholesale_price = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [targetBuy, targetSell, targetWholesale, pu.unit_id]
            );

            await PriceHistoryService.recordChange(client, {
              productId: variant.product_id,
              variantId: validated.variant_id,
              variantUnitId: pu.unit_id,
              unitName: uRow.unit_name,
              supplierId: uRow.supplier_id,
              oldBuyPrice: oldBuy,
              newBuyPrice: targetBuy,
              oldSellPrice: oldSell,
              newSellPrice: targetSell,
              oldWholesalePrice: oldWholesale,
              newWholesalePrice: targetWholesale,
              changeSource: 'PURCHASE_RESTOCK',
              referenceNo: pu.reference_no || refNo,
              reason: pu.reason || validated.notes || 'Pembaruan harga saat restock barang',
              userId,
              createdBy: creator,
            });

            priceUpdated = true;
          }
        }
      }

      await client.query('COMMIT');

      return {
        movement_id: movementId,
        product_id: variant.product_id,
        variant_id: validated.variant_id,
        product_name: variant.product_name,
        variant_name: variant.variant_name,
        previous_stock: previousStock,
        quantity_change: quantityChange,
        current_stock: newStock,
        reserved_stock: reservedStock,
        available_stock: roundStockQty(newStock - reservedStock),
        movement_type: validated.movement_type,
        reference_no: refNo,
        notes: validated.notes,
        created_by: creator,
        user_id: userId,
        price_updated: priceUpdated,
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
        pv.sku as variant_sku,
        u.username as created_by_username,
        u.role as created_by_role
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN product_variants pv ON sm.variant_id = pv.id
      LEFT JOIN users u ON sm.user_id = u.id
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
