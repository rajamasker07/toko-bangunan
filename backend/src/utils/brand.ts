/**
 * Normalisasi nama merek untuk tampilan:
 * - hapus spasi di awal/akhir
 * - gabungkan spasi berulang menjadi satu
 *   contoh: "  Tiga   Roda " -> "Tiga Roda"
 */
export function normalizeBrandName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Kunci pembanding (dedup key) merek.
 * Huruf kecil + buang semua karakter non huruf/angka, sehingga variasi penulisan
 * seperti "Tiga Roda", "tiga-roda", "TIGA.RODA", "TigaRoda" dianggap merek yang SAMA.
 * Disimpan di kolom `brands.name_key` yang memiliki UNIQUE constraint.
 */
export function brandKey(name: string): string {
  const normalized = normalizeBrandName(name).toLowerCase();
  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, '');
  return compact || normalized;
}
