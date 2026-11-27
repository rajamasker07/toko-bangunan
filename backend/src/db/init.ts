import type { PoolClient } from 'pg';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { brandKey, normalizeBrandName } from '../utils/brand.js';
import { generateRandomPassword, hashPassword } from '../utils/password.js';
import { ALL_PERMISSIONS } from '../types/auth.js';
import { DEFAULT_ROLE_PERMISSIONS, syncRolesCacheFromDb } from '../config/rbac.js';

async function columnExists(client: PoolClient, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Buat akun Owner awal secara aman jika tabel `users` masih kosong.
 * - Jika `BOOTSTRAP_OWNER_PASSWORD` tersedia di env, pakai password tersebut.
 * - Jika kosong, buat password acak 1x pakai via CSPRNG dan wajibkan ganti password saat login.
 */
export async function ensureBootstrapOwner(
  client: PoolClient
): Promise<{ id: string; full_name: string } | null> {
  const countRes = await client.query('SELECT COUNT(*)::int AS count FROM users');
  if (countRes.rows[0].count > 0) {
    const existingOwner = await client.query(
      `SELECT id, full_name
       FROM users
       WHERE role = 'owner' AND is_active = TRUE
       ORDER BY created_at ASC
       LIMIT 1`
    );
    return (existingOwner.rows[0] as { id: string; full_name: string } | undefined) || null;
  }

  const username = env.bootstrapOwner.username || 'owner';
  const fullName = env.bootstrapOwner.fullName || 'Pemilik Toko';
  const email = env.bootstrapOwner.email || null;
  const isGenerated = !env.bootstrapOwner.password;
  const rawPassword = env.bootstrapOwner.password || generateRandomPassword(12);
  const mustChangePassword = isGenerated ? true : env.bootstrapOwner.forcePasswordChange;
  const passwordHash = await hashPassword(rawPassword);
  const ownerId = generateUUIDv7();

  await client.query(
    `INSERT INTO users (
       id, username, email, full_name, password_hash, role, is_active, must_change_password
     ) VALUES ($1, $2, $3, $4, $5, 'owner', TRUE, $6)
     ON CONFLICT (username) DO NOTHING`,
    [ownerId, username, email, fullName, passwordHash, mustChangePassword]
  );

  if (isGenerated) {
    console.log('🔐 ========================================================');
    console.log(`🔐 Akun Owner awal dibuat: username="${username}"`);
    console.log(`🔐 Password sementara 1x pakai: ${rawPassword}`);
    console.log('🔐 Segera login dan ganti password Anda!');
    console.log('🔐 ========================================================');
  } else {
    console.log(
      `🔐 Akun Owner awal siap: username="${username}" (must_change_password=${mustChangePassword})`
    );
  }

  return { id: ownerId, full_name: fullName };
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

    // 0. Dynamic Roles Table (RBAC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        short_name VARCHAR(50) NOT NULL,
        description TEXT,
        badge_color VARCHAR(30) DEFAULT 'slate' NOT NULL,
        hierarchy_level INT DEFAULT 10 NOT NULL,
        is_system BOOLEAN DEFAULT FALSE NOT NULL,
        permissions JSONB DEFAULT '[]'::jsonb NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_code_lower ON roles (LOWER(code));
      CREATE INDEX IF NOT EXISTS idx_roles_hierarchy ON roles(hierarchy_level DESC);
    `);

    // 0a. Users & Sessions Tables (Authentication & RBAC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(150),
        full_name VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'kasir',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        token_version INTEGER NOT NULL DEFAULT 1,
        last_login_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (LOWER(username));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email)) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    `);

    // 0b. Hapus constraint lama users_role_check / CHECK (role IN (...)) secara aman
    const legacyRoleConstraints = await client.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'users'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%role%'
    `);
    for (const row of legacyRoleConstraints.rows as Array<{ conname: string }>) {
      await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    }

    try {
      await client.query(`ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50)`);
    } catch {
      // Abaikan jika tipe sudah sesuai
    }

    // 0c. Seed 4 role sistem bawaan ('owner', 'admin', 'gudang', 'kasir') hanya jika belum ada.
    //     Menggunakan ON CONFLICT (code) DO NOTHING agar kustomisasi izin/metadata oleh admin
    //     tidak ter-reset saat server restart (Issue #3).
    const defaultRolesSeed = [
      {
        code: 'owner',
        name: 'Owner (Pemilik Toko)',
        short_name: 'Owner',
        description:
          'Akses penuh ke seluruh stok, harga modal, master data, dan manajemen semua akun serta peran.',
        badge_color: 'purple',
        hierarchy_level: 100,
        is_system: true,
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
      },
      {
        code: 'admin',
        name: 'Admin / Kepala Toko',
        short_name: 'Admin',
        description:
          'Mengelola inventaris, harga, master data, reservasi, peran bawahan, serta akun Staf Gudang & Kasir.',
        badge_color: 'blue',
        hierarchy_level: 80,
        is_system: true,
        permissions: DEFAULT_ROLE_PERMISSIONS.admin,
      },
      {
        code: 'gudang',
        name: 'Staf Gudang',
        short_name: 'Gudang',
        description:
          'Menyesuaikan stok, membuat/ubah produk & varian, penyerahan titipan barang, melihat supplier.',
        badge_color: 'amber',
        hierarchy_level: 50,
        is_system: true,
        permissions: DEFAULT_ROLE_PERMISSIONS.gudang,
      },
      {
        code: 'kasir',
        name: 'Kasir / Penjualan',
        short_name: 'Kasir',
        description:
          'Melihat dashboard, katalog produk, riwayat stok, serta membuat & memproses reservasi/titipan barang.',
        badge_color: 'emerald',
        hierarchy_level: 30,
        is_system: true,
        permissions: DEFAULT_ROLE_PERMISSIONS.kasir,
      },
    ];

    for (const roleDef of defaultRolesSeed) {
      await client.query(
        `
        INSERT INTO roles (
          id, code, name, short_name, description, badge_color,
          hierarchy_level, is_system, permissions, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (code) DO NOTHING
      `,
        [
          generateUUIDv7(),
          roleDef.code,
          roleDef.name,
          roleDef.short_name,
          roleDef.description,
          roleDef.badge_color,
          roleDef.hierarchy_level,
          roleDef.is_system,
          JSON.stringify(roleDef.permissions),
        ]
      );
    }

    // Pastikan role 'owner' selalu memiliki daftar ALL_PERMISSIONS terbaru di DB
    // (karena permissions & hierarchy_level owner terkunci di RoleService),
    // tanpa menimpa metadata tampilan (name/short_name/description/badge_color) ataupun role lain.
    await client.query(
      `
      UPDATE roles
      SET permissions = $1::jsonb,
          is_system = TRUE,
          hierarchy_level = 100
      WHERE LOWER(code) = 'owner'
        AND (
          permissions IS DISTINCT FROM $1::jsonb
          OR is_system IS DISTINCT FROM TRUE
          OR hierarchy_level IS DISTINCT FROM 100
        )
      `,
      [JSON.stringify(ALL_PERMISSIONS)]
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(64) NOT NULL,
        user_agent VARCHAR(255),
        ip_address VARCHAR(64),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    `);

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

    // 2b. Suppliers Table (Master Supplier / Pemasok Bahan Bangunan)
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        code VARCHAR(50) UNIQUE,
        contact_person VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(100),
        address TEXT,
        city VARCHAR(100),
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
      CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
    `);

    // 2c. Supplier Sales Table (Sales per Supplier, Multiple Phone Numbers, Active Status)
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_sales (
        id UUID PRIMARY KEY,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        phones JSONB DEFAULT '[]'::jsonb NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_sales_supplier ON supplier_sales(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_sales_active ON supplier_sales(is_active);
    `);

    // 2d. Supplier Invoices Table (Nota Hutang Pembelian & Jatuh Tempo Supplier)
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id UUID PRIMARY KEY,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        invoice_number VARCHAR(100) NOT NULL,
        purchase_order_no VARCHAR(100),
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date ON supplier_invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
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
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    `);

    // 3b. Migrasi skema lama: kolom teks `products.brand` -> relasi `products.brand_id`
    await migrateLegacyBrandColumn(client);
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);');

    // 3c. Tambah kolom products.supplier_id jika belum ada
    if (!(await columnExists(client, 'products', 'supplier_id'))) {
      await client.query('ALTER TABLE products ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;');
      await client.query('CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);');
    }

    // 3d. Kolom dimensi, berat, dan spesifikasi logistik toko bangunan
    if (!(await columnExists(client, 'products', 'weight'))) {
      await client.query('ALTER TABLE products ADD COLUMN weight NUMERIC(12, 3);');
    }
    if (!(await columnExists(client, 'products', 'length'))) {
      await client.query('ALTER TABLE products ADD COLUMN length NUMERIC(12, 2);');
    }
    if (!(await columnExists(client, 'products', 'width'))) {
      await client.query('ALTER TABLE products ADD COLUMN width NUMERIC(12, 2);');
    }
    if (!(await columnExists(client, 'products', 'height'))) {
      await client.query('ALTER TABLE products ADD COLUMN height NUMERIC(12, 2);');
    }
    if (!(await columnExists(client, 'products', 'material'))) {
      await client.query('ALTER TABLE products ADD COLUMN material VARCHAR(150);');
    }
    if (!(await columnExists(client, 'products', 'specifications'))) {
      await client.query('ALTER TABLE products ADD COLUMN specifications TEXT;');
    }

    // 3e. Kolom semantic search & AI embeddings
    if (!(await columnExists(client, 'products', 'embedding'))) {
      await client.query('ALTER TABLE products ADD COLUMN embedding REAL[];');
    }
    if (!(await columnExists(client, 'products', 'embedding_text'))) {
      await client.query('ALTER TABLE products ADD COLUMN embedding_text TEXT;');
    }
    if (!(await columnExists(client, 'products', 'embedding_updated_at'))) {
      await client.query('ALTER TABLE products ADD COLUMN embedding_updated_at TIMESTAMPTZ;');
    }

    // 3f. Kolom daftar nama opsi atribut dinamis per produk (e.g. ['Kemasan', 'Warna'])
    if (!(await columnExists(client, 'products', 'variant_options'))) {
      await client.query("ALTER TABLE products ADD COLUMN variant_options JSONB DEFAULT '[]'::jsonb NOT NULL;");
    }

    // 3. Product Variants Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_name VARCHAR(150) NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        barcode VARCHAR(100),
        current_stock NUMERIC(12, 2) DEFAULT 0 NOT NULL,
        reserved_stock NUMERIC(12, 2) DEFAULT 0 NOT NULL,
        min_stock NUMERIC(12, 2) DEFAULT 5 NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        attributes JSONB DEFAULT '{}'::jsonb NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
      CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active);
    `);

    // 3e. Kolom reserved_stock jika belum ada
    if (!(await columnExists(client, 'product_variants', 'reserved_stock'))) {
      await client.query('ALTER TABLE product_variants ADD COLUMN reserved_stock NUMERIC(12, 2) DEFAULT 0 NOT NULL;');
    }

    // 3g. Kolom nilai atribut dinamis varian jika belum ada (e.g. {"Kemasan": "1kg", "Warna": "Super Black"})
    if (!(await columnExists(client, 'product_variants', 'attributes'))) {
      await client.query("ALTER TABLE product_variants ADD COLUMN attributes JSONB DEFAULT '{}'::jsonb NOT NULL;");
      await client.query("CREATE INDEX IF NOT EXISTS idx_product_variants_attributes ON product_variants USING gin (attributes);");
    }

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

    // 4b. Price History (Audit Trail & Log Perubahan Harga Modal, Jual, dan Grosir)
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        variant_unit_id UUID REFERENCES variant_units(id) ON DELETE SET NULL,
        unit_name VARCHAR(50) NOT NULL,
        supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

        old_buy_price NUMERIC(14, 2),
        new_buy_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
        old_sell_price NUMERIC(14, 2),
        new_sell_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
        old_wholesale_price NUMERIC(14, 2),
        new_wholesale_price NUMERIC(14, 2),

        buy_price_diff NUMERIC(14, 2) NOT NULL DEFAULT 0,
        buy_price_change_pct NUMERIC(8, 2),
        sell_price_diff NUMERIC(14, 2) NOT NULL DEFAULT 0,
        sell_price_change_pct NUMERIC(8, 2),
        old_margin_pct NUMERIC(8, 2),
        new_margin_pct NUMERIC(8, 2),

        change_direction VARCHAR(20) NOT NULL DEFAULT 'INITIAL',
        changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        change_source VARCHAR(40) NOT NULL DEFAULT 'MANUAL_EDIT',
        batch_id UUID,
        reference_no VARCHAR(100),
        reason TEXT,

        discount_pct NUMERIC(6, 2) DEFAULT 0,
        discount_tiers JSONB DEFAULT '[]'::jsonb,
        discount_amount NUMERIC(14, 2) DEFAULT 0,
        tax_pct NUMERIC(6, 2) DEFAULT 0,
        tax_amount NUMERIC(14, 2) DEFAULT 0,

        additional_costs JSONB DEFAULT '[]'::jsonb,
        total_additional_cost NUMERIC(14, 2) DEFAULT 0,

        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by VARCHAR(100) NOT NULL DEFAULT 'Admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_history_variant ON price_history(variant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_history_unit ON price_history(variant_unit_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON price_history(supplier_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_history_user ON price_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_price_history_source ON price_history(change_source);
      CREATE INDEX IF NOT EXISTS idx_price_history_batch ON price_history(batch_id) WHERE batch_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_price_history_created ON price_history(created_at DESC);
    `);

    // Pastikan kolom tambahan tersedia untuk tabel price_history versi lama (kompatibel PostgreSQL 9.5)
    const priceHistoryExtraCols: Array<[string, string]> = [
      ['discount_pct', 'NUMERIC(6, 2) DEFAULT 0'],
      ['discount_tiers', "JSONB DEFAULT '[]'::jsonb"],
      ['discount_amount', 'NUMERIC(14, 2) DEFAULT 0'],
      ['tax_pct', 'NUMERIC(6, 2) DEFAULT 0'],
      ['tax_amount', 'NUMERIC(14, 2) DEFAULT 0'],
      ['additional_costs', "JSONB DEFAULT '[]'::jsonb"],
      ['total_additional_cost', 'NUMERIC(14, 2) DEFAULT 0'],
      ['user_id', 'UUID REFERENCES users(id) ON DELETE SET NULL'],
      ['created_by', "VARCHAR(100) NOT NULL DEFAULT 'Admin'"],
    ];
    for (const [col, def] of priceHistoryExtraCols) {
      if (!(await columnExists(client, 'price_history', col))) {
        await client.query(`ALTER TABLE price_history ADD COLUMN ${col} ${def};`);
      }
    }

    // 4c. Store Settings (Pengaturan Global Toko Bangunan Termasuk Ambang Batas Margin)
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      INSERT INTO store_settings (key, value, description)
      VALUES (
        'margin_alert_threshold',
        '{"threshold_pct": 10.0}'::jsonb,
        'Ambang batas persentase gross margin untuk peringatan margin tipis/kritis'
      )
      ON CONFLICT (key) DO NOTHING;
    `);

    // 4d. Snapshot baseline harga awal untuk varian yang sudah ada jika price_history masih kosong
    const priceHistCount = await client.query('SELECT COUNT(*)::int AS count FROM price_history');
    if (priceHistCount.rows[0].count === 0) {
      const existingUnitsRes = await client.query(`
        SELECT vu.id as unit_id, vu.unit_name, vu.buy_price, vu.sell_price, vu.wholesale_price,
               pv.id as variant_id, pv.product_id, p.supplier_id
        FROM variant_units vu
        JOIN product_variants pv ON vu.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
      `);

      if (existingUnitsRes.rows.length > 0) {
        console.log(`📊 Menyiapkan snapshot baseline awal riwayat harga (${existingUnitsRes.rows.length} satuan)...`);
        for (const row of existingUnitsRes.rows) {
          const buyP = Number(row.buy_price) || 0;
          const sellP = Number(row.sell_price) || 0;
          const wholesaleP = row.wholesale_price !== null && row.wholesale_price !== undefined ? Number(row.wholesale_price) : null;
          const marginPct = sellP > 0 ? Number((((sellP - buyP) / sellP) * 100).toFixed(2)) : null;

          await client.query(`
            INSERT INTO price_history (
              id, product_id, variant_id, variant_unit_id, unit_name, supplier_id,
              old_buy_price, new_buy_price, old_sell_price, new_sell_price, old_wholesale_price, new_wholesale_price,
              buy_price_diff, buy_price_change_pct, sell_price_diff, sell_price_change_pct,
              old_margin_pct, new_margin_pct, change_direction, changed_fields, change_source,
              reason, created_by, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              NULL, $7, NULL, $8, NULL, $9,
              0, NULL, 0, NULL,
              NULL, $10, 'INITIAL', '["buy_price", "sell_price", "wholesale_price"]'::jsonb, 'INITIAL_SNAPSHOT',
              'Baseline inisialisasi awal sistem histori harga', 'System', CURRENT_TIMESTAMP
            )
          `, [
            generateUUIDv7(),
            row.product_id,
            row.variant_id,
            row.unit_id,
            row.unit_name,
            row.supplier_id || null,
            buyP,
            sellP,
            wholesaleP,
            marginPct
          ]);
        }
      }
    }

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

    // 5b. Tambah kolom stock_movements.user_id jika belum ada (kompatibel PostgreSQL 9.5)
    if (!(await columnExists(client, 'stock_movements', 'user_id'))) {
      await client.query(
        'ALTER TABLE stock_movements ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;'
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON stock_movements(user_id);'
      );
    }

    // 6. Data Awal Supplier jika tabel masih kosong
    const suppCount = await client.query('SELECT COUNT(*)::int AS count FROM suppliers');
    if (suppCount.rows[0].count === 0) {
      console.log('🌱 Menyiapkan data awal supplier material bangunan...');
      const seedSuppliers = [
        {
          name: 'PT Indocement Tunggal Prakarsa Tbk',
          code: 'SUP-INDO',
          contact_person: 'Budi Santoso',
          phone: '0812-3456-7890',
          email: 'sales@indocement.co.id',
          address: 'Jl. Jenderal Sudirman Kav. 70-71, Setiabudi',
          city: 'Jakarta Selatan',
          notes: 'Distributor utama Semen Tiga Roda, Mortar TR-10, TR-20'
        },
        {
          name: 'PT Avia Avian Tbk',
          code: 'SUP-AVIA',
          contact_person: 'Dewi Lestari',
          phone: '0813-8888-9999',
          email: 'order@avianbrands.com',
          address: 'Jl. Raya Surabaya-Krian KM 27',
          city: 'Sidoarjo',
          notes: 'Pemasok cat dinding Avitex, No Drop pelapis anti bocor'
        },
        {
          name: 'PT Wahana Duta Jaya Rucika',
          code: 'SUP-RUCI',
          contact_person: 'Hendro Wijaya',
          phone: '0811-2233-4455',
          email: 'distributor@rucika.co.id',
          address: 'Kawasan Industri Jababeka Tahap I, Cikarang',
          city: 'Bekasi',
          notes: 'Pemasok resmi pipa PVC AW/D dan fitting sambungan pipa'
        },
        {
          name: 'CV Baja Sakti Sentosa',
          code: 'SUP-BAJA',
          contact_person: 'Ahmad Fauzi',
          phone: '0819-7766-5544',
          email: 'bajasakti@gmail.com',
          address: 'Jl. Industri Pergudangan Margomulyo Permai',
          city: 'Surabaya',
          notes: 'Penyedia besi beton ulir/polos SNI, wiremesh, dan baja ringan'
        }
      ];

      for (const s of seedSuppliers) {
        await client.query(
          `INSERT INTO suppliers (id, name, code, contact_person, phone, email, address, city, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [generateUUIDv7(), s.name, s.code, s.contact_person, s.phone, s.email, s.address, s.city, s.notes]
        );
      }
    }

    // 6b. Data Awal Sales Tim Supplier jika tabel supplier_sales masih kosong
    const salesCount = await client.query('SELECT COUNT(*)::int AS count FROM supplier_sales');
    if (salesCount.rows[0].count === 0) {
      console.log('🌱 Menyiapkan data awal sales supplier...');
      const existingSuppliers = await client.query('SELECT id, code FROM suppliers');
      const supplierMap = new Map<string, string>();
      for (const row of existingSuppliers.rows as Array<{ id: string; code: string }>) {
        if (row.code) supplierMap.set(row.code, row.id);
      }

      const seedSalesList = [
        {
          code: 'SUP-INDO',
          name: 'Agus Pratama',
          email: 'agus.pratama@indocement.co.id',
          is_active: true,
          phones: [
            { number: '0812-1111-2222', label: 'WhatsApp', is_primary: true },
            { number: '0815-9999-0000', label: 'Telepon Kantor' },
          ],
          notes: 'Sales Lapangan - Semen Portland & TR-10 Mortar Area Barat',
        },
        {
          code: 'SUP-INDO',
          name: 'Siti Rahmawati',
          email: 'siti.rahma@indocement.co.id',
          is_active: true,
          phones: [
            { number: '0813-4444-5555', label: 'WhatsApp', is_primary: true },
          ],
          notes: 'Sales Counter & Order Hotline Proyek',
        },
        {
          code: 'SUP-AVIA',
          name: 'Rian Hidayat',
          email: 'rian.h@avianbrands.com',
          is_active: true,
          phones: [
            { number: '0812-9876-5432', label: 'WhatsApp', is_primary: true },
            { number: '0878-1234-5678', label: 'HP Pribadi' },
          ],
          notes: 'Sales Eksekutif Cat Tembok & Waterproofing No Drop',
        },
        {
          code: 'SUP-AVIA',
          name: 'Doni Prasetyo',
          email: 'doni.p@avianbrands.com',
          is_active: false,
          phones: [
            { number: '0811-0000-1111', label: 'HP Kantor Lama' },
          ],
          notes: 'Nonaktif - Telah mutasi ke cabang lain',
        },
        {
          code: 'SUP-RUCI',
          name: 'Eko Wicaksono',
          email: 'eko.w@rucika.co.id',
          is_active: true,
          phones: [
            { number: '0811-2233-4455', label: 'WhatsApp', is_primary: true },
            { number: '021-8989-1122', label: 'Kantor Jababeka' },
          ],
          notes: 'Sales Spesialis Pipa PVC, Fitting & Talang Air',
        },
        {
          code: 'SUP-BAJA',
          name: 'Bambang Sudiro',
          email: 'bambang.bajasakti@gmail.com',
          is_active: true,
          phones: [
            { number: '0818-3333-2222', label: 'WhatsApp', is_primary: true },
            { number: '0812-5555-6666', label: 'Nomor Alternatif' },
          ],
          notes: 'Penanggung Jawab Order Besi Beton Ulir, Wiremesh & Kanal C',
        },
      ];

      for (const item of seedSalesList) {
        const suppId = supplierMap.get(item.code);
        if (suppId) {
          await client.query(
            `INSERT INTO supplier_sales (id, supplier_id, name, email, is_active, phones, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              generateUUIDv7(),
              suppId,
              item.name,
              item.email,
              item.is_active,
              JSON.stringify(item.phones),
              item.notes,
            ]
          );
        }
      }
    }

    // 7. Master Units Table (Satuan Barang)
    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id UUID PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        name_key VARCHAR(50) UNIQUE NOT NULL,
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_units_name_key ON units(name_key);
    `);

    // Inisialisasi daftar satuan default toko bangunan jika masih kosong
    const unitCountRes = await client.query('SELECT COUNT(*)::int AS count FROM units');
    if (unitCountRes.rows[0].count === 0) {
      console.log('🌱 Menyiapkan master data satuan bahan bangunan...');
      const defaultUnits = [
        { name: 'Sak', description: 'Semen, Mortar, Pasir Silika' },
        { name: 'Dus', description: 'Keramik, Granite, Baut/Mur' },
        { name: 'Batang', description: 'Pipa PVC, Besi Beton, Hollow, Baja Ringan' },
        { name: 'Pail', description: 'Cat Tembok Besar 20-25kg, Waterproofing' },
        { name: 'Galon', description: 'Cat Tembok Sedang 4-5kg' },
        { name: 'Pcs', description: 'Buah / Satuan Terkecil / Keran / Stop Kontak' },
        { name: 'Meter', description: 'Kabel Listrik, Selang Air, Tali Tambang' },
        { name: 'Roll', description: 'Kawat Harmonika, Karpet Talang, Wiremesh' },
        { name: 'Kg', description: 'Paku Kayu/Baja, Pasir Ecer, Kawat Bendrat' },
        { name: 'Lembar', description: 'Triplek, GRC Board, Seng, Spandek' },
        { name: 'Truk', description: 'Pasir Cor, Batu Split, Bata Ringan 1 Dump Truk' },
        { name: 'Pick Up', description: 'Pasir, Bata Merah 1 Mobil Pick Up' },
        { name: 'Ikat', description: 'Besi Beton, Kayu Kaso, Reng' },
        { name: 'Bungkus', description: 'Fisher, Skrup Gypsum, Paku Payung' },
        { name: 'Kaleng', description: 'Cat Semprot, Thinner, Lem Fox' },
        { name: 'Koli', description: 'Paket / Dus Besar Grosir' },
        { name: 'Botol', description: 'Sealant Silicone, Lem Botol' },
        { name: 'Set', description: 'Kunci Pintu, Engsel, Alat Pertukangan' },
        { name: 'Kotak', description: 'Kemasan Box Kecil' },
        { name: 'Papan', description: 'Kayu Papan Kamper/Meranti' },
      ];

      for (const u of defaultUnits) {
        const key = u.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        await client.query(
          `INSERT INTO units (id, name, name_key, description, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (name_key) DO NOTHING`,
          [generateUUIDv7(), u.name, key, u.description]
        );
      }

      // Migrasi satuan lama yang pernah dipakai di variant_units
      const legacyUnitsRes = await client.query(`
        SELECT DISTINCT TRIM(vu.unit_name) as unit_name
        FROM variant_units vu
        WHERE vu.unit_name IS NOT NULL AND TRIM(vu.unit_name) <> ''
          AND LOWER(REGEXP_REPLACE(TRIM(vu.unit_name), '[^a-zA-Z0-9]', '', 'g')) NOT IN (SELECT name_key FROM units)
      `);

      for (const row of legacyUnitsRes.rows as Array<{ unit_name: string }>) {
        const key = row.unit_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        await client.query(
          `INSERT INTO units (id, name, name_key, description, is_active)
           VALUES ($1, $2, $3, 'Satuan dari produk', TRUE)
           ON CONFLICT (name_key) DO NOTHING`,
          [generateUUIDv7(), row.unit_name.trim(), key]
        );
      }
    }

    // 8. Stock Reservations (Sistem Titip Barang & Reservasi Stok Pelanggan)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id UUID PRIMARY KEY,
        reservation_code VARCHAR(50) UNIQUE NOT NULL,
        invoice_no VARCHAR(100),
        customer_name VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(50),
        customer_address TEXT,
        status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
        pickup_deadline TIMESTAMPTZ NOT NULL,
        notes TEXT,
        created_by VARCHAR(100) DEFAULT 'Admin',
        completed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        cancel_reason TEXT,
        settlement_type VARCHAR(50),
        settlement_notes TEXT,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_deadline ON stock_reservations(pickup_deadline);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_code ON stock_reservations(reservation_code);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_created ON stock_reservations(created_at DESC);
    `);

    // 8a. Kolom settlement_type, settlement_notes, closed_at jika belum ada
    if (!(await columnExists(client, 'stock_reservations', 'settlement_type'))) {
      await client.query('ALTER TABLE stock_reservations ADD COLUMN settlement_type VARCHAR(50);');
    }
    if (!(await columnExists(client, 'stock_reservations', 'settlement_notes'))) {
      await client.query('ALTER TABLE stock_reservations ADD COLUMN settlement_notes TEXT;');
    }
    if (!(await columnExists(client, 'stock_reservations', 'closed_at'))) {
      await client.query('ALTER TABLE stock_reservations ADD COLUMN closed_at TIMESTAMPTZ;');
    }

    // 8b. Stock Reservation Items (Rincian barang & unit yang ditahan)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_reservation_items (
        id UUID PRIMARY KEY,
        reservation_id UUID NOT NULL REFERENCES stock_reservations(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id),
        variant_id UUID NOT NULL REFERENCES product_variants(id),
        unit_name VARCHAR(50) NOT NULL,
        conversion_factor NUMERIC(12, 4) DEFAULT 1 NOT NULL,
        qty_ordered_unit NUMERIC(12, 2) NOT NULL,
        qty_reserved_base NUMERIC(12, 2) NOT NULL,
        qty_picked_up_base NUMERIC(12, 2) DEFAULT 0 NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stock_reservation_items_res ON stock_reservation_items(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_stock_reservation_items_variant ON stock_reservation_items(variant_id);
      CREATE INDEX IF NOT EXISTS idx_stock_reservation_items_product ON stock_reservation_items(product_id);
    `);

    // 8c. Stock Reservation Pickups (Log Riwayat Pengambilan Barang Bertahap / Penuh)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_reservation_pickups (
        id UUID PRIMARY KEY,
        reservation_id UUID NOT NULL REFERENCES stock_reservations(id) ON DELETE CASCADE,
        receiver_name VARCHAR(150) NOT NULL,
        vehicle_plate VARCHAR(50),
        notes TEXT,
        handed_by VARCHAR(100) DEFAULT 'Admin',
        items JSONB NOT NULL,
        picked_up_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_reservation_pickups_res ON stock_reservation_pickups(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_stock_reservation_pickups_date ON stock_reservation_pickups(picked_up_at DESC);
    `);

    // 8d. Tambah kolom stock_reservation_pickups.user_id jika belum ada (kompatibel PostgreSQL 9.5)
    if (!(await columnExists(client, 'stock_reservation_pickups', 'user_id'))) {
      await client.query(
        'ALTER TABLE stock_reservation_pickups ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;'
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_stock_reservation_pickups_user ON stock_reservation_pickups(user_id);'
      );
    }

    // 9. Bootstrap akun Owner awal jika tabel users masih kosong
    await ensureBootstrapOwner(client);

    await client.query('COMMIT');

    // 10. Sinkronisasi cache in-memory peran & hak akses (Dynamic RBAC)
    await syncRolesCacheFromDb();

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
