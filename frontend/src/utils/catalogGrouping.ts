import { Product, SimilarProductGroup } from '../types';

/**
 * Membersihkan spasi berlebih dan karakter pemisah di awal/akhir string.
 */
function cleanBoundaryPunctuation(str: string): string {
  return str.replace(/^[\s\-_:/,()]+|[\s\-_:/,()]+$/g, '').trim();
}

/**
 * Mencari awalan kata yang sama (Longest Common Prefix di level kata/token).
 * Contoh:
 * ["Cat Dulux Weathershield Putih", "Cat Dulux Weathershield Hitam"]
 * -> "Cat Dulux Weathershield"
 */
export function findLongestCommonPrefix(names: string[]): string {
  if (!names || names.length === 0) return '';
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];

  // Tokenize berdasarkan spasi
  const tokenLists = cleaned.map((n) => n.split(/\s+/).filter(Boolean));
  const minLen = Math.min(...tokenLists.map((tl) => tl.length));

  const commonTokens: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const currentWord = tokenLists[0][i];
    const allMatch = tokenLists.every(
      (tl) => tl[i].toLowerCase() === currentWord.toLowerCase()
    );
    if (allMatch) {
      commonTokens.push(currentWord);
    } else {
      break;
    }
  }

  let result = commonTokens.join(' ');
  result = cleanBoundaryPunctuation(result);

  // Jika tidak ada token kata yang sama, cek di level karakter untuk setidaknya 3 karakter sama
  if (!result) {
    const first = cleaned[0];
    let charPrefix = '';
    for (let i = 0; i < first.length; i++) {
      const char = first[i];
      if (cleaned.every((n) => n[i]?.toLowerCase() === char.toLowerCase())) {
        charPrefix += char;
      } else {
        break;
      }
    }
    result = cleanBoundaryPunctuation(charPrefix);
  }

  return result;
}

/**
 * Menghasilkan saran nama varian dari nama produk asal dengan menghilangkan awalan yang sama.
 * Contoh:
 * - productName: "Cat Dulux Weathershield Putih 2.5L"
 * - commonPrefix: "Cat Dulux Weathershield"
 * -> "Putih 2.5L"
 */
export function suggestVariantName(productName: string, commonPrefix: string): string {
  const pName = (productName || '').trim();
  const prefix = (commonPrefix || '').trim();

  if (!pName) return 'Standar';
  if (!prefix || pName.toLowerCase() === prefix.toLowerCase()) {
    return pName;
  }

  // Jika nama diawali prefix, buang prefix
  if (pName.toLowerCase().startsWith(prefix.toLowerCase())) {
    const remainder = pName.slice(prefix.length);
    const cleaned = cleanBoundaryPunctuation(remainder);
    if (cleaned) {
      return cleaned;
    }
  }

  return pName;
}

/**
 * Mendeteksi grup produk yang kemungkinan besar merupakan varian dari produk yang sama.
 * Kriteria kemiripan:
 * 1. Berada dalam brand dan/atau kategori yang sama.
 * 2. Memiliki awalan nama kata yang sama (minimal 2 kata awal sama atau prefix >= 5 huruf).
 * 3. Memiliki minimal 2 produk dalam grup.
 */
export function detectSimilarProductGroups(products: Product[]): SimilarProductGroup[] {
  if (!products || products.length < 2) return [];

  // Filter kandidat: prioritaskan produk aktif dengan varian <= 2
  const candidates = products.filter((p) => p.is_active !== false);

  // Bucket awal berdasarkan: brand (atau no-brand) + 2 kata pertama nama produk
  const buckets = new Map<string, Product[]>();

  for (const p of candidates) {
    const words = p.name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // Ambil 2 kata pertama (atau 1 kata jika panjang >= 6)
    const firstTwoWords = words.slice(0, 2).join(' ').toLowerCase();
    const brandKey = (p.brand || 'nobrand').trim().toLowerCase();
    const catKey = (p.category_name || 'nocat').trim().toLowerCase();

    // Buat kombinasi key
    const primaryKey = `${brandKey}:::${firstTwoWords}`;
    const list = buckets.get(primaryKey) || [];
    list.push(p);
    buckets.set(primaryKey, list);

    // Jika brand tidak ada, kelompokkan juga berdasarkan kategori + 2 kata awal
    if (!p.brand && p.category_name) {
      const catBucketKey = `cat:::${catKey}:::${firstTwoWords}`;
      const catList = buckets.get(catBucketKey) || [];
      catList.push(p);
      buckets.set(catBucketKey, catList);
    }
  }

  // Saring bucket yang memiliki minimal 2 produk unik
  const seenGroupSignatures = new Set<string>();
  const results: SimilarProductGroup[] = [];

  for (const [, prods] of buckets.entries()) {
    // Hilangkan duplikat produk dalam bucket yang sama
    const uniqueMap = new Map<string, Product>();
    for (const p of prods) {
      uniqueMap.set(p.id, p);
    }
    const uniqueProds = Array.from(uniqueMap.values());
    if (uniqueProds.length < 2) continue;

    // Hitung awalan bersama yang sebenarnya dari seluruh produk dalam bucket ini
    const names = uniqueProds.map((p) => p.name);
    const prefix = findLongestCommonPrefix(names);

    // Syarat prefix valid: minimal 4 karakter dan bukan nama generik satu huruf
    if (!prefix || prefix.length < 4) continue;

    // Signature untuk deduplikasi grup
    const sortedIds = uniqueProds.map((p) => p.id).sort().join(',');
    if (seenGroupSignatures.has(sortedIds)) continue;
    seenGroupSignatures.add(sortedIds);

    const first = uniqueProds[0];
    const totalStock = uniqueProds.reduce(
      (sum, p) => sum + (Number(p.total_stock) || 0),
      0
    );

    results.push({
      id: `group-${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueProds.length}`,
      commonPrefix: prefix,
      categoryName: first.category_name || undefined,
      brandName: first.brand || undefined,
      products: uniqueProds.sort((a, b) => a.name.localeCompare(b.name)),
      totalStock,
    });
  }

  // Urutkan grup: yang memiliki produk terbanyak di atas
  return results.sort((a, b) => {
    if (b.products.length !== a.products.length) {
      return b.products.length - a.products.length;
    }
    return a.commonPrefix.localeCompare(b.commonPrefix);
  });
}
