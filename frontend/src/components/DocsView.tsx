import React from 'react';
import { BookOpen, Database, Layers, SlidersHorizontal, Cpu, CheckCircle } from 'lucide-react';

export const DocsView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-xl space-y-2">
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs tracking-wider uppercase">
          <BookOpen className="w-4 h-4" />
          <span>Dokumentasi Arsitektur & Panduan Penggunaan</span>
        </div>
        <h2 className="text-2xl font-black tracking-tight">
          Sistem POS & Inventaris Toko Bahan Bangunan
        </h2>
        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-3xl">
          Dirancang khusus untuk karakteristik unik toko material: multi-varian (ukuran, ketebalan, warna),
          multi-satuan harga (eceran, sak, dus, truk, batang), UUIDv7 time-ordered, dan audit log perubahan stok ketat.
        </p>
      </div>

      {/* Grid of Key Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-sm">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
            <span>1. Pengelolaan Produk & Varian Otomatis</span>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside">
            <li>
              <strong>Produk Multi-Varian:</strong> Satu produk dapat memiliki banyak varian (misal: Pipa PVC dengan ukuran 1/2", 3/4", 1" atau Cat Tembok 5kg dan 25kg).
            </li>
            <li>
              <strong>Auto 1 Varian:</strong> Produk tanpa varian (produk sederhana) secara otomatis dibuatkan 1 varian default (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Standar</code>) tanpa perlu konfigurasi manual.
            </li>
            <li>
              <strong>ID UUIDv7:</strong> Menggunakan UUIDv7 (RFC 9562) yang berbasis waktu sehingga pengindeksan PostgreSQL B-Tree sangat cepat dan terurut kronologis.
            </li>
          </ul>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-sm">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <span>2. Multi-Satuan Harga (Satuan Bertingkat)</span>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside">
            <li>
              <strong>Konversi Satuan:</strong> Tiap varian memiliki satuan dasar (misal: Batang, Sak, Dus) dan dapat memiliki satuan grosir/turunan (misal: 1 Truk = 200 Sak, 1 Ikat = 10 Batang).
            </li>
            <li>
              <strong>Harga Berjenjang:</strong> Mendukung Harga Jual Standar, Harga Modal/Beli, dan Harga Grosir untuk tukang/kontraktor.
            </li>
            <li>
              <strong>Perhitungan Akurat:</strong> Stok selalu dihitung dan disimpan dalam satuan dasar terkecil untuk mencegah selisih pembulatan.
            </li>
          </ul>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-sm">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <Database className="w-4 h-4" />
            </div>
            <span>3. Kategori Bertingkat (Hierarchical Tree)</span>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside">
            <li>
              <strong>Sub-Kategori Tak Terbatas:</strong> Kategori dapat memiliki anak (sub-kategori) hingga cucu (sub-sub-kategori) menggunakan relasi rekursif self-referential <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">parent_id</code>.
            </li>
            <li>
              <strong>Filter Rekursif:</strong> Ketika memfilter kategori induk (misal: Bahan Bangunan Dasar), semua produk di sub-kategori di bawahnya otomatis disertakan via SQL CTE rekursif.
            </li>
          </ul>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-sm">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
              <CheckCircle className="w-4 h-4" />
            </div>
            <span>4. Stock Adjustment & Log Mutasi Transaksional</span>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside">
            <li>
              <strong>ACID Transaction Lock:</strong> Penyesuaian stok menggunakan transaksi PostgreSQL dengan row-level lock (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">SELECT ... FOR UPDATE</code>) untuk mencegah race condition.
            </li>
            <li>
              <strong>Audit Trail Lengkap:</strong> Setiap perubahan mencatat <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">previous_stock</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">quantity_change</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">current_stock</code>, nomor referensi, serta alasan wajib.
            </li>
          </ul>
        </div>
      </div>

      {/* API Reference Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 dark:text-white text-sm">
          Ringkasan RESTful API Endpoints
        </h3>
        <div className="overflow-x-auto text-xs font-mono">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
              <tr>
                <th className="pb-2">Metode</th>
                <th className="pb-2">Endpoint</th>
                <th className="pb-2">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="py-2 text-emerald-600 font-bold">GET</td>
                <td className="py-2">/api/products</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Daftar produk, pencarian, dan filter stok</td>
              </tr>
              <tr>
                <td className="py-2 text-blue-600 font-bold">POST</td>
                <td className="py-2">/api/products</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Tambah produk baru (auto 1 varian atau multi-varian)</td>
              </tr>
              <tr>
                <td className="py-2 text-blue-600 font-bold">POST</td>
                <td className="py-2">/api/stock/adjust</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Penyesuaian stok opname / masuk / keluar + log mutasi</td>
              </tr>
              <tr>
                <td className="py-2 text-emerald-600 font-bold">GET</td>
                <td className="py-2">/api/stock/movements</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Riwayat audit log mutasi stok terurut kronologis</td>
              </tr>
              <tr>
                <td className="py-2 text-emerald-600 font-bold">GET</td>
                <td className="py-2">/api/categories?tree=true</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Pohon hierarkis kategori bertingkat</td>
              </tr>
              <tr>
                <td className="py-2 text-emerald-600 font-bold">GET</td>
                <td className="py-2">/api/dashboard/summary</td>
                <td className="py-2 font-sans text-slate-600 dark:text-slate-400">Metrik ringkasan, peringatan stok kritis</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
