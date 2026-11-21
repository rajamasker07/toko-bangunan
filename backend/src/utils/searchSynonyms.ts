/**
 * Kamus Sinonim & Istilah Masalah Sehari-hari Toko Bangunan (Domain Knowledge)
 * Digunakan untuk:
 * 1. Menghubungkan kueri bahasa sehari-hari / keluhan pelanggan (misal: "tembok rembes", "sambungan pipa belok")
 *    dengan nama produk teknis (misal: "Aquaproof", "Keni PVC AW Rucika").
 * 2. Memperkaya passage embedding produk agar representasi semantik lebih akurat.
 * 3. Memberikan skor leksikal multi-field berbobot tinggi.
 */

export interface SynonymGroup {
  category: string;
  keywords: string[];
  intents: string[];
  relatedTerms: string[];
}

export const TOKOBANGUNAN_SYNONYMS: SynonymGroup[] = [
  {
    category: 'Waterproofing & Anti Bocor',
    keywords: ['waterproofing', 'anti bocor', 'antibocor', 'pelapis anti bocor', 'kedap air', 'aquaproof', 'no drop', 'nodrop', 'damdex', 'sika', 'sealant', 'aspal cair', 'flashing tape'],
    intents: ['tembok rembes', 'dinding rembes', 'atap bocor', 'dak bocor', 'genteng bocor', 'bocor hujan', 'dinding lembab', 'tembok basah', 'nat bocor', 'nambal retak', 'tambal bocor', 'nambal tembok'],
    relatedTerms: ['cat pelapis', 'semen waterproofing', 'elastis', 'serat fiber', 'kasa fiber', 'membrane'],
  },
  {
    category: 'Perpipaan & Fitting',
    keywords: ['pipa', 'paralon', 'pralon', 'pvc', 'rucika', 'wavin', 'maspion', 'pipa aw', 'pipa d', 'fitting pvc', 'keni', 'knee', 'elbow', 'sok', 'sock', 'tee', 'letter t', 'drat', 'watermur', 'vlok ring', 'flange', 'lem pipa', 'lem pralon', 'isarplas', 'seal tape', 'sealtape'],
    intents: ['pipa belok', 'sambungan belok', 'sambungan pipa belok', 'sambungan pipa air', 'cabang pipa', 'sambungan pipa cabang', 'sambung pralon', 'saluran pembuangan', 'saluran air kotor', 'pipa pompa air', 'pipa sanyo', 'pipa sumur', 'paralon bocor'],
    relatedTerms: ['kran air', 'stop kran', 'valve', 'tandon', 'toren air', 'tutup pipa', 'dop'],
  },
  {
    category: 'Semen & Mortar',
    keywords: ['semen', 'semen pcc', 'semen opc', 'tiga roda', 'tigaroda', 'semen gresik', 'gresik', 'dynamix', 'holcim', 'padang', 'merdeka', 'mortar', 'semen instan', 'mu', 'mortar utama', 'acian', 'plester', 'plesteran', 'perekat bata ringan', 'thinbed'],
    intents: ['cor beton', 'cor lantai', 'cor dak', 'cor pondasi', 'cor tiang', 'sloof', 'kolom', 'pondasi rumah', 'pasang hebel', 'pasang bata ringan', 'aci tembok', 'plester dinding', 'nambal semen'],
    relatedTerms: ['pasir cor', 'split', 'batu krikil', 'obat cor', 'calbond', 'sikament', 'pengeras beton'],
  },
  {
    category: 'Besi & Baja Tulangan',
    keywords: ['besi', 'besi beton', 'besi ulir', 'besi polos', 'besi behel', 'begel', 'beugel', 'cakar ayam', 'wiremesh', 'baja ringan', 'kanal c', 'truss', 'reng baja', 'hollow', 'holo', 'pipa besi', 'plat besi', 'besi siku', 'bondek'],
    intents: ['tulangan cor', 'tulangan pondasi', 'rangka atap', 'rangka plafon', 'tiang cor', 'pagar besi', 'tralis', 'besi anti karat', 'besi pondasi'],
    relatedTerms: ['kawat bendrat', 'baut roofing', 'sekrup gypsum', 'dynabolt', 'sni'],
  },
  {
    category: 'Cat & Finishing',
    keywords: ['cat', 'cat tembok', 'cat dinding', 'cat kayu', 'cat besi', 'cat genteng', 'cat kolam', 'cat lapangan', 'dulux', 'catylac', 'avitex', 'vinilex', 'danapaint', 'jotun', 'nippon paint', 'aries', 'emco', 'ftalit', 'avian', 'plamir', 'dempul', 'thinner', 'tiner', 'meni besi', 'meni kayu'],
    intents: ['cat anti karat', 'cat pagar besi', 'cat interior', 'cat eksterior', 'dinding kusam', 'cat tahan cuaca', 'cat mengelupas', 'menghilangkan karat', 'pelapis kayu', 'varnish', 'plitur', 'politur'],
    relatedTerms: ['kuas cat', 'roll cat', 'bak cat', 'ampelas', 'amplas', 'kertas gosok', 'solasi kertas', 'masking tape'],
  },
  {
    category: 'Keramik & Granit',
    keywords: ['keramik', 'granit', 'granite', 'lantai', 'ubin', 'tile', 'homogenous tile', 'roman', 'milan', 'ikad', 'mulia', 'asia tile', 'nat', 'nat keramik', 'semen nat', 'pengisi nat', 'lem keramik', 'perekat granit', 'mu 400', 'mu 450', 'am 53', 'am 50'],
    intents: ['perekat keramik lantai', 'pasang granit', 'keramik kamar mandi', 'keramik kasar', 'keramik dinding dapur', 'ganti nat keramik', 'nat anti bocor', 'keramik terangkat', 'tile popping'],
    relatedTerms: ['spacer keramik', 'perata keramik', 'trowel', 'roskam gerigi', 'pemotong keramik'],
  },
  {
    category: 'Pengikat & Paku',
    keywords: ['paku', 'paku kayu', 'paku usuk', 'paku reng', 'paku kaso', 'paku triplek', 'paku seng', 'paku asbes', 'paku payung', 'paku beton', 'sekrup', 'screw', 'baut', 'bolt', 'mur', 'nut', 'fisher', 'fischer', 'dynabolt', 'ramset', 'sekrup gypsum', 'baut roofing'],
    intents: ['paku rangka atap', 'pasang gypsum', 'pasang plafon', 'paku kayu keras', 'baut baja ringan', 'pasang kanopi', 'gantungan dinding beton', 'pengikat kayu'],
    relatedTerms: ['kawat las', 'kawat loket', 'kawat ayakan', 'kawat bendrat'],
  },
  {
    category: 'Atap & Plafon',
    keywords: ['atap', 'seng', 'seng gelombang', 'spandek', 'alderon', 'upvc', 'polycarbonate', 'polikarbonat', 'fiber bening', 'genteng metal', 'asbes', 'gypsum', 'jayaboard', 'elephant', 'grc board', 'kalsiboard', 'list profil', 'cornice'],
    intents: ['atap bening kanopi', 'atap kanopi dingin', 'atap tembus cahaya', 'tutup kanopi', 'plafon tahan air', 'plafon kamar mandi', 'plafon anti jamur', 'atap gudang'],
    relatedTerms: ['kompon gypsum', 'kasa gypsum', 'list plafon', 'talang air', 'talang seng', 'karpet talang'],
  },
  {
    category: 'Sanitari & Kamar Mandi',
    keywords: ['kran', 'keran', 'keran air', 'stop kran', 'kran cabang', 'kran shower', 'shower mandi', 'jet shower', 'bidet', 'kloset', 'closet', 'kloset duduk', 'kloset jongkok', 'toto', 'american standard', 'florence', 'bak cuci piring', 'kitchen sink', 'siphon', 'afur', 'floor drain', 'saringan got'],
    intents: ['kran air bocor', 'saringan air kamar mandi anti bau', 'saluran cucian piring', 'shower air kencang', 'saluran got mampet'],
    relatedTerms: ['pelampung toren', 'radar toren', 'selang fleksibel', 'seal karet'],
  },
  {
    category: 'Alat & Perkakas Tukang',
    keywords: ['palu', 'martil', 'cetok', 'sendok semen', 'cangkul', 'sekop', 'gergaji', 'gergaji kayu', 'gergaji besi', 'meteran', 'waterpass', 'benang bangunan', 'ember cor', 'gerinda', 'mesin bor', 'mata bor', 'mata gerinda', 'batu potong'],
    intents: ['alat aduk semen', 'alat pasang bata', 'alat ukur lurus', 'potong keramik', 'potong besi', 'bor beton', 'bor tembok'],
    relatedTerms: ['sarung tangan proyek', 'helm proyek', 'sepatu boot', 'kacamata safety'],
  },
  {
    category: 'Kelistrikan',
    keywords: ['kabel', 'kabel listrik', 'kabel nym', 'kabel nyahy', 'kabel nymhy', 'eterna', 'supreme', 'extana', 'saklar', 'stop kontak', 'steker', 'colokan', 'mcb', 'box mcb', 'schneider', 'panasonic', 'broco', 'lampu led', 'philips', 'fitting lampu', 'isolasi listrik', 'solasi hitam'],
    intents: ['stop kontak ac', 'saklar lampu ganda', 'instalasi listrik rumah', 'kabel tanam tembok', 'mcb jeglek', 'pengaman listrik'],
    relatedTerms: ['pipa conduit', 'klem kabel', 'inbow doos', 'tedus'],
  },
  {
    category: 'Pintu & Jendela',
    keywords: ['kunci pintu', 'handle pintu', 'gagang pintu', 'bodi kunci', 'silinder kunci', 'engsel', 'engsel pintu', 'engsel jendela', 'grendel', 'slot pintu', 'hak angin', 'door closer', 'dekson', 'dekson', 'bellucci', 'solid'],
    intents: ['kunci rumah anti maling', 'penahan jendela', 'gagang pintu kamar', 'kunci kamar mandi'],
    relatedTerms: ['rel pintu geser', 'roda pintu dorong'],
  },
];

/**
 * Normalisasi token (lowercase, hilangkan tanda baca berlebih)
 */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^\w\d\s-]/g, ' ')
    .trim();
}

/**
 * Memecah string menjadi token unik kata
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeToken(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  return Array.from(new Set(words));
}

/**
 * Mengekstrak sinonim dan intent terkait dari kueri
 */
export function expandQueryTokens(query: string): {
  rawQuery: string;
  tokens: string[];
  expandedTerms: string[];
  matchedCategories: string[];
} {
  const normalizedQuery = normalizeToken(query);
  const tokens = tokenize(normalizedQuery);
  const expandedSet = new Set<string>();
  const matchedCategories = new Set<string>();

  // Cek pencocokan frasa atau kata kunci pada kamus domain
  for (const group of TOKOBANGUNAN_SYNONYMS) {
    let matchedGroup = false;

    // Cek kecocokan intent / masalah pelanggan
    for (const intent of group.intents) {
      if (normalizedQuery.includes(intent.toLowerCase())) {
        matchedGroup = true;
        group.keywords.forEach((kw) => expandedSet.add(kw));
        group.relatedTerms.forEach((rt) => expandedSet.add(rt));
        break;
      }
    }

    // Cek kecocokan kata kunci produk
    if (!matchedGroup) {
      for (const kw of group.keywords) {
        if (normalizedQuery.includes(kw.toLowerCase())) {
          matchedGroup = true;
          group.keywords.forEach((k) => expandedSet.add(k));
          group.relatedTerms.forEach((rt) => expandedSet.add(rt));
          break;
        }
      }
    }

    if (matchedGroup) {
      matchedCategories.add(group.category);
    }
  }

  return {
    rawQuery: query.trim(),
    tokens,
    expandedTerms: Array.from(expandedSet),
    matchedCategories: Array.from(matchedCategories),
  };
}

/**
 * Membangun teks passage kaya konteks untuk embedding model (multilingual-e5-small)
 * Format passage wajib diawali 'passage: ' sesuai panduan e5 model
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
    units?: Array<{ unit_name?: string | null; conversion_factor?: number | null }>;
  }>;
}): string {
  const parts: string[] = [];

  // 1. Identitas Inti Produk
  parts.push(`Nama Produk: ${product.name}`);
  if (product.sku) parts.push(`SKU: ${product.sku}`);
  if (product.barcode) parts.push(`Barcode: ${product.barcode}`);

  // 2. Taksonomi & Merek
  if (product.category_name) parts.push(`Kategori: ${product.category_name}`);
  if (product.brand) parts.push(`Merek: ${product.brand}`);
  if (product.supplier_name) parts.push(`Supplier: ${product.supplier_name}`);

  // 3. Karakteristik Fisik & Spesifikasi
  if (product.material) parts.push(`Material: ${product.material}`);
  if (product.specifications) parts.push(`Spesifikasi: ${product.specifications}`);
  if (product.description) parts.push(`Deskripsi: ${product.description}`);

  // 4. Informasi Varian & Satuan
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const variantNames: string[] = [];
    const unitNames: string[] = [];

    for (const v of product.variants) {
      if (v.variant_name && v.variant_name !== 'Default') {
        variantNames.push(v.variant_name);
      }
      if (Array.isArray(v.units)) {
        for (const u of v.units) {
          if (u.unit_name && !unitNames.includes(u.unit_name)) {
            unitNames.push(u.unit_name);
          }
        }
      }
    }

    if (variantNames.length > 0) {
      parts.push(`Pilihan Varian: ${variantNames.join(', ')}`);
    }
    if (unitNames.length > 0) {
      parts.push(`Satuan: ${unitNames.join(', ')}`);
    }
  }

  // 5. Ekstraksi Tag Domain & Sinonim Otomatis
  const compositeSearchableText = [
    product.name,
    product.category_name,
    product.brand,
    product.material,
    product.specifications,
    product.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const domainTags = new Set<string>();
  for (const group of TOKOBANGUNAN_SYNONYMS) {
    const hasCategoryMatch = group.category.toLowerCase().split(/\s+/).some((w) => compositeSearchableText.includes(w));
    const hasKeywordMatch = group.keywords.some((kw) => compositeSearchableText.includes(kw.toLowerCase()));

    if (hasCategoryMatch || hasKeywordMatch) {
      // Tambahkan istilah penting dan intent masalah ke passage produk
      group.keywords.slice(0, 8).forEach((k) => domainTags.add(k));
      group.intents.slice(0, 5).forEach((it) => domainTags.add(it));
    }
  }

  if (domainTags.size > 0) {
    parts.push(`Istilah & Masalah Terkait: ${Array.from(domainTags).join(', ')}`);
  }

  // Prefix 'passage: ' sesuai arsitektur multilingual-e5
  return `passage: ${parts.join('. ')}`;
}

/**
 * Menghitung skor kecocokan leksikal multi-field (BM25-style keyword matching)
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
  query: string
): { score: number; matchedTerms: string[] } {
  if (!query || !query.trim()) {
    return { score: 0, matchedTerms: [] };
  }

  const rawQ = query.trim().toLowerCase();
  const { tokens, expandedTerms } = expandQueryTokens(rawQ);
  const matchedTerms = new Set<string>();
  let score = 0;

  const pSku = (product.sku || '').toLowerCase();
  const pBarcode = (product.barcode || '').toLowerCase();
  const pName = (product.name || '').toLowerCase();
  const pBrand = (product.brand || '').toLowerCase();
  const pCategory = (product.category_name || '').toLowerCase();
  const pMaterial = (product.material || '').toLowerCase();
  const pSpecs = (product.specifications || '').toLowerCase();
  const pDesc = (product.description || '').toLowerCase();

  // 1. Exact Match SKU / Barcode (Bobot tertinggi: 1000)
  if (pSku === rawQ || (pBarcode && pBarcode === rawQ)) {
    score += 1000;
    matchedTerms.add(rawQ);
  } else if (pSku.startsWith(rawQ) || (pBarcode && pBarcode.startsWith(rawQ))) {
    score += 500;
    matchedTerms.add(rawQ);
  } else if (pSku.includes(rawQ) || (pBarcode && pBarcode.includes(rawQ))) {
    score += 250;
    matchedTerms.add(rawQ);
  }

  // 2. Phrase & Prefix Match pada Nama Produk
  if (pName === rawQ) {
    score += 800;
    matchedTerms.add(pName);
  } else if (pName.startsWith(rawQ)) {
    score += 450;
    matchedTerms.add(rawQ);
  } else if (pName.includes(rawQ)) {
    score += 250;
    matchedTerms.add(rawQ);
  }

  // 2b. Brand Matching
  if (pBrand === rawQ) {
    score += 300;
    matchedTerms.add(pBrand);
  } else if (pBrand.startsWith(rawQ)) {
    score += 180;
    matchedTerms.add(pBrand);
  } else if (pBrand.includes(rawQ)) {
    score += 100;
    matchedTerms.add(pBrand);
  }

  // 2c. Category Matching
  if (pCategory === rawQ) {
    score += 200;
    matchedTerms.add(pCategory);
  } else if (pCategory.startsWith(rawQ)) {
    score += 120;
    matchedTerms.add(pCategory);
  } else if (pCategory.includes(rawQ)) {
    score += 70;
    matchedTerms.add(pCategory);
  }

  // 3. Varian SKU / Barcode / Variant Name Match
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      const vSku = (v.sku || '').toLowerCase();
      const vBarcode = (v.barcode || '').toLowerCase();
      const vName = (v.variant_name || '').toLowerCase();

      if (vSku === rawQ || (vBarcode && vBarcode === rawQ)) {
        score += 900;
        matchedTerms.add(rawQ);
      } else if (vSku.startsWith(rawQ) || (vBarcode && vBarcode.startsWith(rawQ))) {
        score += 400;
        matchedTerms.add(rawQ);
      } else if (vSku.includes(rawQ) || (vBarcode && vBarcode.includes(rawQ))) {
        score += 180;
        matchedTerms.add(rawQ);
      }

      if (vName && vName === rawQ) {
        score += 250;
        matchedTerms.add(vName);
      } else if (vName && vName.startsWith(rawQ)) {
        score += 150;
        matchedTerms.add(vName);
      } else if (vName && vName.includes(rawQ)) {
        score += 80;
        matchedTerms.add(vName);
      }
    }
  }

  // 4. Token Matching Multi-Field
  let matchedTokenCount = 0;
  for (const token of tokens) {
    let tokenMatched = false;

    if (pName.startsWith(token)) {
      score += 80;
      tokenMatched = true;
      matchedTerms.add(token);
    } else if (pName.includes(token)) {
      score += 50;
      tokenMatched = true;
      matchedTerms.add(token);
    }
    if (pBrand.includes(token)) {
      score += 45;
      tokenMatched = true;
      matchedTerms.add(token);
    }
    if (pCategory.includes(token)) {
      score += 35;
      tokenMatched = true;
      matchedTerms.add(token);
    }
    if (pMaterial.includes(token)) {
      score += 30;
      tokenMatched = true;
      matchedTerms.add(token);
    }
    if (pSpecs.includes(token)) {
      score += 25;
      tokenMatched = true;
      matchedTerms.add(token);
    }
    if (pDesc.includes(token)) {
      score += 15;
      tokenMatched = true;
      matchedTerms.add(token);
    }

    if (tokenMatched) {
      matchedTokenCount++;
    }
  }

  // Bonus jika semua kata kueri ditemukan
  if (tokens.length > 1 && matchedTokenCount === tokens.length) {
    score += 150;
  }

  // 5. Pencocokan Istilah Sinonim / Masalah Pelanggan
  for (const syn of expandedTerms) {
    const s = syn.toLowerCase();
    if (pName.includes(s) || pCategory.includes(s) || pBrand.includes(s) || pSpecs.includes(s) || pDesc.includes(s)) {
      score += 40;
      matchedTerms.add(syn);
    }
  }

  return {
    score,
    matchedTerms: Array.from(matchedTerms),
  };
}
