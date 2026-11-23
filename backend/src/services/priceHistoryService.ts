import type { PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { logger } from '../utils/logger.js';

export type PriceChangeSource =
  | 'INITIAL_SNAPSHOT'
  | 'INITIAL_PRICE'
  | 'MANUAL_EDIT'
  | 'BULK_UPDATE'
  | 'EXCEL_IMPORT'
  | 'PURCHASE_RESTOCK';

export type PriceChangeDirection = 'INITIAL' | 'INCREASE' | 'DECREASE' | 'MIXED';

export interface RecordPriceChangeInput {
  productId: string;
  variantId: string;
  variantUnitId?: string | null;
  unitName: string;
  supplierId?: string | null;

  oldBuyPrice?: number | null;
  newBuyPrice: number;
  oldSellPrice?: number | null;
  newSellPrice: number;
  oldWholesalePrice?: number | null;
  newWholesalePrice?: number | null;

  changeSource?: PriceChangeSource;
  batchId?: string | null;
  referenceNo?: string | null;
  reason?: string | null;

  discountPct?: number | null;
  discountAmount?: number | null;
  taxPct?: number | null;
  taxAmount?: number | null;

  additionalCosts?: AdditionalCostItem[] | null;
  totalAdditionalCost?: number | null;

  userId?: string | null;
  createdBy?: string;
}

export interface AdditionalCostItem {
  name: string;
  amount: number;
}

export interface PriceHistoryFilters {
  productId?: string;
  variantId?: string;
  variantUnitId?: string;
  supplierId?: string;
  source?: string;
  direction?: string;
  field?: 'ALL' | 'buy_price' | 'sell_price' | 'wholesale_price';
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BulkPriceUpdateInput {
  scope?: string;
  product_ids?: string[];
  variant_ids?: string[];
  category_id?: string;
  brand_id?: string;
  supplier_id?: string;
  base_unit_only?: boolean;
  target_units?: 'BASE_ONLY' | 'ALL_UNITS';

  target_field: 'buy_price' | 'sell_price' | 'wholesale_price' | 'both_buy_and_sell';
  adjustment_mode: 'PERCENT' | 'FIXED_AMOUNT' | 'SET_VALUE';
  value: number; // e.g. 5 for +5%, or 2000 for +Rp 2.000, or exact value
  auto_maintain_margin?: boolean; // if updating buy_price, auto-adjust sell_price to keep gross margin %
  rounding?: 'NONE' | 'HUNDRED' | 'THOUSAND' | 'FIVE_THOUSAND';
  rounding_step?: number;

  discount_type?: 'PERCENT' | 'AMOUNT';
  discount_pct?: number;
  discount_amount?: number;
  tax_type?: 'PERCENT' | 'AMOUNT';
  tax_pct?: number;
  tax_amount?: number;

  additional_costs?: AdditionalCostItem[];
  total_additional_cost?: number;

  reason?: string;
  reference_no?: string;
}

export class PriceHistoryService {
  /**
   * Hitung Gross Margin: (Harga Jual - Harga Modal) / Harga Jual * 100%
   */
  static calculateGrossMargin(sellPrice: number, buyPrice: number): number | null {
    if (sellPrice <= 0) return null;
    if (buyPrice <= 0) return 100;
    const margin = ((sellPrice - buyPrice) / sellPrice) * 100;
    return Number(margin.toFixed(2));
  }

  /**
   * Hitung Markup: (Harga Jual - Harga Modal) / Harga Modal * 100%
   */
  static calculateMarkup(sellPrice: number, buyPrice: number): number | null {
    if (buyPrice <= 0) return null;
    const markup = ((sellPrice - buyPrice) / buyPrice) * 100;
    return Number(markup.toFixed(2));
  }

  /**
   * Pembulatan harga ke kelipatan terdekat (atau ke atas)
   */
  static applyRounding(value: number, step?: number): number {
    if (!step || step <= 1) return Math.round(value);
    return Math.ceil(value / step) * step;
  }

  /**
   * Catat mutasi perubahan harga ke tabel `price_history`.
   * Jika tidak ada perubahan nilai harga dan bukan initial, record dilewati (no-op guard).
   */
  static async recordChange(
    clientOrNull: PoolClient | null,
    input: RecordPriceChangeInput
  ): Promise<string | null> {
    const db = clientOrNull || pool;

    const newBuy = Number(input.newBuyPrice) || 0;
    const newSell = Number(input.newSellPrice) || 0;
    const newWholesale =
      input.newWholesalePrice !== undefined && input.newWholesalePrice !== null
        ? Number(input.newWholesalePrice)
        : null;

    const oldBuy = input.oldBuyPrice !== undefined && input.oldBuyPrice !== null ? Number(input.oldBuyPrice) : null;
    const oldSell = input.oldSellPrice !== undefined && input.oldSellPrice !== null ? Number(input.oldSellPrice) : null;
    const oldWholesale =
      input.oldWholesalePrice !== undefined && input.oldWholesalePrice !== null
        ? Number(input.oldWholesalePrice)
        : null;

    const isInitial = oldBuy === null && oldSell === null;

    // Deteksi kolom yang berubah
    const changedFields: string[] = [];
    if (isInitial) {
      changedFields.push('buy_price', 'sell_price');
      if (newWholesale !== null) changedFields.push('wholesale_price');
    } else {
      if (oldBuy !== null && Math.abs(oldBuy - newBuy) > 0.001) changedFields.push('buy_price');
      if (oldSell !== null && Math.abs(oldSell - newSell) > 0.001) changedFields.push('sell_price');
      if (oldWholesale !== newWholesale) changedFields.push('wholesale_price');
    }

    // No-op guard: Jangan insert jika harga sama persis
    if (!isInitial && changedFields.length === 0) {
      return null;
    }

    // Hitung delta dan persentase perubahan
    const buyDiff = oldBuy !== null ? newBuy - oldBuy : 0;
    const buyChangePct =
      oldBuy !== null && oldBuy > 0 ? Number(((buyDiff / oldBuy) * 100).toFixed(2)) : null;

    const sellDiff = oldSell !== null ? newSell - oldSell : 0;
    const sellChangePct =
      oldSell !== null && oldSell > 0 ? Number(((sellDiff / oldSell) * 100).toFixed(2)) : null;

    // Gross margin
    const oldMarginPct =
      oldSell !== null && oldBuy !== null ? this.calculateGrossMargin(oldSell, oldBuy) : null;
    const newMarginPct = this.calculateGrossMargin(newSell, newBuy);

    // Tentukan arah perubahan
    let direction: PriceChangeDirection = 'INITIAL';
    if (!isInitial) {
      const increases = [buyDiff > 0, sellDiff > 0].filter(Boolean).length;
      const decreases = [buyDiff < 0, sellDiff < 0].filter(Boolean).length;

      if (increases > 0 && decreases === 0) {
        direction = 'INCREASE';
      } else if (decreases > 0 && increases === 0) {
        direction = 'DECREASE';
      } else if (increases > 0 && decreases > 0) {
        direction = 'MIXED';
      } else {
        direction = 'INITIAL';
      }
    }

    const historyId = generateUUIDv7();
    const source = input.changeSource || (isInitial ? 'INITIAL_PRICE' : 'MANUAL_EDIT');
    const createdBy = (input.createdBy || 'Admin').slice(0, 100);

    await db.query(
      `INSERT INTO price_history (
        id, product_id, variant_id, variant_unit_id, unit_name, supplier_id,
        old_buy_price, new_buy_price, old_sell_price, new_sell_price, old_wholesale_price, new_wholesale_price,
        buy_price_diff, buy_price_change_pct, sell_price_diff, sell_price_change_pct,
        old_margin_pct, new_margin_pct, change_direction, changed_fields, change_source,
        discount_pct, discount_amount, tax_pct, tax_amount,
        additional_costs, total_additional_cost,
        batch_id, reference_no, reason, user_id, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25,
        $26, $27,
        $28, $29, $30, $31, $32, CURRENT_TIMESTAMP
      )`,
      [
        historyId,
        input.productId,
        input.variantId,
        input.variantUnitId || null,
        input.unitName,
        input.supplierId || null,
        oldBuy,
        newBuy,
        oldSell,
        newSell,
        oldWholesale,
        newWholesale,
        buyDiff,
        buyChangePct,
        sellDiff,
        sellChangePct,
        oldMarginPct,
        newMarginPct,
        direction,
        JSON.stringify(changedFields),
        source,
        input.discountPct || 0,
        input.discountAmount || 0,
        input.taxPct || 0,
        input.taxAmount || 0,
        JSON.stringify(input.additionalCosts || []),
        input.totalAdditionalCost || 0,
        input.batchId || null,
        input.referenceNo || null,
        input.reason || null,
        input.userId || null,
        createdBy,
      ]
    );

    return historyId;
  }

  /**
   * Ambil daftar riwayat perubahan harga dengan filter & RBAC masking
   */
  static async getHistory(
    filters: PriceHistoryFilters & {
      product_id?: string;
      variant_id?: string;
      variant_unit_id?: string;
      supplier_id?: string;
      start_date?: string;
      end_date?: string;
    },
    options: { includeBuyPrice: boolean } = { includeBuyPrice: true }
  ) {
    const params: any[] = [];
    const conditions: string[] = [];

    const productId = filters.productId || filters.product_id;
    if (productId) {
      params.push(productId);
      conditions.push(`ph.product_id = $${params.length}`);
    }

    const variantId = filters.variantId || filters.variant_id;
    if (variantId) {
      params.push(variantId);
      conditions.push(`ph.variant_id = $${params.length}`);
    }

    const variantUnitId = filters.variantUnitId || filters.variant_unit_id;
    if (variantUnitId) {
      params.push(variantUnitId);
      conditions.push(`ph.variant_unit_id = $${params.length}`);
    }

    const supplierId = filters.supplierId || filters.supplier_id;
    if (supplierId) {
      params.push(supplierId);
      conditions.push(`ph.supplier_id = $${params.length}`);
    }

    if (filters.source && filters.source !== 'ALL') {
      params.push(filters.source);
      conditions.push(`ph.change_source = $${params.length}`);
    }

    if (filters.direction && filters.direction !== 'ALL') {
      const dir =
        filters.direction === 'UP'
          ? 'INCREASE'
          : filters.direction === 'DOWN'
          ? 'DECREASE'
          : filters.direction;
      params.push(dir);
      conditions.push(`ph.change_direction = $${params.length}`);
    }

    if (filters.field && filters.field !== 'ALL') {
      params.push(`%"${filters.field}"%`);
      conditions.push(`ph.changed_fields::text LIKE $${params.length}`);
    }

    const startDate = filters.startDate || filters.start_date;
    if (startDate) {
      params.push(startDate);
      conditions.push(`ph.created_at >= $${params.length}::timestamptz`);
    }

    const endDate = filters.endDate || filters.end_date;
    if (endDate) {
      params.push(endDate);
      conditions.push(`ph.created_at <= $${params.length}::timestamptz`);
    }

    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      conditions.push(`(
        LOWER(p.name) LIKE $${params.length} OR
        LOWER(pv.variant_name) LIKE $${params.length} OR
        LOWER(COALESCE(ph.reference_no, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ph.reason, '')) LIKE $${params.length} OR
        LOWER(COALESCE(s.name, '')) LIKE $${params.length}
      )`);
    }

    // RBAC: Jika tidak punya izin melihat harga modal, sembunyikan log yang HANYA mengubah harga modal
    if (!options.includeBuyPrice) {
      conditions.push(`(
        ph.changed_fields::text != '["buy_price"]'
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ? Math.min(Math.max(filters.limit, 1), 100) : 25;
    const offset = filters.offset ? Math.max(filters.offset, 0) : 0;

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT
        ph.*,
        p.name as product_name,
        p.sku as product_sku,
        pv.variant_name,
        pv.sku as variant_sku,
        s.name as supplier_name,
        u.username as created_by_username,
        u.full_name as created_by_fullname,
        u.role as created_by_role
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN product_variants pv ON ph.variant_id = pv.id
      LEFT JOIN suppliers s ON ph.supplier_id = s.id
      LEFT JOIN users u ON ph.user_id = u.id
      ${whereClause}
      ORDER BY ph.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN product_variants pv ON ph.variant_id = pv.id
      LEFT JOIN suppliers s ON ph.supplier_id = s.id
      ${whereClause}
    `;

    const [rowsRes, countRes] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);

    // Map numeric types and mask buy price fields if user doesn't have permission
    const items = rowsRes.rows.map((row: any) => {
      const oldMargin = row.old_margin_pct !== null ? Number(row.old_margin_pct) : null;
      const newMargin = row.new_margin_pct !== null ? Number(row.new_margin_pct) : null;
      const sellDiff = Number(row.sell_price_diff) || 0;
      const sellPct = row.sell_price_change_pct !== null ? Number(row.sell_price_change_pct) : 0;
      const buyDiff = row.buy_price_diff !== null ? Number(row.buy_price_diff) : null;
      const buyPct = row.buy_price_change_pct !== null ? Number(row.buy_price_change_pct) : null;

      const oldMarkup = options.includeBuyPrice && row.old_sell_price !== null && row.old_buy_price !== null
        ? this.calculateMarkup(Number(row.old_sell_price), Number(row.old_buy_price))
        : null;
      const newMarkup = options.includeBuyPrice && row.new_buy_price !== null
        ? this.calculateMarkup(Number(row.new_sell_price), Number(row.new_buy_price))
        : null;

      return {
        ...row,
        old_sell_price: row.old_sell_price !== null ? Number(row.old_sell_price) : null,
        new_sell_price: Number(row.new_sell_price),
        sell_price_diff: sellDiff,
        sell_price_change_pct: sellPct,
        sell_price_percent_change: sellPct,
        old_margin_pct: options.includeBuyPrice ? oldMargin : null,
        new_margin_pct: options.includeBuyPrice ? newMargin : null,
        gross_margin_before: options.includeBuyPrice ? oldMargin : null,
        gross_margin_after: options.includeBuyPrice ? newMargin : null,
        markup_before: oldMarkup,
        markup_after: newMarkup,
        old_buy_price:
          options.includeBuyPrice && row.old_buy_price !== null ? Number(row.old_buy_price) : null,
        new_buy_price: options.includeBuyPrice ? Number(row.new_buy_price) : null,
        buy_price_diff: options.includeBuyPrice ? buyDiff : null,
        buy_price_change_pct: options.includeBuyPrice ? buyPct : null,
        buy_price_percent_change: options.includeBuyPrice ? buyPct : null,
        old_wholesale_price:
          row.old_wholesale_price !== null ? Number(row.old_wholesale_price) : null,
        new_wholesale_price:
          row.new_wholesale_price !== null ? Number(row.new_wholesale_price) : null,
        discount_pct:
          options.includeBuyPrice && row.discount_pct !== null ? Number(row.discount_pct) : 0,
        discount_amount:
          options.includeBuyPrice && row.discount_amount !== null ? Number(row.discount_amount) : 0,
        tax_pct:
          options.includeBuyPrice && row.tax_pct !== null ? Number(row.tax_pct) : 0,
        tax_amount:
          options.includeBuyPrice && row.tax_amount !== null ? Number(row.tax_amount) : 0,
        additional_costs:
          options.includeBuyPrice && row.additional_costs ? row.additional_costs : [],
        total_additional_cost:
          options.includeBuyPrice && row.total_additional_cost !== null
            ? Number(row.total_additional_cost)
            : 0,
      };
    });

    return {
      total: parseInt(countRes.rows[0].total, 10),
      items,
      entries: items,
      limit,
      offset,
    };
  }

  /**
   * Analitik harga untuk satu varian spesifik (termasuk time-series untuk grafik SVG)
   */
  static async getVariantAnalytics(
    variantId: string,
    options: { includeBuyPrice: boolean; period?: string }
  ) {
    // 1. Ambil detail varian & satuan saat ini
    const variantRes = await query(
      `SELECT pv.*, p.name as product_name, p.id as product_id, p.supplier_id,
              s.name as supplier_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  )
                ) FILTER (WHERE vu.id IS NOT NULL), '[]'
              ) as units
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN variant_units vu ON vu.variant_id = pv.id
       WHERE pv.id = $1
       GROUP BY pv.id, p.id, p.name, p.supplier_id, s.name`,
      [variantId]
    );

    if (variantRes.rows.length === 0) {
      throw new Error('Varian tidak ditemukan');
    }

    const variant = variantRes.rows[0];

    // 2. Filter periode (default 1 tahun jika tidak ditentukan)
    let periodCondition = '';
    const periodDays = parseInt(options.period || '365', 10);
    if (!isNaN(periodDays) && periodDays > 0) {
      periodCondition = `AND ph.created_at >= (CURRENT_TIMESTAMP - INTERVAL '${periodDays} days')`;
    }

    // 3. Ambil riwayat kronologis untuk time series grafik
    const historyRes = await query(
      `SELECT ph.*
       FROM price_history ph
       WHERE ph.variant_id = $1 ${periodCondition}
       ORDER BY ph.created_at ASC`,
      [variantId]
    );

    const historyRows = historyRes.rows;

    // Kelompokkan per satuan unit_name
    const unitsMap = new Map<string, any[]>();
    for (const h of historyRows) {
      const uName = h.unit_name;
      if (!unitsMap.has(uName)) {
        unitsMap.set(uName, []);
      }
      unitsMap.get(uName)!.push(h);
    }

    // Hitung ringkasan statistik per satuan
    const unitsSummary: Record<string, any> = {};

    for (const [unitName, records] of unitsMap.entries()) {
      const first = records[0];
      const last = records[records.length - 1];

      const buyPrices = records.map((r) => Number(r.new_buy_price)).filter((p) => p > 0);
      const sellPrices = records.map((r) => Number(r.new_sell_price)).filter((p) => p > 0);

      const minBuy = buyPrices.length > 0 ? Math.min(...buyPrices) : 0;
      const maxBuy = buyPrices.length > 0 ? Math.max(...buyPrices) : 0;
      const avgBuy =
        buyPrices.length > 0 ? buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length : 0;

      const minSell = sellPrices.length > 0 ? Math.min(...sellPrices) : 0;
      const maxSell = sellPrices.length > 0 ? Math.max(...sellPrices) : 0;
      const avgSell =
        sellPrices.length > 0 ? sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length : 0;

      const increases = records.filter((r) => r.change_direction === 'INCREASE').length;
      const decreases = records.filter((r) => r.change_direction === 'DECREASE').length;

      const currentSell = Number(last.new_sell_price);
      const currentBuy = Number(last.new_buy_price);
      const initialSell = Number(first.old_sell_price ?? first.new_sell_price);
      const initialBuy = Number(first.old_buy_price ?? first.new_buy_price);

      const currentMargin = this.calculateGrossMargin(currentSell, currentBuy);
      const initialMargin = this.calculateGrossMargin(initialSell, initialBuy);
      const currentMarkup = this.calculateMarkup(currentSell, currentBuy);

      unitsSummary[unitName] = {
        unit_name: unitName,
        total_changes: records.length,
        increases_count: increases,
        decreases_count: decreases,
        current_sell_price: currentSell,
        current_buy_price: options.includeBuyPrice ? currentBuy : null,
        current_wholesale_price: last.new_wholesale_price ? Number(last.new_wholesale_price) : null,
        current_margin_pct: options.includeBuyPrice ? currentMargin : null,
        current_markup_pct: options.includeBuyPrice ? currentMarkup : null,
        initial_sell_price: initialSell,
        initial_buy_price: options.includeBuyPrice ? initialBuy : null,
        initial_margin_pct: options.includeBuyPrice ? initialMargin : null,
        margin_diff_pct:
          options.includeBuyPrice && currentMargin !== null && initialMargin !== null
            ? Number((currentMargin - initialMargin).toFixed(2))
            : null,
        sell_price_change_pct:
          initialSell > 0 ? Number((((currentSell - initialSell) / initialSell) * 100).toFixed(2)) : 0,
        buy_price_change_pct:
          options.includeBuyPrice && initialBuy > 0
            ? Number((((currentBuy - initialBuy) / initialBuy) * 100).toFixed(2))
            : null,
        min_sell_price: minSell,
        max_sell_price: maxSell,
        avg_sell_price: Number(avgSell.toFixed(0)),
        min_buy_price: options.includeBuyPrice ? minBuy : null,
        max_buy_price: options.includeBuyPrice ? maxBuy : null,
        avg_buy_price: options.includeBuyPrice ? Number(avgBuy.toFixed(0)) : null,
        last_changed_at: last.created_at,
      };
    }

    // Format units_summary as an array (VariantUnitPriceSummary[])
    const unitsSummaryList = (variant.units || []).map((u: any) => {
      const records = unitsMap.get(u.unit_name) || [];
      const first = records[0];
      const last = records[records.length - 1];

      const currentSell = Number(u.sell_price) || 0;
      const currentBuy = Number(u.buy_price) || 0;
      const currentWholesale = u.wholesale_price ? Number(u.wholesale_price) : null;
      const initialSell = first ? Number(first.old_sell_price ?? first.new_sell_price) : currentSell;
      const initialBuy = first ? Number(first.old_buy_price ?? first.new_buy_price) : currentBuy;

      const currentMargin = this.calculateGrossMargin(currentSell, currentBuy);
      const currentMarkup = this.calculateMarkup(currentSell, currentBuy);

      const sellPrices = records.map((r: any) => Number(r.new_sell_price)).filter((p: number) => p > 0);
      const minSell = sellPrices.length > 0 ? Math.min(...sellPrices) : currentSell;
      const maxSell = sellPrices.length > 0 ? Math.max(...sellPrices) : currentSell;
      const avgSell =
        sellPrices.length > 0
          ? sellPrices.reduce((a: number, b: number) => a + b, 0) / sellPrices.length
          : currentSell;

      return {
        unit_id: u.id,
        unit_name: u.unit_name,
        conversion_factor: Number(u.conversion_factor) || 1,
        is_base_unit: Boolean(u.is_base_unit),
        current_sell_price: currentSell,
        current_buy_price: options.includeBuyPrice ? currentBuy : null,
        current_wholesale_price: currentWholesale,
        current_gross_margin: options.includeBuyPrice ? currentMargin : null,
        current_margin_pct: options.includeBuyPrice ? currentMargin : null,
        current_markup: options.includeBuyPrice ? currentMarkup : null,
        current_markup_pct: options.includeBuyPrice ? currentMarkup : null,
        min_sell_price: minSell,
        max_sell_price: maxSell,
        avg_sell_price: Math.round(avgSell),
        all_time_sell_diff: currentSell - initialSell,
        all_time_sell_percent_change:
          initialSell > 0 ? Number((((currentSell - initialSell) / initialSell) * 100).toFixed(2)) : 0,
        history_count: records.length,
        total_changes: records.length,
        last_changed_at: last ? last.created_at : null,
        last_changed_by: last ? last.created_by_name || last.created_by_username || null : null,
        last_reason: last ? last.reason || null : null,
      };
    });

    // Time-series points formatted for frontend charting
    const timeSeries = historyRows.map((r: any) => {
      const sell = Number(r.new_sell_price);
      const buy = Number(r.new_buy_price);
      const wholesale = r.new_wholesale_price ? Number(r.new_wholesale_price) : null;
      const grossMargin = options.includeBuyPrice ? this.calculateGrossMargin(sell, buy) : null;
      const markup = options.includeBuyPrice ? this.calculateMarkup(sell, buy) : null;
      return {
        id: r.id,
        date: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        created_at: r.created_at,
        unit_name: r.unit_name,
        sell_price: sell,
        buy_price: options.includeBuyPrice ? buy : null,
        wholesale_price: wholesale,
        gross_margin: grossMargin,
        gross_margin_pct: grossMargin,
        markup: markup,
        markup_pct: markup,
        direction: r.change_direction,
        source: r.change_source,
        change_source: r.change_source,
        reason: r.reason,
        reference_no: r.reference_no,
        created_by: r.created_by_name || r.created_by_username || null,
      };
    });

    return {
      variant: {
        id: variant.id,
        variant_name: variant.variant_name,
        sku: variant.sku,
        product_id: variant.product_id,
        product_name: variant.product_name,
        supplier_id: variant.supplier_id,
        supplier_name: variant.supplier_name,
        units: variant.units,
      },
      units_summary: unitsSummaryList,
      units_summary_map: unitsSummary,
      time_series: timeSeries,
      total_changes: historyRows.length,
    };
  }

  /**
   * Analitik harga untuk satu produk (lintas varian)
   */
  static async getProductAnalytics(
    productId: string,
    options: { includeBuyPrice: boolean; period?: string }
  ) {
    const threshold = await this.getMarginThreshold();

    const productRes = await query(
      `SELECT p.id, p.name, p.sku, p.supplier_id, s.name as supplier_name, c.name as category_name
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [productId]
    );

    if (productRes.rows.length === 0) {
      throw new Error('Produk tidak ditemukan');
    }

    const prod = productRes.rows[0];

    // Ambil semua varian dan satuan terkait
    const variantsRes = await query(
      `SELECT pv.id, pv.variant_name, pv.sku, pv.current_stock, pv.is_active,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
                ) FILTER (WHERE vu.id IS NOT NULL), '[]'
              ) as units
       FROM product_variants pv
       LEFT JOIN variant_units vu ON vu.variant_id = pv.id
       WHERE pv.product_id = $1 AND pv.is_active = TRUE
       GROUP BY pv.id, pv.variant_name, pv.sku, pv.current_stock, pv.is_active
       ORDER BY pv.variant_name ASC`,
      [productId]
    );

    const variantsList = variantsRes.rows;

    // Ambil histori harga produk ini untuk time series & audit
    const productHistoryRes = await query(
      `SELECT ph.*, pv.variant_name, pv.sku as variant_sku
       FROM price_history ph
       JOIN product_variants pv ON ph.variant_id = pv.id
       WHERE ph.product_id = $1
       ORDER BY ph.created_at ASC`,
      [productId]
    );

    const productHistoryRows = productHistoryRes.rows;

    // Evaluasi margin varian & deteksi alert
    let totalMargin = 0;
    let marginCount = 0;
    let criticalCount = 0;
    let warningCount = 0;

    const variantStatusList: any[] = [];
    const variantsSummary: any[] = [];

    for (const v of variantsList) {
      const units = v.units || [];
      const baseUnit = units.find((u: any) => u.is_base_unit) || units[0];

      if (baseUnit) {
        const bSell = Number(baseUnit.sell_price) || 0;
        const bBuy = Number(baseUnit.buy_price) || 0;
        const bWholesale = baseUnit.wholesale_price ? Number(baseUnit.wholesale_price) : null;
        const bMargin = this.calculateGrossMargin(bSell, bBuy);

        let status = 'HEALTHY';
        if (bSell <= bBuy || (bWholesale !== null && bWholesale <= bBuy)) {
          status = 'CRITICAL';
          criticalCount++;
        } else if (bMargin !== null && bMargin < threshold) {
          status = 'WARNING';
          warningCount++;
        }

        if (bMargin !== null) {
          totalMargin += bMargin;
          marginCount++;
        }

        variantStatusList.push({
          variant_id: v.id,
          variant_name: v.variant_name,
          sku: v.sku,
          unit_name: baseUnit.unit_name,
          sell_price: bSell,
          buy_price: options.includeBuyPrice ? bBuy : null,
          wholesale_price: bWholesale,
          gross_margin: options.includeBuyPrice ? bMargin : null,
          gross_margin_pct: options.includeBuyPrice ? bMargin : null,
          status,
        });
      }

      // Bangun units array (VariantUnitPriceSummary[]) untuk varian ini
      const unitSummaries = units.map((u: any) => {
        const uRecords = productHistoryRows.filter(
          (r) => r.variant_id === v.id && (r.variant_unit_id === u.id || r.unit_name === u.unit_name)
        );
        const first = uRecords[0];
        const last = uRecords[uRecords.length - 1];

        const cSell = Number(u.sell_price) || 0;
        const cBuy = Number(u.buy_price) || 0;
        const cWholesale = u.wholesale_price ? Number(u.wholesale_price) : null;
        const iSell = first ? Number(first.old_sell_price ?? first.new_sell_price) : cSell;
        const iBuy = first ? Number(first.old_buy_price ?? first.new_buy_price) : cBuy;

        const cMargin = this.calculateGrossMargin(cSell, cBuy);
        const cMarkup = this.calculateMarkup(cSell, cBuy);

        const sPrices = uRecords.map((r) => Number(r.new_sell_price)).filter((p) => p > 0);
        const minS = sPrices.length > 0 ? Math.min(...sPrices) : cSell;
        const maxS = sPrices.length > 0 ? Math.max(...sPrices) : cSell;
        const avgS = sPrices.length > 0 ? sPrices.reduce((a, b) => a + b, 0) / sPrices.length : cSell;

        return {
          unit_id: u.id,
          unit_name: u.unit_name,
          conversion_factor: Number(u.conversion_factor) || 1,
          is_base_unit: Boolean(u.is_base_unit),
          current_sell_price: cSell,
          current_buy_price: options.includeBuyPrice ? cBuy : null,
          current_wholesale_price: cWholesale,
          current_gross_margin: options.includeBuyPrice ? cMargin : null,
          current_margin_pct: options.includeBuyPrice ? cMargin : null,
          current_markup: options.includeBuyPrice ? cMarkup : null,
          current_markup_pct: options.includeBuyPrice ? cMarkup : null,
          min_sell_price: minS,
          max_sell_price: maxS,
          avg_sell_price: Math.round(avgS),
          all_time_sell_diff: cSell - iSell,
          all_time_sell_percent_change:
            iSell > 0 ? Number((((cSell - iSell) / iSell) * 100).toFixed(2)) : 0,
          history_count: uRecords.length,
          total_changes: uRecords.length,
          last_changed_at: last ? last.created_at : null,
          last_changed_by: last ? last.created_by_name || last.created_by_username || null : null,
          last_reason: last ? last.reason || null : null,
        };
      });

      variantsSummary.push({
        variant_id: v.id,
        variant_name: v.variant_name,
        sku: v.sku,
        units: unitSummaries,
      });
    }

    const avgMargin = marginCount > 0 ? Number((totalMargin / marginCount).toFixed(2)) : null;

    // Time-series across all variants of this product
    const timeSeries = productHistoryRows.map((r: any) => {
      const sell = Number(r.new_sell_price);
      const buy = Number(r.new_buy_price);
      const wholesale = r.new_wholesale_price ? Number(r.new_wholesale_price) : null;
      const grossMargin = options.includeBuyPrice ? this.calculateGrossMargin(sell, buy) : null;
      const markup = options.includeBuyPrice ? this.calculateMarkup(sell, buy) : null;
      return {
        id: r.id,
        date: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        created_at: r.created_at,
        unit_name: `${r.variant_name} - ${r.unit_name}`,
        sell_price: sell,
        buy_price: options.includeBuyPrice ? buy : null,
        wholesale_price: wholesale,
        gross_margin: grossMargin,
        gross_margin_pct: grossMargin,
        markup: markup,
        markup_pct: markup,
        direction: r.change_direction,
        source: r.change_source,
        change_source: r.change_source,
        reason: r.reason,
        reference_no: r.reference_no,
        created_by: r.created_by_name || r.created_by_username || null,
      };
    });

    // Ambil histori 10 perubahan harga terakhir pada produk ini
    const recentHistory = await this.getHistory(
      { productId, limit: 10, offset: 0 },
      options
    );

    return {
      product: {
        id: prod.id,
        name: prod.name,
        sku: prod.sku,
        category_name: prod.category_name || null,
        supplier_id: prod.supplier_id,
        supplier_name: prod.supplier_name,
      },
      summary: {
        total_variants: variantsList.length,
        avg_gross_margin_pct: options.includeBuyPrice ? avgMargin : null,
        critical_alerts_count: options.includeBuyPrice ? criticalCount : 0,
        warning_alerts_count: options.includeBuyPrice ? warningCount : 0,
        margin_threshold_pct: threshold,
      },
      variants_summary: variantsSummary,
      variants_status: variantStatusList,
      time_series: timeSeries,
      total_changes: productHistoryRows.length,
      recent_history: recentHistory.items,
    };
  }

  /**
   * Ambang batas persentase gross margin dari `store_settings`
   */
  static async getMarginThreshold(): Promise<number> {
    try {
      const res = await query(
        `SELECT value FROM store_settings WHERE key = 'margin_alert_threshold'`
      );
      if (res.rows[0]?.value?.threshold_pct !== undefined) {
        return Number(res.rows[0].value.threshold_pct);
      }
    } catch {}
    return 10.0; // default 10%
  }

  /**
   * Update ambang batas margin (memerlukan izin `pricing:threshold`)
   */
  static async updateMarginThreshold(thresholdPct: number, userId?: string | null) {
    const val = Math.max(0, Math.min(Number(thresholdPct) || 10, 100));
    const isUuid =
      userId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const validUserId = isUuid ? userId : null;

    await query(
      `INSERT INTO store_settings (key, value, description, updated_at, updated_by)
       VALUES (
         'margin_alert_threshold',
         $1::jsonb,
         'Ambang batas persentase gross margin untuk peringatan margin tipis/kritis',
         CURRENT_TIMESTAMP,
         $2
       )
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = EXCLUDED.updated_by`,
      [JSON.stringify({ threshold_pct: val }), validUserId]
    );
    return { threshold_pct: val };
  }

  /**
   * Ikhtisar analitik harga global (Pusat Analitik & Alert Margin)
   */
  static async getOverviewAnalytics(options: {
    includeBuyPrice: boolean;
    period?: string;
    threshold?: number;
  }) {
    const threshold =
      options.threshold !== undefined ? options.threshold : await this.getMarginThreshold();

    const periodDays = parseInt(options.period || '30', 10);
    const intervalSql = !isNaN(periodDays) && periodDays > 0 ? `INTERVAL '${periodDays} days'` : `INTERVAL '30 days'`;

    // 1. Alert Erosi Margin (Varian dengan margin tipis atau jual rugi)
    let marginAlerts: any[] = [];
    if (options.includeBuyPrice) {
      const alertsRes = await query(`
        SELECT
          vu.id as unit_id,
          vu.unit_name,
          vu.buy_price,
          vu.sell_price,
          vu.wholesale_price,
          pv.id as variant_id,
          pv.variant_name,
          pv.sku as variant_sku,
          pv.current_stock,
          p.id as product_id,
          p.name as product_name,
          s.id as supplier_id,
          s.name as supplier_name,
          c.name as category_name
        FROM variant_units vu
        JOIN product_variants pv ON vu.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = TRUE AND pv.is_active = TRUE
          AND (
            vu.sell_price <= vu.buy_price
            OR (vu.wholesale_price IS NOT NULL AND vu.wholesale_price > 0 AND vu.wholesale_price <= vu.buy_price)
            OR (
              vu.sell_price > 0
              AND ((vu.sell_price - vu.buy_price) / vu.sell_price * 100) < ${threshold}
            )
          )
        ORDER BY
          CASE WHEN vu.sell_price <= vu.buy_price THEN 1 ELSE 2 END,
          ((vu.sell_price - vu.buy_price) / NULLIF(vu.sell_price, 0)) ASC
        LIMIT 50
      `);

      marginAlerts = alertsRes.rows.map((row: any) => {
        const sell = Number(row.sell_price) || 0;
        const buy = Number(row.buy_price) || 0;
        const wholesale = row.wholesale_price ? Number(row.wholesale_price) : null;
        const grossMargin = PriceHistoryService.calculateGrossMargin(sell, buy);
        const markup = PriceHistoryService.calculateMarkup(sell, buy);

        const isLoss = sell <= buy || (wholesale !== null && wholesale <= buy) || (grossMargin !== null && grossMargin <= 0);
        const alertLevel = isLoss ? 'CRITICAL' : 'WARNING';
        const status = isLoss ? 'LOSS' : (grossMargin !== null && grossMargin < threshold ? 'CRITICAL' : 'WARNING');

        return {
          unit_id: row.unit_id,
          unit_name: row.unit_name,
          variant_id: row.variant_id,
          variant_name: row.variant_name,
          variant_sku: row.variant_sku,
          sku: row.variant_sku || '',
          product_id: row.product_id,
          product_name: row.product_name,
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name,
          category_name: row.category_name,
          current_stock: Number(row.current_stock) || 0,
          buy_price: buy,
          sell_price: sell,
          wholesale_price: wholesale,
          gross_margin: grossMargin ?? 0,
          gross_margin_pct: grossMargin ?? 0,
          markup: markup ?? 0,
          markup_pct: markup ?? 0,
          alert_level: alertLevel,
          status,
          alert_reason: isLoss
            ? sell <= buy
              ? 'Harga jual di bawah/sama dengan modal (Jual Rugi)'
              : 'Harga grosir di bawah/sama dengan modal'
            : `Gross margin (${grossMargin}%) di bawah batas aman (${threshold}%)`,
        };
      });
    }

    // 2. Top Kenaikan Harga Modal & Jual pada periode terpilih
    const topIncreasesRes = await query(`
      SELECT
        ph.*,
        p.name as product_name,
        pv.variant_name,
        pv.sku as variant_sku,
        s.name as supplier_name
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN product_variants pv ON ph.variant_id = pv.id
      LEFT JOIN suppliers s ON ph.supplier_id = s.id
      WHERE ph.created_at >= (CURRENT_TIMESTAMP - ${intervalSql})
        AND (ph.buy_price_diff > 0 OR ph.sell_price_diff > 0)
      ORDER BY COALESCE(ph.buy_price_diff, ph.sell_price_diff) DESC
      LIMIT 10
    `);

    const topIncreases = topIncreasesRes.rows.map((r: any) => {
      const sellDiff = Number(r.sell_price_diff) || 0;
      const sellPct = r.sell_price_change_pct !== null ? Number(r.sell_price_change_pct) : 0;
      const buyDiff = r.buy_price_diff !== null ? Number(r.buy_price_diff) : null;
      const buyPct = r.buy_price_change_pct !== null ? Number(r.buy_price_change_pct) : null;
      const oldSell = r.old_sell_price !== null ? Number(r.old_sell_price) : 0;
      const newSell = Number(r.new_sell_price) || 0;
      const oldBuy = r.old_buy_price !== null ? Number(r.old_buy_price) : null;
      const newBuy = r.new_buy_price !== null ? Number(r.new_buy_price) : null;

      const oldMargin = r.old_margin_pct !== null ? Number(r.old_margin_pct) : null;
      const newMargin = r.new_margin_pct !== null ? Number(r.new_margin_pct) : null;

      return {
        id: r.id,
        created_at: r.created_at,
        date: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        product_id: r.product_id,
        product_name: r.product_name,
        variant_id: r.variant_id,
        variant_name: r.variant_name,
        sku: r.variant_sku || '',
        variant_sku: r.variant_sku || '',
        unit_name: r.unit_name,
        old_sell_price: oldSell,
        new_sell_price: newSell,
        sell_price_diff: sellDiff,
        sell_price_change_pct: sellPct,
        sell_price_percent_change: sellPct,
        old_buy_price: options.includeBuyPrice ? oldBuy : null,
        new_buy_price: options.includeBuyPrice ? newBuy : null,
        buy_price_diff: options.includeBuyPrice ? buyDiff : null,
        buy_price_change_pct: options.includeBuyPrice ? buyPct : null,
        buy_price_percent_change: options.includeBuyPrice ? buyPct : null,
        old_margin_pct: options.includeBuyPrice ? oldMargin : null,
        new_margin_pct: options.includeBuyPrice ? newMargin : null,
        gross_margin_before: options.includeBuyPrice ? oldMargin : null,
        gross_margin_after: options.includeBuyPrice ? newMargin : null,
        supplier_name: r.supplier_name,
      };
    });

    // 3. Ringkasan Inflasi Harga per Supplier
    let supplierInflation: any[] = [];
    if (options.includeBuyPrice) {
      const suppRes = await query(`
        SELECT
          s.id as supplier_id,
          s.name as supplier_name,
          COUNT(ph.id)::int as change_count,
          COUNT(CASE WHEN ph.buy_price_diff > 0 THEN 1 END)::int as increase_count,
          AVG(CASE WHEN ph.buy_price_change_pct > 0 THEN ph.buy_price_change_pct END)::numeric(8, 2) as avg_increase_pct,
          MAX(ph.created_at) as last_changed_at
        FROM price_history ph
        JOIN suppliers s ON ph.supplier_id = s.id
        WHERE ph.created_at >= (CURRENT_TIMESTAMP - ${intervalSql})
          AND ph.buy_price_diff > 0
        GROUP BY s.id, s.name
        ORDER BY avg_increase_pct DESC NULLS LAST
        LIMIT 10
      `);
      supplierInflation = suppRes.rows.map((s: any) => {
        const avgInc = s.avg_increase_pct !== null ? Number(s.avg_increase_pct) : 0;
        return {
          supplier_id: s.supplier_id,
          supplier_name: s.supplier_name,
          change_count: Number(s.change_count) || 0,
          increase_count: Number(s.increase_count) || 0,
          avg_increase_pct: avgInc,
          avg_buy_percent_change: avgInc,
          last_changed_at: s.last_changed_at,
        };
      });
    }

    // 4. Ringkasan Inflasi Harga per Kategori
    const categoryInflationRes = await query(`
      SELECT
        c.id as category_id,
        c.name as category_name,
        COUNT(ph.id)::int as change_count,
        COUNT(CASE WHEN ph.sell_price_diff > 0 THEN 1 END)::int as sell_increase_count,
        AVG(CASE WHEN ph.sell_price_change_pct > 0 THEN ph.sell_price_change_pct END)::numeric(8, 2) as avg_sell_increase_pct,
        ${
          options.includeBuyPrice
            ? `COUNT(CASE WHEN ph.buy_price_diff > 0 THEN 1 END)::int as buy_increase_count,
               AVG(CASE WHEN ph.buy_price_change_pct > 0 THEN ph.buy_price_change_pct END)::numeric(8, 2) as avg_buy_increase_pct,`
            : ''
        }
        MAX(ph.created_at) as last_changed_at
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE ph.created_at >= (CURRENT_TIMESTAMP - ${intervalSql})
      GROUP BY c.id, c.name
      ORDER BY change_count DESC
      LIMIT 10
    `);

    const categoryInflation = categoryInflationRes.rows.map((c: any) => {
      const avgSellInc = c.avg_sell_increase_pct !== null ? Number(c.avg_sell_increase_pct) : 0;
      const avgBuyInc =
        c.avg_buy_increase_pct !== undefined && c.avg_buy_increase_pct !== null
          ? Number(c.avg_buy_increase_pct)
          : 0;
      return {
        category_id: c.category_id,
        category_name: c.category_name,
        change_count: Number(c.change_count) || 0,
        sell_increase_count: Number(c.sell_increase_count) || 0,
        avg_sell_increase_pct: avgSellInc,
        avg_sell_percent_change: avgSellInc,
        buy_increase_count:
          c.buy_increase_count !== undefined ? Number(c.buy_increase_count) || 0 : undefined,
        avg_buy_increase_pct: avgBuyInc,
        avg_buy_percent_change: avgBuyInc,
        last_changed_at: c.last_changed_at,
      };
    });

    // 5. KPI Ringkasan Global
    const kpiRes = await query(`
      SELECT
        COUNT(*)::int as total_changes,
        COUNT(CASE WHEN change_direction = 'INCREASE' THEN 1 END)::int as total_increases,
        COUNT(CASE WHEN change_direction = 'DECREASE' THEN 1 END)::int as total_decreases,
        COUNT(DISTINCT product_id)::int as products_affected
      FROM price_history
      WHERE created_at >= (CURRENT_TIMESTAMP - ${intervalSql})
    `);

    const criticalCount = marginAlerts.filter((a) => a.alert_level === 'CRITICAL' || a.status === 'LOSS').length;
    const warningCount = marginAlerts.filter((a) => a.alert_level === 'WARNING' || a.status === 'CRITICAL').length;

    const summary = {
      total_price_changes_30d: Number(kpiRes.rows[0]?.total_changes) || 0,
      price_increases_30d: Number(kpiRes.rows[0]?.total_increases) || 0,
      price_decreases_30d: Number(kpiRes.rows[0]?.total_decreases) || 0,
      critical_margin_count: criticalCount,
      loss_making_count: marginAlerts.filter((a) => a.alert_level === 'CRITICAL' || a.status === 'LOSS' || (a.gross_margin !== null && a.gross_margin <= 0)).length,
    };

    return {
      margin_threshold: threshold,
      margin_threshold_pct: threshold,
      period_days: periodDays,
      summary,
      kpis: {
        total_changes: kpiRes.rows[0]?.total_changes || 0,
        total_increases: kpiRes.rows[0]?.total_increases || 0,
        total_decreases: kpiRes.rows[0]?.total_decreases || 0,
        products_affected: kpiRes.rows[0]?.products_affected || 0,
        critical_margin_count: criticalCount,
        warning_margin_count: warningCount,
      },
      margin_alerts: marginAlerts,
      top_increases: topIncreases,
      supplier_inflation: supplierInflation,
      category_inflation: categoryInflation,
    };
  }

  /**
   * Pratinjau simulasi perubahan harga massal (Bulk Price Update Preview)
   */
  static async previewBulkPriceUpdate(input: BulkPriceUpdateInput) {
    const conditions: string[] = ['p.is_active = TRUE', 'pv.is_active = TRUE'];
    const params: any[] = [];

    if (input.product_ids && input.product_ids.length > 0) {
      params.push(input.product_ids);
      conditions.push(`p.id = ANY($${params.length}::uuid[])`);
    }

    if (input.variant_ids && input.variant_ids.length > 0) {
      params.push(input.variant_ids);
      conditions.push(`pv.id = ANY($${params.length}::uuid[])`);
    }

    if (input.category_id) {
      params.push(input.category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    if (input.brand_id) {
      params.push(input.brand_id);
      conditions.push(`p.brand_id = $${params.length}`);
    }

    if (input.supplier_id) {
      params.push(input.supplier_id);
      conditions.push(`p.supplier_id = $${params.length}`);
    }

    if (input.base_unit_only || input.target_units === 'BASE_ONLY') {
      conditions.push(`vu.is_base_unit = TRUE`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        vu.id as unit_id,
        vu.unit_name,
        vu.conversion_factor,
        vu.is_base_unit,
        vu.buy_price,
        vu.sell_price,
        vu.wholesale_price,
        pv.id as variant_id,
        pv.variant_name,
        pv.sku as variant_sku,
        p.id as product_id,
        p.name as product_name,
        s.name as supplier_name,
        c.name as category_name
      FROM variant_units vu
      JOIN product_variants pv ON vu.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.name ASC, pv.variant_name ASC, vu.is_base_unit DESC, vu.conversion_factor ASC
    `;

    const unitsRes = await query(sql, params);
    const units = unitsRes.rows;

    const previewItems: any[] = [];
    let step = input.rounding_step || 0;
    if (!step && input.rounding) {
      if (input.rounding === 'HUNDRED') step = 100;
      else if (input.rounding === 'THOUSAND') step = 1000;
      else if (input.rounding === 'FIVE_THOUSAND') step = 5000;
    }

    for (const u of units) {
      const curBuy = Number(u.buy_price) || 0;
      const curSell = Number(u.sell_price) || 0;
      const curWholesale = u.wholesale_price ? Number(u.wholesale_price) : null;
      const curMargin = this.calculateGrossMargin(curSell, curBuy);
      const factor = Number(u.conversion_factor) > 0 ? Number(u.conversion_factor) : 1;

      let nextBuy = curBuy;
      let nextSell = curSell;
      let nextWholesale = curWholesale;
      let discountVal = 0;
      let taxVal = 0;

      // 1. Hitung harga beli baru
      if (input.target_field === 'buy_price' || input.target_field === 'both_buy_and_sell') {
        let baseAdjustedBuy = curBuy;
        if (input.adjustment_mode === 'PERCENT') {
          baseAdjustedBuy = curBuy * (1 + input.value / 100);
        } else if (input.adjustment_mode === 'FIXED_AMOUNT') {
          // Nominal penyesuaian modal diskalakan dengan faktor konversi satuan (misal 1 bag = 40 sak -> kenaikan = 1.000 * 40 = 40.000)
          baseAdjustedBuy = Math.max(0, curBuy + (input.value * factor));
        } else if (input.adjustment_mode === 'SET_VALUE') {
          // Menetapkan nilai modal baru diskalakan dengan faktor konversi satuan
          baseAdjustedBuy = Math.max(0, input.value * factor);
        }

        // Terapkan Diskon Supplier (opsional)
        if (input.discount_pct && input.discount_pct > 0) {
          discountVal = Number((baseAdjustedBuy * (input.discount_pct / 100)).toFixed(2));
        } else if (input.discount_amount && input.discount_amount > 0) {
          discountVal = Math.min(baseAdjustedBuy, input.discount_amount * factor);
        }

        const netBeforeTax = Math.max(0, baseAdjustedBuy - discountVal);

        // Terapkan PPN Supplier (opsional)
        if (input.tax_pct && input.tax_pct > 0) {
          taxVal = Number((netBeforeTax * (input.tax_pct / 100)).toFixed(2));
        } else if (input.tax_amount && input.tax_amount > 0) {
          taxVal = input.tax_amount * factor;
        }

        // Terapkan Biaya Tambahan (Pengiriman, Kontainer, Buruh, dll)
        const baseAdditionalCost = (input.additional_costs || []).reduce(
          (sum: number, c: any) => sum + (Number(c.amount) || 0),
          0
        );
        const totalAdditionalCost = baseAdditionalCost * factor;

        // Biaya tambahan langsung di-include ke harga modal
        const effectiveBuy = netBeforeTax + taxVal + totalAdditionalCost;
        // PENTING: Aturan pembulatan HANYA berlaku untuk harga jual, TIDAK untuk harga modal!
        nextBuy = Math.round(effectiveBuy * 100) / 100;
      }

      // 2. Hitung harga jual baru
      if (input.target_field === 'sell_price' || input.target_field === 'both_buy_and_sell') {
        if (input.adjustment_mode === 'PERCENT') {
          nextSell = curSell * (1 + input.value / 100);
        } else if (input.adjustment_mode === 'FIXED_AMOUNT') {
          // Kenaikan/penurunan harga jual nominal diskalakan dengan faktor konversi satuan
          nextSell = Math.max(0, curSell + (input.value * factor));
        } else if (input.adjustment_mode === 'SET_VALUE') {
          nextSell = Math.max(0, input.value * factor);
        }
        nextSell = this.applyRounding(nextSell, step);
      } else if (
        input.target_field === 'buy_price' &&
        input.auto_maintain_margin &&
        curMargin !== null &&
        curMargin < 100
      ) {
        // Auto-jaga margin saat kenaikan harga modal
        // Sell = Buy / (1 - Margin/100)
        const targetMarginFraction = curMargin / 100;
        if (targetMarginFraction < 0.99) {
          nextSell = nextBuy / (1 - targetMarginFraction);
          nextSell = this.applyRounding(nextSell, step);
        }
      }

      // 3. Hitung harga grosir baru jika target adalah wholesale
      if (input.target_field === 'wholesale_price') {
        if (curWholesale !== null) {
          let calcWholesale = curWholesale;
          if (input.adjustment_mode === 'PERCENT') {
            calcWholesale = curWholesale * (1 + input.value / 100);
          } else if (input.adjustment_mode === 'FIXED_AMOUNT') {
            calcWholesale = Math.max(0, curWholesale + (input.value * factor));
          } else if (input.adjustment_mode === 'SET_VALUE') {
            calcWholesale = Math.max(0, input.value * factor);
          }
          nextWholesale = this.applyRounding(calcWholesale, step);
        }
      }

      const nextMargin = this.calculateGrossMargin(nextSell, nextBuy);

      let warning: string | null = null;
      if (nextSell <= nextBuy) {
        warning = 'Harga jual di bawah/sama dengan modal (Jual Rugi!)';
      } else if (nextWholesale !== null && nextWholesale <= nextBuy) {
        warning = 'Harga grosir di bawah/sama dengan modal!';
      }

      previewItems.push({
        unit_id: u.unit_id,
        unit_name: u.unit_name,
        conversion_factor: factor,
        is_base_unit: u.is_base_unit,
        variant_id: u.variant_id,
        variant_name: u.variant_name,
        variant_sku: u.variant_sku,
        product_id: u.product_id,
        product_name: u.product_name,
        supplier_name: u.supplier_name,
        category_name: u.category_name,

        old_buy_price: curBuy,
        new_buy_price: nextBuy,
        current_buy_price: curBuy,
        next_buy_price: nextBuy,
        buy_diff: nextBuy - curBuy,

        old_sell_price: curSell,
        new_sell_price: nextSell,
        current_sell_price: curSell,
        next_sell_price: nextSell,
        sell_diff: nextSell - curSell,

        old_wholesale_price: curWholesale,
        new_wholesale_price: nextWholesale,
        current_wholesale_price: curWholesale,
        next_wholesale_price: nextWholesale,

        old_margin_pct: curMargin,
        new_margin_pct: nextMargin,
        current_margin: curMargin,
        next_margin: nextMargin,
        margin_diff_pct:
          nextMargin !== null && curMargin !== null
            ? Number((nextMargin - curMargin).toFixed(2))
            : null,

        discount_pct: input.discount_pct || 0,
        discount_amount: discountVal,
        tax_pct: input.tax_pct || 0,
        tax_amount: taxVal,
        additional_costs: (input.additional_costs || []).map((c: any) => ({
          name: c.name,
          amount: (Number(c.amount) || 0) * factor,
        })),
        total_additional_cost:
          (input.additional_costs || []).reduce(
            (sum: number, c: any) => sum + (Number(c.amount) || 0),
            0
          ) * factor,

        warning,
      });
    }

    const marginBeforeList = previewItems
      .map((i) => i.current_margin)
      .filter((m): m is number => m !== null);
    const marginAfterList = previewItems
      .map((i) => i.next_margin)
      .filter((m): m is number => m !== null);

    const avgMarginBefore =
      marginBeforeList.length > 0
        ? marginBeforeList.reduce((a, b) => a + b, 0) / marginBeforeList.length
        : 0;
    const avgMarginAfter =
      marginAfterList.length > 0
        ? marginAfterList.reduce((a, b) => a + b, 0) / marginAfterList.length
        : 0;

    return {
      total_units: previewItems.length,
      total_units_affected: previewItems.length,
      items: previewItems,
      summary: {
        avg_margin_before: avgMarginBefore,
        avg_margin_after: avgMarginAfter,
        potential_losses_count: previewItems.filter((i) => i.warning !== null).length,
      },
    };
  }

  /**
   * Eksekusi pembaruan harga massal secara atomik (PostgreSQL transaction)
   */
  static async commitBulkPriceUpdate(
    input: BulkPriceUpdateInput,
    actor: { userId?: string | null; createdBy?: string; allowBuyPrice: boolean }
  ) {
    const preview = await this.previewBulkPriceUpdate(input);
    if (preview.items.length === 0) {
      throw new Error('Tidak ada satuan varian yang sesuai dengan kriteria filter.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const batchId = generateUUIDv7();
      const baseReason = input.reason || 'Update harga massal';
      const referenceNo = input.reference_no || `BULK-${Date.now().toString().slice(-6)}`;

      const auditNotes: string[] = [];
      if (input.discount_pct && input.discount_pct > 0) auditNotes.push(`Diskon: ${input.discount_pct}%`);
      else if (input.discount_amount && input.discount_amount > 0) auditNotes.push(`Diskon: Rp ${input.discount_amount.toLocaleString('id-ID')}`);
      if (input.tax_pct && input.tax_pct > 0) auditNotes.push(`PPN: ${input.tax_pct}%`);
      else if (input.tax_amount && input.tax_amount > 0) auditNotes.push(`PPN: Rp ${input.tax_amount.toLocaleString('id-ID')}`);

      const extraCosts = input.additional_costs || [];
      if (extraCosts.length > 0) {
        const totalExtra = extraCosts.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        const details = extraCosts
          .map((c) => `${c.name}: Rp ${Number(c.amount).toLocaleString('id-ID')}`)
          .join(', ');
        auditNotes.push(`Biaya Tambahan: Rp ${totalExtra.toLocaleString('id-ID')} (${details})`);
      }

      const reason = auditNotes.length > 0 ? `${baseReason} [${auditNotes.join(', ')}]` : baseReason;

      let updatedCount = 0;

      for (const item of preview.items) {
        // Cek apakah ada perubahan harga
        const buyChanged = actor.allowBuyPrice && Math.abs(item.new_buy_price - item.old_buy_price) > 0.001;
        const sellChanged = Math.abs(item.new_sell_price - item.old_sell_price) > 0.001;
        const wholesaleChanged = item.new_wholesale_price !== item.old_wholesale_price;

        if (!buyChanged && !sellChanged && !wholesaleChanged) {
          continue;
        }

        const targetBuy = actor.allowBuyPrice ? item.new_buy_price : item.old_buy_price;

        // 1. Update variant_units
        await client.query(
          `UPDATE variant_units
           SET buy_price = $1, sell_price = $2, wholesale_price = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [targetBuy, item.new_sell_price, item.new_wholesale_price, item.unit_id]
        );

        // 2. Catat riwayat perubahan harga
        await this.recordChange(client, {
          productId: item.product_id,
          variantId: item.variant_id,
          variantUnitId: item.unit_id,
          unitName: item.unit_name,
          oldBuyPrice: item.old_buy_price,
          newBuyPrice: targetBuy,
          oldSellPrice: item.old_sell_price,
          newSellPrice: item.new_sell_price,
          oldWholesalePrice: item.old_wholesale_price,
          newWholesalePrice: item.new_wholesale_price,
          discountPct: actor.allowBuyPrice ? (item.discount_pct || null) : null,
          discountAmount: actor.allowBuyPrice ? (item.discount_amount || null) : null,
          taxPct: actor.allowBuyPrice ? (item.tax_pct || null) : null,
          taxAmount: actor.allowBuyPrice ? (item.tax_amount || null) : null,
          additionalCosts: actor.allowBuyPrice ? (item.additional_costs || null) : null,
          totalAdditionalCost: actor.allowBuyPrice ? (item.total_additional_cost || null) : null,
          changeSource: 'BULK_UPDATE',
          batchId,
          referenceNo,
          reason,
          userId: actor.userId,
          createdBy: actor.createdBy,
        });

        updatedCount++;
      }

      await client.query('COMMIT');

      logger.info(
        'PRICE_HISTORY',
        `Bulk price update committed: ${updatedCount} units updated (batch: ${batchId}) by ${actor.createdBy}`
      );

      return {
        batch_id: batchId,
        updated_count: updatedCount,
        message: `Berhasil memperbarui harga untuk ${updatedCount} satuan barang.`,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
