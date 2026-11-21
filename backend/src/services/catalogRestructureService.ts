import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { BrandService } from './brandService.js';
import { EmbeddingService } from './embeddingService.js';
import { logger } from '../utils/logger.js';

export interface MoveVariantsInput {
  source_product_id?: string;
  variant_ids: string[];
  target_product_id: string;
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate' | 'keep';
  notes?: string;
  userId?: string | null;
  createdBy?: string;
  allowDeleteProduct?: boolean;
}

export interface MergeProductInput {
  source_product_id: string;
  target_product_id: string;
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate';
  notes?: string;
  userId?: string | null;
  createdBy?: string;
  allowDeleteProduct?: boolean;
}

export interface PromoteVariantInput {
  variant_id: string;
  new_product_name: string;
  new_product_sku?: string;
  category_id?: string | null;
  brand_id?: string | null;
  brand?: string;
  supplier_id?: string | null;
  description?: string;
  min_stock_alert?: number;
  new_variant_name?: string;
  source_empty_action?: 'delete' | 'deactivate' | 'keep';
  notes?: string;
  userId?: string | null;
  createdBy?: string;
  allowDeleteProduct?: boolean;
}

export interface BulkMergeProductsInput {
  source_product_ids: string[];
  target_mode: 'existing' | 'new';
  // Mode existing:
  target_product_id?: string;
  target_product_name?: string;
  target_standard_variant_name?: string;
  // Mode new:
  new_product_name?: string;
  new_product_sku?: string;
  category_id?: string | null;
  brand_id?: string | null;
  brand?: string;
  supplier_id?: string | null;
  description?: string | null;
  min_stock_alert?: number;
  // Mapping varian & SKU:
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate';
  notes?: string;
  userId?: string | null;
  createdBy?: string;
  allowDeleteProduct?: boolean;
}

export class CatalogRestructureService {
  /**
   * Pindahkan satu atau banyak varian ke produk target secara atomik.
   * Menangani perpindahan foreign-key relasi:
   * - product_variants.product_id
   * - stock_movements.product_id
   * - stock_reservation_items.product_id
   * Dan mencatat jejak audit VARIANT_MOVED di kartu stok.
   */
  static async moveVariants(input: MoveVariantsInput) {
    if (!input.variant_ids || input.variant_ids.length === 0) {
      throw new Error('Pilih minimal satu varian untuk dipindahkan.');
    }
    if (!input.target_product_id) {
      throw new Error('Produk tujuan wajib dipilih.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const actorName = (input.createdBy || 'Admin').slice(0, 100);
      const actorId = input.userId || null;
      const emptyAction = input.source_empty_action || 'deactivate';

      // 1. Fetch & lock produk target
      const targetProdRes = await client.query(
        `SELECT id, name, sku, is_active, has_variants FROM products WHERE id = $1 FOR UPDATE`,
        [input.target_product_id]
      );
      if (targetProdRes.rows.length === 0) {
        throw new Error('Produk tujuan tidak ditemukan.');
      }
      const targetProduct = targetProdRes.rows[0];

      // 2. Fetch & lock varian yang akan dipindahkan beserta data produk asalnya
      const variantsRes = await client.query(
        `SELECT pv.*, p.name as source_product_name, p.id as source_product_id
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         WHERE pv.id = ANY($1::uuid[])
         ORDER BY pv.id ASC
         FOR UPDATE`,
        [input.variant_ids]
      );

      if (variantsRes.rows.length !== input.variant_ids.length) {
        throw new Error('Satu atau lebih varian yang dipilih tidak ditemukan.');
      }

      const variants = variantsRes.rows;

      // Kumpulkan ID produk asal unik
      const sourceProductIds = Array.from(new Set(variants.map((v) => v.source_product_id)));

      // Pastikan tidak ada varian yang sudah berada di produk tujuan
      for (const v of variants) {
        if (v.source_product_id === input.target_product_id) {
          throw new Error(`Varian "${v.variant_name}" sudah berada di produk tujuan "${targetProduct.name}".`);
        }
      }

      // Lock produk-produk sumber secara berurutan untuk mencegah deadlock
      const sortedSourceIds = [...sourceProductIds].sort();
      await client.query(
        `SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`,
        [sortedSourceIds]
      );

      // 3. Ambil varian-varian yang sudah ada di produk tujuan untuk cek duplikasi nama
      const existingTargetVariantsRes = await client.query(
        `SELECT id, variant_name, sku FROM product_variants WHERE product_id = $1`,
        [input.target_product_id]
      );
      const existingTargetVariants = existingTargetVariantsRes.rows;
      const targetVariantNameSet = new Set(
        existingTargetVariants.map((v) => v.variant_name.trim().toLowerCase())
      );

      // Kumpulan nama baru yang sedang diproses di batch ini untuk cegah tabrakan internal
      const batchNamesSet = new Set<string>();

      // Siapkan mapping nama & SKU final
      const variantPlan: Array<{
        variant: any;
        finalName: string;
        finalSku: string;
      }> = [];

      for (const v of variants) {
        const customName = input.rename_map?.[v.id]?.trim();
        const finalName = customName || v.variant_name.trim();

        const customSku = input.sku_map?.[v.id]?.trim();
        const finalSku = customSku || v.sku.trim();

        const nameLower = finalName.toLowerCase();
        if (targetVariantNameSet.has(nameLower) || batchNamesSet.has(nameLower)) {
          throw new Error(
            `Nama varian "${finalName}" sudah ada pada produk tujuan "${targetProduct.name}". Silakan ubah nama varian terlebih dahulu.`
          );
        }
        batchNamesSet.add(nameLower);

        // Jika SKU diubah, cek keunikan di seluruh tabel product_variants
        if (finalSku !== v.sku) {
          const skuConflictRes = await client.query(
            `SELECT id FROM product_variants WHERE LOWER(sku) = LOWER($1) AND id != $2 LIMIT 1`,
            [finalSku, v.id]
          );
          if (skuConflictRes.rows.length > 0) {
            throw new Error(`SKU "${finalSku}" sudah digunakan oleh varian lain.`);
          }
        }

        variantPlan.push({ variant: v, finalName, finalSku });
      }

      // 4. Eksekusi perpindahan per varian
      for (const item of variantPlan) {
        const v = item.variant;

        // a. Pindahkan variant ke target_product_id
        await client.query(
          `UPDATE product_variants
           SET product_id = $1,
               variant_name = $2,
               sku = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [input.target_product_id, item.finalName, item.finalSku, v.id]
        );

        // b. Pindahkan relasi stock_movements
        await client.query(
          `UPDATE stock_movements
           SET product_id = $1
           WHERE variant_id = $2`,
          [input.target_product_id, v.id]
        );

        // c. Pindahkan relasi stock_reservation_items
        await client.query(
          `UPDATE stock_reservation_items
           SET product_id = $1
           WHERE variant_id = $2`,
          [input.target_product_id, v.id]
        );

        // d. Buat jejak audit perpindahan di kartu stok (stock_movements)
        const moveId = generateUUIDv7();
        const refNo = `MOV-${Date.now().toString().slice(-6)}`;
        const userNotes = input.notes ? ` Catatan: ${input.notes.trim()}` : '';
        const auditLog = `Pemindahan varian dari "${v.source_product_name}" ke "${targetProduct.name}".${userNotes}`;

        await client.query(
          `INSERT INTO stock_movements (
            id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
          ) VALUES ($1, $2, $3, 'VARIANT_MOVED', $4, 0, $4, $5, $6, $7, $8)`,
          [
            moveId,
            input.target_product_id,
            v.id,
            Number(v.current_stock) || 0,
            refNo,
            auditLog,
            actorName,
            actorId,
          ]
        );
      }

      // 5. Periksa dan tangani sisa varian pada masing-masing produk sumber
      const deletedSourceIds: string[] = [];
      const updatedSourceIds: string[] = [];

      for (const sourceId of sourceProductIds) {
        const countRes = await client.query(
          `SELECT COUNT(*)::int as count FROM product_variants WHERE product_id = $1`,
          [sourceId]
        );
        const remainingCount = countRes.rows[0]?.count || 0;

        if (remainingCount === 0) {
          // Produk sumber sudah tidak memiliki varian lagi
          if (emptyAction === 'delete' && input.allowDeleteProduct) {
            await client.query(`DELETE FROM products WHERE id = $1`, [sourceId]);
            deletedSourceIds.push(sourceId);
          } else {
            // Nonaktifkan produk sumber agar tidak mengotori katalog aktif
            await client.query(
              `UPDATE products
               SET is_active = FALSE, has_variants = FALSE, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [sourceId]
            );
            updatedSourceIds.push(sourceId);
          }
        } else {
          // Produk sumber masih memiliki varian
          await client.query(
            `UPDATE products
             SET has_variants = ($1 > 1), updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [remainingCount, sourceId]
          );
          updatedSourceIds.push(sourceId);
        }
      }

      // 6. Update status has_variants pada produk target
      const targetCountRes = await client.query(
        `SELECT COUNT(*)::int as count FROM product_variants WHERE product_id = $1`,
        [input.target_product_id]
      );
      const targetTotalVariants = targetCountRes.rows[0]?.count || 0;
      await client.query(
        `UPDATE products
         SET has_variants = ($1 > 1), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [targetTotalVariants, input.target_product_id]
      );

      await client.query('COMMIT');

      // 7. Latar belakang: Sinkronisasi embedding AI pencarian semantik
      EmbeddingService.syncProductEmbedding(input.target_product_id).catch((err) => {
        logger.warn('AI_EMBEDDING', `Sync embedding target moveVariants error: ${err.message}`);
      });

      for (const dId of deletedSourceIds) {
        EmbeddingService.removeProductFromIndex(dId);
      }
      for (const uId of updatedSourceIds) {
        EmbeddingService.syncProductEmbedding(uId).catch((err) => {
          logger.warn('AI_EMBEDDING', `Sync embedding source moveVariants error: ${err.message}`);
        });
      }

      return {
        success: true,
        moved_count: variantPlan.length,
        target_product_id: input.target_product_id,
        target_product_name: targetProduct.name,
        target_variant_count: targetTotalVariants,
        deleted_source_product_ids: deletedSourceIds,
        updated_source_product_ids: updatedSourceIds,
        message: `${variantPlan.length} varian berhasil dipindahkan ke "${targetProduct.name}".`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gabungkan seluruh varian dari satu produk sumber ke dalam produk target.
   * Produk sumber kemudian dihapus atau dinonaktifkan sesuai pilihan user.
   */
  static async mergeProduct(input: MergeProductInput) {
    if (!input.source_product_id) {
      throw new Error('Produk asal (sumber) wajib dipilih.');
    }
    if (!input.target_product_id) {
      throw new Error('Produk tujuan (target) wajib dipilih.');
    }
    if (input.source_product_id === input.target_product_id) {
      throw new Error('Produk asal dan produk tujuan tidak boleh sama.');
    }

    // Ambil semua varian dari produk sumber
    const variantsRes = await query(
      `SELECT id FROM product_variants WHERE product_id = $1 ORDER BY created_at ASC`,
      [input.source_product_id]
    );

    const variantIds = variantsRes.rows.map((r) => r.id);

    // Jika produk sumber tidak memiliki varian sama sekali
    if (variantIds.length === 0) {
      if (input.source_empty_action === 'delete' && input.allowDeleteProduct) {
        await query(`DELETE FROM products WHERE id = $1`, [input.source_product_id]);
        EmbeddingService.removeProductFromIndex(input.source_product_id);
      } else {
        await query(
          `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [input.source_product_id]
        );
        EmbeddingService.syncProductEmbedding(input.source_product_id).catch(() => {});
      }
      return {
        success: true,
        moved_count: 0,
        target_product_id: input.target_product_id,
        deleted_source_product_ids: input.source_empty_action === 'delete' ? [input.source_product_id] : [],
        updated_source_product_ids: input.source_empty_action !== 'delete' ? [input.source_product_id] : [],
        message: 'Produk sumber kosong berhasil digabungkan.',
      };
    }

    // Pindahkan seluruh varian menggunakan moveVariants
    return this.moveVariants({
      source_product_id: input.source_product_id,
      variant_ids: variantIds,
      target_product_id: input.target_product_id,
      rename_map: input.rename_map,
      sku_map: input.sku_map,
      source_empty_action: input.source_empty_action || 'deactivate',
      notes: input.notes,
      userId: input.userId,
      createdBy: input.createdBy,
      allowDeleteProduct: input.allowDeleteProduct,
    });
  }

  /**
   * Promosikan (pisahkan) sebuah varian menjadi produk mandiri baru.
   */
  static async promoteVariant(input: PromoteVariantInput) {
    if (!input.variant_id) {
      throw new Error('Varian yang ingin dipromosikan wajib dipilih.');
    }
    if (!input.new_product_name || !input.new_product_name.trim()) {
      throw new Error('Nama produk baru wajib diisi.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const actorName = (input.createdBy || 'Admin').slice(0, 100);
      const actorId = input.userId || null;
      const emptyAction = input.source_empty_action || 'deactivate';

      // 1. Ambil & lock varian serta produk sumber
      const vRes = await client.query(
        `SELECT pv.*, p.name as source_product_name, p.id as source_product_id, p.category_id, p.brand_id, p.supplier_id
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         WHERE pv.id = $1
         FOR UPDATE`,
        [input.variant_id]
      );

      if (vRes.rows.length === 0) {
        throw new Error('Varian tidak ditemukan.');
      }
      const variant = vRes.rows[0];
      const sourceProductId = variant.source_product_id;

      // Lock produk sumber
      await client.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [sourceProductId]);

      // 2. Tentukan SKU produk baru jika belum ada
      const newProductSku =
        input.new_product_sku?.trim() ||
        variant.sku.trim() ||
        `PRD-${Date.now().toString().slice(-6)}`;

      // Cek apakah SKU produk bentrok
      const skuCheck = await client.query(
        `SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1`,
        [newProductSku]
      );
      if (skuCheck.rows.length > 0) {
        throw new Error(`SKU Produk "${newProductSku}" sudah digunakan oleh produk lain.`);
      }

      // Resolve brand_id jika brand name diberikan
      let brandId: string | null = input.brand_id || variant.brand_id || null;
      if (input.brand && !input.brand_id) {
        const resolved = await BrandService.findOrCreate(input.brand, client);
        brandId = resolved.brand.id;
      }

      const newProductId = generateUUIDv7();
      const categoryId = input.category_id !== undefined ? input.category_id : variant.category_id;
      const supplierId = input.supplier_id !== undefined ? input.supplier_id : variant.supplier_id;
      const description = input.description !== undefined ? input.description : null;
      const minStockAlert = input.min_stock_alert !== undefined ? Number(input.min_stock_alert) : 5;

      // 3. Buat produk baru
      await client.query(
        `INSERT INTO products (
          id, name, sku, category_id, brand_id, supplier_id, description, min_stock_alert, is_active, has_variants
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, FALSE)`,
        [
          newProductId,
          input.new_product_name.trim(),
          newProductSku,
          categoryId,
          brandId,
          supplierId,
          description,
          minStockAlert,
        ]
      );

      // 4. Update varian ke produk baru
      const finalVariantName = input.new_variant_name?.trim() || 'Standar';
      await client.query(
        `UPDATE product_variants
         SET product_id = $1, variant_name = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newProductId, finalVariantName, variant.id]
      );

      // 5. Update referensi stock_movements & stock_reservation_items
      await client.query(
        `UPDATE stock_movements SET product_id = $1 WHERE variant_id = $2`,
        [newProductId, variant.id]
      );
      await client.query(
        `UPDATE stock_reservation_items SET product_id = $1 WHERE variant_id = $2`,
        [newProductId, variant.id]
      );

      // 6. Catat log jejak audit di stock_movements
      const moveId = generateUUIDv7();
      const refNo = `PROM-${Date.now().toString().slice(-6)}`;
      const userNotes = input.notes ? ` Catatan: ${input.notes.trim()}` : '';
      const auditLog = `Pemisahan varian menjadi produk mandiri "${input.new_product_name.trim()}". Asal: "${variant.source_product_name}".${userNotes}`;

      await client.query(
        `INSERT INTO stock_movements (
          id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
        ) VALUES ($1, $2, $3, 'VARIANT_MOVED', $4, 0, $4, $5, $6, $7, $8)`,
        [
          moveId,
          newProductId,
          variant.id,
          Number(variant.current_stock) || 0,
          refNo,
          auditLog,
          actorName,
          actorId,
        ]
      );

      // 7. Cek sisa varian pada produk sumber
      const countRes = await client.query(
        `SELECT COUNT(*)::int as count FROM product_variants WHERE product_id = $1`,
        [sourceProductId]
      );
      const remainingCount = countRes.rows[0]?.count || 0;

      let sourceDeleted = false;
      if (remainingCount === 0) {
        if (emptyAction === 'delete' && input.allowDeleteProduct) {
          await client.query(`DELETE FROM products WHERE id = $1`, [sourceProductId]);
          sourceDeleted = true;
        } else {
          await client.query(
            `UPDATE products
             SET is_active = FALSE, has_variants = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [sourceProductId]
          );
        }
      } else {
        await client.query(
          `UPDATE products
           SET has_variants = ($1 > 1), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [remainingCount, sourceProductId]
        );
      }

      await client.query('COMMIT');

      // 8. Latar belakang: Sinkronisasi embedding AI
      EmbeddingService.syncProductEmbedding(newProductId).catch((err) => {
        logger.warn('AI_EMBEDDING', `Sync embedding new promoted product error: ${err.message}`);
      });

      if (sourceDeleted) {
        EmbeddingService.removeProductFromIndex(sourceProductId);
      } else {
        EmbeddingService.syncProductEmbedding(sourceProductId).catch((err) => {
          logger.warn('AI_EMBEDDING', `Sync embedding source promoted product error: ${err.message}`);
        });
      }

      return {
        success: true,
        new_product_id: newProductId,
        new_product_name: input.new_product_name.trim(),
        variant_id: variant.id,
        source_product_deleted: sourceDeleted,
        message: `Varian "${variant.variant_name}" berhasil dipisahkan menjadi produk baru "${input.new_product_name.trim()}".`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gabungkan banyak produk sekaligus (bulk merge) ke dalam satu produk target.
   * Mendukung 2 mode target:
   * 1. 'existing': Menggabungkan ke produk yang sudah ada di katalog.
   * 2. 'new': Membuat master produk induk baru dan menyerap semua produk terpilih sebagai variannya.
   */
  static async bulkMergeProducts(input: BulkMergeProductsInput) {
    if (!Array.isArray(input.source_product_ids) || input.source_product_ids.length === 0) {
      throw new Error('Pilih minimal satu produk sumber untuk digabungkan.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const actorName = (input.createdBy || 'Admin').slice(0, 100);
      const actorId = input.userId || null;
      const emptyAction = input.source_empty_action || 'deactivate';

      let targetProductId = input.target_product_id?.trim() || '';
      let targetProductName = '';

      // Tentukan produk target berdasarkan mode
      if (input.target_mode === 'new') {
        if (!input.new_product_name || !input.new_product_name.trim()) {
          throw new Error('Nama produk induk baru wajib diisi.');
        }

        let targetSku = input.new_product_sku?.trim();
        if (!targetSku) {
          targetSku = `PRD-${Date.now().toString().slice(-6)}`;
        }

        // Cek SKU produk induk baru
        const skuCheck = await client.query(
          `SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1`,
          [targetSku]
        );
        if (skuCheck.rows.length > 0) {
          targetSku = `${targetSku}-${Date.now().toString().slice(-3)}`;
        }

        let brandId = input.brand_id || null;
        if (input.brand && !input.brand_id) {
          const resolved = await BrandService.findOrCreate(input.brand, client);
          brandId = resolved.brand.id;
        }

        targetProductId = generateUUIDv7();
        targetProductName = input.new_product_name.trim();

        await client.query(
          `INSERT INTO products (
            id, name, sku, category_id, brand_id, supplier_id, description, min_stock_alert, is_active, has_variants
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE)`,
          [
            targetProductId,
            targetProductName,
            targetSku,
            input.category_id || null,
            brandId,
            input.supplier_id || null,
            input.description || null,
            input.min_stock_alert !== undefined ? Number(input.min_stock_alert) : 5,
          ]
        );
      } else {
        // Mode 'existing'
        if (!targetProductId) {
          throw new Error('Produk tujuan wajib dipilih.');
        }

        const targetRes = await client.query(
          `SELECT id, name, sku, is_active, has_variants FROM products WHERE id = $1 FOR UPDATE`,
          [targetProductId]
        );
        if (targetRes.rows.length === 0) {
          throw new Error('Produk tujuan tidak ditemukan.');
        }

        targetProductName = targetRes.rows[0].name;

        // Opsi rename produk target jika diberikan
        if (input.target_product_name?.trim() && input.target_product_name.trim() !== targetProductName) {
          await client.query(
            `UPDATE products SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [input.target_product_name.trim(), targetProductId]
          );
          targetProductName = input.target_product_name.trim();
        }

        // Opsi rename varian 'Standar' produk target jika diberikan
        if (input.target_standard_variant_name?.trim()) {
          await client.query(
            `UPDATE product_variants
             SET variant_name = $1, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $2
               AND (LOWER(variant_name) = 'standar' OR (SELECT COUNT(*) FROM product_variants WHERE product_id = $2) = 1)`,
            [input.target_standard_variant_name.trim(), targetProductId]
          );
        }
      }

      // Bersihkan source_product_ids: hindari duplikat dan jangan sertakan targetProductId
      const rawSourceIds = Array.from(new Set(input.source_product_ids.map((id) => String(id).trim()))).filter(
        Boolean
      );
      const cleanSourceIds = rawSourceIds.filter((id) => id !== targetProductId);

      if (cleanSourceIds.length === 0) {
        throw new Error('Tidak ada produk sumber yang valid untuk digabungkan.');
      }

      // Lock seluruh produk sumber secara terurut untuk cegah deadlock
      const sortedSourceIds = [...cleanSourceIds].sort();
      await client.query(
        `SELECT id, name FROM products WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`,
        [sortedSourceIds]
      );

      // Ambil seluruh varian dari produk sumber
      const sourceVariantsRes = await client.query(
        `SELECT pv.*, p.name as source_product_name, p.id as source_product_id
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         WHERE pv.product_id = ANY($1::uuid[])
         ORDER BY pv.id ASC
         FOR UPDATE`,
        [sortedSourceIds]
      );
      const sourceVariants = sourceVariantsRes.rows;

      // Ambil varian yang sudah ada di produk target untuk pengecekan bentrok nama
      const targetVariantsRes = await client.query(
        `SELECT id, variant_name, sku FROM product_variants WHERE product_id = $1`,
        [targetProductId]
      );
      const targetVariantNameSet = new Set(
        targetVariantsRes.rows.map((v) => v.variant_name.trim().toLowerCase())
      );
      const batchNamesSet = new Set<string>();

      // Buat rencana mapping nama dan SKU varian
      const variantPlan: Array<{
        variant: any;
        finalName: string;
        finalSku: string;
      }> = [];

      for (const v of sourceVariants) {
        const customName = input.rename_map?.[v.id]?.trim();
        // Smart default: jika varian bernama 'Standar', pakai nama produk asalnya agar lebih deskriptif
        const defaultName =
          v.variant_name.toLowerCase() === 'standar' ? v.source_product_name.trim() : v.variant_name.trim();
        const finalName = customName || defaultName;

        const customSku = input.sku_map?.[v.id]?.trim();
        const finalSku = customSku || v.sku.trim();

        const nameLower = finalName.toLowerCase();
        if (targetVariantNameSet.has(nameLower) || batchNamesSet.has(nameLower)) {
          throw new Error(
            `Nama varian "${finalName}" bentrok dengan varian yang sudah ada pada produk tujuan "${targetProductName}". Silakan sesuaikan nama varian.`
          );
        }
        batchNamesSet.add(nameLower);

        // Jika SKU diubah, cek keunikan di tabel product_variants
        if (finalSku !== v.sku) {
          const skuConflictRes = await client.query(
            `SELECT id FROM product_variants WHERE LOWER(sku) = LOWER($1) AND id != $2 LIMIT 1`,
            [finalSku, v.id]
          );
          if (skuConflictRes.rows.length > 0) {
            throw new Error(`SKU "${finalSku}" sudah digunakan oleh varian lain.`);
          }
        }

        variantPlan.push({ variant: v, finalName, finalSku });
      }

      // Eksekusi perpindahan setiap varian
      for (const item of variantPlan) {
        const v = item.variant;

        await client.query(
          `UPDATE product_variants
           SET product_id = $1, variant_name = $2, sku = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [targetProductId, item.finalName, item.finalSku, v.id]
        );

        await client.query(
          `UPDATE stock_movements SET product_id = $1 WHERE variant_id = $2`,
          [targetProductId, v.id]
        );

        await client.query(
          `UPDATE stock_reservation_items SET product_id = $1 WHERE variant_id = $2`,
          [targetProductId, v.id]
        );

        // Jejak audit di kartu stok
        const moveId = generateUUIDv7();
        const refNo = `BULKMOV-${Date.now().toString().slice(-6)}`;
        const userNotes = input.notes ? ` Catatan: ${input.notes.trim()}` : '';
        const auditLog = `Penggabungan massal produk ke "${targetProductName}". Asal: "${v.source_product_name}".${userNotes}`;

        await client.query(
          `INSERT INTO stock_movements (
            id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
          ) VALUES ($1, $2, $3, 'VARIANT_MOVED', $4, 0, $4, $5, $6, $7, $8)`,
          [
            moveId,
            targetProductId,
            v.id,
            Number(v.current_stock) || 0,
            refNo,
            auditLog,
            actorName,
            actorId,
          ]
        );
      }

      // Periksa dan tangani seluruh produk sumber
      const deletedSourceIds: string[] = [];
      const updatedSourceIds: string[] = [];

      for (const sourceId of cleanSourceIds) {
        const countRes = await client.query(
          `SELECT COUNT(*)::int as count FROM product_variants WHERE product_id = $1`,
          [sourceId]
        );
        const remainingCount = countRes.rows[0]?.count || 0;

        if (remainingCount === 0) {
          if (emptyAction === 'delete' && input.allowDeleteProduct) {
            await client.query(`DELETE FROM products WHERE id = $1`, [sourceId]);
            deletedSourceIds.push(sourceId);
          } else {
            await client.query(
              `UPDATE products
               SET is_active = FALSE, has_variants = FALSE, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [sourceId]
            );
            updatedSourceIds.push(sourceId);
          }
        } else {
          await client.query(
            `UPDATE products
             SET has_variants = ($1 > 1), updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [remainingCount, sourceId]
          );
          updatedSourceIds.push(sourceId);
        }
      }

      // Update flag has_variants pada produk target
      const targetCountRes = await client.query(
        `SELECT COUNT(*)::int as count FROM product_variants WHERE product_id = $1`,
        [targetProductId]
      );
      const targetTotalVariants = targetCountRes.rows[0]?.count || 0;
      await client.query(
        `UPDATE products
         SET has_variants = ($1 > 1), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [targetTotalVariants, targetProductId]
      );

      await client.query('COMMIT');

      // Latar belakang: Sinkronisasi AI embedding
      EmbeddingService.syncProductEmbedding(targetProductId).catch((err) => {
        logger.warn('AI_EMBEDDING', `Sync embedding target bulkMerge error: ${err.message}`);
      });

      for (const dId of deletedSourceIds) {
        EmbeddingService.removeProductFromIndex(dId);
      }
      for (const uId of updatedSourceIds) {
        EmbeddingService.syncProductEmbedding(uId).catch((err) => {
          logger.warn('AI_EMBEDDING', `Sync embedding source bulkMerge error: ${err.message}`);
        });
      }

      return {
        success: true,
        target_product_id: targetProductId,
        target_product_name: targetProductName,
        target_variant_count: targetTotalVariants,
        moved_variants_count: variantPlan.length,
        merged_source_count: cleanSourceIds.length,
        deleted_source_product_ids: deletedSourceIds,
        updated_source_product_ids: updatedSourceIds,
        message: `${cleanSourceIds.length} produk (${variantPlan.length} varian) berhasil digabungkan ke "${targetProductName}".`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
