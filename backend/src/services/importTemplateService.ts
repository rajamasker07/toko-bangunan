import ExcelJS from 'exceljs';
import type {
  ImportEntityType,
  ImportFileFormat,
  ParsedSpreadsheet,
  ParsedSpreadsheetRow,
} from '../types/import.js';
import { AppHttpError } from '../utils/errors.js';
import { escapeCsvValue, type CellScalar } from '../utils/spreadsheetParser.js';

export interface TemplateColumnDef {
  key: string;
  label: string;
  required: boolean;
  width: number;
  isText?: boolean;
  description: string;
  example: string;
}

export interface EntityTemplateSchema {
  entity: ImportEntityType;
  title: string;
  aliases: Record<string, string>;
  columns: TemplateColumnDef[];
  sampleRows: Array<Record<string, CellScalar>>;
  generalNotes: string[];
}

const ENTITY_SCHEMAS: Record<ImportEntityType, EntityTemplateSchema> = {
  categories: {
    entity: 'categories',
    title: 'Template Import Master Kategori',
    aliases: {
      nama: 'nama_kategori',
      kategori: 'nama_kategori',
      category_name: 'nama_kategori',
      induk: 'kategori_induk',
      parent: 'kategori_induk',
      parent_kategori: 'kategori_induk',
      parent_category: 'kategori_induk',
      keterangan: 'deskripsi',
      description: 'deskripsi',
    },
    columns: [
      {
        key: 'nama_kategori',
        label: 'Nama Kategori',
        required: true,
        width: 30,
        description: 'Nama kategori atau sub-kategori (maks 100 karakter).',
        example: 'Semen PCC Standar',
      },
      {
        key: 'kategori_induk',
        label: 'Kategori Induk (Path)',
        required: false,
        width: 42,
        description:
          'Kosongkan untuk kategori utama. Untuk sub-kategori gunakan path dipisah " > ", contoh: Bahan Bangunan Dasar > Semen & Mortar.',
        example: 'Bahan Bangunan Dasar > Semen & Mortar',
      },
      {
        key: 'deskripsi',
        label: 'Deskripsi',
        required: false,
        width: 45,
        description: 'Keterangan tambahan kategori (opsional).',
        example: 'Semen kemasan sak 40kg/50kg untuk cor dan plester',
      },
    ],
    sampleRows: [
      {
        nama_kategori: 'Bahan Bangunan Dasar',
        kategori_induk: '',
        deskripsi: 'Material pondasi, semen, bata, pasir, dan besi',
      },
      {
        nama_kategori: 'Semen & Mortar',
        kategori_induk: 'Bahan Bangunan Dasar',
        deskripsi: 'Semen portland dan semen instan mortar',
      },
      {
        nama_kategori: 'Semen PCC Standar',
        kategori_induk: 'Bahan Bangunan Dasar > Semen & Mortar',
        deskripsi: 'Semen kemasan sak untuk bangunan umum',
      },
    ],
    generalNotes: [
      'Natural key deteksi duplikat: kombinasi (Kategori Induk + Nama Kategori, case-insensitive).',
      'Jika Kategori Induk belum ada di database, sistem akan membuatnya otomatis sesuai path hierarki.',
      'Mode SKIP: kategori yang sudah ada dilewati. Mode UPSERT: deskripsi kategori diperbarui.',
    ],
  },

  brands: {
    entity: 'brands',
    title: 'Template Import Master Merek',
    aliases: {
      nama: 'nama_merek',
      merek: 'nama_merek',
      brand: 'nama_merek',
      brand_name: 'nama_merek',
    },
    columns: [
      {
        key: 'nama_merek',
        label: 'Nama Merek',
        required: true,
        width: 35,
        description:
          'Nama merek produk (maks 100 karakter). Deduplikasi otomatis mengabaikan spasi, tanda hubung, dan huruf besar/kecil.',
        example: 'Tiga Roda',
      },
    ],
    sampleRows: [
      { nama_merek: 'Tiga Roda' },
      { nama_merek: 'Dulux' },
      { nama_merek: 'Rucika' },
    ],
    generalNotes: [
      'Natural key deteksi duplikat: name_key (huruf kecil tanpa spasi/tanda baca; "Tiga Roda" = "tiga-roda").',
      'Mode SKIP: merek yang sudah ada dilewati. Mode UPSERT: kapitalisasi/penulisan nama merek diperbarui.',
    ],
  },

  suppliers: {
    entity: 'suppliers',
    title: 'Template Import Master Supplier & Kontak Sales',
    aliases: {
      kode: 'kode_supplier',
      supplier_code: 'kode_supplier',
      nama: 'nama_supplier',
      supplier: 'nama_supplier',
      supplier_name: 'nama_supplier',
      contact_person: 'kontak_utama',
      pic: 'kontak_utama',
      telepon: 'telepon_kantor',
      phone: 'telepon_kantor',
      no_telp: 'telepon_kantor',
      email: 'email_supplier',
      city: 'kota',
      address: 'alamat',
      catatan: 'catatan_supplier',
      notes: 'catatan_supplier',
      status: 'status_supplier',
      sales: 'nama_sales',
      sales_name: 'nama_sales',
      hp_sales: 'no_hp_sales',
      telepon_sales: 'no_hp_sales',
      phones_sales: 'no_hp_sales',
    },
    columns: [
      {
        key: 'kode_supplier',
        label: 'Kode Supplier',
        required: false,
        width: 18,
        isText: true,
        description:
          'Kode unik supplier (maks 50 char). Sangat disarankan diisi untuk mode UPSERT; jika kosong, auto-generate saat buat baru.',
        example: 'SUP-INDO',
      },
      {
        key: 'nama_supplier',
        label: 'Nama Supplier',
        required: true,
        width: 36,
        description: 'Nama perusahaan/distributor supplier (maks 150 karakter).',
        example: 'PT Indocement Tunggal Prakarsa Tbk',
      },
      {
        key: 'kontak_utama',
        label: 'Kontak Utama (PIC)',
        required: false,
        width: 22,
        description: 'Nama PIC utama supplier (maks 100 karakter).',
        example: 'Budi Santoso',
      },
      {
        key: 'telepon_kantor',
        label: 'Telepon Kantor',
        required: false,
        width: 20,
        isText: true,
        description: 'Nomor telepon utama perusahaan supplier (maks 50 karakter).',
        example: '0812-3456-7890',
      },
      {
        key: 'email_supplier',
        label: 'Email Supplier',
        required: false,
        width: 28,
        description: 'Alamat email resmi supplier.',
        example: 'sales@indocement.co.id',
      },
      {
        key: 'kota',
        label: 'Kota',
        required: false,
        width: 20,
        description: 'Kota domisili supplier.',
        example: 'Jakarta Selatan',
      },
      {
        key: 'alamat',
        label: 'Alamat',
        required: false,
        width: 38,
        description: 'Alamat lengkap kantor/gudang supplier.',
        example: 'Jl. Jenderal Sudirman Kav. 70-71',
      },
      {
        key: 'catatan_supplier',
        label: 'Catatan Supplier',
        required: false,
        width: 32,
        description: 'Catatan internal mengenai supplier.',
        example: 'Distributor utama Semen Tiga Roda',
      },
      {
        key: 'status_supplier',
        label: 'Status Supplier',
        required: false,
        width: 16,
        description: 'Isi AKTIF atau NONAKTIF (default AKTIF).',
        example: 'AKTIF',
      },
      {
        key: 'nama_sales',
        label: 'Nama Sales',
        required: false,
        width: 24,
        description:
          'Opsional. Isi jika ingin menambah kontak sales. Untuk 1 supplier dengan banyak sales, ulangi kode/nama supplier di baris baru.',
        example: 'Agus Pratama',
      },
      {
        key: 'email_sales',
        label: 'Email Sales',
        required: false,
        width: 28,
        description: 'Email kontak sales.',
        example: 'agus.pratama@indocement.co.id',
      },
      {
        key: 'no_hp_sales',
        label: 'No. HP Sales',
        required: false,
        width: 40,
        isText: true,
        description:
          'Bisa multi-nomor dipisah ";" atau "|", dengan label dalam kurung: 0812-1111-2222 (WhatsApp); 0815-9999-0000 (Kantor).',
        example: '0812-1111-2222 (WhatsApp); 0815-9999-0000 (Kantor)',
      },
      {
        key: 'catatan_sales',
        label: 'Catatan Sales',
        required: false,
        width: 32,
        description: 'Catatan area/spesialisasi sales.',
        example: 'Sales Lapangan Area Barat',
      },
      {
        key: 'status_sales',
        label: 'Status Sales',
        required: false,
        width: 15,
        description: 'Isi AKTIF atau NONAKTIF (default AKTIF).',
        example: 'AKTIF',
      },
    ],
    sampleRows: [
      {
        kode_supplier: 'SUP-INDO',
        nama_supplier: 'PT Indocement Tunggal Prakarsa Tbk',
        kontak_utama: 'Budi Santoso',
        telepon_kantor: '0812-3456-7890',
        email_supplier: 'sales@indocement.co.id',
        kota: 'Jakarta Selatan',
        alamat: 'Jl. Jenderal Sudirman Kav. 70-71',
        catatan_supplier: 'Distributor utama Semen Tiga Roda',
        status_supplier: 'AKTIF',
        nama_sales: 'Agus Pratama',
        email_sales: 'agus.pratama@indocement.co.id',
        no_hp_sales: '0812-1111-2222 (WhatsApp); 0815-9999-0000 (Kantor)',
        catatan_sales: 'Sales Lapangan - Semen Portland',
        status_sales: 'AKTIF',
      },
      {
        kode_supplier: 'SUP-INDO',
        nama_supplier: 'PT Indocement Tunggal Prakarsa Tbk',
        kontak_utama: 'Budi Santoso',
        telepon_kantor: '0812-3456-7890',
        email_supplier: 'sales@indocement.co.id',
        kota: 'Jakarta Selatan',
        alamat: 'Jl. Jenderal Sudirman Kav. 70-71',
        catatan_supplier: 'Distributor utama Semen Tiga Roda',
        status_supplier: 'AKTIF',
        nama_sales: 'Siti Rahmawati',
        email_sales: 'siti.rahma@indocement.co.id',
        no_hp_sales: '0813-4444-5555 (WhatsApp)',
        catatan_sales: 'Sales Counter & Hotline Proyek',
        status_sales: 'AKTIF',
      },
    ],
    generalNotes: [
      'Natural key Supplier: kode_supplier (case-insensitive) jika diisi, atau nama_supplier jika kode kosong.',
      'Natural key Sales: kombinasi (Supplier + nama_sales, case-insensitive).',
      'Satu supplier dengan banyak sales ditulis dalam beberapa baris dengan kode_supplier / nama_supplier yang sama.',
      'Mode SKIP: data supplier yang sudah ada tidak diubah, namun kontak sales baru tetap bisa ditambahkan.',
    ],
  },

  products: {
    entity: 'products',
    title: 'Template Import Produk, Varian & Multi-Satuan',
    aliases: {
      sku: 'sku_produk',
      product_sku: 'sku_produk',
      nama: 'nama_produk',
      product_name: 'nama_produk',
      category: 'kategori',
      brand: 'merek',
      supplier: 'kode_supplier',
      supplier_code: 'kode_supplier',
      barcode: 'barcode_produk',
      min_stock: 'stok_minimum_produk',
      min_stock_alert: 'stok_minimum_produk',
      status: 'status_produk',
      description: 'deskripsi',
      berat: 'berat_kg',
      weight: 'berat_kg',
      panjang: 'panjang_cm',
      length: 'panjang_cm',
      lebar: 'lebar_cm',
      width: 'lebar_cm',
      tinggi: 'tinggi_cm',
      height: 'tinggi_cm',
      specifications: 'spesifikasi',
      variant_sku: 'sku_varian',
      variant_name: 'nama_varian',
      varian: 'nama_varian',
      variant_barcode: 'barcode_varian',
      stock: 'stok_awal',
      initial_stock: 'stok_awal',
      min_stock_varian: 'stok_minimum_varian',
      variant_min_stock: 'stok_minimum_varian',
      variant_status: 'status_varian',
      satuan: 'nama_satuan',
      unit: 'nama_satuan',
      unit_name: 'nama_satuan',
      is_base_unit: 'satuan_dasar',
      base_unit: 'satuan_dasar',
      conversion_factor: 'faktor_konversi',
      konversi: 'faktor_konversi',
      buy_price: 'harga_beli',
      hpp: 'harga_beli',
      harga_modal: 'harga_beli',
      sell_price: 'harga_jual',
      wholesale_price: 'harga_grosir',
    },
    columns: [
      {
        key: 'sku_produk',
        label: 'SKU Produk',
        required: true,
        width: 18,
        isText: true,
        description:
          'Kode SKU unik produk (maks 100 char). Ulangi SKU Produk yang sama pada baris lanjutan untuk multi-varian atau multi-satuan.',
        example: 'SMN-TGR-50',
      },
      {
        key: 'nama_produk',
        label: 'Nama Produk',
        required: true,
        width: 34,
        description:
          'Nama produk (maks 255 char). Wajib di baris pertama tiap SKU Produk; boleh kosong di baris lanjutan produk yang sama.',
        example: 'Semen Tiga Roda PCC 50 Kg',
      },
      {
        key: 'kategori',
        label: 'Kategori (Path)',
        required: false,
        width: 34,
        description:
          'Opsional. Gunakan path "Induk > Sub-Kategori" (otomatis dibuat jika belum ada di Master Kategori).',
        example: 'Bahan Bangunan Dasar > Semen & Mortar',
      },
      {
        key: 'merek',
        label: 'Merek',
        required: false,
        width: 20,
        description: 'Opsional. Otomatis dibuat di Master Merek jika belum terdaftar.',
        example: 'Tiga Roda',
      },
      {
        key: 'kode_supplier',
        label: 'Kode Supplier',
        required: false,
        width: 16,
        isText: true,
        description: 'Opsional. Kode atau nama persis supplier yang sudah ada di Master Supplier.',
        example: 'SUP-INDO',
      },
      {
        key: 'barcode_produk',
        label: 'Barcode Produk',
        required: false,
        width: 18,
        isText: true,
        description: 'Barcode utama produk (opsional).',
        example: '899123456001',
      },
      {
        key: 'stok_minimum_produk',
        label: 'Stok Min. Produk',
        required: false,
        width: 16,
        description: 'Ambang batas peringatan stok rendah produk (default 5).',
        example: '20',
      },
      {
        key: 'status_produk',
        label: 'Status Produk',
        required: false,
        width: 15,
        description: 'AKTIF atau NONAKTIF (default AKTIF).',
        example: 'AKTIF',
      },
      {
        key: 'deskripsi',
        label: 'Deskripsi',
        required: false,
        width: 34,
        description: 'Deskripsi singkat produk (opsional).',
        example: 'Semen portland composite 50 kg',
      },
      {
        key: 'berat_kg',
        label: 'Berat (Kg)',
        required: false,
        width: 13,
        description: 'Berat fisik per satuan dasar dalam kg (opsional).',
        example: '50',
      },
      {
        key: 'panjang_cm',
        label: 'Panjang (cm)',
        required: false,
        width: 13,
        description: 'Panjang produk dalam cm (opsional).',
        example: '60',
      },
      {
        key: 'lebar_cm',
        label: 'Lebar (cm)',
        required: false,
        width: 13,
        description: 'Lebar produk dalam cm (opsional).',
        example: '40',
      },
      {
        key: 'tinggi_cm',
        label: 'Tinggi (cm)',
        required: false,
        width: 13,
        description: 'Tinggi produk dalam cm (opsional).',
        example: '15',
      },
      {
        key: 'material',
        label: 'Material',
        required: false,
        width: 18,
        description: 'Bahan penyusun produk, mis. PVC, Baja SNI, Portland Cement.',
        example: 'Portland Cement',
      },
      {
        key: 'spesifikasi',
        label: 'Spesifikasi',
        required: false,
        width: 30,
        description: 'Detail teknis tambahan produk (opsional).',
        example: 'SNI 7064:2014',
      },
      {
        key: 'sku_varian',
        label: 'SKU Varian',
        required: false,
        width: 20,
        isText: true,
        description:
          'Wajib jika produk punya >1 varian. Untuk produk tunggal boleh dikosongkan (otomatis "{sku_produk}-STD"). Ulangi untuk multi-satuan varian yang sama.',
        example: 'SMN-TGR-50-STD',
      },
      {
        key: 'nama_varian',
        label: 'Nama Varian',
        required: false,
        width: 26,
        description: 'Wajib jika multi-varian. Untuk produk tunggal default "Standar".',
        example: 'Standar Sak 50kg',
      },
      {
        key: 'barcode_varian',
        label: 'Barcode Varian',
        required: false,
        width: 18,
        isText: true,
        description: 'Barcode spesifik varian (opsional).',
        example: '899123456001',
      },
      {
        key: 'stok_awal',
        label: 'Stok Awal',
        required: false,
        width: 13,
        description:
          'Stok awal dalam satuan dasar (hanya dipakai saat varian BARU dibuat; diabaikan saat UPSERT varian lama agar tidak menimpa stok berjalan).',
        example: '120',
      },
      {
        key: 'stok_minimum_varian',
        label: 'Stok Min. Varian',
        required: false,
        width: 16,
        description: 'Batas alert stok minimum varian (default mengikuti stok_minimum_produk).',
        example: '20',
      },
      {
        key: 'status_varian',
        label: 'Status Varian',
        required: false,
        width: 15,
        description: 'AKTIF atau NONAKTIF (default AKTIF).',
        example: 'AKTIF',
      },
      {
        key: 'nama_satuan',
        label: 'Nama Satuan',
        required: true,
        width: 18,
        description: 'Nama satuan jual (maks 50 char), mis. Sak, Batang, Dus, Pcs. Auto-create ke Master Satuan.',
        example: 'Sak',
      },
      {
        key: 'satuan_dasar',
        label: 'Satuan Dasar',
        required: false,
        width: 14,
        description:
          'Isi YA untuk tepat 1 satuan dasar per varian (faktor_konversi wajib 1), atau TIDAK untuk satuan bertingkat.',
        example: 'YA',
      },
      {
        key: 'faktor_konversi',
        label: 'Faktor Konversi',
        required: false,
        width: 16,
        description: 'Isi 1 untuk satuan dasar; mis. 10 jika 1 Ikat = 10 Batang.',
        example: '1',
      },
      {
        key: 'harga_beli',
        label: 'Harga Beli',
        required: false,
        width: 16,
        description:
          'Harga beli/modal satuan ini (memerlukan izin "products:view_buy_price"; jika tidak punya izin akan diset 0/diabaikan).',
        example: '63000',
      },
      {
        key: 'harga_jual',
        label: 'Harga Jual',
        required: true,
        width: 16,
        description: 'Harga jual eceran normal (>= 0).',
        example: '68000',
      },
      {
        key: 'harga_grosir',
        label: 'Harga Grosir',
        required: false,
        width: 16,
        description: 'Harga jual grosir/proyek (opsional).',
        example: '66000',
      },
    ],
    sampleRows: [
      {
        sku_produk: 'SMN-TGR-50',
        nama_produk: 'Semen Tiga Roda PCC 50 Kg',
        kategori: 'Bahan Bangunan Dasar > Semen & Mortar',
        merek: 'Tiga Roda',
        kode_supplier: 'SUP-INDO',
        barcode_produk: '899123456001',
        stok_minimum_produk: 20,
        status_produk: 'AKTIF',
        deskripsi: 'Semen portland composite 50 kg',
        berat_kg: 50,
        panjang_cm: null,
        lebar_cm: null,
        tinggi_cm: null,
        material: 'Portland Cement',
        spesifikasi: 'SNI 7064:2014',
        sku_varian: '',
        nama_varian: '',
        barcode_varian: '899123456001',
        stok_awal: 120,
        stok_minimum_varian: 20,
        status_varian: 'AKTIF',
        nama_satuan: 'Sak',
        satuan_dasar: 'YA',
        faktor_konversi: 1,
        harga_beli: 63000,
        harga_jual: 68000,
        harga_grosir: 66000,
      },
      {
        sku_produk: 'SMN-TGR-50',
        nama_produk: '',
        kategori: '',
        merek: '',
        kode_supplier: '',
        barcode_produk: '',
        stok_minimum_produk: null,
        status_produk: '',
        deskripsi: '',
        berat_kg: null,
        panjang_cm: null,
        lebar_cm: null,
        tinggi_cm: null,
        material: '',
        spesifikasi: '',
        sku_varian: '',
        nama_varian: '',
        barcode_varian: '',
        stok_awal: null,
        stok_minimum_varian: null,
        status_varian: '',
        nama_satuan: 'Truk',
        satuan_dasar: 'TIDAK',
        faktor_konversi: 200,
        harga_beli: 12200000,
        harga_jual: 13200000,
        harga_grosir: 13000000,
      },
      {
        sku_produk: 'PPA-RCK-AW',
        nama_produk: 'Pipa PVC Rucika AW Standard JIS',
        kategori: 'Pipa & Sanitari > Pipa PVC',
        merek: 'Rucika',
        kode_supplier: 'SUP-RUCI',
        barcode_produk: '899345678001',
        stok_minimum_produk: 15,
        status_produk: 'AKTIF',
        deskripsi: 'Pipa uPVC tekanan tinggi panjang 4 meter',
        berat_kg: 1.8,
        panjang_cm: 400,
        lebar_cm: 2.2,
        tinggi_cm: 2.2,
        material: 'uPVC',
        spesifikasi: 'JIS K-6741',
        sku_varian: 'PPA-RCK-AW-050',
        nama_varian: 'Ukuran 1/2 inch (4 Meter)',
        barcode_varian: '899345678050',
        stok_awal: 65,
        stok_minimum_varian: 15,
        status_varian: 'AKTIF',
        nama_satuan: 'Batang',
        satuan_dasar: 'YA',
        faktor_konversi: 1,
        harga_beli: 28000,
        harga_jual: 35000,
        harga_grosir: 33000,
      },
      {
        sku_produk: 'PPA-RCK-AW',
        nama_produk: '',
        kategori: '',
        merek: '',
        kode_supplier: '',
        barcode_produk: '',
        stok_minimum_produk: null,
        status_produk: '',
        deskripsi: '',
        berat_kg: null,
        panjang_cm: null,
        lebar_cm: null,
        tinggi_cm: null,
        material: '',
        spesifikasi: '',
        sku_varian: 'PPA-RCK-AW-075',
        nama_varian: 'Ukuran 3/4 inch (4 Meter)',
        barcode_varian: '899345678075',
        stok_awal: 50,
        stok_minimum_varian: 15,
        status_varian: 'AKTIF',
        nama_satuan: 'Batang',
        satuan_dasar: 'YA',
        faktor_konversi: 1,
        harga_beli: 39000,
        harga_jual: 47000,
        harga_grosir: 44500,
      },
    ],
    generalNotes: [
      '1 baris merepresentasikan 1 kombinasi (Produk + Varian + Satuan).',
      'Kategori, Merek, dan Satuan yang belum ada di master otomatis dibuat saat commit.',
      'Kode Supplier (jika diisi) wajib mengacu ke supplier yang sudah terdaftar di Master Supplier.',
      'Mode UPSERT tidak menimpa stok berjalan (current_stock) pada varian yang sudah ada; gunakan Stock Opname untuk penyesuaian stok.',
    ],
  },
};

export class ImportTemplateService {
  static getSchema(entity: ImportEntityType): EntityTemplateSchema {
    return ENTITY_SCHEMAS[entity];
  }

  /**
   * Petakan header hasil parsing ke key kanonik & validasi kolom wajib.
   */
  static normalizeSpreadsheetToSchema(
    entity: ImportEntityType,
    parsed: ParsedSpreadsheet
  ): { columns: string[]; rows: ParsedSpreadsheetRow[] } {
    const schema = this.getSchema(entity);
    const knownKeys = new Set(schema.columns.map((c) => c.key));

    const keyMap = new Map<string, string>();
    for (const rawHeader of parsed.headers) {
      const canonical = knownKeys.has(rawHeader)
        ? rawHeader
        : schema.aliases[rawHeader] || rawHeader;

      if (knownKeys.has(canonical) && Array.from(keyMap.values()).includes(canonical)) {
        throw new AppHttpError(
          400,
          `Terdapat lebih dari satu kolom yang memetakan ke "${canonical}".`,
          'INVALID_TEMPLATE_HEADERS'
        );
      }
      keyMap.set(rawHeader, canonical);
    }

    const mappedHeaders = parsed.headers.map((h) => keyMap.get(h) || h);
    const mappedSet = new Set(mappedHeaders);

    const missingRequired = schema.columns
      .filter((col) => col.required && !mappedSet.has(col.key))
      .map((col) => col.key);

    if (missingRequired.length > 0) {
      throw new AppHttpError(
        400,
        `Kolom wajib tidak ditemukan pada file: ${missingRequired.join(', ')}. Gunakan template resmi agar struktur kolom sesuai.`,
        'INVALID_TEMPLATE_HEADERS'
      );
    }

    const normalizedRows: ParsedSpreadsheetRow[] = parsed.rows.map((row) => {
      const values: Record<string, CellScalar> = {};
      for (const col of schema.columns) {
        values[col.key] = null;
      }
      for (const [origKey, val] of Object.entries(row.values)) {
        const canonical = keyMap.get(origKey) || origKey;
        if (knownKeys.has(canonical)) {
          values[canonical] = val;
        }
      }
      return {
        row_number: row.row_number,
        values,
      };
    });

    return {
      columns: schema.columns.map((c) => c.key),
      rows: normalizedRows,
    };
  }

  static async generateTemplateBuffer(
    entity: ImportEntityType,
    format: ImportFileFormat
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const schema = this.getSchema(entity);
    const filename = `template-import-${entity}.${format}`;

    if (format === 'csv') {
      const headerLine = schema.columns.map((c) => escapeCsvValue(c.key)).join(',');
      const dataLines = schema.sampleRows.map((row) =>
        schema.columns.map((c) => escapeCsvValue(row[c.key] ?? null)).join(',')
      );
      const csvContent = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`;
      return {
        buffer: Buffer.from(csvContent, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Toko Bangunan Management System';
    workbook.created = new Date();

    // Sheet 1: Data Import
    const dataSheet = workbook.addWorksheet('Data Import', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    dataSheet.columns = schema.columns.map((col) => ({
      header: col.key,
      key: col.key,
      width: col.width,
      style: col.isText ? { numFmt: '@' } : undefined,
    }));

    const headerRow = dataSheet.getRow(1);
    headerRow.height = 26;
    schema.columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: col.required ? 'FFD97706' : 'FF1E293B' }, // amber-600 for required, slate-800 for optional
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      cell.note = `${col.label} (${col.required ? 'WAJIB' : 'Opsional'})\n${col.description}`;
    });

    for (const sample of schema.sampleRows) {
      const added = dataSheet.addRow(sample);
      schema.columns.forEach((col, idx) => {
        const cell = added.getCell(idx + 1);
        if (col.isText) {
          cell.numFmt = '@';
        }
      });
    }

    dataSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: schema.columns.length },
    };

    // Sheet 2: Petunjuk Pengisian
    const guideSheet = workbook.addWorksheet('Petunjuk Pengisian');
    guideSheet.columns = [
      { header: 'Nama Kolom', key: 'key', width: 24 },
      { header: 'Label', key: 'label', width: 26 },
      { header: 'Status', key: 'required', width: 14 },
      { header: 'Contoh', key: 'example', width: 38 },
      { header: 'Keterangan', key: 'description', width: 65 },
    ];

    const guideHeader = guideSheet.getRow(1);
    guideHeader.height = 24;
    guideHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle' };
    });

    for (const col of schema.columns) {
      const row = guideSheet.addRow({
        key: col.key,
        label: col.label,
        required: col.required ? 'WAJIB' : 'Opsional',
        example: col.example,
        description: col.description,
      });
      const statusCell = row.getCell('required');
      statusCell.font = {
        bold: true,
        color: { argb: col.required ? 'FFB45309' : 'FF475569' },
      };
      row.getCell('description').alignment = { wrapText: true };
    }

    guideSheet.addRow({});
    const noteTitleRow = guideSheet.addRow({ key: 'CATATAN PENTING:' });
    noteTitleRow.getCell(1).font = { bold: true };
    for (const note of schema.generalNotes) {
      guideSheet.addRow({ key: '•', label: note });
    }

    const rawBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(rawBuffer as ArrayBuffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }
}
