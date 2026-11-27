# Panduan Lengkap: Tips & Trik Import Data Produk, Varian, dan Multi-Satuan
### Sistem Manajemen & POS Toko Bangunan

Dokumen ini berisi panduan komprehensif, tips praktis, dan trik terbaik untuk menyusun file spreadsheet (Excel `.xlsx` atau CSV `.csv`) saat mengimpor data produk material bahan bangunan, varian produk, serta satuan bertingkat (*multi-unit*).

---

## Daftar Isi
1. [Konsep Dasar Row-Based Grouping](#1-konsep-dasar-row-based-grouping)
2. [Aturan Multi-Satuan & Faktor Konversi](#2-aturan-multi-satuan--faktor-konversi)
3. [Produk Tunggal vs Multi-Varian](#3-produk-tunggal-vs-multi-varian)
4. [Master Data Otomatis & Relasi Supplier](#4-master-data-otomatis--relasi-supplier)
5. [Format Angka, Barcode, & Tips Excel](#5-format-angka-barcode--tips-excel)
6. [Mode Import: SKIP vs UPSERT](#6-mode-import-skip-vs-upsert)
7. [Tabel Contoh Skenario Nyata Toko Bangunan](#7-tabel-contoh-skenario-nyata-toko-bangunan)
8. [Checklist Pra-Upload & Troubleshooting](#8-checklist-pra-upload--troubleshooting)

---

## 1. Konsep Dasar Row-Based Grouping

Sistem import Toko Bangunan menggunakan arsitektur **_Row-Based Grouping_**:
> **1 Baris di Spreadsheet = 1 Kombinasi (Produk + Varian + Satuan)**

### Cara Sistem Mengelompokkan Baris:
- **Pengelompokan Produk**: Semua baris yang memiliki nilai `sku_produk` yang sama akan digabungkan menjadi **satu produk**.
- **Pengelompokan Varian**: Semua baris dalam produk yang sama dengan nilai `sku_varian` yang sama akan digabungkan menjadi **satu varian**.
- **Baris Lanjutan (Multi-Satuan)**: Jika satu varian memiliki 3 satuan (misal *Pcs*, *Lusin*, *Koli*), maka varian tersebut ditulis dalam **3 baris berturut-turut**.

### Aturan Pengisian Baris Pertama vs Baris Lanjutan:
| Kolom | Baris Pertama Produk | Baris Lanjutan (Satuan ke-2, ke-3, dst) |
|---|---|---|
| `sku_produk` | **Wajib diisi** | **Wajib diisi sama persis** |
| `nama_produk` | **Wajib diisi** | Boleh dikosongkan (otomatis ikut baris pertama) |
| `kategori` | Opsional (Disarankan) | Boleh dikosongkan |
| `merek` | Opsional | Boleh dikosongkan |
| `kode_supplier` | Opsional | Boleh dikosongkan |
| `sku_varian` | Wajib jika multi-varian | Wajib diisi sama untuk varian yang sama |
| `stok_awal` | Diisi (hanya di satuan dasar) | **Wajib dikosongkan** pada satuan turunan |
| `nama_satuan` | **Wajib diisi** | **Wajib diisi** |
| `satuan_dasar` | Diisi **`YA`** | Diisi **`TIDAK`** |
| `faktor_konversi` | Diisi **`1`** | Diisi nilai konversi ke satuan dasar |
| `harga_jual` | **Wajib diisi** | **Wajib diisi** |

> [!NOTE]
> Jika kolom seperti `nama_produk`, `kategori`, atau `merek` diisi pada baris lanjutan, pastikan nilainya sama persis dengan baris pertama. Jika berbeda, sistem validasi akan menandainya sebagai `INCONSISTENT_PRODUCT`.

---

## 2. Aturan Multi-Satuan & Faktor Konversi

Ini adalah bagian paling penting sekaligus paling sering terjadi kekeliruan pemula saat menyusun file import.

### 🔑 Rumus Baku Faktor Konversi:
$$\text{Faktor Konversi} = \frac{\text{Jumlah Kuantitas Satuan Tersebut dalam Satuan Dasar}}{1}$$

> [!IMPORTANT]
> **Faktor Konversi SELALU mengacu ke Satuan Dasar (Satuan Terkecil)**, bukan ke satuan tingkat di bawahnya!

### Studi Kasus: *Pcs $\rightarrow$ Lusin $\rightarrow$ Koli*
Misalkan Anda menjual kran air atau fitting pipa:
- Satuan 1: **Pcs** (Satuan terkecil/dasar)
- Satuan 2: **Lusin** (1 Lusin = 12 Pcs)
- Satuan 3: **Koli** (1 Koli berisi 10 Lusin)

**Cara Pengisian yang Benar:**
1. **Pcs**: `satuan_dasar` = **`YA`**, `faktor_konversi` = **`1`**.
2. **Lusin**: `satuan_dasar` = **`TIDAK`**, `faktor_konversi` = **`12`**.
3. **Koli**: `satuan_dasar` = **`TIDAK`**, `faktor_konversi` = **`120`** ($10 \times 12\text{ Pcs}$).

> [!WARNING]
> **JANGAN** mengisi faktor konversi Koli = `10`! Jika Anda mengisi 10, sistem akan mengira 1 Koli hanya berisi 10 Pcs, bukan 120 Pcs.

### Aturan Satuan Dasar (*Base Unit*):
1. **Tepat 1 Satuan Dasar per Varian**: Setiap varian **wajib memiliki tepat satu baris** dengan `satuan_dasar = YA` dan `faktor_konversi = 1`.
2. **Stok Awal Hanya pada Satuan Dasar**: Kolom `stok_awal` hanya boleh diisi pada baris satuan dasar. Nilai ini menyatakan jumlah fisik barang dalam satuan terkecil.
   - *Contoh*: Jika di gudang ada 10 Koli (@ 120 Pcs), isi `stok_awal` = `1200` pada baris **Pcs**, dan kosongkan `stok_awal` pada baris Lusin dan Koli.

---

## 3. Produk Tunggal vs Multi-Varian

### A. Produk Tunggal (Tanpa Varian)
Contoh: *Semen Tiga Roda 50 Kg*, *Bata Ringan Hebel 10cm*, *Triplek Meranti 12mm*.
- Kolom `sku_varian` dan `nama_varian` **boleh dikosongkan**.
- Sistem akan otomatis membuat varian default dengan kode `{sku_produk}-STD` dan nama varian `"Standar"`.
- Jika produk memiliki multi-satuan, cukup ulangi `sku_produk` pada baris berikutnya tanpa mengisi `sku_varian`.

### B. Produk Multi-Varian
Contoh:
- Pipa PVC dengan varian ukuran: `1/2"`, `3/4"`, `1"`, `2"`.
- Cat Tembok dengan varian warna: `Putih Salju`, `Abu Cerah`, `Krem`.
- Besi Beton dengan varian diameter: `D10`, `D13`, `D16`.

**Aturan Produk Multi-Varian:**
1. Kolom `sku_varian` **wajib diisi dan harus unik** di seluruh file dan database.
   - *Rekomendasi penamaan*: Tambahkan akhiran kode varian pada SKU produk:
     - `PPA-RCK-050` (untuk ukuran 1/2")
     - `PPA-RCK-075` (untuk ukuran 3/4")
2. Kolom `nama_varian` **wajib diisi** secara deskriptif (misal: `"Ukuran 1/2 Inch (4 Meter)"`).
3. Masing-masing varian memiliki stok awal dan struktur satuannya sendiri.

---

## 4. Master Data Otomatis & Relasi Supplier

Sistem Toko Bangunan POS dirancang cerdas untuk mempercepat proses on-boarding data. Berikut tabel perilaku otomatis saat import produk:

| Entitas | Otomatis Didaftarkan (*Auto-Create*)? | Cara Kerja & Penulisan |
|---|:---:|---|
| **Kategori (`kategori`)** | **YA** ✅ | Gunakan pemisah tanda `>` untuk hierarki.<br>Contoh: `Bahan Bangunan Dasar > Semen & Mortar`. Jika kategori belum ada, sistem akan membuat pohon kategori secara otomatis. |
| **Merek (`merek`)** | **YA** ✅ | Tuliskan nama merek (misal: `Tiga Roda`, `Rucika`, `Onda`). Sistem menerapkan normalisasi anti-duplikat (mengabaikan huruf besar/kecil dan spasi berlebih). |
| **Satuan (`nama_satuan`)** | **YA** ✅ | Tuliskan nama satuan (misal: `Sak`, `Batang`, `Pcs`, `Dus`, `Ikat`, `Truk`). Otomatis didaftarkan ke Master Satuan jika belum ada. |
| **Supplier (`kode_supplier`)** | **TIDAK** ❌ | **Wajib sudah terdaftar** di Master Supplier, atau **dikosongkan**! |

### Mengapa Supplier Tidak Dibuat Otomatis?
Supplier berkaitan erat dengan buku besar utang piutang, termin jatuh tempo nota, rekening bank, dan kontak sales lapangan. Mengizinkan auto-create dari salah ketik nama supplier akan mengotori laporan keuangan toko.

> [!TIP]
> **Urutan Terbaik Import Awal Toko:**
> 1. Import **Master Supplier** terlebih dahulu (tersedia template khusus supplier).
> 2. Import **Produk, Varian, & Multi-Satuan** dengan mencantumkan `kode_supplier` yang sudah terdaftar.
> 3. *Alternatif*: Jika data supplier belum siap, kosongkan saja kolom `kode_supplier`. Produk tetap berhasil diimport dan supplier bisa ditautkan kemudian lewat tombol **Edit Produk**.

---

## 5. Format Angka, Barcode, & Tips Excel

### 1. Format Angka Harga & Stok (Tanpa Pemisah Ribuan Manual)
- **BENAR**: `65000` atau `65000.00`
- **SALAH**: `Rp 65.000` atau `65,000` atau `65.000,-`
- Sistem import telah mendukung pembersih desimal, namun menulis angka polos (*clean raw numeric*) adalah praktik paling aman untuk menghindari kesalahan interpretasi locale (koma vs titik).

### 2. Mencegah Hilangnya Angka Nol di Awal Barcode (*Leading Zero*)
Excel secara default menganggap barcode angka seperti `089912345` sebagai angka numerik biasa dan menghapus angka `0` di depan menjadi `89912345`.
- **Tips di Excel**:
  - Sebelum mengetik barcode, ubah format kolom menjadi **Text** (*Format Cells $\rightarrow$ Text*).
  - Atau tambahkan tanda kutip satu (`'`) di depan angka: `'089912345678`. Tanda kutip tidak akan tersimpan di database.

### 3. Nilai Boolean / Flag
Pada kolom seperti `satuan_dasar`, `status_produk`, dan `status_varian`:
- Nilai Benar / Aktif: `YA`, `1`, `TRUE`, `AKTIF`.
- Nilai Salah / Nonaktif: `TIDAK`, `0`, `FALSE`, `NONAKTIF`.
- Jika dikosongkan: `satuan_dasar` default `TIDAK`, sedangkan status produk/varian default `AKTIF`.

---

## 6. Mode Import: SKIP vs UPSERT

Pada layar pop-up Import Data, terdapat pilihan **Mode Penanganan Duplikat**:

```
[•] Lewati Duplikat (Skip)     - Produk lama tidak disentuh, hanya produk baru yang dibuat.
[ ] Perbarui Data (Upsert)     - Produk lama diperbarui, satuan/varian baru ditambahkan.
```

### Kapan Menggunakan Mode SKIP?
- Digunakan saat Anda mengimpor katalog produk baru, dan tidak ingin ada data lama yang tersentuh jika tidak sengaja mencantumkan SKU yang sudah ada.
- Jika SKU produk sudah ada di database, seluruh baris produk tersebut dilewati (*skipped*) dengan aman.

### Kapan Menggunakan Mode UPSERT?
- **Pembaruan Harga Massal**: Ingin menaikkan/menurunkan harga jual atau harga grosir ratusan barang sekaligus dari supplier.
- **Menambah Satuan Baru**: Produk lama baru memiliki satuan *Pcs*, dan Anda ingin menambahkan satuan *Lusin* dan *Koli*.
- **Menambah Varian Baru**: Menambahkan varian warna/ukuran baru pada produk yang sudah berjalan.

### 🛡️ Proteksi Stok Berjalan pada Mode UPSERT:
> [!IMPORTANT]
> Mode **UPSERT TIDAK AKAN PERNAH menimpa stok berjalan (`current_stock`)** pada produk yang sudah terdaftar!
> Nilai `stok_awal` pada file Excel hanya digunakan saat membuat varian BARU. Pada varian yang sudah ada, nilai stok awal di file akan diabaikan dan sistem memberikan catatan informasi (*info warning*). Untuk penyesuaian stok berjalan, gunakan modul resmi **Penyesuaian Stok / Stock Opname**.

---

## 7. Tabel Contoh Skenario Nyata Toko Bangunan

Berikut adalah contoh tabel pengisian riil yang dapat Anda jadikan contekan:

### Skenario 1: Semen Sak & Pembelian Partai (Truk)
- Produk: *Semen Tiga Roda PCC 50 Kg*
- Satuan: Sak (Eceran) & Truk (1 Truk = 200 Sak)

| sku_produk | nama_produk | kategori | merek | kode_supplier | sku_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_beli | harga_jual | harga_grosir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SMN-TGR-50` | Semen Tiga Roda PCC 50 Kg | Bahan Bangunan Dasar > Semen & Mortar | Tiga Roda | SUP-INDO | *(kosong)* | **Sak** | **YA** | **1** | 150 | 64000 | 69000 | 67000 |
| `SMN-TGR-50` | *(kosong)* | *(kosong)* | *(kosong)* | *(kosong)* | *(kosong)* | **Truk** | **TIDAK** | **200** | *(kosong)* | 12400000 | 13400000 | 13200000 |

---

### Skenario 2: Pipa PVC Multi-Ukuran & Multi-Satuan (Batang & Ikat)
- Produk: *Pipa PVC Rucika AW JIS*
- Varian: Ukuran 1/2" & 3/4" (4 Meter)
- Satuan: Batang & Ikat (1 Ikat = 10 Batang)

| sku_produk | nama_produk | kategori | merek | sku_varian | nama_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_jual | harga_grosir |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PPA-RCK-AW` | Pipa PVC Rucika AW Standard JIS | Pipa & Sanitari > Pipa PVC | Rucika | `PPA-RCK-AW-050` | Ukuran 1/2 Inch | **Batang** | **YA** | **1** | 80 | 35000 | 33000 |
| `PPA-RCK-AW` | *(kosong)* | *(kosong)* | *(kosong)* | `PPA-RCK-AW-050` | Ukuran 1/2 Inch | **Ikat** | **TIDAK** | **10** | *(kosong)* | 340000 | 320000 |
| `PPA-RCK-AW` | *(kosong)* | *(kosong)* | *(kosong)* | `PPA-RCK-AW-075` | Ukuran 3/4 Inch | **Batang** | **YA** | **1** | 60 | 47000 | 44500 |
| `PPA-RCK-AW` | *(kosong)* | *(kosong)* | *(kosong)* | `PPA-RCK-AW-075` | Ukuran 3/4 Inch | **Ikat** | **TIDAK** | **10** | *(kosong)* | 455000 | 435000 |

---

### Skenario 3: Kran Air 3 Tingkat Satuan (Pcs $\rightarrow$ Lusin $\rightarrow$ Koli)
- Produk: *Kran Tembok Onda A 801 G*
- 1 Lusin = 12 Pcs
- 1 Koli = 10 Lusin = 120 Pcs

| sku_produk | nama_produk | merek | sku_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_beli | harga_jual | harga_grosir |
|---|---|---|---|---|---|---|---|---|---|---|
| `KRN-ONDA-801` | Kran Air Tembok Onda A 801 G | Onda | *(kosong)* | **Pcs** | **YA** | **1** | 120 | 32000 | 42000 | 39000 |
| `KRN-ONDA-801` | *(kosong)* | *(kosong)* | *(kosong)* | **Lusin** | **TIDAK** | **12** | *(kosong)* | 375000 | 490000 | 460000 |
| `KRN-ONDA-801` | *(kosong)* | *(kosong)* | *(kosong)* | **Koli** | **TIDAK** | **120** | *(kosong)* | 3600000 | 4700000 | 4450000 |

---

### Skenario 4: Cat Tembok Multi-Varian Warna
- Produk: *Cat Tembok Avitex Galon 5 Kg*
- Varian: Putih Super, Modern Grey, Barley White

| sku_produk | nama_produk | kategori | merek | sku_varian | nama_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_jual |
|---|---|---|---|---|---|---|---|---|---|---|
| `CAT-AVT-5KG` | Cat Tembok Avitex Interior 5 Kg | Cat & Perlengkapan > Cat Tembok | Avian | `CAT-AVT-5K-WHT` | Putih Super (SW) | Galon | YA | 1 | 35 | 130000 |
| `CAT-AVT-5KG` | *(kosong)* | *(kosong)* | *(kosong)* | `CAT-AVT-5K-GRY` | Modern Grey (MG) | Galon | YA | 1 | 20 | 130000 |
| `CAT-AVT-5KG` | *(kosong)* | *(kosong)* | *(kosong)* | `CAT-AVT-5K-BRL` | Barley White (BW) | Galon | YA | 1 | 25 | 130000 |

---

### Skenario 5: Besi Beton Ulir (Batang & Ikat isi 50)
- Produk: *Besi Beton Ulir SNI TS280 12M*
- Varian: D10 & D13
- 1 Ikat = 50 Batang

| sku_produk | nama_produk | kategori | merek | sku_varian | nama_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_jual |
|---|---|---|---|---|---|---|---|---|---|---|
| `BESI-ULIR-SNI` | Besi Beton Ulir SNI 12 Meter | Bahan Bangunan Dasar > Besi & Baja | Krakatau Steel | `BESI-ULR-D10` | Diameter D10 Full | Batang | YA | 1 | 200 | 82000 |
| `BESI-ULIR-SNI` | *(kosong)* | *(kosong)* | *(kosong)* | `BESI-ULR-D10` | Diameter D10 Full | Ikat | TIDAK | 50 | *(kosong)* | 4050000 |
| `BESI-ULIR-SNI` | *(kosong)* | *(kosong)* | *(kosong)* | `BESI-ULR-D13` | Diameter D13 Full | Batang | YA | 1 | 150 | 138000 |
| `BESI-ULIR-SNI` | *(kosong)* | *(kosong)* | *(kosong)* | `BESI-ULR-D13` | Diameter D13 Full | Ikat | TIDAK | 50 | *(kosong)* | 6800000 |

---

### Skenario 6: Paku Kayu (Kg & Dus isi 30 Kg)
- Produk: *Paku Kayu SNI*
- Varian: 5 cm (2") & 7 cm (3")
- 1 Dus = 30 Kg

| sku_produk | nama_produk | sku_varian | nama_varian | nama_satuan | satuan_dasar | faktor_konversi | stok_awal | harga_jual |
|---|---|---|---|---|---|---|---|---|
| `PAKU-KYU-SNI` | Paku Kayu Kawat Baja SNI | `PK-KYU-05` | Ukuran 5 cm (2 Inch) | Kg | YA | 1 | 180 | 19000 |
| `PAKU-KYU-SNI` | *(kosong)* | `PK-KYU-05` | Ukuran 5 cm (2 Inch) | Dus | TIDAK | 30 | *(kosong)* | 550000 |
| `PAKU-KYU-SNI` | *(kosong)* | `PK-KYU-07` | Ukuran 7 cm (3 Inch) | Kg | YA | 1 | 240 | 19000 |
| `PAKU-KYU-SNI` | *(kosong)* | `PK-KYU-07` | Ukuran 7 cm (3 Inch) | Dus | TIDAK | 30 | *(kosong)* | 550000 |

---

## 8. Checklist Pra-Upload & Troubleshooting

Sebelum mengunggah file ke aplikasi, lakukan pengecekan 10 poin ini:

- [ ] **1. Header Kolom**: Jangan mengubah nama header pada baris pertama template resmi.
- [ ] **2. SKU Unik**: Pastikan `sku_produk` unik untuk setiap jenis produk, dan `sku_varian` unik untuk setiap varian.
- [ ] **3. Baris Satuan Lengkap**: Pastikan setiap varian memiliki baris satuan dengan `satuan_dasar = YA` dan `faktor_konversi = 1`.
- [ ] **4. Konversi Terhadap Satuan Dasar**: Periksa kembali satuan besar (*Koli, Palet, Truk*), pastikan faktor konversi adalah jumlah satuan terkecil.
- [ ] **5. Stok Awal Tidak Ganda**: Pastikan `stok_awal` hanya terisi pada baris `satuan_dasar = YA`.
- [ ] **6. Format Angka Bersih**: Tidak ada simbol mata uang (`Rp`), spasi, titik ribuan manual di kolom harga atau stok.
- [ ] **7. Supplier Terdaftar**: Jika mengisi `kode_supplier`, pastikan kodenya sudah ada di menu Master Supplier (atau kosongkan saja jika ragu).
- [ ] **8. Hierarki Kategori**: Jika mengisi sub-kategori, gunakan tanda lebih besar `>` dengan spasi (contoh: `Induk > Sub`).
- [ ] **9. Mode Import yang Tepat**: Pilih *Skip* untuk produk baru, atau *Upsert* untuk update harga/tambah satuan produk lama.
- [ ] **10. Simpan sebagai `.xlsx` atau `.csv` (UTF-8)**: Pastikan file berekstensi `.xlsx` atau `.csv`.

### Membaca Hasil Validasi Pratinjau (Preview Modal):
Aplikasi memiliki fitur pratinjau instan sebelum data disimpan permanen ke database:
- **Pill Hijau (Valid)**: Baris data sudah siap diimpor tanpa kendala.
- **Pill Kuning (Peringatan/Warning)**: Baris tetap bisa diimpor, namun ada catatan (misal: stok awal diabaikan karena mode upsert pada produk existing).
- **Pill Merah (Invalid)**: Ada kesalahan data wajib (misal harga jual kosong, faktor konversi salah, atau satuan dasar tidak ada). Anda dapat memperbaiki file Excel Anda lalu mengunggah ulang tanpa perlu khawatir data rusak.
