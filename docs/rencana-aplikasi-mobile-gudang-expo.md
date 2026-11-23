# Rencana Aplikasi Mobile Gudang (Expo) — BangunJaya POS

> Dokumen catatan perencanaan fitur, kesiapan backend, arsitektur teknis Expo, dan roadmap pengembangan aplikasi mobile khusus staf gudang toko bahan bangunan (**BangunJaya POS**). Disusun agar setiap poin dapat dievaluasi satu per satu sebelum masuk ke tahap implementasi.

**Legenda Status Kesiapan Backend:**
- 🟢 **Siap Pakai API Eksisting** — Endpoint & skema saat ini sudah bisa langsung dikonsumsi mobile.
- 🟡 **Perlu Modifikasi Ringan** — Endpoint sudah ada, tetapi butuh perbaikan validasi, query, index, atau penyesuaian kecil.
- 🔴 **Perlu Backend Baru** — Memerlukan tabel database baru dan/atau endpoint baru.

---

## 1. Ringkasan Fondasi Sistem Saat Ini

Berdasarkan audit codebase (`backend/` dan `frontend/`), fondasi BangunJaya POS yang sudah tersedia untuk langsung dimanfaatkan aplikasi mobile:

- **Auth Mobile-Friendly**: Menggunakan **Bearer JWT** (`access_token`) + **Refresh Token JSON** di body (bukan `httpOnly` cookie), serta konfigurasi CORS yang mengizinkan request native tanpa header `Origin` ([`backend/src/index.ts`](../backend/src/index.ts)).
- **RBAC Dinamis & Peran `gudang`**: Peran bawaan `gudang` memiliki 10 izin operasional (`dashboard:read`, `products:read`, `products:create`, `products:update`, `master:read`, `suppliers:read`, `stock:read`, `stock:adjust`, `reservations:read`, `reservations:pickup`) dan **otomatis menyensor `buy_price`** menjadi `null` ([`backend/src/config/permissionCatalog.ts`](../backend/src/config/permissionCatalog.ts)). Custom role baru (mis. `kepala_gudang`, `helper_muat`) dapat dibuat lewat `/api/roles`.
- **Multi-Varian & Multi-Satuan Bertingkat**: Stok fisik (`current_stock`) dan stok ditahan (`reserved_stock`) disimpan dalam satuan dasar, sedangkan tabel `variant_units` menyimpan `conversion_factor` (*Truk*, *Pick Up*, *Ikat*, *Dus*, *Batang*, *Sak*, dll.).
- **Mutasi Stok Transaksional (ACID)**: `POST /api/stock/adjust` menggunakan row lock (`SELECT ... FOR UPDATE`) dengan 11 tipe aksi (`STOCK_OPNAME`, `PURCHASE_RESTOCK`, `SALE_DEDUCT`, `DAMAGED_EXPIRED`, `RETURN_IN`, `RETURN_OUT`, `MANUAL_ADJUSTMENT`, `RESERVATION_HOLD`, `RESERVATION_PICKUP`, `RESERVATION_RELEASE`, `VARIANT_MOVED`) ([`backend/src/services/stockService.ts`](../backend/src/services/stockService.ts)).
- **Alur Titip Barang (Reservasi & Pickup Parsial/Penuh)**: Sudah tersedia di [`backend/src/services/reservationService.ts`](../backend/src/services/reservationService.ts) dengan kode `TTP-YYYYMMDD-XXXX`, perpanjangan deadline, serta log `stock_reservation_pickups` (`receiver_name`, `vehicle_plate`, `handed_by`).
- **AI Hybrid / Semantic Search**: `GET /api/products?mode=hybrid` sudah aktif, membantu staf gudang mencari material dengan bahasa sehari-hari (mis. *"cat anti bocor dak"* atau *"pipa tebal 3 dim"*).

---

## 2. Daftar Fitur Aplikasi Mobile Gudang (Untuk Evaluasi)

### A. Pencarian Cepat, Scan & Cek Stok Lapangan

- [ ] **A1. Omni-Search (Hybrid AI + Kategori/Merek)** — 🟢 *Siap Pakai API Eksisting*
  - Cari produk lewat `GET /api/products?mode=hybrid` serta filter `GET /api/categories?tree=true` dan `GET /api/brands` tanpa harus hafal SKU.
- [ ] **A2. Kalkulator Konversi Multi-Satuan & Info Logistik** — 🟢 *Siap Pakai API Eksisting*
  - Menampilkan `Fisik` (`current_stock`), `Ditahan` (`reserved_stock`), dan `Bebas Jual` (`available_stock`), konversi interaktif ke seluruh `variant_units`, serta berat/dimensi produk untuk estimasi muatan truk (dengan `buy_price` otomatis disensor untuk `gudang`).
- [ ] **A3. Scan Barcode / QR Label -> Buka Varian Instan** — 🟡 *Perlu Modifikasi Ringan*
  - Scan barcode pabrik atau QR rak/produk internal menggunakan `expo-camera`.
  - *Catatan Backend*: Saat ini `GET /api/products?search=` melakukan full-table scan di Node dan tidak mencocokkan `variant.id`. Perlu index DB pada `barcode` serta endpoint `GET /api/products/by-barcode/:code` dan `GET /api/variants/:id`.
- [ ] **A4. Tab "Tanpa Barcode / Curah" & Filter Varian Habis** — 🟡 *Perlu Modifikasi Ringan*
  - Akses <= 2 tap untuk material tanpa barcode pabrik (pasir, batu, besi beton, kayu, pipa).
  - *Catatan Backend*: Perlu query `?hasBarcode=false` dan perbaikan filter `stockStatus=out` agar memeriksa per varian, bukan hanya total stok produk induk.
- [ ] **A5. Manajemen Lokasi Rak / Zona Gudang** — 🔴 *Perlu Backend Baru*
  - Penandaan dan scan QR zona/rak (mis. `ZONA-PASIR`, `RAK-PIPA-B1`) dengan relasi *many-to-many* (`warehouse_locations` + `variant_locations`), karena satu varian material bangunan sering berada di rak depan sekaligus tumpukan palet belakang.

### B. Penerimaan Barang (Inbound / Bongkar Truk Supplier)

- [ ] **B1. Input Masuk Barang Multi-Satuan & Kontak Sales WA** — 🟢 *Siap Pakai API Eksisting*
  - Petugas menginput qty dalam satuan pengiriman (*Truk*, *Koli*, *Ikat*, *Dus*, *Sak*) -> aplikasi menghitung konversi ke satuan dasar -> kirim `PURCHASE_RESTOCK` (`ADD`) ke `POST /api/stock/adjust`.
  - Akses cepat nomor WhatsApp sales aktif lewat `GET /api/suppliers/:supplierId/sales`.
- [ ] **B2. Quick Bind Barcode di Dok Bongkar** — 🟡 *Perlu Modifikasi Ringan*
  - Scan barcode kemasan baru untuk langsung disimpan ke varian terkait via `PUT /api/variants/:id`.
  - *Catatan Backend*: Perlu sinkronisasi `barcode` ke `products.barcode` untuk produk non-varian dan perbaikan status error HTTP `400`/`409` (saat ini masih `500`).
- [ ] **B3. Modul Goods Receipt (Penerimaan per PO / Nota Supplier)** — 🔴 *Perlu Backend Baru*
  - Saat ini `supplier_invoices` hanya mencatat header hutang rupiah tanpa rincian item, dan role `gudang` tidak punya izin `master:write`.
  - Perlu tabel `goods_receipts` + `goods_receipt_items` untuk mencatat qty datang, terima parsial, dan **barang rusak/ditolak langsung di truk** tanpa membuka data HPP/nominal hutang ke staf gudang.
  - > **Penting**: Barang rusak dari truk yang ditolak di dok **tidak boleh** dicatat sebagai `DAMAGED_EXPIRED` pada `POST /api/stock/adjust`, karena `DAMAGED_EXPIRED` bersifat `SUBTRACT` dan akan memotong stok bagus yang sudah ada di rak.

### C. Pengambilan Barang & Titip Barang (Outbound / Picking)

- [ ] **C1. Antrean Titipan (`PENDING`, `PARTIAL`, `Overdue`, `Due Soon`)** — 🟢 *Siap Pakai API Eksisting*
  - Pantau daftar pengambilan barang tertunda & alert jatuh tempo lewat `GET /api/reservations` dan `GET /api/reservations/alerts`.
- [ ] **C2. Scan Tiket `TTP-...` & Checklist Muat Parsial/Penuh** — 🟡 *Perlu Modifikasi Ringan*
  - Scan QR tiket dari kasir untuk membuka detail item, centang barang yang dimuat bertahap/penuh, isi `receiver_name` dan `vehicle_plate` (`POST /api/reservations/:id/pickup`).
  - *Catatan Backend*: Perlu endpoint `GET /api/reservations/by-code/:code` (karena `GET /api/reservations/:id` crash `500` jika diberi kode `TTP-...` non-UUID) serta mengisi `stock_movements.user_id` dan `handed_by` dari `req.user`.
- [ ] **C3. Share PDF Bukti Serah Terima via WhatsApp** — 🟢 *Siap Pakai (Client Expo)*
  - Generate PDF ringan di HP menggunakan `expo-print` + `expo-sharing` dari data pickup untuk langsung dibagikan ke pelanggan/supir.
- [ ] **C4. Foto Muatan, Tanda Tangan Digital POD & Surat Jalan Resmi** — 🔴 *Perlu Backend Baru*
  - [`backend/src/middleware/upload.ts`](../backend/src/middleware/upload.ts) saat ini hanya menerima file Excel/CSV/SQL di memory. Perlu storage disk/S3 untuk gambar terkompresi, kolom `photo_url`/`signature_url`, serta tabel `deliveries` / Surat Jalan resmi.

### D. Stock Opname & Penyesuaian Stok

- [ ] **D1. Opname Cepat, Kalkulator Hitung Campuran & Lapor Rusak/Retur** — 🟡 *Perlu Modifikasi Ringan*
  - Contoh: petugas hitung *3 Ikat + 4 Batang* -> otomatis dikonversi ke satuan dasar -> kirim `POST /api/stock/adjust` (`STOCK_OPNAME`, `DAMAGED_EXPIRED`, `RETURN_IN`, `RETURN_OUT`).
  - *Catatan Backend*: Perlu validasi agar `SET`/`SUBTRACT` tidak boleh membuat `current_stock < reserved_stock`, validasi enum `adjustment_mode`/`movement_type`, serta `idempotency_key` untuk mencegah duplikasi saat sinyal putus.
- [ ] **D2. Sesi Opname Terstruktur (Cycle Count, Blind Count, Approval)** — 🔴 *Perlu Backend Baru*
  - Pembagian opname per zona/kategori, mode *blind count* (sembunyikan stok sistem saat hitung), batch commit (`stock_opname_sessions` + `stock_opname_items`), dan alur approval selisih besar oleh `admin`/`owner`.

### E. Dashboard Gudang, Riwayat Audit, Cetak Hardware & Notifikasi

- [ ] **E1. Dashboard Tugas Harian & Kartu Audit Mutasi** — 🟢 *Siap Pakai API Eksisting*
  - Ringkasan varian kritis/habis (`GET /api/dashboard/summary`), alert reservasi, dan riwayat mutasi lengkap (`GET /api/stock/movements`) dengan info pelaku.
- [ ] **E2. Cetak Thermal Bluetooth (Label Rak QR & Struk Titipan)** — 🟡 *Client Native (Expo Dev Build)*
  - Cetak stiker QR untuk barang non-barcode (besi, pipa, rak pasir), label *"BARANG TITIPAN"* (`TTP-...`), dan struk serah terima ke printer thermal Bluetooth 58mm/80mm (ESC/POS / TSPL).
- [ ] **E3. Push Notification Stok Kritis & Titipan Overdue** — 🔴 *Perlu Backend Baru*
  - Tabel `user_push_tokens` + scheduler Expo Push Notification agar kepala gudang/admin langsung menerima notifikasi.

### F. UX Khusus Medan Gudang & Offline-First

- [ ] **F1. Login Cepat Shift (Quick PIN / Biometrik Lokal)** — 🟢 *Siap Pakai (Client Expo)*
  - Menggunakan `expo-secure-store` + `expo-local-authentication` untuk membungkus sesi JWT aktif agar staf bersarung tangan/berdebu tidak perlu mengetik ulang password panjang.
  - *(Catatan: ganti cepat multi-operator pada 1 HP bersama membutuhkan endpoint PIN backend baru).*
- [ ] **F2. Ergonomi Lapangan & Feedback Scan Instan** — 🟢 *Siap Pakai (Client Expo)*
  - Audio beep + getaran (`expo-haptics` + `expo-audio`), `expo-keep-awake` saat bongkar muat, tombol besar >= 48dp, keypad stepper cepat (`-10`, `-1`, `+1`, `+10`), tema **Outdoor High-Contrast** (untuk area terbuka di bawah matahari) & **Dark Mode**.
- [ ] **F3. Mode Offline-First & Antrean Sinkronisasi** — 🔴 *Perlu Modifikasi/Backend Baru*
  - Cermin katalog lokal (`expo-sqlite`) + tabel `sync_outbox` FIFO untuk zona blank spot beton/seng, dilengkapi UI resolusi konflik yang jelas.
  - *Catatan Backend*: Memerlukan `?updated_since=` delta sync, `idempotency_key`, dan pengecekan `expected_previous_stock` saat sync opname agar tidak menimpa transaksi kasir secara diam-diam.

---

## 3. Rekomendasi Stack Teknis Expo

| Lapisan | Teknologi Disarankan | Catatan & Trade-Off |
|---|---|---|
| **Core & Navigasi** | **Expo SDK + Expo Router (TypeScript)** | File-based routing & deep link QR (`bangunjaya://v/:id`, `bangunjaya://r/:code`). |
| **Build Target** | **Expo Development Build (Prebuild / CNG)** | Wajib untuk `react-native-mmkv`, printer thermal Bluetooth (BLE/SPP), scanner PDA (DataWedge/HID), dan remote push Android SDK 53+ (tidak jalan di Expo Go). Prototipe awal Fase 1 tanpa modul native tersebut masih bisa dicoba di Expo Go. |
| **Kamera & Scan** | `expo-camera` (`CameraView`) | Mendukung EAN-13, Code-128, QR, dan kontrol flash/torch untuk rak gelap. Bungkus di komponen abstrak agar mudah migrasi ke `vision-camera` atau PDA scanner nanti. |
| **Offline & State** | `expo-sqlite` + `@tanstack/react-query` + `@react-native-community/netinfo` + `react-native-mmkv` | SQLite untuk cermin katalog & outbox FIFO; TanStack Query untuk cache & revalidasi; MMKV untuk preferensi cepat (tema, printer MAC). |
| **Auth & Keamanan** | `expo-secure-store` + `expo-local-authentication` | Menyimpan `access_token` & `refresh_token` terenkripsi Keystore/Keychain + unlock PIN/biometrik lokal. |
| **Foto & Cetak** | `expo-image-picker` + `expo-image-manipulator` + `expo-print` + `expo-sharing` + adapter Bluetooth ESC/POS | Kompresi foto otomatis ke ~150–250 KB sebelum upload; PDF WhatsApp untuk Fase 1, thermal Bluetooth langsung di Fase 3. |

---

## 4. Catatan Celah & Jebakan Teknis Codebase Saat Ini

Poin-poin berikut diverifikasi langsung dari codebase dan penting untuk dievaluasi sebelum implementasi:

- [ ] **T1. Refresh Token Replay Trap** ([`backend/src/services/authService.ts`](../backend/src/services/authService.ts))
  - Mengirim ulang `refresh_token` lama langsung memicu `TOKEN_REPLAY_DETECTED` dan **mencabut semua sesi user**. Di Wi-Fi gudang yang tidak stabil, mobile wajib memakai **single-flight refresh mutex**, dan backend disarankan menambah *rotation grace window* (10–15 detik).
- [ ] **T2. Android Cleartext HTTP & Dev JWT Secret** ([`backend/src/config/env.ts`](../backend/src/config/env.ts))
  - Android API 28+ memblokir akses `http://192.168.x.x:5000` kecuali `usesCleartextTraffic: true` diaktifkan via `expo-build-properties` (atau gunakan HTTPS LAN).
  - Pastikan `JWT_ACCESS_SECRET` (>= 32 karakter) terisi di `.env` dev agar restart backend tidak menginvalidasi seluruh sesi mobile.
- [ ] **T3. Guardrail Stok & Audit Reservasi** ([`backend/src/services/stockService.ts`](../backend/src/services/stockService.ts), [`backend/src/services/reservationService.ts`](../backend/src/services/reservationService.ts))
  - `StockService.adjustStock` baru mengecek `newStock < 0`, belum menolak `newStock < reserved_stock`, dan belum memvalidasi enum `adjustment_mode`/`movement_type`.
  - `ReservationService` mencatat `stock_movements.user_id = NULL` dan menerima string `handed_by` dari body request.
  - JSONB `stock_reservation_pickups.items` menyimpan key `qty_picked_up_base` (satuan dasar), bukan `qty_picked_up` (terdeteksi inkonsistensi di [`frontend/src/components/PickupReservationModal.tsx`](../frontend/src/components/PickupReservationModal.tsx)).
- [ ] **T4. Reset RBAC Saat Restart & Visibilitas Nota Supplier** ([`backend/src/db/init.ts`](../backend/src/db/init.ts), [`backend/src/routes/api.ts`](../backend/src/routes/api.ts))
  - `init.ts` menjalankan `ON CONFLICT (code) DO UPDATE SET permissions = EXCLUDED.permissions` sehingga edit izin pada 4 role sistem (`owner`, `admin`, `gudang`, `kasir`) ter-reset tiap server restart.
  - `GET /api/suppliers/:supplierId/invoices` saat ini bisa diakses `gudang` (`suppliers:read`) termasuk nominal tagihan rupiahnya — perlu dievaluasi apakah nominal hutang harus disembunyikan seperti `buy_price`.
- [ ] **T5. Parsing Desimal `NUMERIC` PostgreSQL**
  - Driver `pg` mengembalikan kolom `NUMERIC(12,2)` / `NUMERIC(12,4)` sebagai string (`"120.00"`). Aplikasi Expo wajib melakukan konversi angka dan pembulatan konsisten 2 desimal agar terhindar dari drift floating-point pada pecahan satuan (mis. `0.5 Truk`, `1.25 Kg`).

---

## 5. Roadmap Pengembangan Bertahap

### Fase 1 — MVP Operasional Gudang Inti (Minggu 1–3)
- [ ] **Pre-req Backend Minimal (~2–3 hari)**:
  - Tambah `GET /api/products/by-barcode/:code`, `GET /api/variants/:id`, dan `GET /api/reservations/by-code/:code`.
  - Tambah `idempotency_key` pada `POST /api/stock/adjust` & `POST /api/reservations/:id/pickup`, plus grace window 15 detik pada `AuthService.refresh()`.
  - Perbaiki validasi `newStock >= reserved_stock`, enum `adjustment_mode`/`movement_type`, pengisian `user_id` di `ReservationService`, dan pencegahan reset RBAC di `init.ts`.
- [ ] **Aplikasi Expo**:
  - Setup Expo Router + Dev Build (CNG) + `usesCleartextTraffic`.
  - Auth JWT + single-flight refresh mutex + SecureStore + Quick PIN/Biometrik lokal.
  - Omni-Search (`expo-camera` + `mode=hybrid` + browse kategori/barang tanpa barcode).
  - Detail varian & Kalkulator Multi-Satuan (`Fisik / Ditahan / Bebas Jual`).
  - Terima Barang (`PURCHASE_RESTOCK`), Opname/Rusak (`STOCK_OPNAME`, `DAMAGED_EXPIRED`), Riwayat Mutasi, Antrean & Pickup Titip Barang + Share PDF WhatsApp.

### Fase 2 — Lokasi Gudang, Goods Receipt & Bukti Lapangan (Minggu 4–7)
- [ ] **Backend**: Tabel `warehouse_locations` + `variant_locations`, modul `goods_receipts` + `goods_receipt_items`, `stock_opname_sessions` (blind count + batch commit + approval selisih), storage upload foto bukti/POD, dan `user_push_tokens` + Expo Push alerts.
- [ ] **Aplikasi Expo**: Scan QR rak/lokasi, Receiving per truk supplier + Quick Bind Barcode, Guided Blind Cycle Count, foto bukti terkompresi, tanda tangan digital POD, dan Push Notification.

### Fase 3 — Offline-First Penuh & Hardware Gudang (Minggu 8–11)
- [ ] **Backend**: Endpoint delta sync (`?updated_since=`), `expected_previous_stock` optimistic check pada sync opname, dan index DB barcode unik opsional.
- [ ] **Aplikasi Expo**: Cermin katalog lokal `expo-sqlite` + FIFO `sync_outbox` dengan UI resolusi konflik, cetak langsung thermal Bluetooth 58mm/80mm (Surat Jalan, Label Titipan `TTP-...`, stiker QR rak/barang non-barcode), serta dukungan scanner PDA (DataWedge/HID).
