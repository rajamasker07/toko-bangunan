# Toko Bangunan - Backend API Service

Backend RESTful API berkinerja tinggi untuk sistem manajemen inventaris dan Point of Sale (POS) Toko Bahan Bangunan. Dibangun dengan **Node.js**, **Express.js**, **TypeScript**, dan **PostgreSQL**, menggunakan arsitektur identifier **UUID v7 (RFC 9562)** berbasis waktu.

---

## 🛠️ Tech Stack & Fitur Utama

- **Runtime & Bahasa**: Node.js v20+ / TypeScript (Strict Mode)
- **Framework Web**: Express.js
- **Database**: PostgreSQL (Port 5432)
- **Identifier**: UUID v7 (Time-ordered UUID) via pustaka `uuid`
- **Fitur Khusus Toko Bangunan**:
  1. **Multi-Variant Produk**: 1 produk dapat memiliki banyak varian (misal: pipa berbagai ukuran, cat berbagai warna/ukuran).
  2. **Auto Single-Variant**: Produk yang dibuat tanpa varian otomatis dibuatkan 1 varian `Standar` di database secara mulus.
  3. **Multi-Satuan Harga Bertingkat**: Tiap varian memiliki satuan dasar (misal: *Sak*, *Dus*, *Batang*) dan satuan turunan dengan faktor konversi (misal: *1 Truk = 200 Sak*, *1 Dus = 25 Pcs*) beserta harga eceran, beli/modal, dan grosir.
  4. **Kategori Bertingkat (Hierarchical Tree)**: Relasi *self-referencing* rekursif `parent_id` untuk mendukung sub-kategori tak terbatas.
  5. **Stock Adjustment Transaksional**: Penyesuaian stok (*Stock Opname*, Restock, Rusak/Pecah, Retur) dengan transaksi ACID PostgreSQL ber-kunci baris (`SELECT ... FOR UPDATE`).
  6. **Audit Trail Mutasi**: Seluruh perubahan stok otomatis mencatat riwayat perubahan: stok awal, jumlah mutasi (+/-), stok akhir, referensi, petugas, dan alasan.

---

## 📂 Struktur Direktori

```text
backend/
├── src/
│   ├── config/
│   │   └── db.ts                   # PostgreSQL Connection Pool
│   ├── controllers/
│   │   ├── categoryController.ts   # Kategori bertingkat
│   │   ├── productController.ts    # CRUD Produk & Varian
│   │   ├── variantController.ts    # Varian & Multi-Satuan Harga
│   │   ├── stockController.ts      # Adjustment & Log Mutasi
│   │   └── dashboardController.ts  # Ringkasan analitik
│   ├── db/
│   │   ├── init.ts                 # Inisialisasi Skema DDL & Index
│   │   └── seed.ts                 # Seeder data realistis toko bangunan
│   ├── routes/
│   │   └── api.ts                  # Routing REST API
│   ├── services/
│   │   ├── categoryService.ts      # Logika kategori pohon & CTE
│   │   ├── productService.ts       # Logika produk & auto-varian
│   │   ├── variantService.ts       # Logika varian & unit konversi
│   │   ├── stockService.ts         # Transaksi ACID penyesuaian stok
│   │   └── dashboardService.ts     # Agregasi metrik
│   ├── utils/
│   │   └── uuid.ts                 # UUIDv7 Generator (RFC 9562)
│   └── index.ts                    # Entrypoint Server
├── .env.example
├── package.json
└── tsconfig.json
```

---

## ⚙️ Skema Database (PostgreSQL)

### 1. `categories`
| Kolom | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | UUID v7 |
| `name` | `VARCHAR(100)` | Nama Kategori |
| `parent_id` | `UUID` (FK) | Merujuk ke `categories(id)` (NULL untuk kategori utama) |
| `description`| `TEXT` | Deskripsi kategori |
| `created_at` | `TIMESTAMPTZ` | Timestamp dibuat |

### 2. `products`
| Kolom | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | UUID v7 |
| `name` | `VARCHAR(255)`| Nama Produk Bahan Bangunan |
| `sku` | `VARCHAR(100)`| SKU Induk Produk (Unik) |
| `barcode` | `VARCHAR(100)`| Barcode Scan (Opsional) |
| `category_id` | `UUID` (FK) | Merujuk ke `categories(id)` |
| `brand` | `VARCHAR(100)`| Merk Pabrik (e.g. Holcim, Rucika, Roman) |
| `description` | `TEXT` | Deskripsi / spesifikasi teknis |
| `min_stock_alert` | `NUMERIC` | Batas minimal peringatan stok |
| `has_variants` | `BOOLEAN` | Menandakan varian tunggal atau multi-varian |

### 3. `product_variants`
| Kolom | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | UUID v7 |
| `product_id` | `UUID` (FK) | Merujuk ke `products(id)` ON DELETE CASCADE |
| `variant_name`| `VARCHAR(150)`| Nama spesifikasi/ukuran/warna |
| `sku` | `VARCHAR(100)`| SKU Varian (Unik) |
| `current_stock`| `NUMERIC(12,2)`| Stok fisik saat ini |
| `min_stock` | `NUMERIC(12,2)`| Batas minimal stok per varian |

### 4. `variant_units` (Satuan Harga Bertingkat)
| Kolom | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | UUID v7 |
| `variant_id` | `UUID` (FK) | Merujuk ke `product_variants(id)` |
| `unit_name` | `VARCHAR(50)` | Nama Satuan (e.g. *Sak*, *Dus*, *Batang*, *Truk*) |
| `conversion_factor` | `NUMERIC` | Nilai konversi terhadap satuan dasar |
| `is_base_unit` | `BOOLEAN` | Menandakan satuan dasar inventaris |
| `buy_price` | `NUMERIC(14,2)`| Harga Beli / Modal |
| `sell_price` | `NUMERIC(14,2)`| Harga Jual Standar |
| `wholesale_price` | `NUMERIC(14,2)`| Harga Grosir / Kontraktor |

### 5. `stock_movements` (Jejak Log Audit Transaksi)
| Kolom | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | UUID v7 |
| `product_id` | `UUID` (FK) | Merujuk ke `products(id)` |
| `variant_id` | `UUID` (FK) | Merujuk ke `product_variants(id)` |
| `movement_type`| `VARCHAR(50)` | `STOCK_OPNAME`, `PURCHASE_RESTOCK`, `DAMAGED_EXPIRED`, dsb |
| `previous_stock`| `NUMERIC(12,2)`| Stok sebelum mutasi |
| `quantity_change`| `NUMERIC(12,2)`| Selisih perubahan (+ / -) |
| `current_stock` | `NUMERIC(12,2)`| Stok setelah mutasi |
| `reference_no` | `VARCHAR(100)`| No. Dokumen / No. Nota / No. Opname |
| `notes` | `TEXT` | Alasan mutasi / keterangan |
| `created_by` | `VARCHAR(100)`| Petugas pembuat transaksi |

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Prasyarat
- PostgreSQL Server 9.5+ atau versi terbaru aktif di `localhost:5432`.
- Node.js v18+ dan npm.

### 2. Konfigurasi Environment (`.env`)
Salin file `.env.example` ke `.env`:
```env
PORT=5000
DATABASE_URL=postgresql://postgres:root@localhost:5432/toko_bangunan
PGUSER=postgres
PGPASSWORD=root
PGHOST=localhost
PGPORT=5432
PGDATABASE=toko_bangunan
NODE_ENV=development
```

### 3. Setup Database & Seeding
```bash
# Inisialisasi tabel dan indeks
npm run db:init

# Isi dengan contoh data material toko bangunan
npm run db:seed
```

### 4. Menjalankan Server
```bash
# Mode development (auto-reload)
npm run dev

# Mode produksi (compile & start)
npm run build
npm start
```
Server akan aktif di: `http://localhost:5000`

---

## 📡 Dokumentasi Endpoint REST API

### 1. Dashboard
- `GET /api/dashboard/summary` — Mengembalikan jumlah produk, varian, kategori, item stok kritis, dan aktivitas mutasi terbaru.

### 2. Produk
- `GET /api/products` — Mendapatkan daftar produk. Parameter query:
  - `search`: Pencarian nama produk, SKU, brand, atau varian
  - `categoryId`: Filter kategori (otomatis menyertakan sub-kategori)
  - `stockStatus`: `all` | `low` | `out` | `normal`
- `GET /api/products/:id` — Detail lengkap produk beserta seluruh varian dan daftar multi-satuan harga.
- `POST /api/products` — Membuat produk baru:
  - Jika `has_variants: false`, backend otomatis membentuk 1 varian default beserta satuan dasarnya.
- `PUT /api/products/:id` — Memperbarui data umum produk.
- `DELETE /api/products/:id` — Menghapus produk dan seluruh varian terkait (*cascade*).

### 3. Varian & Satuan Harga
- `POST /api/products/:productId/variants` — Menambahkan varian baru ke produk yang sudah ada.
- `PUT /api/variants/:id` — Mengubah nama varian, SKU, atau batas stok minimal.
- `DELETE /api/variants/:id` — Menghapus varian produk.
- `POST /api/variants/:variantId/units` — Menambahkan opsi satuan harga (misal: *Dus*, *Truk*, *Kg*).
- `PUT /api/units/:id` — Memperbarui harga dan rasio konversi satuan.
- `DELETE /api/units/:id` — Menghapus satuan harga.

### 4. Penyesuaian Stok (Stock Adjustment) & Log Mutasi
- `POST /api/stock/adjust` — Menyesuaikan stok varian secara transaksional:
  ```json
  {
    "variant_id": "01a1b970-89e0-754e-99a6-ffd800ed82e3",
    "adjustment_mode": "SUBTRACT", // "SET" | "ADD" | "SUBTRACT"
    "amount": 5,
    "movement_type": "DAMAGED_EXPIRED", // "STOCK_OPNAME" | "PURCHASE_RESTOCK" | "SALE_DEDUCT" | "DAMAGED_EXPIRED"
    "reference_no": "OPN-202611-001",
    "notes": "5 batang pipa retak terjatuh saat unloading",
    "created_by": "Staff Gudang"
  }
  ```
- `GET /api/stock/movements` — Melihat seluruh jejak audit log mutasi stok terurut kronologis terbaru.
  - Parameter query: `variantId`, `productId`, `type`, `search`, `limit`, `offset`.

### 5. Kategori Bertingkat
- `GET /api/categories?tree=true` — Mendapatkan pohon kategori hierarkis bersarang (*parent-children*).
- `POST /api/categories` — Membuat kategori utama atau sub-kategori (`parent_id`).
- `PUT /api/categories/:id` — Memperbarui kategori.
- `DELETE /api/categories/:id` — Menghapus kategori.
