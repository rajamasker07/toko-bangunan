import { pool } from '../config/db.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { initializeDatabase } from '../db/init.js';

async function main() {
  console.log('🚀 Memulai inisialisasi skema & backfill embedding produk toko bangunan...');
  await initializeDatabase();
  const result = await EmbeddingService.reindexAllProducts({ force: true });
  console.log('📊 Hasil backfill:', result);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill gagal:', err);
  process.exit(1);
});
