# Toko Bangunan - Frontend Web Application

Aplikasi Frontend Modern dan Intuitif untuk **Sistem Manajemen Inventaris & POS Toko Bahan Bangunan (BangunJaya POS)**. Dibangun menggunakan **React 18**, **TypeScript**, **Vite**, dan **Tailwind CSS**.

---

## 🎨 Fitur Antarmuka & UX

1. **Dark Mode & Light Mode Switch**:
   - Dukungan mode gelap dan terang penuh dengan penyimpanan status preferensi di `localStorage`.
   - Menggunakan kelas CSS Tailwind `dark` tanpa kedip (*anti-flash script*).
2. **Desain UX Intuitif & Cepat**:
   - **Dashboard Ringkasan Operasional**: Metrik total produk, varian, kategori, serta peringatan stok menipis secara *real-time*.
   - **Katalog Produk & Varian**: Pencarian instan (*live search*), filter kategori pohon, filter stok kritis, indikator badge status stok (*Aman*, *Kritis*, *Habis*).
   - **Modal Tambah Produk Praktis**:
     - Pilihan sederhana antara **Produk Standar (1 Varian Otomatis)** atau **Multi-Varian**.
     - Form multi-satuan harga berjenjang (Satuan Dasar misal: *Sak*, *Dus*, *Batang*, dan satuan alternatif misal: *Truk*, *Ikat*).
     - Pilihan kategori hierarkis dengan indentasi visual sub-kategori.
   - **Penyesuaian Stok Cepat (Quick Stock Adjustment)**:
     - Akses langsung dari baris tabel produk atau kartu dashboard.
     - Mode perhitungan cerdas: **Opname Fisik (=)**, **Tambah Barang Masuk (+)**, atau **Kurang Barang Rusak/Retur (-)** dengan simulasi selisih instan sebelum disimpan.
   - **Audit Jejak Mutasi Stok**:
     - Visualisasi tabel perubahan kuantitas dengan indikator panah naik (+ hijau) dan panah turun (- merah), nomor referensi, alasan, dan petugas.
   - **Manajemen Pohon Kategori**:
     - Tampilan visual hierarki kategori bertingkat dengan penambahan sub-kategori satu klik.
   - **Ekspor CSV**:
     - Mengunduh daftar produk dan stok terfilter ke format CSV untuk laporan atau pembukuan.
   - **Sistem Notifikasi Toast**:
     - Umpan balik langsung untuk setiap aksi berhasil atau gagal tanpa mengganggu alur kerja pengguna.

---

## 📂 Struktur Direktori Frontend

```text
frontend/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx                 # Header atas, dark mode switch, alert stok kritis
│   │   ├── Sidebar.tsx                # Navigasi menu utama
│   │   ├── DashboardView.tsx          # Tampilan ringkasan metrik & aktivitas terkini
│   │   ├── ProductListView.tsx        # Tabel katalog produk, search, filter, export
│   │   ├── ProductFormModal.tsx       # Modal input produk baru (auto 1 varian / multi-varian)
│   │   ├── ProductDetailModal.tsx     # Modal detail varian dan daftar multi-satuan harga
│   │   ├── StockAdjustmentModal.tsx   # Modal penyesuaian stok opname transaksional
│   │   ├── StockMovementsView.tsx     # Tabel audit log transaksi perubahan stok
│   │   ├── CategoryManagementView.tsx # Pohon hierarki kategori & sub-kategori
│   │   ├── DocsView.tsx               # Panduan arsitektur sistem
│   │   └── Toast.tsx                  # Komponen notifikasi toast melayang
│   ├── context/
│   │   └── ThemeContext.tsx           # Context penyedia tema Dark/Light
│   ├── services/
│   │   └── api.ts                     # API client fetch wrapper
│   ├── types/
│   │   └── index.ts                   # Definisi tipe TypeScript
│   ├── utils/
│   │   └── format.ts                  # Formatter Rupiah, angka stok, dan tanggal
│   ├── App.tsx                        # Komponen Utama Aplikasi
│   ├── main.tsx                       # Titik Masuk React DOM
│   └── index.css                      # Tailwind base styling
├── tailwind.config.js                 # Konfigurasi Tailwind CSS & warna kustom
├── vite.config.ts                     # Konfigurasi Vite & API Proxy
└── package.json
```

---

## 🚀 Panduan Menjalankan

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Menjalankan Server Development
```bash
npm run dev
```
Aplikasi frontend akan aktif di: `http://localhost:3000`  
Proxy bawaan Vite secara otomatis mengarahkan panggilan `/api/*` ke backend di `http://localhost:5000`.

### 3. Build untuk Produksi
```bash
npm run build
```
File hasil kompilasi yang dioptimasi akan berada di folder `dist/`.

---

## 💡 Panduan Penggunaan Fitur

### 1. Menambah Produk Baru
- Klik tombol **"+ Tambah Produk"** di pojok kanan atas.
- Pilih mode:
  - **Tanpa Varian (Otomatis 1)**: Cukup masukkan nama produk, kategori, harga jual/beli, dan satuan dasar. Sistem akan otomatis membuat 1 varian standar di database.
  - **Multi-Varian**: Tambahkan kartu varian sesuai spesifikasi (misal: Ukuran pipa *1/2"*, *3/4"*, *1"* atau Ukuran cat *5kg*, *25kg*).
- Anda juga dapat menambahkan satuan alternatif (misal: *1 Truk = 200 Sak*).
- Klik **"Simpan Produk"**.

### 2. Melakukan Penyesuaian Stok (Stock Opname)
- Klik tombol **"Adjust"** pada baris barang atau klik menu **"Penyesuaian Stok"**.
- Pilih metode:
  - **Opname Fisik (=)**: Masukkan jumlah riil yang dihitung di gudang. Sistem menghitung otomatis selisihnya.
  - **Tambah (+)**: Masukkan jumlah barang masuk baru dari supplier.
  - **Kurang (-)**: Masukkan jumlah barang yang rusak, pecah, cacat, atau hilang.
- Isi **No. Dokumen** (misal: `OPN-01`) dan **Alasan Wajib**.
- Klik **"Simpan Penyesuaian"**. Stok varian otomatis diperbarui dan dicatat ke log riwayat mutasi.

### 3. Mengubah Tema Tampilan
- Klik ikon ☀️ / 🌙 di pojok kanan atas untuk beralih antara Mode Terang dan Mode Gelap kapan saja.
