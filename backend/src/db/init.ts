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
      CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active);
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
