/**
 * Golden Evaluation Benchmark & Unit Test untuk Smart Search Anti-Halusinasi
 *
 * Menjalankan:
 * 1. Unit Assertions deterministik (word-boundary, clean passage v2, fuzzy typo, query analyzer, attribute guard)
 * 2. 25+ Skenario Golden Query terhadap katalog PostgreSQL aktif (mode keyword, hybrid, semantic)
 * 3. Laporan Precision@5, Anti-Hallucination Pass Rate, dan Average Latency (ms)
 *
 * Cara jalan:
 *   npm run search:eval
 *   RERANKER_ENABLED=true npm run search:eval   (untuk menguji dengan Cross-Encoder Tahap 3)
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { pool } from '../config/db.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { ProductService } from '../services/productService.js';
import { RerankerService } from '../services/rerankerService.js';
import {
  buildProductPassage,
  hasWholeTerm,
  scoreKeywordMatch,
} from '../utils/searchSynonyms.js';
import { damerauLevenshtein, scoreFuzzyTokenMatch } from '../utils/searchFuzzy.js';
import {
  analyzeSearchQuery,
  evaluateAttributeCompatibility,
} from '../utils/searchQueryAnalyzer.js';

interface GoldenCase {
  name: string;
  query: string;
  mode: 'keyword' | 'hybrid' | 'semantic';
  category: 'anti_hallucination' | 'substring_trap' | 'semantic_intent' | 'synonym' | 'fuzzy_typo' | 'attribute_sku';
  expectZeroResults?: boolean;
  /** Pola regex yang WAJIB cocok di Top-K (minimal 1 produk di Top 3) */
  mustMatchTop3?: RegExp;
  /** Pola regex yang DILARANG muncul di Top-5 (kecuali cocok pola pengecualian) */
  mustNotMatchTop5?: RegExp;
  mustNotException?: RegExp;
  /** Untuk tes SKU/exact: SKU yang wajib di peringkat #1 */
  expectFirstSku?: string;
}

function runUnitAssertions() {
  console.log('🧪 [Bagian 1] Menjalankan Unit Assertions Deterministik...');

  // 1. Word-Boundary (hasWholeTerm)
  assert.equal(hasWholeTerm('Keramik Mulia 40x40', 'mu'), false, 'mu tidak boleh cocok dengan Mulia');
  assert.equal(hasWholeTerm('Watermur PVC Rucika', 'mu'), false, 'mu tidak boleh cocok dengan Watermur');
  assert.equal(hasWholeTerm('Plafon Anti Jamur', 'mur'), false, 'mur tidak boleh cocok dengan Jamur');
  assert.equal(hasWholeTerm('Kertas Gosok Amplas', 'sok'), false, 'sok tidak boleh cocok dengan Gosok');
  assert.equal(hasWholeTerm('Besi & Baja Tulangan', '&'), false, '& tidak boleh cocok');
  assert.equal(hasWholeTerm('Semen Mortar Utama MU 400', 'mu 400'), true, 'mu 400 harus cocok');
  assert.equal(hasWholeTerm('Pipa PVC AW 1/2 inch', '1/2'), true, '1/2 harus cocok');

  // 2. Clean Passage v2 (bebas polusi '&' dan label template kaku)
  const besiPassage = buildProductPassage({
    name: 'Besi Beton Ulir 10mm SNI TS 280',
    sku: 'BSI-ULR-10MM',
    barcode: '899234567010',
    category_name: 'Besi & Baja Tulangan',
    brand: 'Krakatau Steel',
    supplier_name: 'PT Baja Jaya',
    description: 'Besi tulangan sirip ulir berstandar SNI untuk struktur pondasi.',
  });
  assert.equal(besiPassage.startsWith('passage: '), true);
  assert.equal(besiPassage.includes('Nama Produk:'), false, 'Passage v2 tidak boleh mengandung label template Nama Produk:');
  assert.equal(besiPassage.includes('BSI-ULR-10MM'), false, 'Passage v2 tidak boleh mengandung SKU');
  assert.equal(besiPassage.includes('899234567010'), false, 'Passage v2 tidak boleh mengandung Barcode');
  assert.equal(besiPassage.toLowerCase().includes('aquaproof'), false, 'Besi Beton tidak boleh tercemar tag aquaproof');
  assert.equal(besiPassage.toLowerCase().includes('kloset'), false, 'Besi Beton tidak boleh tercemar tag kloset');
  assert.equal(besiPassage.toLowerCase().includes('keramik'), false, 'Besi Beton tidak boleh tercemar tag keramik');

  const amplasPassage = buildProductPassage({
    name: 'Amplas Kertas & Air Nikken Tahan Sobek',
    category_name: 'Kuas, Roll, Amplas & Thinner',
    brand: 'Nikken',
    description: 'Kertas gosok untuk dempul tembok, kayu, dan besi.',
  });
  assert.equal(amplasPassage.toLowerCase().includes('besi beton'), false, 'Amplas tidak boleh tercemar tag besi beton');
  assert.equal(amplasPassage.toLowerCase().includes('tembok rembes'), false, 'Amplas tidak boleh tercemar tag tembok rembes');

  // 3. Fuzzy Typo Tolerance
  assert.equal(damerauLevenshtein('aquaprof', 'aquaproof'), 1);
  assert.equal(damerauLevenshtein('ruccika', 'rucika'), 1);
  assert.equal(damerauLevenshtein('parlon', 'paralon'), 1);

  const f1 = scoreFuzzyTokenMatch('aquaprof', ['aquaproof', 'cat', 'pelapis']);
  assert.equal(f1.matched, true, 'aquaprof harus fuzzy match aquaproof');
  assert.equal(f1.bestWord, 'aquaproof');

  const f2 = scoreFuzzyTokenMatch('10mm', ['12mm', '16mm', 'besi']);
  assert.equal(f2.matched, false, 'Angka/ukuran 10mm tidak boleh fuzzy match 12mm');

  // 4. Query Intent Analyzer & Hard Attribute Guard
  assert.equal(analyzeSearchQuery('BSI-ULR-10MM').intentType, 'code_or_sku');
  assert.equal(analyzeSearchQuery('899234567010').intentType, 'code_or_sku');
  assert.equal(analyzeSearchQuery('semen').intentType, 'short_exact');
  assert.equal(analyzeSearchQuery('nambal tembok rembes').intentType, 'descriptive_intent');

  const attrQuery = analyzeSearchQuery('besi beton 10mm');
  assert.equal(attrQuery.intentType, 'attribute_specific');
  assert.equal(attrQuery.hasNumericConstraint, true);
  assert.equal(evaluateAttributeCompatibility(attrQuery.attributes, 'Besi Beton Ulir 10mm SNI').status, 'match');
  assert.equal(evaluateAttributeCompatibility(attrQuery.attributes, 'Besi Beton Ulir 12mm SNI').status, 'conflict');

  const catBesi = analyzeSearchQuery('cat besi anti karat');
  assert.equal(catBesi.headNoun, 'cat', 'Head noun dari "cat besi anti karat" harus "cat"');

  // 5. Keyword Scoring Strictness
  const kwMulia = scoreKeywordMatch(
    { id: '1', name: 'Semen Tiga Roda 40kg', category_name: 'Semen & Mortar' },
    'keramik mulia',
    { includeIntentSynonyms: true }
  );
  assert.equal(kwMulia.score, 0, 'Semen Tiga Roda tidak boleh mendapat skor untuk kueri "keramik mulia"');

  console.log('✅ Semua Unit Assertions (5/5 grup) LULUS!\n');
}

const GOLDEN_CASES: GoldenCase[] = [
  // --- A. Anti-Halusinasi (Out-of-Domain: WAJIB 0 hasil) ---
  { name: 'OOD: laptop gaming (hybrid)', query: 'laptop gaming', mode: 'hybrid', category: 'anti_hallucination', expectZeroResults: true },
  { name: 'OOD: laptop gaming (semantic)', query: 'laptop gaming', mode: 'semantic', category: 'anti_hallucination', expectZeroResults: true },
  { name: 'OOD: sepatu lari nike (hybrid)', query: 'sepatu lari nike', mode: 'hybrid', category: 'anti_hallucination', expectZeroResults: true },
  { name: 'OOD: obat sakit kepala (semantic)', query: 'obat sakit kepala', mode: 'semantic', category: 'anti_hallucination', expectZeroResults: true },
  { name: 'OOD: kopi susu gula aren (hybrid)', query: 'kopi susu gula aren', mode: 'hybrid', category: 'anti_hallucination', expectZeroResults: true },
  { name: 'OOD: kamera mirrorless (semantic)', query: 'kamera mirrorless', mode: 'semantic', category: 'anti_hallucination', expectZeroResults: true },

  // --- B. Jebakan Substring & Isolasi Kategori ---
  {
    name: 'Trap: keramik mulia bebas semen (hybrid)',
    query: 'keramik mulia',
    mode: 'hybrid',
    category: 'substring_trap',
    mustMatchTop3: /keramik|granit|mulia/i,
    mustNotMatchTop5: /semen tiga roda|semen gresik|semen padang|batako/i,
  },
  {
    name: 'Trap: cat besi tidak memunculkan besi beton (hybrid)',
    query: 'cat besi',
    mode: 'hybrid',
    category: 'substring_trap',
    mustMatchTop3: /cat|meni/i,
    mustNotMatchTop5: /besi beton|besi hollow|besi siku|besi begel/i,
  },
  {
    name: 'Trap: cat besi tidak memunculkan besi beton (semantic)',
    query: 'cat besi',
    mode: 'semantic',
    category: 'substring_trap',
    mustMatchTop3: /cat|meni/i,
    mustNotMatchTop5: /besi beton|besi hollow|besi siku|besi begel/i,
  },
  {
    name: 'Trap: amplas tidak tercemar waterproofing/besi (hybrid)',
    query: 'amplas',
    mode: 'hybrid',
    category: 'substring_trap',
    mustMatchTop3: /amplas|kertas gosok/i,
    mustNotMatchTop5: /aquaproof|besi beton|kloset/i,
  },
  {
    name: 'Trap: watermur bebas semen & lampu (hybrid)',
    query: 'watermur',
    mode: 'hybrid',
    category: 'substring_trap',
    mustMatchTop3: /watermur/i,
    mustNotMatchTop5: /semen tiga roda|semen gresik|mortar|lampu/i,
  },

  // --- C. Semantic Intent / Masalah Pelanggan ---
  {
    name: 'Intent: nambal tembok rembes (hybrid)',
    query: 'nambal tembok rembes',
    mode: 'hybrid',
    category: 'semantic_intent',
    mustMatchTop3: /waterproof|anti bocor|aquaproof|no drop|damdex|sika|pelapis|sealant/i,
  },
  {
    name: 'Intent: nambal tembok rembes (semantic)',
    query: 'nambal tembok rembes',
    mode: 'semantic',
    category: 'semantic_intent',
    mustMatchTop3: /waterproof|anti bocor|aquaproof|no drop|damdex|sika|pelapis|sealant/i,
  },
  {
    name: 'Intent: sambungan pipa belok (hybrid)',
    query: 'sambungan pipa belok',
    mode: 'hybrid',
    category: 'semantic_intent',
    mustMatchTop3: /keni|knee|elbow|pipa|pvc|fitting/i,
  },
  {
    name: 'Intent: atap bening kanopi (hybrid)',
    query: 'atap bening kanopi',
    mode: 'hybrid',
    category: 'semantic_intent',
    mustMatchTop3: /polycarbonate|twinlite|kanopi|fiber|atap|alderon/i,
  },
  {
    name: 'Intent: cat besi anti karat (hybrid)',
    query: 'cat besi anti karat',
    mode: 'hybrid',
    category: 'semantic_intent',
    mustMatchTop3: /cat|meni|ftalit|avian|zinc/i,
    mustNotMatchTop5: /besi beton|besi hollow|besi siku/i,
  },
  {
    name: 'Intent: perekat keramik lantai (hybrid)',
    query: 'perekat keramik lantai',
    mode: 'hybrid',
    category: 'semantic_intent',
    mustMatchTop3: /keramik|granit|perekat|mu|lem|nat/i,
  },

  // --- D. Exact Synonyms 1-ke-1 ---
  {
    name: 'Synonym: paralon -> pipa pvc (keyword)',
    query: 'paralon',
    mode: 'keyword',
    category: 'synonym',
    mustMatchTop3: /pipa|pvc|paralon/i,
  },
  {
    name: 'Synonym: tiner -> thinner (keyword)',
    query: 'tiner',
    mode: 'keyword',
    category: 'synonym',
    mustMatchTop3: /thinner|tiner/i,
  },
  {
    name: 'Synonym: hebel -> bata ringan (keyword)',
    query: 'hebel',
    mode: 'keyword',
    category: 'synonym',
    mustMatchTop3: /hebel|bata ringan/i,
  },

  // --- E. Fuzzy Typo Tolerance ---
  {
    name: 'Typo: aquaprof -> aquaproof (keyword)',
    query: 'aquaprof',
    mode: 'keyword',
    category: 'fuzzy_typo',
    mustMatchTop3: /aquaproof/i,
  },
  {
    name: 'Typo: ruccika -> rucika (hybrid)',
    query: 'ruccika',
    mode: 'hybrid',
    category: 'fuzzy_typo',
    mustMatchTop3: /rucika/i,
  },
  {
    name: 'Typo: alderonn -> alderon (keyword)',
    query: 'alderonn',
    mode: 'keyword',
    category: 'fuzzy_typo',
    mustMatchTop3: /alderon/i,
  },

  // --- F. SKU & Numeric Attribute Precision ---
  {
    name: 'SKU Exact: BSI-ULR-10MM (hybrid)',
    query: 'BSI-ULR-10MM',
    mode: 'hybrid',
    category: 'attribute_sku',
    expectFirstSku: 'BSI-ULR-10MM',
  },
  {
    name: 'Attribute: besi 10mm (hybrid)',
    query: 'besi 10mm',
    mode: 'hybrid',
    category: 'attribute_sku',
    mustMatchTop3: /besi.*10mm|10mm.*besi/i,
    mustNotMatchTop5: /cat|keramik|pipa pvc|mesin bor/i,
  },
  {
    name: 'Short Exact: semen (hybrid)',
    query: 'semen',
    mode: 'hybrid',
    category: 'attribute_sku',
    mustMatchTop3: /semen/i,
    mustNotMatchTop5: /kloset|lampu|kabel/i,
  },
];

async function runGoldenEvaluation() {
  console.log('🚀 [Bagian 2] Memuat indeks vektor dari PostgreSQL...');
  const loadedCount = await EmbeddingService.reloadIndexFromDb();
  const status = await EmbeddingService.getStatus();
  console.log(
    `📊 Indeks siap: ${loadedCount}/${status.total_products} produk | Passage v${status.passage_version} | Needs Reindex: ${status.needs_reindex} | Reranker: ${
      status.reranker_enabled ? `${status.reranker_model} (ON)` : 'OFF'
    }\n`
  );

  // Pemanasan model Bi-Encoder (+ Reranker jika aktif) agar latency pengukuran realistis
  await EmbeddingService.embedQuery('pemanasan model');

  let passed = 0;
  let failed = 0;
  let oodTotal = 0;
  let oodPassed = 0;
  let totalLatencyMs = 0;

  const failures: Array<{ test: GoldenCase; reason: string; top5: string[] }> = [];

  for (const tc of GOLDEN_CASES) {
    const start = performance.now();
    const results = await ProductService.getProducts(
      { search: tc.query, searchMode: tc.mode, saleStatus: 'active' },
      { includeBuyPrice: false, waitForReranker: true }
    );
    const elapsed = performance.now() - start;
    totalLatencyMs += elapsed;

    const top5 = results.slice(0, 5);
    const top3 = results.slice(0, 3);
    const top5Labels = top5.map(
      (p: any) =>
        `${p.name} [${p.match_type || 'kw'}:${p.similarity_score ?? '-'}${
          p.rerank_score !== undefined ? `|rr:${p.rerank_score}` : ''
        }]`
    );

    let ok = true;
    const reasons: string[] = [];

    if (tc.expectZeroResults) {
      oodTotal++;
      if (results.length !== 0) {
        ok = false;
        reasons.push(`Ekspektasi 0 hasil (anti-halusinasi), tetapi mendapat ${results.length} hasil`);
      } else {
        oodPassed++;
      }
    }

    if (tc.expectFirstSku) {
      const firstSku = results[0]?.sku || '';
      if (firstSku.toUpperCase() !== tc.expectFirstSku.toUpperCase()) {
        ok = false;
        reasons.push(`Peringkat #1 harus SKU ${tc.expectFirstSku}, tetapi mendapat "${firstSku}" (${results[0]?.name || 'kosong'})`);
      }
    }

    if (tc.mustMatchTop3) {
      const hit = top3.some((p: any) =>
        tc.mustMatchTop3!.test(`${p.name} ${p.category_name || ''} ${p.brand || ''} ${p.specifications || ''}`)
      );
      if (!hit) {
        ok = false;
        reasons.push(`Tidak ada produk di Top-3 yang cocok pola ${tc.mustMatchTop3}`);
      }
    }

    if (tc.mustNotMatchTop5) {
      const violators = top5.filter((p: any) => {
        const text = `${p.name} ${p.category_name || ''}`;
        if (tc.mustNotException && tc.mustNotException.test(text)) return false;
        return tc.mustNotMatchTop5!.test(text);
      });
      if (violators.length > 0) {
        ok = false;
        reasons.push(
          `Produk terlarang muncul di Top-5: ${violators.map((v: any) => v.name).join(', ')}`
        );
      }
    }

    const icon = ok ? '✅' : '❌';
    console.log(
      `${icon} [${tc.mode.padEnd(8)}] "${tc.query}" -> ${results.length} hasil (${elapsed.toFixed(1)} ms)`
    );
    if (results.length > 0) {
      console.log(`   Top-3: ${top5Labels.slice(0, 3).join(' | ')}`);
    }

    if (ok) {
      passed++;
    } else {
      failed++;
      console.log(`   ⚠️  Gagal: ${reasons.join('; ')}`);
      failures.push({ test: tc, reason: reasons.join('; '), top5: top5Labels });
    }
  }

  const avgLatency = totalLatencyMs / GOLDEN_CASES.length;
  const rerankerStatus = RerankerService.getStatus();

  console.log('\n============================================================');
  console.log('📈 RINGKASAN BENCHMARK SMART SEARCH');
  console.log('============================================================');
  console.log(`Total Skenario     : ${GOLDEN_CASES.length}`);
  console.log(`Lulus / Gagal      : ${passed} LULUS / ${failed} GAGAL (${Math.round((passed / GOLDEN_CASES.length) * 100)}%)`);
  console.log(`Anti-Halusinasi OOD: ${oodPassed}/${oodTotal} (${Math.round((oodPassed / Math.max(1, oodTotal)) * 100)}%)`);
  console.log(`Latency Rata-rata  : ${avgLatency.toFixed(1)} ms`);
  console.log(`Cross-Encoder      : ${rerankerStatus.enabled ? `${rerankerStatus.status} (${rerankerStatus.model_name})` : 'disabled'}`);
  console.log('============================================================\n');

  if (failures.length > 0) {
    console.log('Detail kegagalan:');
    for (const f of failures) {
      console.log(`- ${f.test.name}: ${f.reason}`);
      console.log(`  Top-5: ${f.top5.join(' | ')}`);
    }
  }

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  runUnitAssertions();
  await runGoldenEvaluation();
}

main().catch(async (err) => {
  console.error('❌ Evaluasi gagal:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
