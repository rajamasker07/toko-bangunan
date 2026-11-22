/**
 * Kamus Sinonim, Word-Boundary Matching & Clean Passage Builder untuk Toko Bangunan
 *
 * Prinsip Anti-Halusinasi:
 * 1. Semua pencocokan sinonim & domain menggunakan batas kata ketat (hasWholeTerm),
 *    bukan .includes() mentah (menghilangkan polusi '&', 'mu' -> 'Mulia'/'Watermur', dll.).
 * 2. Memisahkan Exact Synonyms (padanan 1-ke-1 seperti paralon <-> pipa pvc) dari
 *    Problem Intents (keluhan seperti "tembok rembes" -> waterproofing).
 * 3. Clean Natural Passage (v2) untuk embedding: tanpa SKU, Barcode, Supplier,
 *    tanpa label template kaku berulang, dan tanpa polusi tag lintas kategori.
 */

import { extractCandidateWords, scoreFuzzyTokenMatch } from './searchFuzzy.js';

export interface SynonymGroup {
  category: string;
  keywords: string[];
  negativeKeywords?: string[];
  intents: string[];
  relatedTerms: string[];
}

/**
 * Stopwords umum yang tidak boleh memicu pencocokan kategori/sinonim sendirian
 */
export const SEARCH_STOPWORDS = new Set<string>([
  'dan', 'atau', 'yang', 'untuk', 'buat', 'di', 'ke', 'dari', 'dengan', 'pada',
  'ini', 'itu', 'ada', 'yg', 'utk', 'dg', 'dgn', 'anti', 'super', 'plus', 'pro',
  'sni', 'std', 'standar', 'asli', 'ori', 'original', 'murah', 'bagus', 'kuat',
  'tahan', 'lama', 'serbaguna', 'siap', 'pakai', 'bahan', 'bangunan', 'toko',
]);

/**
 * Padanan sinonim ketat 1-ke-1 (aktif di semua mode termasuk keyword)
 */
export const EXACT_SYNONYM_GROUPS: string[][] = [
  ['paralon', 'pralon', 'pipa pvc'],
  ['keni', 'knee', 'elbow'],
  ['sok', 'sock', 'soket', 'socket'],
  ['sealtape', 'seal tape', 'selotip pipa'],
  ['lem pralon', 'lem paralon', 'lem pipa', 'isarplas'],
  ['holo', 'hollow'],
  ['behel', 'begel', 'beugel', 'cincin kolom'],
  ['kanal c', 'baja ringan', 'truss'],
  ['tiner', 'thinner'],
  ['ampelas', 'amplas', 'kertas gosok'],
  ['politur', 'plitur', 'varnish'],
  ['keran', 'kran'],
  ['kloset', 'closet'],
  ['tandon', 'toren', 'tangki air'],
  ['bak cuci piring', 'kitchen sink', 'wastafel dapur'],
  ['saringan got', 'floor drain', 'afur'],
  ['martil', 'palu'],
  ['cetok', 'sendok semen'],
  ['sekrup', 'screw', 'skrup'],
  ['baut', 'bolt'],
  ['fisher', 'fischer'],
  ['steker', 'colokan'],
  ['hebel', 'bata ringan'],
  ['thinbed', 'perekat bata ringan', 'lem hebel'],
  ['nodrop', 'no drop'],
  ['antibocor', 'anti bocor', 'waterproofing'],
  ['tigaroda', 'tiga roda'],
  ['polikarbonat', 'polycarbonate'],
  ['gagang pintu', 'handle pintu'],
  ['solasi listrik', 'isolasi listrik', 'solasi hitam'],
  ['isolasi kertas', 'solasi kertas', 'masking tape'],
  ['gerinda', 'gurinda'],
];

/**
 * Kamus Domain & Masalah Pelanggan Toko Bangunan
 * (Bebas singkatan ambigu 2 huruf seperti 'mu' sendirian)
 */
export const TOKOBANGUNAN_SYNONYMS: SynonymGroup[] = [
  {
    category: 'Waterproofing & Anti Bocor',
    keywords: [
      'waterproofing', 'anti bocor', 'antibocor', 'pelapis anti bocor', 'kedap air',
      'aquaproof', 'no drop', 'nodrop', 'damdex', 'sika top', 'sikatop', 'sikalastic',
      'sealant', 'aspal cair', 'flashing tape', 'membrane bakar', 'kasa fiber',
    ],
    intents: [
      'tembok rembes', 'dinding rembes', 'atap bocor', 'dak bocor', 'genteng bocor',
      'bocor hujan', 'dinding lembab', 'tembok basah', 'nat bocor', 'nambal retak',
      'tambal bocor', 'nambal tembok', 'pelapis dak', 'anti rembes',
    ],
    relatedTerms: ['cat pelapis anti bocor', 'pelapis waterproofing', 'waterproof'],
  },
  {
    category: 'Perpipaan & Fitting',
    keywords: [
      'pipa pvc', 'pipa air', 'pipa aw', 'pipa d', 'paralon', 'pralon', 'rucika',
      'wavin', 'maspion', 'fitting pvc', 'keni', 'knee', 'elbow', 'sok drat',
      'tee pvc', 'letter t', 'watermur', 'vlok ring', 'flange', 'lem pipa',
      'lem pralon', 'lem paralon', 'isarplas', 'seal tape', 'sealtape', 'dop pvc',
    ],
    negativeKeywords: ['pipa besi', 'pipa hollow', 'pipa conduit'],
    intents: [
      'pipa belok', 'sambungan belok', 'sambungan pipa belok', 'sambungan pipa air',
      'cabang pipa', 'sambungan pipa cabang', 'sambung pralon', 'saluran pembuangan',
      'saluran air kotor', 'pipa pompa air', 'pipa sanyo', 'pipa sumur', 'paralon bocor',
    ],
    relatedTerms: ['sambungan pvc', 'fitting pvc', 'tutup pipa'],
  },
  {
    category: 'Semen & Mortar',
    keywords: [
      'semen', 'semen pcc', 'semen opc', 'semen instan', 'tiga roda', 'tigaroda',
      'semen gresik', 'dynamix', 'holcim', 'semen padang', 'semen merdeka',
      'mortar', 'mortar utama', 'mu 400', 'mu 450', 'mu 380', 'mu 200', 'mu 301',
      'acian', 'plester', 'plesteran', 'perekat bata ringan', 'thinbed', 'calbond',
    ],
    negativeKeywords: ['sendok semen', 'cetok', 'ember cor', 'batako', 'semen nat'],
    intents: [
      'cor beton', 'cor lantai', 'cor dak', 'cor pondasi', 'cor tiang', 'sloof',
      'pasang hebel', 'pasang bata ringan', 'aci tembok', 'plester dinding', 'nambal semen',
    ],
    relatedTerms: ['pasir cor', 'batu split', 'obat cor', 'pengeras beton'],
  },
  {
    category: 'Besi & Baja Tulangan',
    keywords: [
      'besi beton', 'besi ulir', 'besi polos', 'besi behel', 'besi begel', 'begel',
      'beugel', 'cakar ayam', 'wiremesh', 'baja ringan', 'kanal c', 'truss',
      'reng baja', 'besi hollow', 'hollow galvanis', 'hollow hitam', 'pipa besi',
      'plat besi', 'besi siku', 'bondek', 'kawat bendrat',
    ],
    negativeKeywords: [
      'cat besi', 'meni besi', 'gergaji besi', 'potong besi', 'bor besi',
      'amplas', 'kuas', 'lem besi', 'paku', 'sekrup', 'baut',
    ],
    intents: [
      'tulangan cor', 'tulangan pondasi', 'rangka atap baja', 'rangka plafon',
      'tiang cor', 'rangka pagar besi', 'besi pondasi',
    ],
    relatedTerms: ['tulangan beton', 'rangka kanopi', 'profil baja'],
  },
  {
    category: 'Cat & Finishing',
    keywords: [
      'cat tembok', 'cat dinding', 'cat kayu', 'cat besi', 'cat genteng', 'cat kolam',
      'cat lapangan', 'cat dasar', 'cat primer', 'alkali killer', 'dulux', 'catylac',
      'avitex', 'vinilex', 'danapaint', 'jotun', 'nippon paint', 'kansai', 'ftalit',
      'avian', 'emco', 'plamir', 'dempul', 'thinner', 'tiner', 'meni besi', 'meni kayu',
      'politur', 'plitur', 'varnish',
    ],
    negativeKeywords: ['amplas', 'kertas gosok'],
    intents: [
      'cat anti karat', 'cat pagar besi', 'cat interior', 'cat eksterior',
      'dinding kusam', 'cat tahan cuaca', 'cat mengelupas', 'pelapis kayu', 'cat rumah',
    ],
    relatedTerms: ['kuas cat', 'roll cat', 'bak cat', 'masking tape'],
  },
  {
    category: 'Keramik & Granit',
    keywords: [
      'keramik', 'granit', 'granite', 'ubin', 'homogenous tile', 'keramik roman',
      'keramik milan', 'keramik ikad', 'keramik mulia', 'asia tile',
      'nat keramik', 'semen nat', 'pengisi nat', 'lem keramik', 'perekat keramik',
      'perekat granit', 'mu 400', 'mu 450', 'am 53', 'am 50',
    ],
    intents: [
      'perekat keramik lantai', 'pasang granit', 'keramik kamar mandi', 'keramik kasar',
      'keramik dinding dapur', 'ganti nat keramik', 'nat anti bocor', 'keramik terangkat',
    ],
    relatedTerms: ['spacer keramik', 'perata keramik', 'roskam gerigi', 'potong keramik'],
  },
  {
    category: 'Pengikat, Paku & Baut',
    keywords: [
      'paku kayu', 'paku usuk', 'paku reng', 'paku kaso', 'paku triplek', 'paku seng',
      'paku asbes', 'paku payung', 'paku beton', 'sekrup', 'screw', 'sekrup gypsum',
      'baut roofing', 'baut baja ringan', 'dynabolt', 'fisher', 'fischer', 'ramset',
      'mur baut', 'kawat las', 'kawat loket', 'kawat ayakan',
    ],
    intents: [
      'paku rangka atap', 'pasang gypsum', 'paku kayu keras', 'baut baja ringan',
      'gantungan dinding beton', 'pengikat kayu', 'bor dinding gantung',
    ],
    relatedTerms: ['pengencang', 'self drilling', 'angkur beton'],
  },
  {
    category: 'Atap & Plafon',
    keywords: [
      'atap spandek', 'spandek', 'seng gelombang', 'alderon', 'atap upvc',
      'polycarbonate', 'polikarbonat', 'twinlite', 'fiber bening', 'genteng metal',
      'asbes', 'gypsum', 'jayaboard', 'elephant gypsum', 'grc board', 'kalsiboard',
      'list profil', 'cornice', 'talang air', 'karpet talang',
    ],
    intents: [
      'atap bening kanopi', 'atap kanopi dingin', 'atap tembus cahaya', 'tutup kanopi',
      'plafon tahan air', 'plafon kamar mandi', 'plafon anti jamur', 'atap gudang',
      'peredam suara hujan', 'peredam panas atap',
    ],
    relatedTerms: ['kompon gypsum', 'kasa gypsum', 'list plafon'],
  },
  {
    category: 'Sanitari & Kamar Mandi',
    keywords: [
      'kran air', 'keran air', 'stop kran', 'kran cabang', 'kran shower',
      'shower mandi', 'jet shower', 'bidet', 'kloset duduk', 'kloset jongkok',
      'kloset', 'closet', 'wastafel', 'toto', 'american standard', 'bak cuci piring',
      'kitchen sink', 'siphon', 'afur', 'floor drain', 'saringan got', 'tandon air',
      'toren air', 'pelampung toren', 'radar toren',
    ],
    intents: [
      'kran air bocor', 'saringan air kamar mandi anti bau', 'saluran cucian piring',
      'shower air kencang', 'saluran got mampet', 'bak air kamar mandi',
    ],
    relatedTerms: ['selang fleksibel', 'seal karet', 'sanitasi'],
  },
  {
    category: 'Alat & Perkakas Tukang',
    keywords: [
      'palu', 'martil', 'cetok', 'sendok semen', 'cangkul', 'sekop', 'gergaji kayu',
      'gergaji besi', 'meteran', 'waterpass', 'benang bangunan', 'ember cor',
      'mesin gerinda', 'gerinda', 'mesin bor', 'mata bor', 'mata gerinda',
      'batu potong', 'amplas', 'kuas cat', 'roll cat', 'obeng', 'tang', 'kunci inggris',
    ],
    intents: [
      'alat aduk semen', 'alat pasang bata', 'alat ukur lurus', 'potong keramik',
      'potong besi', 'bor beton', 'bor tembok', 'menghaluskan dempul', 'alat ngecat',
    ],
    relatedTerms: ['sarung tangan proyek', 'helm proyek', 'perkakas pertukangan'],
  },
  {
    category: 'Kelistrikan',
    keywords: [
      'kabel listrik', 'kabel nym', 'kabel nya', 'kabel nymhy', 'eterna', 'supreme',
      'saklar', 'stop kontak', 'steker', 'colokan', 'mcb', 'box mcb', 'schneider',
      'panasonic', 'broco', 'lampu led', 'philips', 'fitting lampu', 'isolasi listrik',
      'solasi hitam', 'pipa conduit', 'inbow doos', 'tedus',
    ],
    intents: [
      'stop kontak ac', 'saklar lampu ganda', 'instalasi listrik rumah',
      'kabel tanam tembok', 'mcb jeglek', 'pengaman listrik', 'penerangan rumah',
    ],
    relatedTerms: ['klem kabel', 'listrik rumah', 'panel listrik'],
  },
  {
    category: 'Pintu & Jendela',
    keywords: [
      'kunci pintu', 'handle pintu', 'gagang pintu', 'bodi kunci', 'silinder kunci',
      'engsel pintu', 'engsel jendela', 'grendel', 'slot pintu', 'hak angin',
      'door closer', 'dekson', 'dekkson', 'bellucci', 'rel pintu geser', 'roda pintu dorong',
    ],
    intents: [
      'kunci rumah anti maling', 'penahan jendela', 'gagang pintu kamar',
      'kunci kamar mandi', 'engsel pintu berat',
    ],
    relatedTerms: ['aksesoris pintu', 'aksesoris jendela'],
  },
];

// Cache regex batas kata untuk performa tinggi
const wholeTermRegexCache = new Map<string, RegExp>();

/**
 * Pencocokan batas kata ketat (word-boundary aware untuk alfanumerik + simbol ukuran seperti 1/2).
 * Contoh:
 * - hasWholeTerm("Keramik Mulia", "mu") === false
 * - hasWholeTerm("Watermur Rucika", "mu") === false
 * - hasWholeTerm("Semen Mortar Utama MU 400", "mu 400") === true
 * - hasWholeTerm("Besi & Baja Tulangan", "&") === false (karena term kosong setelah sanitasi)
 */
export function hasWholeTerm(text: string, term: string): boolean {
  if (!text || !term) return false;
  const cleanTerm = term.trim().toLowerCase();
  if (!cleanTerm || !/[a-z0-9]/.test(cleanTerm)) return false;

  let regex = wholeTermRegexCache.get(cleanTerm);
  if (!regex) {
    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    wholeTermRegexCache.set(cleanTerm, regex);
  }
  return regex.test(text);
}

/**
 * Normalisasi token (lowercase, hilangkan tanda baca berlebih, pertahankan / dan - di dalam ukuran/SKU)
 */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^\w\d\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Memecah string menjadi token unik kata
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeToken(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 0 && /[a-z0-9]/.test(w));
  return Array.from(new Set(words));
}

/**
 * Mencari padanan sinonim ketat 1-ke-1 dari teks kueri menggunakan word-boundary
 */
export function getExactSynonymsForQuery(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const synSet = new Set<string>();
  for (const group of EXACT_SYNONYM_GROUPS) {
    const matched = group.some((term) => hasWholeTerm(normalized, term));
    if (matched) {
      for (const term of group) {
        if (!hasWholeTerm(normalized, term)) {
          synSet.add(term);
        }
      }
    }
  }
  return Array.from(synSet);
}

/**
 * Mengekstrak sinonim ketat (exactSynonyms) dan istilah intent/masalah (intentTerms)
 * secara terpisah menggunakan pencocokan batas kata (hasWholeTerm).
 */
export function expandQueryTokens(query: string): {
  rawQuery: string;
  tokens: string[];
  meaningfulTokens: string[];
  exactSynonyms: string[];
  intentTerms: string[];
  expandedTerms: string[];
  matchedCategories: string[];
} {
  const normalizedQuery = normalizeToken(query);
  const tokens = tokenize(normalizedQuery);
  const meaningfulTokens = tokens.filter((t) => !SEARCH_STOPWORDS.has(t));
  const exactSynonyms = getExactSynonymsForQuery(normalizedQuery);

  const intentSet = new Set<string>();
  const matchedCategories = new Set<string>();

  // Cek pencocokan intent / masalah pelanggan menggunakan batas kata ketat
  for (const group of TOKOBANGUNAN_SYNONYMS) {
    // Jika kueri mengandung kata negatif untuk grup ini (misal "cat besi" untuk grup Besi Tulangan), lewati
    if (group.negativeKeywords?.some((neg) => hasWholeTerm(normalizedQuery, neg))) {
      continue;
    }

    let matchedByIntent = false;
    let matchedByKeyword = false;

    for (const intent of group.intents) {
      if (hasWholeTerm(normalizedQuery, intent)) {
        matchedByIntent = true;
        break;
      }
    }

    if (!matchedByIntent) {
      // Cek kecocokan minimal 2 token dari salah satu frasa intent (contoh: "tembok bocor" -> cocok "tembok rembes" / "atap bocor")
      for (const intent of group.intents) {
        const intentWords = tokenize(intent).filter((w) => !SEARCH_STOPWORDS.has(w));
        if (intentWords.length >= 2) {
          const hits = intentWords.filter((w) => hasWholeTerm(normalizedQuery, w)).length;
          if (hits === intentWords.length) {
            matchedByIntent = true;
            break;
          }
        }
      }
    }

    if (!matchedByIntent) {
      for (const kw of group.keywords) {
        if (hasWholeTerm(normalizedQuery, kw)) {
          matchedByKeyword = true;
          break;
        }
      }
    }

    if (matchedByIntent) {
      matchedCategories.add(group.category);
      group.keywords.forEach((kw) => intentSet.add(kw));
      group.relatedTerms.forEach((rt) => intentSet.add(rt));
    } else if (matchedByKeyword) {
      matchedCategories.add(group.category);
      // Saat kueri sudah menyebut kata kunci produk langsung, jangan menyemburkan seluruh kategori lain
      group.relatedTerms.forEach((rt) => intentSet.add(rt));
    }
  }

  const intentTerms = Array.from(intentSet);
  const expandedTerms = Array.from(new Set([...exactSynonyms, ...intentTerms]));

  return {
    rawQuery: query.trim(),
    tokens,
    meaningfulTokens: meaningfulTokens.length > 0 ? meaningfulTokens : tokens,
    exactSynonyms,
    intentTerms,
    expandedTerms,
    matchedCategories: Array.from(matchedCategories),
  };
}

/**
 * Memotong teks secara rapi pada batas kata
 */
function truncateClean(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  const sliced = cleaned.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced).trim();
}

/**
 * Membangun teks Clean Natural Passage (v2) untuk embedding model (multilingual-e5-small)
 *
 * Perubahan anti-halusinasi v2:
 * - Menghapus SKU, Barcode, Supplier, dan label template kaku berulang ("Nama Produk:", "SKU:", "Kategori:").
 * - Menggunakan hasWholeTerm() pada nama & kategori produk saja untuk menentukan tag kegunaan (maks 4 tag),
 *   sehingga produk seperti "Besi Beton" atau "Amplas" tidak pernah lagi tercemar tag kategori lain.
 */
export function buildProductPassage(product: {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  brand?: string | null;
  supplier_name?: string | null;
  description?: string | null;
  material?: string | null;
  specifications?: string | null;
  variants?: Array<{
    variant_name?: string | null;
    sku?: string | null;
    attributes?: Record<string, string> | null;
    units?: Array<{ unit_name?: string | null; conversion_factor?: number | null }>;
  }>;
}): string {
  const parts: string[] = [];
  const nameClean = (product.name || '').trim();
  const nameLower = nameClean.toLowerCase();

  // 1. Identitas Produk Natural
  if (nameClean) {
    parts.push(nameClean);
  }

  // 2. Taksonomi & Merek (hanya jika belum tercantum persis di nama)
  const catClean = (product.category_name || '').trim();
  if (catClean && !nameLower.includes(catClean.toLowerCase())) {
    parts.push(`Kategori ${catClean}`);
  }

  const brandClean = (product.brand || '').trim();
  if (brandClean && !hasWholeTerm(nameLower, brandClean)) {
    parts.push(`Merek ${brandClean}`);
  }

  // 3. Karakteristik Fisik, Spesifikasi & Deskripsi Ringkas
  const matClean = (product.material || '').trim();
  if (matClean) {
    parts.push(`Material ${truncateClean(matClean, 80)}`);
  }

  const specsClean = (product.specifications || '').trim();
  if (specsClean) {
    parts.push(truncateClean(specsClean, 140));
  }

  const descClean = (product.description || '').trim();
  if (descClean) {
    parts.push(truncateClean(descClean, 200));
  }

  // 4. Varian & Satuan Ringkas (maks 8 varian agar vektor tetap tajam)
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const variantNames: string[] = [];
    const unitNames: string[] = [];
    const attrEntries: string[] = [];

    for (const v of product.variants) {
      const vn = (v.variant_name || '').trim();
      if (vn && vn.toLowerCase() !== 'default' && !variantNames.includes(vn)) {
        variantNames.push(vn);
      }
      if (v.attributes && typeof v.attributes === 'object') {
        for (const [k, val] of Object.entries(v.attributes)) {
          if (val && !attrEntries.includes(`${k}: ${val}`)) {
            attrEntries.push(`${k}: ${val}`);
          }
        }
      }
      if (Array.isArray(v.units)) {
        for (const u of v.units) {
          const un = (u.unit_name || '').trim();
          if (un && !unitNames.includes(un)) {
            unitNames.push(un);
          }
        }
      }
    }

    if (variantNames.length > 0) {
      parts.push(`Varian ${variantNames.slice(0, 8).join(', ')}`);
    }
    if (attrEntries.length > 0) {
      parts.push(`Atribut Varian: ${attrEntries.join(', ')}`);
    }
    if (unitNames.length > 0) {
      parts.push(`Satuan ${unitNames.slice(0, 5).join(', ')}`);
    }
  }

  // 5. Tag Kegunaan & Sinonim Ketat (HANYA dari nama + kategori, dengan hasWholeTerm & negativeKeywords)
  const coreIdentityText = `${nameClean} ${catClean}`.toLowerCase();
  const useCaseTags = new Set<string>();

  // Tambahkan padanan sinonim 1-ke-1 yang relevan dengan nama produk
  for (const synGroup of EXACT_SYNONYM_GROUPS) {
    if (synGroup.some((t) => hasWholeTerm(coreIdentityText, t))) {
      for (const t of synGroup) {
        if (!hasWholeTerm(coreIdentityText, t) && useCaseTags.size < 3) {
          useCaseTags.add(t);
        }
      }
    }
  }

  // Tambahkan maksimal 4 intent masalah dari grup domain yang BENAR-BENAR cocok pada identitas produk
  for (const group of TOKOBANGUNAN_SYNONYMS) {
    if (group.negativeKeywords?.some((neg) => hasWholeTerm(coreIdentityText, neg))) {
      continue;
    }

    const hasStrictKeywordMatch = group.keywords.some((kw) => hasWholeTerm(coreIdentityText, kw));
    if (hasStrictKeywordMatch) {
      for (const intent of group.intents.slice(0, 4)) {
        if (useCaseTags.size < 6) {
          useCaseTags.add(intent);
        }
      }
    }
  }

  if (useCaseTags.size > 0) {
    parts.push(`Kegunaan: ${Array.from(useCaseTags).join(', ')}`);
  }

  // Prefix 'passage: ' wajib sesuai arsitektur multilingual-e5
  return `passage: ${parts.join('. ')}`;
}

export interface KeywordMatchOptions {
  /** Aktifkan ekspansi istilah intent/masalah (true untuk hybrid/semantic, false untuk keyword ketat) */
  includeIntentSynonyms?: boolean;
  /** Aktifkan toleransi typo fuzzy Damerau-Levenshtein (default: true) */
  includeFuzzy?: boolean;
}

export interface KeywordMatchResult {
  score: number;
  /** Skor kecocokan langsung (eksak, prefix, token, exact synonym, fuzzy) tanpa ekspansi intent */
  directScore: number;
  matchedTerms: string[];
  fuzzyMatches: Array<{ queryToken: string; matchedWord: string; similarity: number }>;
  matchedIntentCategories: string[];
}

/**
 * Menghitung skor kecocokan leksikal multi-field + Exact Synonym + Fuzzy Typo Tolerance.
 */
export function scoreKeywordMatch(
  product: {
    id: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    category_name?: string | null;
    brand?: string | null;
    supplier_name?: string | null;
    material?: string | null;
    specifications?: string | null;
    description?: string | null;
    variants?: Array<{
      variant_name?: string | null;
      sku?: string | null;
      barcode?: string | null;
      units?: Array<{ unit_name?: string | null }>;
    }>;
  },
  query: string,
  options?: KeywordMatchOptions
): KeywordMatchResult {
  if (!query || !query.trim()) {
    return {
      score: 0,
      directScore: 0,
      matchedTerms: [],
      fuzzyMatches: [],
      matchedIntentCategories: [],
    };
  }

  const includeIntentSynonyms = options?.includeIntentSynonyms ?? false;
  const includeFuzzy = options?.includeFuzzy ?? true;

  const rawQ = query.trim().toLowerCase();
  const {
    meaningfulTokens: tokens,
    exactSynonyms,
    intentTerms,
    matchedCategories,
  } = expandQueryTokens(rawQ);

  const matchedTerms = new Set<string>();
  const fuzzyMatches: Array<{ queryToken: string; matchedWord: string; similarity: number }> = [];
  let directScore = 0;
  let intentScore = 0;

  const pSku = (product.sku || '').toLowerCase();
  const pBarcode = (product.barcode || '').toLowerCase();
  const pName = (product.name || '').toLowerCase();
  const pBrand = (product.brand || '').toLowerCase();
  const pCategory = (product.category_name || '').toLowerCase();
  const pMaterial = (product.material || '').toLowerCase();
  const pSpecs = (product.specifications || '').toLowerCase();
  const pDesc = (product.description || '').toLowerCase();

  // 1. Exact / Prefix / Contains Match SKU & Barcode (Bobot tertinggi: 1000)
  if (pSku === rawQ || (pBarcode && pBarcode === rawQ)) {
    directScore += 1000;
    matchedTerms.add(rawQ);
  } else if (pSku.startsWith(rawQ) || (pBarcode && pBarcode.startsWith(rawQ))) {
    directScore += 500;
    matchedTerms.add(rawQ);
  } else if (pSku.includes(rawQ) || (pBarcode && pBarcode.includes(rawQ))) {
    directScore += 250;
    matchedTerms.add(rawQ);
  }

  // 2. Phrase & Prefix Match pada Nama Produk
  if (pName === rawQ) {
    directScore += 800;
    matchedTerms.add(pName);
  } else if (pName.startsWith(rawQ)) {
    directScore += 450;
    matchedTerms.add(rawQ);
  } else if (hasWholeTerm(pName, rawQ)) {
    directScore += 300;
    matchedTerms.add(rawQ);
  } else if (pName.includes(rawQ)) {
    directScore += 200;
    matchedTerms.add(rawQ);
  }

  // 2b. Brand Matching
  if (pBrand && pBrand === rawQ) {
    directScore += 300;
    matchedTerms.add(pBrand);
  } else if (pBrand && pBrand.startsWith(rawQ)) {
    directScore += 180;
    matchedTerms.add(pBrand);
  } else if (pBrand && hasWholeTerm(pBrand, rawQ)) {
    directScore += 120;
    matchedTerms.add(pBrand);
  } else if (pBrand && pBrand.includes(rawQ)) {
    directScore += 80;
    matchedTerms.add(pBrand);
  }

  // 2c. Category Matching
  if (pCategory && pCategory === rawQ) {
    directScore += 200;
    matchedTerms.add(pCategory);
  } else if (pCategory && pCategory.startsWith(rawQ)) {
    directScore += 120;
    matchedTerms.add(pCategory);
  } else if (pCategory && hasWholeTerm(pCategory, rawQ)) {
    directScore += 90;
    matchedTerms.add(pCategory);
  } else if (pCategory && pCategory.includes(rawQ)) {
    directScore += 60;
    matchedTerms.add(pCategory);
  }

  // 3. Varian SKU / Barcode / Variant Name Match
  const variantTexts: string[] = [];
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      const vSku = (v.sku || '').toLowerCase();
      const vBarcode = (v.barcode || '').toLowerCase();
      const vName = (v.variant_name || '').toLowerCase();
      if (vName && vName !== 'default') variantTexts.push(vName);

      if (vSku === rawQ || (vBarcode && vBarcode === rawQ)) {
        directScore += 900;
        matchedTerms.add(rawQ);
      } else if (vSku.startsWith(rawQ) || (vBarcode && vBarcode.startsWith(rawQ))) {
        directScore += 400;
        matchedTerms.add(rawQ);
      } else if (vSku.includes(rawQ) || (vBarcode && vBarcode.includes(rawQ))) {
        directScore += 180;
        matchedTerms.add(rawQ);
      }

      if (vName && vName === rawQ) {
        directScore += 250;
        matchedTerms.add(vName);
      } else if (vName && vName.startsWith(rawQ)) {
        directScore += 150;
        matchedTerms.add(vName);
      } else if (vName && vName.includes(rawQ)) {
        directScore += 80;
        matchedTerms.add(vName);
      }
    }
  }
  const variantJoined = variantTexts.join(' ');

  // Siapkan daftar kata kandidat untuk fuzzy matching (lazy only if needed)
  let candidateWordsCache: string[] | null = null;
  const getCandidateWords = () => {
    if (!candidateWordsCache) {
      candidateWordsCache = extractCandidateWords(
        `${pName} ${pBrand} ${pCategory} ${pMaterial} ${variantJoined}`
      );
    }
    return candidateWordsCache;
  };

  // 4. Token Matching Multi-Field (+ Fuzzy Fallback per token)
  let matchedTokenCount = 0;
  for (const token of tokens) {
    let tokenMatched = false;

    if (pName.startsWith(token)) {
      directScore += 85;
      tokenMatched = true;
      matchedTerms.add(token);
    } else if (hasWholeTerm(pName, token)) {
      directScore += 75;
      tokenMatched = true;
      matchedTerms.add(token);
    } else if (token.length >= 3 && pName.includes(token)) {
      directScore += 40;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (pBrand && hasWholeTerm(pBrand, token)) {
      directScore += 55;
      tokenMatched = true;
      matchedTerms.add(token);
    } else if (pBrand && token.length >= 3 && pBrand.includes(token)) {
      directScore += 30;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (pCategory && hasWholeTerm(pCategory, token)) {
      directScore += 45;
      tokenMatched = true;
      matchedTerms.add(token);
    } else if (pCategory && token.length >= 3 && pCategory.includes(token)) {
      directScore += 25;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (pMaterial && hasWholeTerm(pMaterial, token)) {
      directScore += 35;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (pSpecs && hasWholeTerm(pSpecs, token)) {
      directScore += 30;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (variantJoined && hasWholeTerm(variantJoined, token)) {
      directScore += 40;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (pDesc && hasWholeTerm(pDesc, token)) {
      directScore += 18;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    // Jika token belum cocok secara literal, coba Fuzzy Typo Matching (Damerau-Levenshtein + Trigram)
    if (!tokenMatched && includeFuzzy && token.length >= 4) {
      const fuzzy = scoreFuzzyTokenMatch(token, getCandidateWords());
      if (fuzzy.matched && fuzzy.bestWord) {
        directScore += Math.round(52 * fuzzy.similarity);
        tokenMatched = true;
        matchedTerms.add(fuzzy.bestWord);
        fuzzyMatches.push({
          queryToken: token,
          matchedWord: fuzzy.bestWord,
          similarity: fuzzy.similarity,
        });
      }
    }

    if (tokenMatched) {
      matchedTokenCount++;
    }
  }

  // Bonus jika semua kata kueri bermakna ditemukan
  if (tokens.length > 1 && matchedTokenCount === tokens.length) {
    directScore += 200;
  }

  // 5. Pencocokan Exact Synonyms 1-ke-1 (aktif di semua mode, ketat dengan hasWholeTerm)
  let exactSynHits = 0;
  for (const syn of exactSynonyms) {
    if (exactSynHits >= 2) break;
    if (hasWholeTerm(pName, syn)) {
      directScore += 160;
      matchedTerms.add(syn);
      exactSynHits++;
    } else if (hasWholeTerm(pCategory, syn) || hasWholeTerm(pSpecs, syn)) {
      directScore += 80;
      matchedTerms.add(syn);
      exactSynHits++;
    }
  }

  // Guard Cakupan Multi-Kata (Anti-Halusinasi untuk kueri >= 3 kata):
  // Jika pengguna mengetik >= 3 kata (misal "obat sakit kepala" atau "sepatu lari nike")
  // dan produk hanya kebetulan cocok 1 kata tunggal (cakupan < 50%) tanpa kecocokan frase/SKU/sinonim,
  // abaikan kecocokan insidental tersebut.
  if (
    tokens.length >= 3 &&
    exactSynHits === 0 &&
    directScore < 200 &&
    matchedTokenCount < Math.ceil(tokens.length / 2)
  ) {
    directScore = 0;
    matchedTerms.clear();
  }

  // 6. Pencocokan Istilah Intent / Masalah Pelanggan (HANYA jika includeIntentSynonyms === true)
  // Dibatasi maks 3 kecocokan (maks +120 poin) agar tidak pernah menenggelamkan kecocokan literal
  if (includeIntentSynonyms && intentTerms.length > 0) {
    let intentHits = 0;
    const identityAndSpec = `${pName} ${pCategory} ${pBrand} ${pMaterial} ${pSpecs} ${pDesc}`;
    for (const term of intentTerms) {
      if (intentHits >= 3) break;
      if (hasWholeTerm(pName, term)) {
        intentScore += 45;
        matchedTerms.add(term);
        intentHits++;
      } else if (hasWholeTerm(identityAndSpec, term)) {
        intentScore += 30;
        matchedTerms.add(term);
        intentHits++;
      }
    }
  }

  return {
    score: directScore + intentScore,
    directScore,
    matchedTerms: Array.from(matchedTerms),
    fuzzyMatches,
    matchedIntentCategories: matchedCategories,
  };
}
