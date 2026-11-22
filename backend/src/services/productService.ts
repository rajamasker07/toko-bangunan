import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { BrandService } from './brandService.js';
import { EmbeddingService, type SemanticSearchResult } from './embeddingService.js';
import { RerankerService } from './rerankerService.js';
import { buildProductPassage, hasWholeTerm, scoreKeywordMatch } from '../utils/searchSynonyms.js';
import {
  analyzeSearchQuery,
  evaluateAttributeCompatibility,
  isProductHeadCompatible,
} from '../utils/searchQueryAnalyzer.js';
import { logger } from '../utils/logger.js';

type Queryable = Pool | PoolClient;

export interface CreateUnitInput {
  unit_name: string;
  conversion_factor?: number;
  is_base_unit?: boolean;
  buy_price?: number;
  sell_price: number;
  wholesale_price?: number | null;
}

export interface CreateVariantInput {
  variant_name: string;
  sku?: string;
  barcode?: string;
  initial_stock?: number;
  min_stock?: number;
  units: CreateUnitInput[];
}

export interface CreateProductInput {
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string | null;
  brand_id?: string | null; // ID merek dari master `brands`
  brand?: string;           // atau nama merek -> otomatis cari/buat (anti-duplikat)
  supplier_id?: string | null; // ID supplier dari master `suppliers`
  description?: string;
  min_stock_alert?: number;
  has_variants?: boolean;
  // Dimensi & spesifikasi fisik toko bangunan
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  material?: string | null;
  specifications?: string | null;
  // If simple product (has_variants = false)
  initial_stock?: number;
  min_stock?: number;
  base_unit_name?: string;
  buy_price?: number;
  sell_price?: number;
  wholesale_price?: number;
  units?: CreateUnitInput[];
  // If multi-variant (has_variants = true)
  variants?: CreateVariantInput[];
}

/**
 * Menyensor harga beli (buy_price: null) untuk role tanpa izin (kasir, gudang)
 * dan menghapus array vektor mentah (embedding) & embedding_text dari HTTP response
 */
export function sanitizeAndRedactProduct<
  T extends {
    embedding?: any;
    embedding_text?: any;
    variants?: Array<{ units?: Array<Record<string, any>> }>;
  }
>(product: T, includeBuyPrice: boolean): T {
  if (!product) return product;

  // Hapus array vektor mentah (384 float) dan teks passage internal dari payload HTTP
  const { embedding, embedding_text, ...sanitized } = product as any;

  if (includeBuyPrice || !Array.isArray(sanitized?.variants)) {
    return sanitized as T;
  }

  return {
    ...sanitized,
    variants: sanitized.variants.map((variant: any) => ({
      ...variant,
      units: Array.isArray(variant.units)
        ? variant.units.map((unit: any) => ({ ...unit, buy_price: null }))
        : variant.units,
    })),
  } as T;
}

export class ProductService {
  /**
   * List all products with variant counts, total stock, category info, and low stock status
   * Mendukung Hybrid Semantic Search (BM25 Keyword + Xenova/multilingual-e5-small + RRF)
   */
  static async getProducts(
    filters?: {
      search?: string;
      searchMode?: 'hybrid' | 'keyword' | 'semantic';
      mode?: 'hybrid' | 'keyword' | 'semantic';
      categoryId?: string;
      brand?: string;
      stockStatus?: 'all' | 'low' | 'out' | 'normal';
      saleStatus?: 'all' | 'active' | 'inactive';
      limit?: number;
      offset?: number;
      minScore?: number;
    },
    options?: { includeBuyPrice?: boolean; waitForReranker?: boolean }
  ) {
    const searchMode = filters?.searchMode || filters?.mode || 'keyword';
    const rawSearch = (filters?.search || '').trim();
    const isSearching = rawSearch.length > 0;

    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.categoryId) {
      params.push(filters.categoryId);
      // Include child categories recursively
      conditions.push(`p.category_id IN (
        WITH RECURSIVE cat_tree AS (
          SELECT id FROM categories WHERE id = $${params.length}
          UNION ALL
          SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM cat_tree
      )`);
    }

    if (filters?.brand) {
      params.push(filters.brand.toLowerCase());
      conditions.push(`LOWER(b.name) = $${params.length}`);
    }

    if (filters?.saleStatus && filters.saleStatus !== 'all') {
      if (filters.saleStatus === 'active') {
        conditions.push(`p.is_active = TRUE`);
      } else if (filters.saleStatus === 'inactive') {
        conditions.push(`p.is_active = FALSE`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        p.*,
        c.name as category_name,
        b.name as brand,
        s.name as supplier_name,
        s.code as supplier_code,
        COALESCE(SUM(pv.current_stock), 0)::numeric as total_stock,
        COALESCE(SUM(COALESCE(pv.reserved_stock, 0)), 0)::numeric as total_reserved_stock,
        COALESCE(SUM(pv.current_stock - COALESCE(pv.reserved_stock, 0)), 0)::numeric as total_available_stock,
        COUNT(pv.id)::int as variant_count,
        BOOL_OR(pv.current_stock <= pv.min_stock) as has_low_stock,
        BOOL_OR(pv.current_stock = 0) as has_out_of_stock,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv2.id,
              'variant_name', pv2.variant_name,
              'sku', pv2.sku,
              'barcode', pv2.barcode,
              'current_stock', pv2.current_stock,
              'reserved_stock', COALESCE(pv2.reserved_stock, 0),
              'available_stock', (pv2.current_stock - COALESCE(pv2.reserved_stock, 0)),
              'min_stock', pv2.min_stock,
              'is_active', pv2.is_active,
              'units', (
                SELECT json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
                ) FROM variant_units vu WHERE vu.variant_id = pv2.id
              )
            ) ORDER BY pv2.created_at ASC
          )
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      ${whereClause}
      GROUP BY p.id, c.name, b.name, s.name, s.code
      ORDER BY p.created_at DESC
    `;

    const res = await query(sql, params);
    let rows = res.rows;

    if (filters?.stockStatus && filters.stockStatus !== 'all') {
      if (filters.stockStatus === 'low') {
        rows = rows.filter(r => r.has_low_stock && Number(r.total_stock) > 0);
      } else if (filters.stockStatus === 'out') {
        rows = rows.filter(r => Number(r.total_stock) <= 0);
      } else if (filters.stockStatus === 'normal') {
        rows = rows.filter(r => !r.has_low_stock && Number(r.total_stock) > 0);
      }
    }

    // Jika ada parameter kueri pencarian, terapkan Query Intent Routing + Hybrid Gating + RRF + Guard + Reranker
    if (isSearching) {
      const qLower = rawSearch.toLowerCase();
      const productIds = rows.map((r) => r.id);
      const analyzed = analyzeSearchQuery(rawSearch);

      // 1. Keyword scoring (Word-Boundary + Exact Synonyms + Fuzzy Typo; Intent Synonyms hanya untuk hybrid/semantic)
      const kwMap = new Map<
        string,
        {
          score: number;
          directScore: number;
          matchedTerms: string[];
          isExact: boolean;
        }
      >();
      let hasExactMatch = false;
      let strongKwCount = 0;

      for (const p of rows) {
        const kw = scoreKeywordMatch(p, rawSearch, {
          includeIntentSynonyms:
            searchMode !== 'keyword' && analyzed.intentType === 'descriptive_intent',
          includeFuzzy: true,
        });
        const pSku = (p.sku || '').toLowerCase();
        const pBarcode = (p.barcode || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        const variantExact =
          Array.isArray(p.variants) &&
          p.variants.some(
            (v: any) =>
              (v.sku && String(v.sku).toLowerCase() === qLower) ||
              (v.barcode && String(v.barcode).toLowerCase() === qLower)
          );
        const isExact = pSku === qLower || pBarcode === qLower || pName === qLower || variantExact;
        if (isExact) hasExactMatch = true;
        if (isExact || kw.directScore >= 140) strongKwCount++;

        kwMap.set(p.id, {
          score: kw.score,
          directScore: kw.directScore,
          matchedTerms: kw.matchedTerms,
          isExact,
        });
      }

      // 2. Hybrid Gating: Tentukan bobot dinamis, topK, dan Z-score multiplier berdasarkan intentType
      let shouldRunSemantic = searchMode !== 'keyword';
      let wKw = 1.0;
      let wSem = 0.0;
      let semTopK = 12;
      let semZMultiplier = EmbeddingService.Z_SCORE_MULTIPLIER;
      let semRelativeGap = EmbeddingService.RAW_CUTOFF_RELATIVE_GAP;

      if (searchMode === 'hybrid') {
        if (analyzed.intentType === 'code_or_sku') {
          // SKU / Barcode: jangan nyalakan semantik jika sudah ada kecocokan langsung
          shouldRunSemantic = strongKwCount === 0 && !hasExactMatch;
          wKw = 1.0;
          wSem = shouldRunSemantic ? 0.5 : 0.0;
          semTopK = 5;
          semZMultiplier = 2.0;
          semRelativeGap = 0.020;
        } else if (analyzed.intentType === 'short_exact') {
          if (strongKwCount >= 3) {
            wKw = 1.0;
            wSem = 0.35;
            semTopK = 8;
            semZMultiplier = 1.9;
            semRelativeGap = 0.022;
          } else {
            wKw = 1.0;
            wSem = 0.75;
            semTopK = 12;
            semZMultiplier = 1.65;
            semRelativeGap = 0.028;
          }
        } else if (analyzed.intentType === 'attribute_specific') {
          wKw = 1.0;
          wSem = 0.60;
          semTopK = 12;
          semZMultiplier = 1.7;
          semRelativeGap = 0.026;
        } else {
          // descriptive_intent (kueri masalah/kebutuhan >= 2 kata)
          wKw = 0.85;
          wSem = 1.0;
          semTopK = 15;
          semZMultiplier = 1.6;
          semRelativeGap = 0.028;
        }
      } else if (searchMode === 'semantic') {
        wKw = 0.25;
        wSem = 1.0;
        semTopK = 15;
        semZMultiplier = 1.65;
        semRelativeGap = 0.028;
      }

      // 3. Semantic vector search dengan Adaptive Z-Score Cutoff
      const semanticMap = new Map<string, SemanticSearchResult>();
      if (shouldRunSemantic) {
        try {
          const semResults = await EmbeddingService.searchSimilarProducts(rawSearch, {
            candidateIds: productIds,
            topK: semTopK,
            minSimilarity: filters?.minScore,
            hasExactMatch: hasExactMatch || strongKwCount >= 3,
            zMultiplier: semZMultiplier,
            relativeGap: semRelativeGap,
          });
          for (const s of semResults) {
            semanticMap.set(s.productId, s);
          }
        } catch (err: any) {
          logger.warn('AI_EMBEDDING', `Gagal pencarian semantik, melanjutkan dengan leksikal: ${err.message}`);
        }
      }

      // 4. Peringkatkan urutan keyword (Dense Ranking: skor sama mendapat peringkat sama)
      const sortedByKw = [...rows]
        .map((p) => ({ id: p.id, score: kwMap.get(p.id)?.score || 0 }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      const kwRankMap = new Map<string, number>();
      let currentRank = 1;
      for (let i = 0; i < sortedByKw.length; i++) {
        if (i > 0 && sortedByKw[i].score < sortedByKw[i - 1].score) {
          currentRank = i + 1;
        }
        kwRankMap.set(sortedByKw[i].id, currentRank);
      }

      // 5. Hitung Skor RRF + Hard Attribute Guard + Head-Noun Guard
      const k = 60;
      let scoredProducts: Array<any> = [];

      for (const p of rows) {
        const kw = kwMap.get(p.id);
        const sem = semanticMap.get(p.id);
        const kwRank = kwRankMap.get(p.id);
        const semRank = sem?.rank;

        const kwScore = kw?.score || 0;
        const directScore = kw?.directScore || 0;
        const isExact = Boolean(kw?.isExact);

        // Abaikan produk yang sama sekali tidak cocok leksikal maupun semantik
        if (kwScore <= 0 && !sem) {
          continue;
        }

        // Di mode semantic murni: jika tidak lolos semantik DAN hanya kecocokan leksikal lemah, abaikan
        if (searchMode === 'semantic' && !sem && !isExact && directScore < 160) {
          continue;
        }

        // Di mode hybrid saat sudah ada banyak kecocokan leksikal kuat untuk kueri pendek,
        // syaratkan kandidat murni semantik (directScore === 0) punya zScore sangat tinggi
        if (
          searchMode === 'hybrid' &&
          analyzed.intentType === 'short_exact' &&
          strongKwCount >= 3 &&
          kwScore === 0 &&
          sem &&
          sem.zScore < 2.2
        ) {
          continue;
        }

        // Evaluasi Hard Attribute Guard (ukuran/dimensi/berat spesifik seperti 10mm, 1/2", 40kg)
        const variantNamesText = Array.isArray(p.variants)
          ? p.variants.map((v: any) => v.variant_name || '').join(' ')
          : '';
        const productAttrText = `${p.name || ''} ${p.specifications || ''} ${variantNamesText}`;
        const attrCheck = analyzed.hasNumericConstraint
          ? evaluateAttributeCompatibility(analyzed.attributes, productAttrText)
          : { status: 'neutral' as const, matchedCount: 0, conflictCount: 0 };

        if (analyzed.hasNumericConstraint && attrCheck.status === 'conflict' && !isExact) {
          // Drop kandidat murni semantik yang ukurannya bertentangan
          if (directScore === 0 || (searchMode === 'semantic' && !kwRank)) {
            continue;
          }
        }

        // Evaluasi Indonesian Head-Noun Guard (Hukum DM: "cat besi" -> inti "cat", "besi 10mm" -> inti "besi")
        // Menolak produk yang tipe utamanya berbeda (misal "Cat Besi" / "Mata Bor Besi" untuk kueri "besi 10mm")
        let headNounMatched = true;
        if (analyzed.headNoun && analyzed.headNounVariants.length > 0 && !isExact) {
          headNounMatched = isProductHeadCompatible(
            analyzed.headNounVariants,
            p.name || '',
            p.category_name
          );

          // Drop kandidat murni semantik yang tidak cocok kata inti utamanya
          if (!headNounMatched && directScore === 0) {
            continue;
          }
        }

        // Reciprocal Rank Fusion (hitung dengan presisi floating point penuh)
        let rawRrfScore = 0;
        if (kwRank) {
          rawRrfScore += wKw * (1 / (k + kwRank));
        }
        if (semRank) {
          rawRrfScore += wSem * (1 / (k + semRank));
        }

        // Penyesuaian skor dari Hard Attribute Guard
        if (analyzed.hasNumericConstraint) {
          if (attrCheck.status === 'match') {
            rawRrfScore += 0.012;
          } else if (attrCheck.status === 'conflict' && !isExact) {
            rawRrfScore *= 0.25;
          }
        }

        // Penyesuaian skor dari Head-Noun Guard (turunkan drastis jika hanya cocok kata penjelas)
        if (!headNounMatched && !isExact) {
          rawRrfScore *= 0.18;
        }

        // Exact match boost (SKU / Barcode / Nama persis mendapat prioritas tertinggi mutlak)
        if (isExact) {
          rawRrfScore += 1000;
        }

        // Tentukan match_type & similarity_score
        let matchType: 'exact' | 'hybrid' | 'semantic' | 'keyword' = 'keyword';
        let displayScore = 0.70;

        if (isExact) {
          matchType = 'exact';
          displayScore = 1.0;
        } else if (kwScore > 0 && sem) {
          matchType = 'hybrid';
          displayScore = sem.similarityScore;
        } else if (sem) {
          matchType = 'semantic';
          displayScore = sem.similarityScore;
        } else {
          matchType = 'keyword';
          displayScore = Math.min(0.99, Math.round((0.70 + Math.min(kwScore, 300) / 1000) * 100) / 100);
        }

        scoredProducts.push({
          ...p,
          match_type: matchType,
          similarity_score: displayScore,
          rrf_score: Math.round(rawRrfScore * 10000) / 10000,
          _raw_rrf_score: rawRrfScore,
          _kw_score: kwScore,
          _direct_score: directScore,
          _is_exact: isExact,
          _head_noun_matched: headNounMatched,
          _attr_status: attrCheck.status,
          matched_terms: kw?.matchedTerms || [],
        });
      }

      // Post-filter Head-Noun Guard:
      // Jika kueri memiliki Head-Noun (misal "cat besi") dan ada produk yang cocok Head-Noun tersebut,
      // buang kandidat non-eksak yang tidak cocok Head-Noun (misal "Besi Beton") agar tidak mengotori hasil.
      if (analyzed.headNoun && scoredProducts.some((item) => item._head_noun_matched)) {
        scoredProducts = scoredProducts.filter(
          (item) => item._is_exact || item._head_noun_matched
        );
      }

      // Post-filter Hard Attribute Guard:
      // Jika kueri mensyaratkan ukuran spesifik dan ada produk yang ukurannya cocok persis,
      // buang kandidat yang ukurannya jelas bertentangan (misal "pipa 4 inch" tidak menampilkan "pipa 1/2 inch").
      if (
        analyzed.hasNumericConstraint &&
        scoredProducts.some((item) => item._attr_status === 'match')
      ) {
        scoredProducts = scoredProducts.filter(
          (item) => item._is_exact || item._attr_status !== 'conflict'
        );
      }

      const sortScored = (list: Array<any>) => {
        list.sort((a, b) => {
          if (b._raw_rrf_score !== a._raw_rrf_score) {
            return b._raw_rrf_score - a._raw_rrf_score;
          }
          if (b._kw_score !== a._kw_score) {
            return b._kw_score - a._kw_score;
          }
          if ((b.similarity_score || 0) !== (a.similarity_score || 0)) {
            return (b.similarity_score || 0) - (a.similarity_score || 0);
          }
          return a.name.localeCompare(b.name);
        });
      };

      // Urutkan sementara sebelum Tahap 3 (Cross-Encoder Reranker)
      sortScored(scoredProducts);

      // 6. Tahap 3: Local Cross-Encoder Reranker (Two-Stage Retrieval, jika RERANKER_ENABLED=true)
      const isSingleStrongDirect =
        scoredProducts.length === 1 &&
        (scoredProducts[0]._is_exact || scoredProducts[0]._direct_score >= 200);

      if (
        searchMode !== 'keyword' &&
        RerankerService.isEnabled() &&
        scoredProducts.length > 0 &&
        !isSingleStrongDirect &&
        !(analyzed.intentType === 'code_or_sku' && hasExactMatch)
      ) {
        const topKForRerank = RerankerService.getTopK();
        const minRerankScore = RerankerService.getMinScore();
        const rerankSlice = scoredProducts.slice(0, topKForRerank);

        const rerankInput = rerankSlice.map((item) => ({
          id: item.id,
          text: EmbeddingService.getPassageText(item.id) || buildProductPassage(item),
        }));

        const rerankScores = await RerankerService.rerank(rawSearch, rerankInput, {
          waitForLoad: options?.waitForReranker,
        });

        if (rerankScores && rerankScores.size > 0) {
          // Normalisasi skor RRF non-exact untuk digabung proporsional dengan skor sigmoid Cross-Encoder
          const nonExactRrfValues = rerankSlice
            .filter((item) => !item._is_exact)
            .map((item) => item._raw_rrf_score);
          const maxRrf = nonExactRrfValues.length > 0 ? Math.max(...nonExactRrfValues, 0.0001) : 1;

          const rerankedList: Array<any> = [];
          for (const item of scoredProducts) {
            const rr = rerankScores.get(item.id);
            if (!rr) {
              // Pertahankan item di luar Top-K HANYA jika punya kecocokan leksikal langsung yang kuat
              if (item._is_exact || item._direct_score >= 120) {
                rerankedList.push(item);
              }
              continue;
            }

            // Hard Drop: buang kandidat murni semantik / tidak terkoroborasi yang ditolak Cross-Encoder
            // (Contoh: "obat sakit kepala" -> "Damdex Obat Cor" memiliki _kw_score = 0 & rr.score < 0.25 -> DROP)
            // Kandidat hybrid yang terkoroborasi kamus domain + E5 tetap dipertahankan & diurutkan ulang.
            if (!item._is_exact && item._kw_score < 35 && rr.score < minRerankScore) {
              continue;
            }

            const baseNorm = item._is_exact ? 1 : item._raw_rrf_score / maxRrf;
            const blended = item._is_exact
              ? 1000 + rr.score
              : 0.45 * baseNorm + 0.55 * rr.score;

            const calibratedDisplay = item._is_exact
              ? 1.0
              : Math.min(
                  0.99,
                  Math.max(
                    item.similarity_score && rr.score < minRerankScore ? item.similarity_score : 0.60,
                    Math.round(rr.score * 100) / 100
                  )
                );

            rerankedList.push({
              ...item,
              rerank_score: rr.score,
              similarity_score:
                item.match_type === 'semantic' || item.match_type === 'hybrid'
                  ? calibratedDisplay
                  : item.similarity_score,
              rrf_score: Math.round(blended * 10000) / 10000,
              _raw_rrf_score: blended,
            });
          }

          scoredProducts = rerankedList;
          sortScored(scoredProducts);
        }
      }

      // Bersihkan properti penunjang sorting internal
      rows = scoredProducts.map(
        ({
          _raw_rrf_score,
          _kw_score,
          _direct_score,
          _is_exact,
          _head_noun_matched,
          _attr_status,
          ...rest
        }) => rest
      );
    }

    if (filters?.limit && filters.limit > 0) {
      const offset = filters.offset && filters.offset > 0 ? filters.offset : 0;
      rows = rows.slice(offset, offset + filters.limit);
    }

    const includeBuyPrice = options?.includeBuyPrice ?? true;
    return rows.map((row) => sanitizeAndRedactProduct(row, includeBuyPrice));
  }

  /**
   * Get single product detail by ID with all variants & unit pricing
   */
  static async getProductById(id: string, options?: { includeBuyPrice?: boolean }) {
    const sql = `
      SELECT 
        p.*,
        c.name as category_name,
        b.name as brand,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'variant_name', pv.variant_name,
              'sku', pv.sku,
              'barcode', pv.barcode,
              'current_stock', pv.current_stock,
              'reserved_stock', COALESCE(pv.reserved_stock, 0),
              'available_stock', (pv.current_stock - COALESCE(pv.reserved_stock, 0)),
              'min_stock', pv.min_stock,
              'is_active', pv.is_active,
              'units', (
                SELECT json_agg(
                  json_build_object(
                    'id', vu.id,
                    'unit_name', vu.unit_name,
                    'conversion_factor', vu.conversion_factor,
                    'is_base_unit', vu.is_base_unit,
                    'buy_price', vu.buy_price,
                    'sell_price', vu.sell_price,
                    'wholesale_price', vu.wholesale_price
                  ) ORDER BY vu.is_base_unit DESC, vu.conversion_factor ASC
                ) FROM variant_units vu WHERE vu.variant_id = pv.id
              )
            ) ORDER BY pv.created_at ASC
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
        ) as variants,
        s.name as supplier_name,
        s.code as supplier_code
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
      GROUP BY p.id, c.name, b.name, s.name, s.code
    `;
    const res = await query(sql, [id]);
    const row = res.rows[0] || null;
    if (!row) return null;
    return sanitizeAndRedactProduct(row, options?.includeBuyPrice ?? true);
  }

  /**
   * Helper to generate unique SKU if not provided
   */
  private static generateSKU(prefix: string): string {
    const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'PRD';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `${cleanPrefix}-${Date.now().toString().slice(-4)}${randomSuffix}`;
  }

  /**
   * Tentukan brand_id produk:
   * - `brand_id` dikirim  -> dipakai langsung (null/'' = tanpa merek)
   * - `brand` (nama) dikirim -> cari merek setara atau buat baru (tidak pernah menduplikasi)
   * - keduanya tidak dikirim -> undefined (tidak diubah)
   */
  private static async resolveBrandId(
    data: { brand_id?: string | null; brand?: string | null },
    db: Queryable
  ): Promise<string | null | undefined> {
    if (data.brand_id !== undefined) return data.brand_id || null;
    if (data.brand !== undefined) {
      if (!data.brand || !String(data.brand).trim()) return null;
      const { brand } = await BrandService.findOrCreate(String(data.brand), db);
      return brand.id;
    }
    return undefined;
  }

  /**
   * Create product: handles single-variant (auto-create variant) or multi-variant
   */
  static async createProduct(
    data: CreateProductInput,
    options?: {
      userId?: string | null;
      createdBy?: string;
      allowBuyPrice?: boolean;
    }
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const allowBuyPrice = options?.allowBuyPrice ?? true;
      const actorId = options?.userId || null;
      const actorName = (options?.createdBy || 'Admin').slice(0, 100);

      const productId = generateUUIDv7();
      const productSku = data.sku || this.generateSKU(data.name);

      const hasVariants = Boolean(data.has_variants && data.variants && data.variants.length > 0);

      // Resolve merek: pakai brand_id jika ada, atau cari/buat dari nama (anti-duplikat)
      const brandId = await this.resolveBrandId(data, client);

      // 1. Insert Product
      await client.query(
        `INSERT INTO products (
          id, name, sku, barcode, category_id, brand_id, supplier_id, description, min_stock_alert, has_variants,
          weight, length, width, height, material, specifications
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          productId,
          data.name,
          productSku,
          data.barcode || null,
          data.category_id || null,
          brandId ?? null,
          data.supplier_id || null,
          data.description || null,
          data.min_stock_alert ?? 5,
          hasVariants,
          data.weight !== undefined && data.weight !== null ? Number(data.weight) : null,
          data.length !== undefined && data.length !== null ? Number(data.length) : null,
          data.width !== undefined && data.width !== null ? Number(data.width) : null,
          data.height !== undefined && data.height !== null ? Number(data.height) : null,
          data.material ? String(data.material).trim() : null,
          data.specifications ? String(data.specifications).trim() : null,
        ]
      );

      // 2. Insert Variants
      if (!hasVariants) {
        // "produk yang tidak memiliki variant. otomatis membuat 1 variant."
        const variantId = generateUUIDv7();
        const variantSku = `${productSku}-STD`;
        const initialStock = Number(data.initial_stock) || 0;
        const minStock = Number(data.min_stock ?? data.min_stock_alert ?? 5);

        await client.query(
          `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [variantId, productId, 'Standar', variantSku, data.barcode || null, initialStock, minStock]
        );

        // Satuan harga for single variant
        const baseUnitName = data.base_unit_name || 'Pcs';
        const buyPrice = allowBuyPrice ? Number(data.buy_price) || 0 : 0;
        const sellPrice = Number(data.sell_price) || 0;
        const wholesalePrice = data.wholesale_price ? Number(data.wholesale_price) : null;

        // If multiple units passed for single variant:
        const unitsToInsert = (data.units && data.units.length > 0)
          ? data.units
          : [{
              unit_name: baseUnitName,
              conversion_factor: 1,
              is_base_unit: true,
              buy_price: buyPrice,
              sell_price: sellPrice,
              wholesale_price: wholesalePrice
            }];

        for (const u of unitsToInsert) {
          const unitId = generateUUIDv7();
          await client.query(
            `INSERT INTO variant_units (
              id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              unitId,
              variantId,
              u.unit_name,
              Number(u.conversion_factor) || 1,
              Boolean(u.is_base_unit),
              allowBuyPrice ? Number(u.buy_price) || 0 : 0,
              Number(u.sell_price) || 0,
              u.wholesale_price ? Number(u.wholesale_price) : null
            ]
          );
        }

        // Log initial stock movement
        if (initialStock > 0) {
          const moveId = generateUUIDv7();
          await client.query(
            `INSERT INTO stock_movements (
              id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
            ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal produk baru', $6, $7)`,
            [moveId, productId, variantId, initialStock, `INIT-${productSku}`, actorName, actorId]
          );
        }
      } else {
        // Multi-variant creation
        for (let idx = 0; idx < data.variants!.length; idx++) {
          const v = data.variants![idx];
          const variantId = generateUUIDv7();
          const variantSku = v.sku || `${productSku}-V${idx + 1}`;
          const initialStock = Number(v.initial_stock) || 0;
          const minStock = Number(v.min_stock ?? data.min_stock_alert ?? 5);

          await client.query(
            `INSERT INTO product_variants (id, product_id, variant_name, sku, barcode, current_stock, min_stock)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [variantId, productId, v.variant_name, variantSku, v.barcode || null, initialStock, minStock]
          );

          // Units for this variant
          if (v.units && v.units.length > 0) {
            for (const u of v.units) {
              const unitId = generateUUIDv7();
              await client.query(
                `INSERT INTO variant_units (
                  id, variant_id, unit_name, conversion_factor, is_base_unit, buy_price, sell_price, wholesale_price
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  unitId,
                  variantId,
                  u.unit_name,
                  Number(u.conversion_factor) || 1,
                  Boolean(u.is_base_unit),
                  allowBuyPrice ? Number(u.buy_price) || 0 : 0,
                  Number(u.sell_price) || 0,
                  u.wholesale_price ? Number(u.wholesale_price) : null
                ]
              );
            }
          }

          // Log initial stock movement
          if (initialStock > 0) {
            const moveId = generateUUIDv7();
            await client.query(
              `INSERT INTO stock_movements (
                id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock, reference_no, notes, created_by, user_id
              ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal varian baru', $6, $7)`,
              [moveId, productId, variantId, initialStock, `INIT-${variantSku}`, actorName, actorId]
            );
          }
        }
      }

      await client.query('COMMIT');

      // Sinkronisasi embedding AI di latar belakang (non-blocking)
      EmbeddingService.syncProductEmbedding(productId).catch((err) => {
        logger.warn('AI_EMBEDDING', `Sync embedding background createProduct error: ${err.message}`);
      });

      return this.getProductById(productId, { includeBuyPrice: allowBuyPrice });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update Product basic info
   */
  static async updateProduct(
    id: string,
    data: {
      name?: string;
      sku?: string;
      barcode?: string;
      category_id?: string | null;
      brand_id?: string | null;
      brand?: string | null;
      supplier_id?: string | null;
      description?: string;
      min_stock_alert?: number;
      is_active?: boolean;
      weight?: number | null;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      material?: string | null;
      specifications?: string | null;
    },
    options?: { includeBuyPrice?: boolean; waitForReranker?: boolean }
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    const brandId = await this.resolveBrandId(data, pool);
    if (brandId !== undefined) {
      values.push(brandId);
      fields.push(`brand_id = $${values.length}`);
    }

    if (data.supplier_id !== undefined) {
      values.push(data.supplier_id || null);
      fields.push(`supplier_id = $${values.length}`);
    }

    if (data.name !== undefined) {
      values.push(data.name);
      fields.push(`name = $${values.length}`);
    }
    if (data.sku !== undefined) {
      values.push(data.sku);
      fields.push(`sku = $${values.length}`);
    }
    if (data.barcode !== undefined) {
      values.push(data.barcode);
      fields.push(`barcode = $${values.length}`);
    }
    if (data.category_id !== undefined) {
      values.push(data.category_id);
      fields.push(`category_id = $${values.length}`);
    }
    if (data.description !== undefined) {
      values.push(data.description);
      fields.push(`description = $${values.length}`);
    }
    if (data.min_stock_alert !== undefined) {
      values.push(data.min_stock_alert);
      fields.push(`min_stock_alert = $${values.length}`);
    }
    if (data.is_active !== undefined) {
      values.push(data.is_active);
      fields.push(`is_active = $${values.length}`);
    }
    if (data.weight !== undefined) {
      values.push(data.weight !== null ? Number(data.weight) : null);
      fields.push(`weight = $${values.length}`);
    }
    if (data.length !== undefined) {
      values.push(data.length !== null ? Number(data.length) : null);
      fields.push(`length = $${values.length}`);
    }
    if (data.width !== undefined) {
      values.push(data.width !== null ? Number(data.width) : null);
      fields.push(`width = $${values.length}`);
    }
    if (data.height !== undefined) {
      values.push(data.height !== null ? Number(data.height) : null);
      fields.push(`height = $${values.length}`);
    }
    if (data.material !== undefined) {
      values.push(data.material ? String(data.material).trim() : null);
      fields.push(`material = $${values.length}`);
    }
    if (data.specifications !== undefined) {
      values.push(data.specifications ? String(data.specifications).trim() : null);
      fields.push(`specifications = $${values.length}`);
    }

    if (fields.length === 0) return this.getProductById(id, options);

    values.push(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    await query(sql, values);

    // Sinkronisasi embedding AI di latar belakang (non-blocking)
    EmbeddingService.syncProductEmbedding(id).catch((err) => {
      logger.warn('AI_EMBEDDING', `Sync embedding background updateProduct error: ${err.message}`);
    });

    return this.getProductById(id, options);
  }

  /**
   * Delete product
   */
  static async deleteProduct(id: string) {
    const res = await query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    EmbeddingService.removeProductFromIndex(id);
    return res.rows[0];
  }

  /**
   * Toggle product sale status (is_active: masih dijual vs sudah tidak dijual)
   */
  static async toggleProductStatus(id: string, options?: { includeBuyPrice?: boolean }) {
    const res = await query(
      `UPDATE products 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    if (!res.rows[0]) throw new Error('Produk tidak ditemukan');

    EmbeddingService.syncProductEmbedding(id).catch((err) => {
      logger.warn('AI_EMBEDDING', `Sync embedding background toggleProductStatus error: ${err.message}`);
    });

    return this.getProductById(id, options);
  }
}
