# Changelog

Seluruh perubahan penting pada aplikasi **Toko Bangunan** dicatat dalam dokumen ini.
Format mengacu pada Semantic Versioning (`MAJOR.MINOR.PATCH`).

## [v1.1.0] - 2026-11-28

### Fitur Baru
- Sistem penomoran versi terpadu (*Unified Semantic Versioning*) lintas Backend, Frontend, dan endpoint `/api/v1` beserta detektor versi baru otomatis di UI.
- Modul **Riwayat & Analitik Perubahan Harga**: pencatatan otomatis perubahan harga modal, harga jual, dan harga grosir beserta perhitungan *Gross Margin* dan ambang batas peringatan margin kritis.
- **Wizard Update Harga Massal 5 Tahap**: dukungan multi-satuan proporsional (`conversion_factor`), diskon supplier bertingkat (misal `45% + 10% + 0,5%`), PPN pembelian, biaya tambahan pengadaan (*landed cost*), opsi penyesuaian harga jual manual/otomatis jaga margin, dan pembulatan per `500` / `1.000` / `5.000`.
- Grafik tren rata-rata harga modal, harga jual, dan histori margin keuntungan produk (default 90 hari) serta filter default satuan dasar pada detail varian.

### Perbaikan & Keamanan
- Penanganan *refresh token grace window* & *single-flight mutex* untuk mencegah *replay trap* pada request paralel.
- Penguatan RBAC dinamis agar hak akses kustom tidak ter-reset saat server restart serta sensor nominal sensitif (harga modal & hutang supplier) sesuai izin peran.
- Validasi ketat mutasi stok & *guardrail* `reserved_stock` pada sistem reservasi pengambilan barang.

## [v1.0.0] - 2026-11-18

### Rilis Fondasi Awal
- Manajemen katalog produk multi-varian, multi-satuan konversi, kategori bertingkat, merek, dan master supplier berbasis **UUIDv7**.
- Pencarian produk hibrida lokal (*Hybrid Semantic Search* `Xenova/multilingual-e5-small` + *Reciprocal Rank Fusion*).
- Manajemen penyesuaian stok, reservasi barang pelanggan, import/export Excel & backup database SQL, serta autentikasi RBAC multi-peran.
