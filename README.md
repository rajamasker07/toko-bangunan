# BangunJaya POS - Sistem Manajemen & Inventaris Toko Bahan Bangunan

Proyek aplikasi terintegrasi untuk pengelolaan data produk, varian, satuan harga bertingkat, kategori hierarkis, dan audit log mutasi stok berbasis waktu (UUIDv7) pada toko bahan bangunan.

Proyek ini terpisah secara modular menjadi dua sub-proyek independen:
1. **`backend/`**: RESTful API berbasis **Node.js**, **Express.js**, **TypeScript**, dan **PostgreSQL**.
2. **`frontend/`**: Antarmuka web responsif berbasis **React 18**, **TypeScript**, **Vite**, dan **Tailwind CSS** dengan dukungan penuh **Dark Mode & Light Mode**.

---

## 🏗️ Fitur Unggulan Sistem (Toko Bangunan)

- **Pengelolaan Multi-Variant Produk**: 1 produk dapat memiliki banyak varian (ukuran pipa, kapasitas cat, tebal besi).
- **Otomatis 1 Varian**: Produk sederhana tanpa varian otomatis dibuatkan 1 varian standar di database secara seamless.
- **Satuan Harga Bertingkat (Multi-Unit Pricing)**: Mendukung satuan dasar (*Sak*, *Batang*, *Dus*, *Pail*) dan satuan turunan grosir (*Truk*, *Ikat*, *Keping*) beserta faktor konversi.
- **Kategori Bertingkat (Hierarchical Tree)**: Sub-kategori rekursif bersarang tanpa batas (Induk → Sub-Kategori → Sub-Sub-Kategori).
- **UUID v7 (RFC 9562)**: Seluruh ID produk, varian, satuan, dan transaksi mutasi stok menggunakan UUID v7 berbasis waktu yang ramah performa indeks B-Tree PostgreSQL.
- **Stock Adjustment & Audit Trail Log Mutasi**: Penyesuaian stok opname / barang masuk / barang rusak secara transaksional ACID dengan riwayat log permanen.
- **Dark Mode & Light Mode**: Switch tema instan yang tersimpan di browser.
- **UX Cepat & Ramah Pengguna**: Pencarian instan, filter status stok kritis, ekspor CSV, dan notifikasi toast.

---

## ⚡ Cara Menjalankan Proyek (Quick Start)

### 1. Prasyarat
- **Node.js** (v18 ke atas) dan **npm**
- **PostgreSQL Server** (aktif di port 5432)

### 2. Jalankan Backend
```bash
cd backend
npm install
# Inisialisasi database & seed data sampel bahan bangunan
npm run db:init
npm run db:seed
# Jalankan server API (port 5000)
npm run dev
```

### 3. Jalankan Frontend
Buka terminal baru:
```bash
cd frontend
npm install
# Jalankan frontend web (port 3000)
npm run dev
```

Buka peramban di: **`http://localhost:3000`**

---

## 📖 Dokumentasi Detail Tiap Proyek

Untuk dokumentasi teknis mendalam, silakan baca dokumentasi masing-masing sub-proyek:
- 📘 [Dokumentasi Lengkap Backend (API, Skema DB & SQL)](./backend/README.md)
- 📙 [Dokumentasi Lengkap Frontend (Komponen, UX & State)](./frontend/README.md)
