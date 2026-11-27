/**
 * Query Intent Analyzer & Hard Attribute Guard untuk Pencarian Toko Bangunan
 *
 * Menganalisis kueri pengguna untuk:
 * 1. Menentukan strategi Hybrid Gating (SKU/Kode vs Kata Singkat vs Atribut Ukuran vs Intent Deskriptif).
 * 2. Mengekstrak atribut numerik/ukuran (10mm, 1/2 inch, 40kg, 60x60, 18 watt) untuk validasi ketat.
 * 3. Mengidentifikasi Head-Noun Bahasa Indonesia (Hukum DM: "cat besi" -> inti "cat", bukan "besi").
 */

import { getExactSynonymsForQuery, hasWholeTerm, normalizeToken, SEARCH_STOPWORDS, tokenize } from './searchSynonyms.js';

export type QueryIntentType =
  | 'code_or_sku'
  | 'attribute_specific'
  | 'short_exact'
  | 'descriptive_intent';

export type AttributeUnitFamily =
  | 'mm'
  | 'cm'
  | 'm'
  | 'inch'
  | 'kg'
  | 'g'
  | 'l'
  | 'watt'
  | 'ampere'
  | 'dim'
  | 'grid';

export interface NumericAttribute {
  raw: string;
  value: number | string;
  unitFamily: AttributeUnitFamily;
}

export interface AnalyzedQuery {
  raw: string;
  normalized: string;
  tokens: string[];
  meaningfulTokens: string[];
  intentType: QueryIntentType;
  attributes: NumericAttribute[];
  hasNumericConstraint: boolean;
  /** Kata benda inti (Hukum DM Bahasa Indonesia), misal "cat" pada "cat besi" */
  headNoun: string | null;
  /** Variasi sinonim persis dari headNoun (termasuk headNoun itu sendiri) */
  headNounVariants: string[];
}

const MULTI_WORD_HEAD_NOUNS: string[] = [
  'mata bor', 'mata gerinda', 'batu potong', 'stop kran', 'stop kontak',
  'box mcb', 'bata ringan', 'bata merah', 'baja ringan', 'kawat las',
  'kawat bendrat', 'seal tape', 'kunci pintu', 'engsel pintu', 'engsel jendela',
  'handle pintu', 'gagang pintu', 'bak cuci piring', 'kitchen sink',
  'floor drain', 'saringan got', 'jet shower', 'sendok semen', 'kertas gosok',
  'roll cat', 'kuas cat', 'bak cat', 'lampu led', 'kabel listrik',
];

const SINGLE_WORD_HEAD_NOUNS = new Set<string>([
  'cat', 'pipa', 'paralon', 'pralon', 'lem', 'paku', 'baut', 'sekrup', 'screw',
  'mur', 'dynabolt', 'fisher', 'fischer', 'kunci', 'engsel', 'grendel', 'handle',
  'kran', 'keran', 'shower', 'kloset', 'closet', 'wastafel', 'toren', 'tandon',
  'gergaji', 'palu', 'martil', 'cetok', 'cangkul', 'sekop', 'meteran', 'waterpass',
  'gerinda', 'bor', 'amplas', 'ampelas', 'kuas', 'thinner', 'tiner', 'plamir',
  'dempul', 'meni', 'politur', 'plitur', 'varnish', 'kabel', 'saklar', 'steker',
  'colokan', 'mcb', 'lampu', 'semen', 'mortar', 'keramik', 'granit', 'granite',
  'nat', 'atap', 'seng', 'spandek', 'alderon', 'gypsum', 'grc', 'kalsiboard',
  'talang', 'besi', 'hollow', 'holo', 'wiremesh', 'bondek', 'kawat', 'selang',
  'keni', 'knee', 'elbow', 'sok', 'tee', 'watermur', 'dop', 'batako', 'pasir',
  'split', 'asbes', 'triplek', 'polycarbonate', 'polikarbonat', 'waterproofing',
  'aquaproof', 'nodrop', 'damdex', 'sealant', 'obeng', 'tang',
]);

/**
 * Mengonversi angka/pecahan (misal "1/2", "1 1/2", "2,5") menjadi number
 */
function parseNumericValue(rawNum: string): number | null {
  const cleaned = rawNum.trim().replace(/,/g, '.');

  // Pecahan campuran: "1 1/2"
  const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    return den > 0 ? whole + num / den : null;
  }

  // Pecahan sederhana: "1/2", "3/4"
  const fracMatch = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    return den > 0 ? num / den : null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapUnitToFamily(unitRaw: string): AttributeUnitFamily | null {
  const u = unitRaw.trim().toLowerCase();
  if (u === 'mm') return 'mm';
  if (u === 'cm') return 'cm';
  if (u === 'm' || u === 'meter' || u === 'mtr') return 'm';
  if (u === '"' || u === 'in' || u === 'inch' || u === 'inci' || u === 'inc' || u === 'dim') return 'inch';
  if (u === 'kg' || u === 'kilo' || u === 'kilogram') return 'kg';
  if (u === 'g' || u === 'gr' || u === 'gram') return 'g';
  if (u === 'l' || u === 'ltr' || u === 'liter') return 'l';
  if (u === 'w' || u === 'watt') return 'watt';
  if (u === 'a' || u === 'amp' || u === 'ampere') return 'ampere';
  return null;
}

/**
 * Mengekstrak atribut numerik/dimensi dari teks kueri maupun teks produk
 */
export function extractNumericAttributes(text: string): NumericAttribute[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const results: NumericAttribute[] = [];
  const seen = new Set<string>();

  const pushAttr = (raw: string, value: number | string, unitFamily: AttributeUnitFamily) => {
    const key = `${unitFamily}:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ raw: raw.trim(), value, unitFamily });
    }
  };

  // 1. Dimensi 2D (misal 60x60, 40x40, 20x40)
  const dimRegex = /\b(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = dimRegex.exec(lower)) !== null) {
    const d1 = m[1].replace(',', '.');
    const d2 = m[2].replace(',', '.');
    pushAttr(m[0], `${d1}x${d2}`, 'dim');
  }

  // 2. Grid amplas (#1000, #400, grid 240)
  const gridRegex = /(?:#|grid\s*#?)\s*(\d{2,4})\b/gi;
  while ((m = gridRegex.exec(lower)) !== null) {
    const val = Number(m[1]);
    if (Number.isFinite(val)) pushAttr(m[0], val, 'grid');
  }

  // 3. Angka/pecahan diikuti satuan eksplisit (10mm, 1/2 inch, 1/2", 40kg, 5 liter, 18 watt, 10a)
  const unitRegex =
    /(?:^|[^a-z0-9])(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(mm|cm|meter|mtr|m|inch|inci|inc|in|"|dim|kilogram|kilo|kg|gram|gr|g|liter|ltr|l|watt|w|ampere|amp|a)(?=$|[^a-z0-9])/gi;
  while ((m = unitRegex.exec(lower)) !== null) {
    const rawNum = m[1];
    const rawUnit = m[2];
    const family = mapUnitToFamily(rawUnit);
    const val = parseNumericValue(rawNum);
    if (family && val !== null) {
      pushAttr(`${rawNum}${rawUnit === '"' ? '"' : ` ${rawUnit}`}`, val, family);
    }
  }

  // 4. Pecahan pipa standar tanpa satuan eksplisit (misal "pipa 1/2", "keni 3/4") -> unitFamily 'inch'
  const fracBareRegex = /(?:^|[^a-z0-9/])(\d+\/\d+)(?=$|[^a-z0-9/])/g;
  while ((m = fracBareRegex.exec(lower)) !== null) {
    const val = parseNumericValue(m[1]);
    if (val !== null && val > 0 && val <= 4) {
      pushAttr(m[1], val, 'inch');
    }
  }

  return results;
}

/**
 * Mengevaluasi kecocokan atribut numerik antara kueri dan kandidat produk.
 * - 'match'   : setidaknya 1 atribut ukuran cocok persis, tanpa konflik.
 * - 'conflict': kandidat memiliki atribut pada satuan yang sama (misal sama-sama mm atau inch)
 *               tetapi nilainya berbeda (misal kueri "pipa 4 inch", produk "pipa 1/2 inch").
 * - 'neutral' : produk tidak mencantumkan satuan pembanding yang relevan.
 */
export function evaluateAttributeCompatibility(
  queryAttrs: NumericAttribute[],
  productText: string
): { status: 'match' | 'conflict' | 'neutral'; matchedCount: number; conflictCount: number } {
  if (!queryAttrs.length) {
    return { status: 'neutral', matchedCount: 0, conflictCount: 0 };
  }

  const productAttrs = extractNumericAttributes(productText);
  let matchedCount = 0;
  let conflictCount = 0;

  for (const qAttr of queryAttrs) {
    const sameFamily = productAttrs.filter((pa) => pa.unitFamily === qAttr.unitFamily);

    const exactMatch =
      sameFamily.some((pa) => {
        if (typeof qAttr.value === 'number' && typeof pa.value === 'number') {
          return Math.abs(pa.value - qAttr.value) < 0.01;
        }
        return String(pa.value) === String(qAttr.value);
      }) || hasWholeTerm(productText, qAttr.raw);

    if (exactMatch) {
      matchedCount++;
    } else if (sameFamily.length > 0) {
      conflictCount++;
    }
  }

  if (matchedCount > 0 && conflictCount === 0) {
    return { status: 'match', matchedCount, conflictCount };
  }
  if (conflictCount > 0 && matchedCount === 0) {
    return { status: 'conflict', matchedCount, conflictCount };
  }
  if (matchedCount > 0 && conflictCount > 0) {
    // Jika produk multi-varian memiliki beberapa ukuran dan salah satunya cocok, tetap dianggap match
    return { status: 'match', matchedCount, conflictCount };
  }
  return { status: 'neutral', matchedCount, conflictCount };
}

/**
 * Mendeteksi apakah kueri berbentuk kode SKU atau Barcode
 */
function isCodeOrSkuPattern(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Barcode murni angka >= 6 digit
  if (/^\d{6,}$/.test(trimmed)) return true;
  // Pola SKU dengan tanda hubung (misal BSI-ULR-10MM, CAT-DLX-01, PIP-001)
  if (/^[a-z0-9]{2,6}(?:-[a-z0-9]{1,8})+$/i.test(trimmed)) return true;
  // Kode alfanumerik rapat tanpa spasi yang mengandung huruf dan angka panjang >= 5 (kecuali ukuran seperti "10mm")
  if (
    !/\s/.test(trimmed) &&
    trimmed.length >= 5 &&
    /[a-z]/i.test(trimmed) &&
    /\d/.test(trimmed) &&
    !/^\d+(?:[.,]\d+)?(?:mm|cm|m|kg|gr|g|ltr|l|inch|in|watt|w|amp|a)$/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Mengekstrak kata benda inti (head noun) sesuai Hukum DM Bahasa Indonesia
 * Contoh: "cat besi anti karat" -> headNoun: "cat"
 *         "lem pipa pvc" -> headNoun: "lem"
 *         "nambal tembok rembes" -> headNoun: null (frasa aksi/masalah, bukan kata benda inti)
 */
function extractHeadNoun(normalized: string, tokens: string[]): {
  headNoun: string | null;
  headNounVariants: string[];
} {
  if (tokens.length < 2) {
    return { headNoun: null, headNounVariants: [] };
  }

  // 1. Cek head noun 2-kata di awal kueri (misal "mata bor beton", "stop kran air")
  for (const multi of MULTI_WORD_HEAD_NOUNS) {
    if (normalized.startsWith(`${multi} `)) {
      const syns = getExactSynonymsForQuery(multi);
      return {
        headNoun: multi,
        headNounVariants: Array.from(new Set([multi, ...syns])),
      };
    }
  }

  // 2. Cek head noun 1-kata di awal kueri (misal "cat besi", "paku beton", "pipa pvc 4 inch")
  const firstToken = tokens[0];
  if (SINGLE_WORD_HEAD_NOUNS.has(firstToken)) {
    const syns = getExactSynonymsForQuery(firstToken);
    return {
      headNoun: firstToken,
      headNounVariants: Array.from(new Set([firstToken, ...syns])),
    };
  }

  return { headNoun: null, headNounVariants: [] };
}

/**
 * Memeriksa kecocokan Head-Noun produk sesuai Hukum DM Bahasa Indonesia.
 * Contoh:
 * - Query "besi 10mm" (head: "besi") vs "Besi Beton Ulir 10mm" -> true (produk memang besi)
 * - Query "besi 10mm" (head: "besi") vs "Cat Besi & Kayu" -> false (produk adalah "cat", bukan "besi"!)
 * - Query "besi 10mm" (head: "besi") vs "Mata Bor Besi" -> false (produk adalah "mata bor", bukan "besi"!)
 * - Query "cat besi" (head: "cat") vs "Dulux Cat Besi" -> true ("dulux" bukan head noun konflik)
 */
export function isProductHeadCompatible(
  headNounVariants: string[],
  productName: string,
  productCategory?: string | null
): boolean {
  if (!headNounVariants.length) return true;

  const nameNorm = normalizeToken(productName || '');
  const catNorm = normalizeToken(productCategory || '');
  const identityText = `${nameNorm} ${catNorm}`.trim();

  // 1. Produk harus menyebut headNoun (atau sinonim persisnya) di nama atau kategori
  const mentionsHead = headNounVariants.some((variant) => hasWholeTerm(identityText, variant));
  if (!mentionsHead) return false;

  // 2. Jika nama produk DIAWALI langsung oleh headNoun / sinonimnya -> pasti cocok!
  const nameStartsWithHead = headNounVariants.some(
    (variant) => nameNorm === variant || nameNorm.startsWith(`${variant} `)
  );
  if (nameStartsWithHead) return true;

  // 3. Cek apakah nama produk diawali oleh head-noun produk LAIN yang bertentangan
  // (misal "cat besi" diawali "cat", "mata bor besi" diawali "mata bor", "lem pipa" diawali "lem")
  const variantSet = new Set(headNounVariants.map((v) => v.toLowerCase()));

  for (const multi of MULTI_WORD_HEAD_NOUNS) {
    if (nameNorm === multi || nameNorm.startsWith(`${multi} `)) {
      return variantSet.has(multi);
    }
  }

  const firstWord = nameNorm.split(' ')[0];
  if (firstWord && SINGLE_WORD_HEAD_NOUNS.has(firstWord)) {
    // Izinkan jika kata pertama adalah variasi dari headNoun yang diminta (misal "paralon" <-> "pipa")
    if (variantSet.has(firstWord)) return true;
    // Cek juga apakah firstWord bersinonim dengan salah satu headNounVariants
    const firstSyns = getExactSynonymsForQuery(firstWord);
    if (firstSyns.some((s) => variantSet.has(s))) return true;
    // Jika kata pertama adalah tipe produk lain (misal "cat", "lem", "klem", "dop", "bor"), tolak!
    return false;
  }

  return true;
}

/**
 * Menganalisis kueri pencarian mentah untuk routing Hybrid Gating & Guard
 */
export function analyzeSearchQuery(rawQuery: string): AnalyzedQuery {
  const raw = (rawQuery || '').trim();
  const normalized = normalizeToken(raw);
  const tokens = tokenize(normalized);
  const meaningfulTokens = tokens.filter((t) => !SEARCH_STOPWORDS.has(t));
  const activeTokens = meaningfulTokens.length > 0 ? meaningfulTokens : tokens;

  const attributes = extractNumericAttributes(raw);
  const hasNumericConstraint = attributes.length > 0;
  const { headNoun, headNounVariants } = extractHeadNoun(normalized, activeTokens);

  let intentType: QueryIntentType;
  if (isCodeOrSkuPattern(raw)) {
    intentType = 'code_or_sku';
  } else if (hasNumericConstraint) {
    intentType = 'attribute_specific';
  } else if (activeTokens.length <= 1) {
    intentType = 'short_exact';
  } else {
    intentType = 'descriptive_intent';
  }

  return {
    raw,
    normalized,
    tokens,
    meaningfulTokens: activeTokens,
    intentType,
    attributes,
    hasNumericConstraint,
    headNoun,
    headNounVariants,
  };
}
