import { query } from '../config/db.js';
import { PriceHistoryService } from './priceHistoryService.js';

export class DashboardService {
  static async getSummary(options?: { includeBuyPrice?: boolean; hasAnalytics?: boolean }) {
    const productsRes = await query('SELECT COUNT(*) as count FROM products');
    const variantsRes = await query('SELECT COUNT(*) as count FROM product_variants');
    const categoriesRes = await query('SELECT COUNT(*) as count FROM categories');
    const brandsRes = await query('SELECT COUNT(*) as count FROM brands');
    const suppliersRes = await query('SELECT COUNT(*) as count FROM suppliers');
    const salesRes = await query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN is_active THEN 1 END)::int AS active
      FROM supplier_sales
    `);
    
    const lowStockRes = await query(`
      SELECT COUNT(*) as count 
      FROM product_variants 
      WHERE current_stock <= min_stock AND current_stock > 0
    `);

    const outOfStockRes = await query(`
      SELECT COUNT(*) as count 
      FROM product_variants 
      WHERE current_stock <= 0
    `);

    const recentMovementsRes = await query(`
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
      ORDER BY sm.created_at DESC
      LIMIT 8
    `);

    const lowStockItemsRes = await query(`
      SELECT 
        pv.id as variant_id,
        pv.variant_name,
        pv.sku,
        pv.current_stock,
        pv.min_stock,
        p.id as product_id,
        p.name as product_name,
        c.name as category_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE pv.current_stock <= pv.min_stock
      ORDER BY pv.current_stock ASC
      LIMIT 6
    `);

    let priceAlertsCount = 0;
    let criticalMarginCount = 0;
    let recentPriceChanges: any[] = [];

    if (options?.hasAnalytics) {
      try {
        const threshold = await PriceHistoryService.getMarginThreshold();
        if (options.includeBuyPrice) {
          const alertCountRes = await query(`
            SELECT
              COUNT(CASE WHEN vu.sell_price <= vu.buy_price OR (vu.wholesale_price IS NOT NULL AND vu.wholesale_price > 0 AND vu.wholesale_price <= vu.buy_price) THEN 1 END)::int as critical_count,
              COUNT(*)::int as total_alerts
            FROM variant_units vu
            JOIN product_variants pv ON vu.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE p.is_active = TRUE AND pv.is_active = TRUE
              AND (
                vu.sell_price <= vu.buy_price
                OR (vu.wholesale_price IS NOT NULL AND vu.wholesale_price > 0 AND vu.wholesale_price <= vu.buy_price)
                OR (vu.sell_price > 0 AND ((vu.sell_price - vu.buy_price) / vu.sell_price * 100) < ${threshold})
              )
          `);
          priceAlertsCount = alertCountRes.rows[0]?.total_alerts || 0;
          criticalMarginCount = alertCountRes.rows[0]?.critical_count || 0;
        }

        const recentChangesRes = await query(`
          SELECT ph.*, p.name as product_name, pv.variant_name
          FROM price_history ph
          JOIN products p ON ph.product_id = p.id
          JOIN product_variants pv ON ph.variant_id = pv.id
          ${options.includeBuyPrice ? '' : `WHERE ph.changed_fields::text != '["buy_price"]'`}
          ORDER BY ph.created_at DESC
          LIMIT 5
        `);
        recentPriceChanges = recentChangesRes.rows.map((r: any) => {
          if (!options.includeBuyPrice) {
            return {
              ...r,
              old_buy_price: null,
              new_buy_price: null,
              buy_price_diff: null,
              buy_price_change_pct: null,
              old_margin_pct: null,
              new_margin_pct: null,
            };
          }
          return r;
        });
      } catch {}
    }

    return {
      total_products: parseInt(productsRes.rows[0].count, 10),
      total_variants: parseInt(variantsRes.rows[0].count, 10),
      total_categories: parseInt(categoriesRes.rows[0].count, 10),
      total_brands: parseInt(brandsRes.rows[0].count, 10),
      total_suppliers: parseInt(suppliersRes.rows[0].count, 10),
      total_sales: parseInt(salesRes.rows[0]?.total || 0, 10),
      active_sales: parseInt(salesRes.rows[0]?.active || 0, 10),
      low_stock_count: parseInt(lowStockRes.rows[0].count, 10),
      out_of_stock_count: parseInt(outOfStockRes.rows[0].count, 10),
      recent_movements: recentMovementsRes.rows,
      low_stock_items: lowStockItemsRes.rows,
      price_alerts_count: priceAlertsCount,
      critical_margin_count: criticalMarginCount,
      recent_price_changes: recentPriceChanges,
    };
  }
}
