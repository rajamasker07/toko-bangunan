import { pool } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { brandKey, normalizeBrandName } from '../utils/brand.js';

export async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting database seeder for Toko Bangunan...');
    await client.query('BEGIN');

    // Clean existing tables
    await client.query('TRUNCATE stock_movements, variant_units, product_variants, products, categories CASCADE;');

    // 1. Categories Hierarchy
    // Root Categories
    const catBahanBangunanId = generateUUIDv7();
    const catCatPerlengkapanId = generateUUIDv7();
    const catPipaSanitariId = generateUUIDv7();
    const catKeramikId = generateUUIDv7();
    const catPakuBautId = generateUUIDv7();

    await client.query(`
      INSERT INTO categories (id, name, parent_id, description) VALUES
      ($1, 'Bahan Bangunan Dasar', NULL, 'Material pondasi, semen, bata, pasir, dan besi'),
      ($2, 'Cat & Perlengkapan', NULL, 'Aneka cat dinding, kayu, besi, tiner dan kuas'),
      ($3, 'Pipa & Sanitari', NULL, 'Pipa air PVC, fitting pipa, kran air, dan sanitasi'),
      ($4, 'Keramik & Granit', NULL, 'Penutup lantai dan dinding aneka ukuran'),
      ($5, 'Paku, Mur & Baut', NULL, 'Alat pengikat konstruksi kayu dan beton');
    `, [catBahanBangunanId, catCatPerlengkapanId, catPipaSanitariId, catKeramikId, catPakuBautId]);

    // Sub-Categories Level 2
    const catSemenId = generateUUIDv7();
    const catBesiId = generateUUIDv7();
    const catCatTembokId = generateUUIDv7();
    const catPipaPVCId = generateUUIDv7();

    await client.query(`
      INSERT INTO categories (id, name, parent_id, description) VALUES
      ($1, 'Semen & Mortar', $2, 'Semen portland, semen instan perekat dan acian'),
      ($3, 'Besi & Baja Tulangan', $2, 'Besi beton SNI, hollow, wiremesh, siku'),
      ($4, 'Cat Tembok', $5, 'Cat tembok eksterior dan interior'),
      ($6, 'Pipa PVC', $7, 'Pipa saluran air bersih dan pembuangan');
    `, [catSemenId, catBahanBangunanId, catBesiId, catCatTembokId, catCatPerlengkapanId, catPipaPVCId, catPipaSanitariId]);

    // Sub-Categories Level 3 (Nested grandchild)
    const catSemenPCCId = generateUUIDv7();
    const catPipaAWId = generateUUIDv7();

    await client.query(`
      INSERT INTO categories (id, name, parent_id, description) VALUES
      ($1, 'Semen PCC Standar', $2, 'Semen kemasan sak untuk cor dan plester'),
      ($3, 'Pipa PVC Kelas AW (Tekanan Tinggi)', $4, 'Pipa tebal untuk pompa air dan saluran bertekanan');
    `, [catSemenPCCId, catSemenId, catPipaAWId, catPipaPVCId]);

    // Helper for product insertion
    const addProductWithVariantAndUnits = async (p: {
      name: string;
      sku: string;
      barcode?: string;
      categoryId: string;
      brand: string;
      description: string;
      minStockAlert: number;
      hasVariants: boolean;
      variants: Array<{
        variantName: string;
        sku: string;
        barcode?: string;
        initialStock: number;
        minStock: number;
        units: Array<{
          unitName: string;
          conversionFactor: number;
          isBaseUnit: boolean;
          buyPrice: number;
          sellPrice: number;
          wholesalePrice?: number;
        }>;
      }>;
    }) => {
      let brandId: string | null = null;
      if (p.brand && p.brand.trim()) {
        const bName = normalizeBrandName(p.brand);
        const bKey = brandKey(bName);
        const existing = await client.query('SELECT id FROM brands WHERE name_key = $1', [bKey]);
        if (existing.rows.length > 0) {
          brandId = existing.rows[0].id;
        } else {
          brandId = generateUUIDv7();
          await client.query(
            'INSERT INTO brands (id, name, name_key) VALUES ($1, $2, $3)',
            [brandId, bName, bKey]
          );
        }
      }

      const productId = generateUUIDv7();
      await client.query(`
        INSERT INTO products (id, name, sku, barcode, category_id, brand_id, description, min_stock_alert, has_variants)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `, [productId, p.name, p.sku, p.barcode || null, p.categoryId, brandId, p.description, p.minStockAlert, p.hasVariants]);

      for (const v of p.variants) {
        const variantId = generateUUIDv7();
        await client.query(`
          INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [variantId, productId, v.variantName, v.sku, v.barcode || null, v.initialStock, v.minStock]);

        for (const u of v.units) {
          const unitId = generateUUIDv7();
          await client.query(`
            INSERT INTO variant_units (id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
          `, [unitId, variantId, u.unitName, u.conversionFactor, u.isBaseUnit, u.buyPrice, u.sellPrice, u.wholesalePrice || null]);
        }

        // Add Initial Stock Movement Log
        if (v.initialStock > 0) {
          const moveId = generateUUIDv7();
          await client.query(`
            INSERT INTO stock_movements (id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by)
            VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, 'INIT-STOCK-001', 'Stok awal setup sistem', 'System Admin');
          `, [moveId, productId, variantId, v.initialStock]);
        }
      }
    };

    // Product 1: Semen Tiga Roda (Simple Product - Auto 1 Variant)
    await addProductWithVariantAndUnits({
      name: 'Semen Tiga Roda PCC 50 Kg',
      sku: 'SMN-TGR-50',
      barcode: '899123456001',
      categoryId: catSemenPCCId,
      brand: 'Tiga Roda',
      description: 'Semen portland composite berkualitas tinggi untuk pasangan bata, plesteran, dan cor beton.',
      minStockAlert: 20,
      hasVariants: false,
      variants: [{
        variantName: 'Standar Sak 50kg',
        sku: 'SMN-TGR-50-STD',
        barcode: '899123456001',
        initialStock: 120,
        minStock: 20,
        units: [
          { unitName: 'Sak', conversionFactor: 1, isBaseUnit: true, buyPrice: 63000, sellPrice: 68000, wholesalePrice: 66000 },
          { unitName: 'Truk (200 Sak)', conversionFactor: 200, isBaseUnit: false, buyPrice: 12200000, sellPrice: 13200000, wholesalePrice: 13000000 }
        ]
      }]
    });

    // Product 2: Cat Dulux Catylac (Multi Variant)
    await addProductWithVariantAndUnits({
      name: 'Cat Dulux Catylac Interior Glow',
      sku: 'CAT-DLX-INT',
      barcode: '899789123001',
      categoryId: catCatTembokId,
      brand: 'Dulux',
      description: 'Cat tembok interior dengan teknologi Chroma-Brite menghasilkan warna cerah menawan.',
      minStockAlert: 10,
      hasVariants: true,
      variants: [
        {
          variantName: 'Putih Salju (40118) - 5 Kg',
          sku: 'CAT-DLX-WHT-5KG',
          barcode: '899789123011',
          initialStock: 35,
          minStock: 8,
          units: [
            { unitName: 'Pail / Galon (5kg)', conversionFactor: 1, isBaseUnit: true, buyPrice: 118000, sellPrice: 142000, wholesalePrice: 138000 }
          ]
        },
        {
          variantName: 'Putih Salju (40118) - 25 Kg',
          sku: 'CAT-DLX-WHT-25KG',
          barcode: '899789123012',
          initialStock: 14,
          minStock: 4,
          units: [
            { unitName: 'Pail Besar (25kg)', conversionFactor: 1, isBaseUnit: true, buyPrice: 530000, sellPrice: 615000, wholesalePrice: 595000 }
          ]
        },
        {
          variantName: 'Abu Minimalis (41389) - 5 Kg',
          sku: 'CAT-DLX-GRY-5KG',
          barcode: '899789123013',
          initialStock: 22,
          minStock: 6,
          units: [
            { unitName: 'Pail / Galon (5kg)', conversionFactor: 1, isBaseUnit: true, buyPrice: 122000, sellPrice: 146000, wholesalePrice: 141000 }
          ]
        }
      ]
    });

    // Product 3: Pipa PVC Rucika Standar AW (Multi Variant & Multi Unit)
    await addProductWithVariantAndUnits({
      name: 'Pipa PVC Rucika AW Standard JIS',
      sku: 'PPA-RCK-AW',
      barcode: '899345678001',
      categoryId: catPipaAWId,
      brand: 'Rucika',
      description: 'Pipa uPVC berstandar industri dengan ketahanan tekanan hingga 10 bar. Panjang 4 meter per batang.',
      minStockAlert: 15,
      hasVariants: true,
      variants: [
        {
          variantName: 'Ukuran 1/2 inch (4 Meter)',
          sku: 'PPA-RCK-AW-050',
          barcode: '899345678050',
          initialStock: 65,
          minStock: 15,
          units: [
            { unitName: 'Batang', conversionFactor: 1, isBaseUnit: true, buyPrice: 28000, sellPrice: 35000, wholesalePrice: 33000 },
            { unitName: 'Ikat (10 Batang)', conversionFactor: 10, isBaseUnit: false, buyPrice: 275000, sellPrice: 335000, wholesalePrice: 320000 }
          ]
        },
        {
          variantName: 'Ukuran 3/4 inch (4 Meter)',
          sku: 'PPA-RCK-AW-075',
          barcode: '899345678075',
          initialStock: 50,
          minStock: 15,
          units: [
            { unitName: 'Batang', conversionFactor: 1, isBaseUnit: true, buyPrice: 39000, sellPrice: 47000, wholesalePrice: 44500 },
            { unitName: 'Ikat (10 Batang)', conversionFactor: 10, isBaseUnit: false, buyPrice: 380000, sellPrice: 450000, wholesalePrice: 430000 }
          ]
        },
        {
          variantName: 'Ukuran 1 inch (4 Meter)',
          sku: 'PPA-RCK-AW-100',
          barcode: '899345678100',
          initialStock: 42,
          minStock: 12,
          units: [
            { unitName: 'Batang', conversionFactor: 1, isBaseUnit: true, buyPrice: 52000, sellPrice: 63000, wholesalePrice: 60000 }
          ]
        }
      ]
    });

    // Product 4: Besi Beton Ulir 10mm SNI (LOW STOCK EXAMPLE to show alerts!)
    await addProductWithVariantAndUnits({
      name: 'Besi Beton Ulir 10mm SNI TS 280',
      sku: 'BSI-ULR-10MM',
      barcode: '899234567010',
      categoryId: catBesiId,
      brand: 'Krakatau Steel',
      description: 'Besi tulangan sirip ulir berstandar SNI untuk struktur pondasi dan kolom gedung.',
      minStockAlert: 25,
      hasVariants: false,
      variants: [{
        variantName: 'Batang 12 Meter',
        sku: 'BSI-ULR-10MM-12M',
        barcode: '899234567010',
        initialStock: 4, // <-- Notice: only 4 left, minStock is 25 (CRITICAL LOW STOCK)
        minStock: 25,
        units: [
          { unitName: 'Batang (12m)', conversionFactor: 1, isBaseUnit: true, buyPrice: 74000, sellPrice: 85000, wholesalePrice: 82000 },
          { unitName: 'Ikat (100 Batang)', conversionFactor: 100, isBaseUnit: false, buyPrice: 7200000, sellPrice: 8100000, wholesalePrice: 7900000 }
        ]
      }]
    });

    // Product 5: Paku Kayu Campur
    await addProductWithVariantAndUnits({
      name: 'Paku Kayu Baja Putih',
      sku: 'PKU-KYU-001',
      barcode: '899887766554',
      categoryId: catPakuBautId,
      brand: 'Bintang Super',
      description: 'Paku kayu konstruksi kuat tidak mudah bengkok.',
      minStockAlert: 10,
      hasVariants: true,
      variants: [
        {
          variantName: 'Ukuran 5 cm (2 inch)',
          sku: 'PKU-KYU-5CM',
          initialStock: 28,
          minStock: 10,
          units: [
            { unitName: 'Kg', conversionFactor: 1, isBaseUnit: true, buyPrice: 16000, sellPrice: 20000, wholesalePrice: 19000 },
            { unitName: 'Dus (25 Kg)', conversionFactor: 25, isBaseUnit: false, buyPrice: 385000, sellPrice: 470000, wholesalePrice: 450000 }
          ]
        },
        {
          variantName: 'Ukuran 7 cm (3 inch)',
          sku: 'PKU-KYU-7CM',
          initialStock: 18,
          minStock: 10,
          units: [
            { unitName: 'Kg', conversionFactor: 1, isBaseUnit: true, buyPrice: 16500, sellPrice: 21000, wholesalePrice: 19500 },
            { unitName: 'Dus (25 Kg)', conversionFactor: 25, isBaseUnit: false, buyPrice: 395000, sellPrice: 490000, wholesalePrice: 465000 }
          ]
        }
      ]
    });

    await client.query('COMMIT');
    console.log('✅ Seeding completed with realistic building materials data!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js')) {
  seedDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
