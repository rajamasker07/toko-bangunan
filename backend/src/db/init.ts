import type { PoolClient } from 'pg';
import { pool } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { brandKey, normalizeBrandName } from '../utils/brand.js';

async function columnExists(client: PoolClient, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Migrasi database versi lama yang menyimpan merek sebagai teks bebas di `products.brand`.
 * - Menambah kolom `products.brand_id` (PostgreSQL 9.5 belum mendukung ADD COLUMN IF NOT EXISTS)
 * - Memindahkan merek unik ke tabel `brands` (dedup via name_key)
 * - Menghubungkan produk ke brand, lalu menghapus kolom teks lama
 * Berjalan di dalam transaksi yang sama dengan inisialisasi skema.
 */
async function migrateLegacyBrandColumn(client: PoolClient) {
  if (!(await columnExists(client, 'products', 'brand_id'))) {
    await client.query('ALTER TABLE products ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE SET NULL');
  }

  if (!(await columnExists(client, 'products', 'brand'))) return;

  console.log('🔁 Migrasi kolom products.brand -> tabel brands...');
  const legacy = await client.query(
    `SELECT id, brand FROM products WHERE brand IS NOT NULL AND TRIM(brand) <> ''`
  );

  for (const row of legacy.rows as Array<{ id: string; brand: string }>) {
    const name = normalizeBrandName(row.brand);
    const key = brandKey(name);
    await client.query(
      `INSERT INTO brands (id, name, name_key) VALUES ($1, $2, $3)
       ON CONFLICT (name_key) DO NOTHING`,
      [generateUUIDv7(), name, key]
    );
    await client.query(
      `UPDATE products SET brand_id = (SELECT id FROM brands WHERE name_key = $1) WHERE id = $2`,
      [key, row.id]
    );
  }

  await client.query('ALTER TABLE products DROP COLUMN brand');
  console.log(`✅ Migrasi merek selesai (${legacy.rowCount} produk diperbarui).`);
}

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

    // 2. Brands Table (Master merek - mencegah input merek berulang)
    //    `name_key` = kunci pembanding ternormalisasi (lihat utils/brand.ts) dengan UNIQUE constraint,
    //    sehingga "Tiga Roda", "tiga-roda", "TIGA RODA" tidak bisa tersimpan dua kali.
    await client.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        name_key VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_name_key ON brands(name_key);
    `);

    // 3. Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        barcode VARCHAR(100),
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
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

    // 3b. Migrasi skema lama: kolom teks `products.brand` -> relasi `products.brand_id`
    await migrateLegacyBrandColumn(client);
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);');

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
