/**
 * Utilitas Fuzzy Matching & Typo Tolerance (Murni TypeScript, Zero-Dependency)
 * Kompatibel 100% dengan PostgreSQL 9.5 tanpa ekstensi pg_trgm.
 * Digunakan agar kesalahan ketik ringan (misal: "aquaprof", "ruccika", "parlon")
 * langsung ditangani oleh jalur leksikal tanpa memaksa pencarian semantik berhalusinasi.
 */

/**
 * Optimal String Alignment (Damerau-Levenshtein) distance.
 * Menangani substitusi, penyisipan, penghapusan, dan pertukaran 2 huruf bersebelahan.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1); // transposition
      }
      dp[i][j] = val;
    }
  }

  return dp[m][n];
}

/**
 * Menghasilkan himpunan trigram untuk string dengan padding batas.
 */
function buildTrigrams(str: string): Set<string> {
  const padded = `  ${str} `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/**
 * Kemiripan trigram (Dice coefficient) dalam rentang [0, 1].
 */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tA = buildTrigrams(a);
  const tB = buildTrigrams(b);
  let overlap = 0;
  for (const t of tA) {
    if (tB.has(t)) overlap++;
  }
  const denom = tA.size + tB.size;
  return denom === 0 ? 0 : (2 * overlap) / denom;
}

/**
 * Batas maksimum jarak edit berdasarkan panjang token agar tidak memicu false positive.
 */
export function maxAllowedEditDistance(tokenLength: number): number {
  if (tokenLength < 5) return 0; // Token pendek (<5 huruf) wajib cocok eksak agar bebas false positive (misal aren != area)
  if (tokenLength <= 6) return 1;
  return 2;
}

/**
 * Memecah teks kandidat menjadi daftar kata unik lowercase (>= 3 karakter).
 */
export function extractCandidateWords(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.filter((w) => w.length >= 3)));
}

export interface FuzzyTokenMatchResult {
  matched: boolean;
  bestWord?: string;
  similarity: number;
  editDistance: number;
}

/**
 * Mencocokkan satu token kueri yang mengalami typo terhadap daftar kata kandidat.
 * Menolak token yang mengandung angka agar ukuran/kode (misal "10mm" vs "12mm") tidak tertukar.
 */
export function scoreFuzzyTokenMatch(
  queryToken: string,
  candidateWords: string[]
): FuzzyTokenMatchResult {
  const q = queryToken.trim().toLowerCase();

  // Jangan fuzzy-match token pendek (< 5 karakter) atau token yang mengandung angka (ukuran/SKU)
  if (q.length < 5 || /\d/.test(q) || candidateWords.length === 0) {
    return { matched: false, similarity: 0, editDistance: Infinity };
  }

  const maxDist = maxAllowedEditDistance(q.length);
  if (maxDist === 0) {
    return { matched: false, similarity: 0, editDistance: Infinity };
  }

  let bestSim = 0;
  let bestDist = Infinity;
  let bestWord: string | undefined;

  for (const word of candidateWords) {
    if (word.length < 4 || /\d/.test(word)) continue;

    // Filter cepat berdasarkan selisih panjang
    if (Math.abs(word.length - q.length) > maxDist) continue;

    // Untuk token 4-5 huruf, syaratkan huruf pertama atau kedua cocok agar tidak melebar liar
    if (q.length <= 5 && word[0] !== q[0] && word[1] !== q[1]) continue;

    const dist = damerauLevenshtein(q, word);
    if (dist === 0 || dist > maxDist) continue;

    const triSim = trigramSimilarity(q, word);
    const lenRatio = 1 - dist / Math.max(q.length, word.length);
    const combinedSim = 0.55 * lenRatio + 0.45 * triSim;

    // Ambang ketat: trigram cukup kuat atau jarak edit 1 dengan rasio tinggi
    const passesThreshold =
      (dist === 1 && combinedSim >= 0.62) ||
      (dist === 2 && q.length >= 7 && combinedSim >= 0.66 && triSim >= 0.45);

    if (passesThreshold && combinedSim > bestSim) {
      bestSim = combinedSim;
      bestDist = dist;
      bestWord = word;
    }
  }

  if (bestWord) {
    return {
      matched: true,
      bestWord,
      similarity: Math.round(bestSim * 1000) / 1000,
      editDistance: bestDist,
    };
  }

  return { matched: false, similarity: 0, editDistance: Infinity };
}
