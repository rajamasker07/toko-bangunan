import path from 'path';
import { pool, query } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { buildProductPassage } from '../utils/searchSynonyms.js';

export interface CachedVectorItem {
  productId: string;
  vector: Float32Array;
  updatedAt: string;
  passageText: string;
}

export interface SemanticSearchResult {
  productId: string;
  rawScore: number;
  similarityScore: number;
  rank: number;
}

export interface EmbeddingServiceStatus {
  status: 'ready' | 'initializing' | 'downloading' | 'error';
  model_status: 'ready' | 'initializing' | 'downloading' | 'error';
  indexed_products: number;
  total_products: number;
  dimensions: number;
  model_name: string;
  cache_size: number;
  last_reindex_at: string | null;
  error?: string | null;
}

export class EmbeddingService {
  private static extractor: any = null;
  private static isModelLoading = false;
  private static modelStatus: 'ready' | 'initializing' | 'downloading' | 'error' = 'initializing';
  private static modelError: string | null = null;
  private static lastReindexAt: string | null = null;

  // In-Memory Vector Index Cache (Float32Array 384 dimensi, dot product == cosine similarity)
  private static vectorIndex = new Map<string, CachedVectorItem>();

  // LRU Cache untuk kueri pencarian (Max 256 item)
  private static queryCache = new Map<string, { vector: Float32Array; timestamp: number }>();
  private static readonly MAX_QUERY_CACHE = 256;
  private static readonly QUERY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 Menit

  public static readonly MODEL_NAME = 'Xenova/multilingual-e5-small';
  public static readonly DIMENSIONS = 384;
  public static readonly RAW_CUTOFF_FLOOR = 0.765;
  public static readonly RAW_CUTOFF_RELATIVE_GAP = 0.050;

  /**
   * Mengambil pipeline extractor secara lazy dynamic import
   */
  private static async getExtractor() {
    if (this.extractor) return this.extractor;

    if (this.isModelLoading) {
      // Tunggu hingga pemuatan selesai
      while (this.isModelLoading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.extractor) return this.extractor;
    }

    this.isModelLoading = true;
    this.modelStatus = 'downloading';

    try {
      logger.info('AI_EMBEDDING', 'Memuat model transformer Xenova/multilingual-e5-small INT8...');
      const { pipeline, env } = await import('@huggingface/transformers');

      // Tentukan folder cache model lokal agar tersimpan di backend/.cache/models
      const baseDir = process.cwd().endsWith('backend')
        ? process.cwd()
        : path.resolve(process.cwd(), 'backend');
      const cacheDir = path.resolve(baseDir, '.cache', 'models');

      env.cacheDir = cacheDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = true;

      this.extractor = await pipeline('feature-extraction', this.MODEL_NAME, {
        dtype: 'q8',
      });

      this.modelStatus = 'ready';
      this.modelError = null;
      logger.info('AI_EMBEDDING', 'Model embedding siap dan berjalan 100% lokal pada CPU.');
      return this.extractor;
    } catch (err: any) {
      this.modelStatus = 'error';
      this.modelError = err.message || 'Gagal memuat model transformer';
      logger.error('AI_EMBEDDING', `Gagal memuat model: ${this.modelError}`, {}, err);
      throw err;
    } finally {
      this.isModelLoading = false;
    }
  }

  /**
   * Normalisasi L2 pada vektor (memastikan panjang Euclidean = 1)
   */
  public static normalizeL2(vector: Float32Array): Float32Array {
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq) || 1e-12;
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
    return vector;
  }

  /**
   * Menghasilkan embedding teks kueri dengan prefix 'query: '
   */
  public static async embedQuery(rawQuery: string): Promise<Float32Array> {
    const trimmed = rawQuery.trim().toLowerCase();
    const now = Date.now();

    // Cek cache kueri
    const cached = this.queryCache.get(trimmed);
    if (cached && now - cached.timestamp < this.QUERY_CACHE_TTL_MS) {
      return cached.vector;
    }

    const extractor = await this.getExtractor();
    const formatted = `query: ${trimmed}`;
    const output = await extractor(formatted, { pooling: 'mean', normalize: true });
    const vector = this.normalizeL2(new Float32Array(output.data));

    // Simpan ke cache LRU
    if (this.queryCache.size >= this.MAX_QUERY_CACHE) {
      const oldestKey = this.queryCache.keys().next().value;
      if (oldestKey) this.queryCache.delete(oldestKey);
    }
    this.queryCache.set(trimmed, { vector, timestamp: now });

    return vector;
  }

  /**
   * Menghasilkan embedding teks katalog dengan prefix 'passage: '
   */
  public static async embedPassage(passageText: string): Promise<Float32Array> {
    const extractor = await this.getExtractor();
    const text = passageText.startsWith('passage: ') ? passageText : `passage: ${passageText}`;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return this.normalizeL2(new Float32Array(output.data));
  }

  /**
   * Menghitung dot product cosine similarity antara dua vektor ternormalisasi
   */
  public static dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Kalibrasi skor kosinus multilingual-e5 ke rentang manusiawi [0.65, 0.99]
   */
  public static calibrateScore(rawScore: number): number {
    if (rawScore >= 0.995) return 1.0;
    if (rawScore <= this.RAW_CUTOFF_FLOOR) return 0.65;
    const ratio = (rawScore - this.RAW_CUTOFF_FLOOR) / (1.0 - this.RAW_CUTOFF_FLOOR);
    const scaled = 0.65 + ratio * (0.99 - 0.65);
    return Math.round(scaled * 100) / 100;
  }

  /**
   * Mencari produk paling relevan secara semantik menggunakan in-memory cache
   */
  public static async searchSimilarProducts(
    queryText: string,
    options?: {
      candidateIds?: string[];
      topK?: number;
      minSimilarity?: number;
      hasExactMatch?: boolean;
    }
  ): Promise<SemanticSearchResult[]> {
    if (!queryText || !queryText.trim()) return [];

    const topK = options?.topK ?? 10;
    const floorCutoff = options?.hasExactMatch ? 0.805 : (options?.minSimilarity ?? this.RAW_CUTOFF_FLOOR);

    let queryVec: Float32Array;
    try {
      queryVec = await this.embedQuery(queryText);
    } catch (err: any) {
      logger.warn('AI_EMBEDDING', `Gagal menghasilkan embedding kueri, fallback leksikal: ${err.message}`);
      return [];
    }

    const candidateFilter = options?.candidateIds && options.candidateIds.length > 0
      ? new Set(options.candidateIds)
      : null;

    const scored: Array<{ productId: string; rawScore: number }> = [];

    for (const [productId, item] of this.vectorIndex.entries()) {
      if (candidateFilter && !candidateFilter.has(productId)) {
        continue;
      }

      const rawScore = this.dotProduct(queryVec, item.vector);
      if (rawScore >= floorCutoff) {
        scored.push({ productId, rawScore });
      }
    }

    if (scored.length === 0) return [];

    // Urutkan dari skor tertinggi
    scored.sort((a, b) => b.rawScore - a.rawScore);

    const bestScore = scored[0].rawScore;
    const relativeCutoff = bestScore - this.RAW_CUTOFF_RELATIVE_GAP;

    const filtered = scored.filter((item) => item.rawScore >= relativeCutoff).slice(0, topK);

    return filtered.map((item, index) => ({
      productId: item.productId,
      rawScore: item.rawScore,
      similarityScore: this.calibrateScore(item.rawScore),
      rank: index + 1,
    }));
  }

  /**
   * Hidrasi memori cache dari PostgreSQL secara instan (< 50ms)
   */
  public static async reloadIndexFromDb(): Promise<number> {
    try {
      const res = await query(
        `SELECT id, embedding, embedding_text, embedding_updated_at 
         FROM products 
         WHERE embedding IS NOT NULL AND is_active = TRUE`
      );

      this.vectorIndex.clear();

      for (const row of res.rows as Array<{
        id: string;
        embedding: number[] | Float32Array;
        embedding_text: string | null;
        embedding_updated_at: string | null;
      }>) {
        if (!row.embedding) continue;
        const arr = Array.isArray(row.embedding) ? new Float32Array(row.embedding) : row.embedding;
        this.vectorIndex.set(row.id, {
          productId: row.id,
          vector: this.normalizeL2(arr),
          updatedAt: row.embedding_updated_at || new Date().toISOString(),
          passageText: row.embedding_text || '',
        });
      }

      logger.info('AI_EMBEDDING', `Berhasil memuat ${this.vectorIndex.size} vektor produk ke memori.`);
      return this.vectorIndex.size;
    } catch (err: any) {
      logger.error('AI_EMBEDDING', `Gagal memuat index vektor dari DB: ${err.message}`, {}, err);
      return 0;
    }
  }

  /**
   * Sinkronisasi embedding untuk 1 produk spesifik (dipanggil saat create/update)
   */
  public static async syncProductEmbedding(productId: string): Promise<boolean> {
    try {
      const res = await query(
        `
        SELECT 
          p.id, p.name, p.sku, p.barcode, p.description, p.is_active,
          p.material, p.specifications,
          c.name as category_name,
          b.name as brand,
          s.name as supplier_name,
          (
            SELECT json_agg(
              json_build_object(
                'variant_name', pv.variant_name,
                'sku', pv.sku,
                'units', (
                  SELECT json_agg(
                    json_build_object(
                      'unit_name', vu.unit_name,
                      'conversion_factor', vu.conversion_factor
                    )
                  ) FROM variant_units vu WHERE vu.variant_id = pv.id
                )
              )
            ) FROM product_variants pv WHERE pv.product_id = p.id
          ) as variants
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = $1
      `,
        [productId]
      );

      if (res.rows.length === 0) {
        this.removeProductFromIndex(productId);
        return false;
      }

      const product = res.rows[0];

      if (!product.is_active) {
        this.removeProductFromIndex(productId);
        await query(
          `UPDATE products SET embedding = NULL, embedding_text = NULL, embedding_updated_at = NOW() WHERE id = $1`,
          [productId]
        );
        return true;
      }

      const passageText = buildProductPassage(product);
      const vector = await this.embedPassage(passageText);

      // Simpan ke PostgreSQL REAL[] (diterima pg sebagai array float JavaScript)
      const vectorArray = Array.from(vector);
      await query(
        `UPDATE products 
         SET embedding = $1, embedding_text = $2, embedding_updated_at = NOW() 
         WHERE id = $3`,
        [vectorArray, passageText, productId]
      );

      // Simpan ke In-Memory Cache
      this.vectorIndex.set(productId, {
        productId,
        vector,
        updatedAt: new Date().toISOString(),
        passageText,
      });

      return true;
    } catch (err: any) {
      logger.error('AI_EMBEDDING', `Gagal sinkronisasi embedding produk ${productId}: ${err.message}`, {}, err);
      return false;
    }
  }

  /**
   * Hapus produk dari in-memory index
   */
  public static removeProductFromIndex(productId: string): void {
    this.vectorIndex.delete(productId);
  }

  /**
   * Reindex semua produk (CLI atau trigger tombol Admin)
   */
  public static async reindexAllProducts(options?: { force?: boolean }): Promise<{
    total: number;
    indexed: number;
    skipped: number;
    errors: number;
  }> {
    logger.info('AI_EMBEDDING', 'Memulai reindex embedding seluruh produk...');

    const condition = options?.force ? 'p.is_active = TRUE' : 'p.is_active = TRUE AND p.embedding IS NULL';
    const res = await query(`
      SELECT 
        p.id, p.name, p.sku, p.barcode, p.description, p.is_active,
        p.material, p.specifications,
        c.name as category_name,
        b.name as brand,
        s.name as supplier_name,
        (
          SELECT json_agg(
            json_build_object(
              'variant_name', pv.variant_name,
              'sku', pv.sku,
              'units', (
                SELECT json_agg(
                  json_build_object(
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor
                  )
                ) FROM variant_units vu WHERE vu.variant_id = pv.id
              )
            )
          ) FROM product_variants pv WHERE pv.product_id = p.id
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE ${condition}
    `);

    const products = res.rows;
    let indexed = 0;
    let errors = 0;

    for (const p of products) {
      try {
        const passageText = buildProductPassage(p);
        const vector = await this.embedPassage(passageText);
        const vectorArray = Array.from(vector);

        await query(
          `UPDATE products 
           SET embedding = $1, embedding_text = $2, embedding_updated_at = NOW() 
           WHERE id = $3`,
          [vectorArray, passageText, p.id]
        );

        this.vectorIndex.set(p.id, {
          productId: p.id,
          vector,
          updatedAt: new Date().toISOString(),
          passageText,
        });

        indexed++;
      } catch (err: any) {
        errors++;
        logger.error('AI_EMBEDDING', `Gagal index produk ${p.id} (${p.name}): ${err.message}`);
      }
    }

    this.lastReindexAt = new Date().toISOString();
    logger.info('AI_EMBEDDING', `Reindex selesai: ${indexed} berhasil, ${errors} gagal dari ${products.length} produk.`);

    return {
      total: products.length,
      indexed,
      skipped: products.length - (indexed + errors),
      errors,
    };
  }

  /**
   * Inisialisasi service di latar belakang saat server start
   */
  public static async initializeInBackground(): Promise<void> {
    try {
      // 1. Cepat: Hidrasi produk yang sudah memiliki embedding dari database (< 50ms)
      await this.reloadIndexFromDb();

      // 2. Latar Belakang: Cek apakah ada produk aktif tanpa embedding
      const unindexed = await query(
        `SELECT COUNT(*)::int as count FROM products WHERE is_active = TRUE AND embedding IS NULL`
      );
      const count = unindexed.rows[0]?.count || 0;

      if (count > 0) {
        logger.info('AI_EMBEDDING', `Ditemukan ${count} produk tanpa embedding, melakukan backfill otomatis...`);
        // Lakukan backfill non-blocking
        setTimeout(async () => {
          try {
            await this.reindexAllProducts({ force: false });
          } catch (err: any) {
            logger.warn('AI_EMBEDDING', `Pemberitahuan backfill background: ${err.message}`);
          }
        }, 1000);
      } else {
        // Pemanasan awal model jika cache sudah terisi
        setTimeout(async () => {
          try {
            await this.getExtractor();
          } catch {
            // Abaikan jika offline / cold-start
          }
        }, 500);
      }
    } catch (err: any) {
      logger.error('AI_EMBEDDING', `Gagal inisialisasi background embedding service: ${err.message}`, {}, err);
    }
  }

  /**
   * Mengambil status kesehatan mesin AI lokal
   */
  public static async getStatus(): Promise<EmbeddingServiceStatus> {
    let totalProducts = 0;
    try {
      const res = await query(`SELECT COUNT(*)::int as count FROM products WHERE is_active = TRUE`);
      totalProducts = res.rows[0]?.count || 0;
    } catch {
      // Abaikan jika DB belum siap
    }

    const state = this.modelStatus;

    return {
      status: state,
      model_status: state,
      indexed_products: this.vectorIndex.size,
      total_products: totalProducts,
      dimensions: this.DIMENSIONS,
      model_name: this.MODEL_NAME,
      cache_size: this.queryCache.size,
      last_reindex_at: this.lastReindexAt,
      error: this.modelError,
    };
  }
}
