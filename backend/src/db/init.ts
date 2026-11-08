import { pool } from '../config/db.js';

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Initializing Toko Bangunan database schema...');

    await client.query('BEGIN');

    // 1. Categories Table (Supports multi-level subcategories)
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    `);

    // 2. Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        barcode VARCHAR(100),
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        brand VARCHAR(100),
        description TEXT,
        min_stock_alert NUMERIC(12, 2) DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        has_variants BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    `);

    // 3. Product Variants Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_name VARCHAR(150) NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        barcode VARCHAR(100),
        current_stock NUMERIC(12, 2) DEFAULT 0 NOT NULL,
        min_stock NUMERIC(12, 2) DEFAULT 5 NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
    `);

    // 4. Variant Units (Satuan Harga bertingkat / multi-unit)
    await client.query(`
      CREATE TABLE IF NOT EXISTS variant_units (
        id UUID PRIMARY KEY,
        variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        unit_name VARCHAR(50) NOT NULL,
        conversion_factor NUMERIC(12, 4) DEFAULT 1 NOT NULL,
        is_base_unit BOOLEAN DEFAULT FALSE,
        buy_price NUMERIC(14, 2) DEFAULT 0,
        sell_price NUMERIC(14, 2) DEFAULT 0 NOT NULL,
        wholesale_price NUMERIC(14, 2),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_variant_units_variant ON variant_units(variant_id);
    `);

    // 5. Stock Movements (Log Transaksi Perubahan Stok)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        movement_type VARCHAR(50) NOT NULL,
        previous_stock NUMERIC(12, 2) NOT NULL,
        quantity_change NUMERIC(12, 2) NOT NULL,
        current_stock NUMERIC(12, 2) NOT NULL,
        reference_no VARCHAR(100),
        notes TEXT,
        created_by VARCHAR(100) DEFAULT 'Admin',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('✅ Toko Bangunan database schema created successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (process.argv[1]?.includes('init.ts') || process.argv[1]?.includes('init.js')) {
  initializeDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
