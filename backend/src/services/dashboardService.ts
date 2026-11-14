import { query } from '../config/db.js';

export class DashboardService {
  static async getSummary() {
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
      low_stock_items: lowStockItemsRes.rows
    };
  }
}
