# Panduan Teknis Export Data & Cadangan Database (BangunJaya POS)

Dokumen ini berisi panduan lengkap penggunaan, struktur data, format file, dan prosedur pemulihan (*restore*) untuk fitur **Export Data & Database Backup** pada sistem **BangunJaya POS & Inventory Toko Bangunan**.

---

## 1. Ikhtisar Fitur (Overview)

Fitur Export Data & Backup dirancang untuk memenuhi dua kebutuhan utama toko:
1. **Cadangan Sistem Penuh (Full System Backup & Disaster Recovery)**:
   - Menghasilkan berkas `.sql` mandiri yang siap diimpor langsung ke database PostgreSQL melalui CLI `psql`, pgAdmin, DBeaver, ataupun melalui antarmuka web sistem.
   - Menghasilkan berkas Multi-Sheet Excel Workbook (`.xlsx`) dan Full JSON Snapshot (`.json`) untuk arsip audit dan pelaporan.
2. **Ekspor Modular Kompatibel Re-import (*Round-Trip Restore*)**:
   - Berkas hasil ekspor untuk entitas Master (**Produk & Variasi**, **Pemasok & Sales**, **Kategori**, dan **Merek**) menggunakan header dan format kolom yang **100% identik** dengan skema template Import.
   - File hasil ekspor dapat langsung diunggah kembali ke menu **Import Data** tanpa perlu mengubah nama kolom atau memformat ulang sel.

---

## 2. Format Cadangan & Cakupan Data

### A. Full PostgreSQL Database Dump (`.sql`)
- **Format**: File teks SQL standar ANSI PostgreSQL dengan ekstensi `.sql`.
- **Mekanisme Keamanan**:
  - Dijalankan dalam satu blok transaksional penuh (`BEGIN ... COMMIT`).
  - Dilengkapi `SET CONSTRAINTS ALL DEFERRED;` untuk menangguhkan evaluasi foreign key saat proses pemuatan massal.
  - Menjalankan pembersihan tabel dalam urutan reverse cascade (`TRUNCATE TABLE ... CASCADE;`).
  - Menjalankan statement `INSERT` terurut secara topologis berdasarkan hierarki ketergantungan relasi kunci asing (*Foreign-Key Dependency Order*):
    ```
    roles -> users -> user_sessions -> categories -> brands -> units ->
    suppliers -> supplier_sales -> supplier_invoices ->
    products -> product_variants -> variant_units ->
    stock_movements -> stock_reservations -> stock_reservation_items -> stock_reservation_pickups
    ```
- **Kelebihan**: Portabel, mandiri (*self-contained*), tidak memerlukan binary tool eksternal `pg_dump` di host atau container.

### B. Multi-Sheet Excel Workbook (`.xlsx`)
- **Format**: File Microsoft Excel OOXML (`.xlsx`) yang dibuat menggunakan engine `ExcelJS`.
- **Cakupan Lembar Kerja (9 Sheets)**:
  1. `Ringkasan Backup`: Metadata ukuran database, versi PostgreSQL, waktu cetak, status izin HPP, dan jumlah baris per tabel.
  2. `Produk & Variasi`: Seluruh katalog produk, varian, stok, dan multi-satuan harga.
  3. `Supplier & Sales`: Daftar pemasok, alamat, kontak kantor, dan detail sales.
  4. `Kategori`: Hierarki kategori pohon material.
  5. `Merek`: Daftar merek dagang material.
  6. `Satuan Ukuran`: Master unit (Sak, Batang, Dus, Pcs, dll).
  7. `Faktur Supplier`: Rekap hutang dagang, termin tempo, dan pembayaran invoice.
  8. `Mutasi Stok`: Buku kartu stok dan riwayat mutasi persediaan.
  9. `Titip Barang`: Nota reservasi pesanan, kuantiti diambil, dan sisa simpanan gudang.
- **Styling**: Header biru navy gelap (`#1E293B`) dengan font putih tebal, zebra striping baris genap, auto-filter kolom, pemformatan teks `@` untuk kode/barcode, dan pemformatan numerik mata uang `#,,##0`.

### C. Full JSON System Snapshot (`.json`)
- **Format**: JSON UTF-8 terstruktur rapi (*pretty-printed*).
- **Kegunaan**: Integrasi API eksternal, pemrosesan analitik big data, data warehouse, atau arsip audit digital.

---

## 3. Ekspor Per-Entitas & Keselarasan Re-import (Round-Trip)

| Entitas | Format Didukung | Status Round-Trip | Keterangan Khusus |
| :--- | :---: | :---: | :--- |
| **Produk, Varian & Multi-Satuan** | `.xlsx`, `.csv`, `.json` | **100% Kompatibel** | Pada baris satuan dasar (`is_base_unit = YA`), kolom `stok_awal` otomatis diisi dengan `current_stock` varian. Saat diimpor kembali ke database kosong, saldo stok akan pulih persis seperti semula. |
| **Supplier & Kontak Sales** | `.xlsx`, `.csv`, `.json` | **100% Kompatibel** | Multi-nomor HP sales digabungkan dengan label tanda kurung (`0812-1111 (WhatsApp); 0815-2222 (Kantor)`). |
| **Kategori Bertingkat** | `.xlsx`, `.csv`, `.json` | **100% Kompatibel** | Jalur hierarki otomatis disusun dengan separator ` > ` (`Bahan Bangunan Dasar > Semen & Mortar`). |
| **Master Merek (Brand)** | `.xlsx`, `.csv`, `.json` | **100% Kompatibel** | Nama merek langsung siap di-import kembali. |
| **Master Satuan Ukuran** | `.xlsx`, `.csv`, `.json` | Master Data | Nama satuan, kode kunci, dan status aktif. |
| **Faktur Pembelian Supplier** | `.xlsx`, `.csv`, `.json` | Operasional / Audit | Nomor invoice, nominal tagihan, terbayar, sisa, dan jatuh tempo. |
| **Riwayat Mutasi Stok** | `.xlsx`, `.csv`, `.json` | Operasional / Audit | Tanggal mutasi, tipe, perubahan stok, referensi, dan operator kasir/gudang. |
| **Nota Titip Barang (Reservasi)** | `.xlsx`, `.csv`, `.json` | Operasional / Audit | Nomor nota, nama pelanggan, kuantiti ditahan, diambil, dan batas tempo. |

---

## 4. Keamanan & Matriks Hak Akses (RBAC)

1. **Izin `data:export`**:
   - Diperlukan untuk mengakses tab navigasi **Export & Backup**, melihat metrik database, dan mengunduh berkas export.
   - Secara default diberikan kepada peran **Owner** dan **Admin**.
2. **Proteksi Harga Modal (`products:view_buy_price`)**:
   - Jika pengguna memiliki izin `products:view_buy_price`, kolom `harga_beli` (HPP) akan ditampilkan secara lengkap.
   - Jika pengguna **tidak memiliki** izin tersebut, kolom `harga_beli` otomatis dikosongkan atau disensor menjadi `0` untuk mencegah kebocoran margin keuntungan toko kepada staf yang tidak berwenang.
3. **Otoritas Pemulihan Database (Database Restore)**:
   - Operasi Restore Database dibatasi **khusus peran Owner (`role === 'owner'`)**.
   - Dilengkapi *Safety Confirmation Gate*: pengguna wajib mengetik frasa konfirmasi **`PULIHKAN DATABASE`** sebelum tombol eksekusi aktif.

---

## 5. Prosedur Pemulihan Database (Database Restoration)

### Cara 1: Melalui Antarmuka Web (UI BangunJaya POS)
1. Masuk (*login*) menggunakan akun dengan peran **Owner**.
2. Buka menu **Data Master > Export & Backup**.
3. Klik tombol merah **Restore Database** di pojok kanan atas.
4. Pilih file berkas `.sql` cadangan resmi sistem (maksimal 50 MB).
5. Baca peringatan risiko penimpaan data.
6. Ketik frasa **`PULIHKAN DATABASE`** pada kolom konfirmasi.
7. Klik **Eksekusi Pemulihan**.
8. Sistem akan mengeksekusi file dalam transaksi PostgreSQL. Jika berhasil, cache hak akses RBAC akan disegarkan otomatis dan notifikasi sukses akan muncul.

### Cara 2: Melalui Terminal / Command Line (`psql`)
File cadangan `.sql` yang diunduh dapat langsung dieksekusi dari terminal server PostgreSQL:

```bash
# Sintaks umum psql
psql -h localhost -U postgres -d bangunjaya_app -f bangunjaya-database-dump-YYYYMMDD-HHmmss.sql
```

Jika server berada dalam container Docker:
```bash
docker exec -i <container_postgres> psql -U postgres -d bangunjaya_app < bangunjaya-database-dump.sql
```

### Cara 3: Melalui GUI Database (DBeaver / pgAdmin)
1. Buka DBeaver atau pgAdmin lalu koneksikan ke database `bangunjaya_app`.
2. Buka SQL Editor / Query Tool.
3. Muat file `bangunjaya-database-dump-*.sql` (`Open File`).
4. Klik tombol **Execute SQL Script** (atau tekan `Alt+X`).
5. Transaksi akan berjalan secara atomik hingga statement `COMMIT;`.

---

## 6. Daftar Endpoint REST API Export & Backup

| Metode | URL Endpoint | Izin Diperlukan | Format Respons / File | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/export/stats` | `data:export` | `application/json` | Statistik jumlah baris 16 tabel dan ukuran fisik DB |
| `GET` | `/api/export/database/sql` | `data:export` | `application/sql` | Full PostgreSQL Database Dump file `.sql` |
| `GET` | `/api/export/full-workbook` | `data:export` | `.xlsx` / `.json` | Multi-sheet workbook 9 sheets atau full JSON |
| `GET` | `/api/export/:entity` | `data:export` | `.xlsx` / `.csv` / `.json` | Ekspor spesifik per-entitas dengan parameter `?format=` |
| `POST` | `/api/export/database/restore` | `owner` role | `application/json` | Unggah file `.sql` untuk memulihkan seluruh database |
