import ExcelJS from 'exceljs';
import { pool, query } from '../config/db.js';
import { syncRolesCacheFromDb } from '../config/rbac.js';
import type {
  ExportColumnDef,
  ExportDataset,
  ExportEntityType,
  ExportStatsResponse,
  RestoreDatabaseResult,
  TableRecordCount,
} from '../types/export.js';
import { AppHttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { escapeCsvValue } from '../utils/spreadsheetParser.js';
import { EmbeddingService } from './embeddingService.js';

interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * Service untuk menangani ekspor data modular (Excel, CSV, JSON),
 * pembuatan Full PostgreSQL Database SQL Dump, serta restore database.
 */
export class ExportService {
  /**
   * Mengambil statistik ringkasan seluruh tabel database untuk halaman Export & Backup
   */
  static async getExportStats(): Promise<ExportStatsResponse> {
    const tableQueries: Array<{ tableName: string; displayName: string; description: string }> = [
      { tableName: 'products', displayName: 'Produk Induk', description: 'Katalog produk utama dan spesifikasi fisik' },
      { tableName: 'product_variants', displayName: 'Variasi Produk', description: 'Varian ukuran, tipe, warna, dan stok fisik' },
      { tableName: 'variant_units', displayName: 'Multi-Satuan & Harga', description: 'Satuan dasar dan harga bertingkat grosir/eceran' },
      { tableName: 'categories', displayName: 'Kategori Produk', description: 'Hierarki kategori dan sub-kategori material' },
      { tableName: 'brands', displayName: 'Merek Produk', description: 'Daftar produsen dan merek dagang' },
      { tableName: 'units', displayName: 'Satuan Ukuran', description: 'Master satuan barang (Sak, Pcs, Dus, Batang)' },
      { tableName: 'suppliers', displayName: 'Pemasok (Supplier)', description: 'Distributor, agen, dan data kontak pemasok' },
      { tableName: 'supplier_sales', displayName: 'Kontak Sales Supplier', description: 'Tenaga penjual lapangan dan nomor hotline sales' },
      { tableName: 'supplier_invoices', displayName: 'Faktur Hutang Pembelian', description: 'Nota tagihan supplier, termin, dan jatuh tempo' },
      { tableName: 'stock_movements', displayName: 'Riwayat Mutasi Stok', description: 'Kartu stok masuk, keluar, dan penyesuaian opname' },
      { tableName: 'stock_reservations', displayName: 'Nota Titip Barang (Reservasi)', description: 'Pesanan titipan simpan stok dan tempo ambil' },
      { tableName: 'stock_reservation_items', displayName: 'Item Titip Barang', description: 'Rincian produk dan kuantiti yang ditahan' },
      { tableName: 'stock_reservation_pickups', displayName: 'Log Pengambilan Titipan', description: 'Riwayat serah terima fisik barang bertahap' },
      { tableName: 'price_history', displayName: 'Riwayat Perubahan Harga', description: 'Log perubahan harga modal, jual, grosir dan margin' },
      { tableName: 'store_settings', displayName: 'Pengaturan Toko', description: 'Konfigurasi sistem & ambang batas margin' },
      { tableName: 'roles', displayName: 'Peran & Hak Akses (RBAC)', description: 'Definisi role staf dan matriks izin otorisasi' },
      { tableName: 'users', displayName: 'Akun Pengguna', description: 'Daftar pengguna terdaftar sistem toko' },
      { tableName: 'user_sessions', displayName: 'Sesi Login Pengguna', description: 'Token sesi aktif dan perangkat masuk' },
    ];

    const tables: TableRecordCount[] = [];
    for (const item of tableQueries) {
      try {
        const countRes = await query(`SELECT COUNT(*)::int as count FROM ${item.tableName}`);
        tables.push({
          tableName: item.tableName,
          displayName: item.displayName,
          count: countRes.rows[0]?.count ?? 0,
          description: item.description,
        });
      } catch (err: any) {
        tables.push({
          tableName: item.tableName,
          displayName: item.displayName,
          count: 0,
          description: item.description,
        });
      }
    }

    let databaseSize = '0 MB';
    let postgresVersion = 'PostgreSQL';
    try {
      const metaRes = await query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as db_size,
          version() as pg_ver
      `);
      if (metaRes.rows[0]) {
        databaseSize = metaRes.rows[0].db_size;
        postgresVersion = metaRes.rows[0].pg_ver;
      }
    } catch (e) {
      // Abaikan jika query metadata gagal
    }

    return {
      tables,
      databaseSize,
      generatedAt: new Date().toISOString(),
      postgresVersion,
    };
  }

  /**
   * Helper untuk membentuk peta hierarki kategori
   */
  private static async getCategoryMap(): Promise<Map<string, CategoryNode>> {
    const res = await query('SELECT id, name, parent_id FROM categories');
    const map = new Map<string, CategoryNode>();
    for (const r of res.rows) {
      map.set(r.id, { id: r.id, name: r.name, parent_id: r.parent_id });
    }
    return map;
  }

  /**
   * Helper untuk menghitung path kategori lengkap ("Induk > Sub")
   */
  private static getCategoryPath(
    categoryId: string | null,
    categoryMap: Map<string, CategoryNode>,
    excludeSelf = false
  ): string {
    if (!categoryId || !categoryMap.has(categoryId)) return '';
    const parts: string[] = [];
    let curr: CategoryNode | undefined = categoryMap.get(categoryId);

    if (excludeSelf && curr) {
      curr = curr.parent_id ? categoryMap.get(curr.parent_id) : undefined;
    }

    while (curr) {
      parts.unshift(curr.name);
      curr = curr.parent_id ? categoryMap.get(curr.parent_id) : undefined;
    }
    return parts.join(' > ');
  }

  /**
   * Dataset Produk & Variasi (100% Round-Trip Compatible dengan Import Template)
   */
  static async buildProductsDataset(canViewBuyPrice: boolean): Promise<ExportDataset> {
    const categoryMap = await this.getCategoryMap();

    const sql = `
      SELECT 
        p.id as product_id,
        p.sku as sku_produk,
        p.name as nama_produk,
        p.category_id,
        b.name as merek,
        s.code as kode_supplier,
        p.barcode as barcode_produk,
        p.min_stock_alert as stok_minimum_produk,
        p.is_active as product_active,
        p.description as deskripsi,
        p.weight as berat_kg,
        p.length as panjang_cm,
        p.width as lebar_cm,
        p.height as tinggi_cm,
        p.material,
        p.specifications,
        pv.id as variant_id,
        pv.sku as sku_varian,
        pv.variant_name as nama_varian,
        pv.barcode as barcode_varian,
        pv.attributes as variant_attributes,
        pv.current_stock,
        pv.min_stock as stok_minimum_varian,
        pv.is_active as variant_active,
        vu.id as unit_id,
        vu.unit_name as nama_satuan,
        vu.conversion_factor as faktor_konversi,
        vu.is_base_unit as satuan_dasar,
        vu.buy_price as harga_beli,
        vu.sell_price as harga_jual,
        vu.wholesale_price as harga_grosir
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN variant_units vu ON vu.variant_id = pv.id
      ORDER BY p.name ASC, p.sku ASC, pv.variant_name ASC, vu.is_base_unit DESC, vu.conversion_factor ASC
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => {
      const isBaseUnit = Boolean(r.satuan_dasar);
      const categoryPath = this.getCategoryPath(r.category_id, categoryMap, false);
      const attrObj = r.variant_attributes && typeof r.variant_attributes === 'object' ? r.variant_attributes : {};
      const attrString = Object.entries(attrObj).map(([k, val]) => `${k}: ${val}`).join(' | ');

      return {
        sku_produk: r.sku_produk || '',
        nama_produk: r.nama_produk || '',
        kategori: categoryPath,
        merek: r.merek || '',
        kode_supplier: r.kode_supplier || '',
        barcode_produk: r.barcode_produk || '',
        stok_minimum_produk: r.stok_minimum_produk != null ? Number(r.stok_minimum_produk) : '',
        status_produk: r.product_active !== false ? 'AKTIF' : 'NONAKTIF',
        deskripsi: r.deskripsi || '',
        berat_kg: r.berat_kg != null ? Number(r.berat_kg) : '',
        panjang_cm: r.panjang_cm != null ? Number(r.panjang_cm) : '',
        lebar_cm: r.lebar_cm != null ? Number(r.lebar_cm) : '',
        tinggi_cm: r.tinggi_cm != null ? Number(r.tinggi_cm) : '',
        material: r.material || '',
        spesifikasi: r.specifications || '',
        sku_varian: r.sku_varian || '',
        nama_varian: r.nama_varian || '',
        atribut_varian: attrString,
        barcode_varian: r.barcode_varian || '',
        // Isi stok_awal pada baris satuan dasar agar ketika di-import ulang stok persis sesuai kondisi saat diekspor
        stok_awal: isBaseUnit && r.current_stock != null ? Number(r.current_stock) : '',
        stok_minimum_varian: r.stok_minimum_varian != null ? Number(r.stok_minimum_varian) : '',
        status_varian: r.variant_active !== false ? 'AKTIF' : 'NONAKTIF',
        nama_satuan: r.nama_satuan || '',
        satuan_dasar: isBaseUnit ? 'YA' : 'TIDAK',
        faktor_konversi: r.faktor_konversi != null ? Number(r.faktor_konversi) : '',
        harga_beli: canViewBuyPrice && r.harga_beli != null ? Number(r.harga_beli) : '',
        harga_jual: r.harga_jual != null ? Number(r.harga_jual) : '',
        harga_grosir: r.harga_grosir != null ? Number(r.harga_grosir) : '',
      };
    });

    const columns: ExportColumnDef[] = [
      { key: 'sku_produk', label: 'SKU Produk', width: 18, isText: true },
      { key: 'nama_produk', label: 'Nama Produk', width: 34 },
      { key: 'kategori', label: 'Kategori (Path)', width: 34 },
      { key: 'merek', label: 'Merek', width: 20 },
      { key: 'kode_supplier', label: 'Kode Supplier', width: 16, isText: true },
      { key: 'barcode_produk', label: 'Barcode Produk', width: 18, isText: true },
      { key: 'stok_minimum_produk', label: 'Stok Min. Produk', width: 16 },
      { key: 'status_produk', label: 'Status Produk', width: 15 },
      { key: 'deskripsi', label: 'Deskripsi', width: 34 },
      { key: 'berat_kg', label: 'Berat (Kg)', width: 13 },
      { key: 'panjang_cm', label: 'Panjang (cm)', width: 13 },
      { key: 'lebar_cm', label: 'Lebar (cm)', width: 13 },
      { key: 'tinggi_cm', label: 'Tinggi (cm)', width: 13 },
      { key: 'material', label: 'Material', width: 18 },
      { key: 'spesifikasi', label: 'Spesifikasi', width: 30 },
      { key: 'sku_varian', label: 'SKU Varian', width: 20, isText: true },
      { key: 'nama_varian', label: 'Nama Varian', width: 26 },
      { key: 'atribut_varian', label: 'Atribut Varian', width: 28, isText: true },
      { key: 'barcode_varian', label: 'Barcode Varian', width: 18, isText: true },
      { key: 'stok_awal', label: 'Stok Awal', width: 13 },
      { key: 'stok_minimum_varian', label: 'Stok Min. Varian', width: 16 },
      { key: 'status_varian', label: 'Status Varian', width: 15 },
      { key: 'nama_satuan', label: 'Nama Satuan', width: 18 },
      { key: 'satuan_dasar', label: 'Satuan Dasar', width: 14 },
      { key: 'faktor_konversi', label: 'Faktor Konversi', width: 16 },
      { key: 'harga_beli', label: 'Harga Beli', width: 16 },
      { key: 'harga_jual', label: 'Harga Jual', width: 16 },
      { key: 'harga_grosir', label: 'Harga Grosir', width: 16 },
    ];

    return {
      entity: 'products',
      title: 'Data Produk, Varian & Multi-Satuan',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Master Supplier & Kontak Sales (100% Round-Trip Compatible)
   */
  static async buildSuppliersDataset(): Promise<ExportDataset> {
    const sql = `
      SELECT 
        s.code as kode_supplier,
        s.name as nama_supplier,
        s.contact_person as kontak_utama,
        s.phone as telepon_kantor,
        s.email as email_supplier,
        s.city as kota,
        s.address as alamat,
        s.notes as catatan_supplier,
        s.is_active as supplier_active,
        ss.name as nama_sales,
        ss.email as email_sales,
        ss.phones as no_hp_sales_raw,
        ss.notes as catatan_sales,
        ss.is_active as sales_active
      FROM suppliers s
      LEFT JOIN supplier_sales ss ON ss.supplier_id = s.id
      ORDER BY s.name ASC, ss.name ASC
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => {
      // Format phones array JSON ke string "0812345 (Label); 0898765"
      let phoneStr = '';
      if (r.no_hp_sales_raw) {
        try {
          const parsed = typeof r.no_hp_sales_raw === 'string' ? JSON.parse(r.no_hp_sales_raw) : r.no_hp_sales_raw;
          if (Array.isArray(parsed)) {
            phoneStr = parsed
              .map((p: any) => {
                if (typeof p === 'string') return p;
                if (p && p.number) {
                  return p.label ? `${p.number} (${p.label})` : p.number;
                }
                return '';
              })
              .filter(Boolean)
              .join('; ');
          } else if (typeof parsed === 'string') {
            phoneStr = parsed;
          }
        } catch {
          phoneStr = String(r.no_hp_sales_raw);
        }
      }

      return {
        kode_supplier: r.kode_supplier || '',
        nama_supplier: r.nama_supplier || '',
        kontak_utama: r.kontak_utama || '',
        telepon_kantor: r.telepon_kantor || '',
        email_supplier: r.email_supplier || '',
        kota: r.kota || '',
        alamat: r.alamat || '',
        catatan_supplier: r.catatan_supplier || '',
        status_supplier: r.supplier_active !== false ? 'AKTIF' : 'NONAKTIF',
        nama_sales: r.nama_sales || '',
        email_sales: r.email_sales || '',
        no_hp_sales: phoneStr,
        catatan_sales: r.catatan_sales || '',
        status_sales: r.nama_sales ? (r.sales_active !== false ? 'AKTIF' : 'NONAKTIF') : '',
      };
    });

    const columns: ExportColumnDef[] = [
      { key: 'kode_supplier', label: 'Kode Supplier', width: 18, isText: true },
      { key: 'nama_supplier', label: 'Nama Supplier', width: 36 },
      { key: 'kontak_utama', label: 'Kontak Utama (PIC)', width: 22 },
      { key: 'telepon_kantor', label: 'Telepon Kantor', width: 20, isText: true },
      { key: 'email_supplier', label: 'Email Supplier', width: 28 },
      { key: 'kota', label: 'Kota', width: 20 },
      { key: 'alamat', label: 'Alamat', width: 38 },
      { key: 'catatan_supplier', label: 'Catatan Supplier', width: 32 },
      { key: 'status_supplier', label: 'Status Supplier', width: 16 },
      { key: 'nama_sales', label: 'Nama Sales', width: 24 },
      { key: 'email_sales', label: 'Email Sales', width: 28 },
      { key: 'no_hp_sales', label: 'No. HP Sales', width: 40, isText: true },
      { key: 'catatan_sales', label: 'Catatan Sales', width: 32 },
      { key: 'status_sales', label: 'Status Sales', width: 15 },
    ];

    return {
      entity: 'suppliers',
      title: 'Data Supplier & Kontak Sales',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Master Kategori (100% Round-Trip Compatible)
   */
  static async buildCategoriesDataset(): Promise<ExportDataset> {
    const categoryMap = await this.getCategoryMap();

    const sql = `
      SELECT id, name as nama_kategori, parent_id, description as deskripsi
      FROM categories
      ORDER BY name ASC
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => {
      const parentPath = this.getCategoryPath(r.id, categoryMap, true);
      return {
        nama_kategori: r.nama_kategori || '',
        kategori_induk: parentPath,
        deskripsi: r.deskripsi || '',
      };
    });

    const columns: ExportColumnDef[] = [
      { key: 'nama_kategori', label: 'Nama Kategori', width: 30 },
      { key: 'kategori_induk', label: 'Kategori Induk (Path)', width: 42 },
      { key: 'deskripsi', label: 'Deskripsi', width: 45 },
    ];

    return {
      entity: 'categories',
      title: 'Data Master Kategori',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Master Merek (100% Round-Trip Compatible)
   */
  static async buildBrandsDataset(): Promise<ExportDataset> {
    const sql = 'SELECT name as nama_merek FROM brands ORDER BY name ASC';
    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      nama_merek: r.nama_merek || '',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'nama_merek', label: 'Nama Merek', width: 35 },
    ];

    return {
      entity: 'brands',
      title: 'Data Master Merek',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Master Satuan Ukuran
   */
  static async buildUnitsDataset(): Promise<ExportDataset> {
    const sql = 'SELECT name as nama_satuan, name_key as kode_satuan, description as deskripsi, is_active FROM units ORDER BY name ASC';
    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      nama_satuan: r.nama_satuan || '',
      kode_satuan: r.kode_satuan || '',
      deskripsi: r.deskripsi || '',
      status: r.is_active !== false ? 'AKTIF' : 'NONAKTIF',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'nama_satuan', label: 'Nama Satuan', width: 24 },
      { key: 'kode_satuan', label: 'Kode Kunci', width: 20, isText: true },
      { key: 'deskripsi', label: 'Deskripsi Satuan', width: 40 },
      { key: 'status', label: 'Status Satuan', width: 16 },
    ];

    return {
      entity: 'units',
      title: 'Data Master Satuan Ukuran',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Faktur Pembelian Supplier
   */
  static async buildSupplierInvoicesDataset(): Promise<ExportDataset> {
    const sql = `
      SELECT 
        si.invoice_number as nomor_invoice,
        s.code as kode_supplier,
        s.name as nama_supplier,
        si.purchase_order_no as no_po,
        to_char(si.invoice_date, 'YYYY-MM-DD') as tanggal_invoice,
        to_char(si.due_date, 'YYYY-MM-DD') as jatuh_tempo,
        si.total_amount as total_tagihan,
        si.paid_amount as jumlah_terbayar,
        (si.total_amount - si.paid_amount) as sisa_tagihan,
        si.status,
        si.notes as catatan,
        to_char(si.created_at, 'YYYY-MM-DD HH24:MI:SS') as dibuat_pada
      FROM supplier_invoices si
      JOIN suppliers s ON si.supplier_id = s.id
      ORDER BY si.due_date ASC, si.created_at DESC
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      nomor_invoice: r.nomor_invoice || '',
      kode_supplier: r.kode_supplier || '',
      nama_supplier: r.nama_supplier || '',
      no_po: r.no_po || '',
      tanggal_invoice: r.tanggal_invoice || '',
      jatuh_tempo: r.jatuh_tempo || '',
      total_tagihan: Number(r.total_tagihan) || 0,
      jumlah_terbayar: Number(r.jumlah_terbayar) || 0,
      sisa_tagihan: Number(r.sisa_tagihan) || 0,
      status: r.status || '',
      catatan: r.catatan || '',
      dibuat_pada: r.dibuat_pada || '',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'nomor_invoice', label: 'Nomor Faktur', width: 22, isText: true },
      { key: 'kode_supplier', label: 'Kode Supplier', width: 16, isText: true },
      { key: 'nama_supplier', label: 'Nama Supplier', width: 34 },
      { key: 'no_po', label: 'No. PO / Ref', width: 18, isText: true },
      { key: 'tanggal_invoice', label: 'Tgl Faktur', width: 14, isText: true },
      { key: 'jatuh_tempo', label: 'Jatuh Tempo', width: 14, isText: true },
      { key: 'total_tagihan', label: 'Total Tagihan (Rp)', width: 18 },
      { key: 'jumlah_terbayar', label: 'Terbayar (Rp)', width: 18 },
      { key: 'sisa_tagihan', label: 'Sisa Hutang (Rp)', width: 18 },
      { key: 'status', label: 'Status Pembayaran', width: 18 },
      { key: 'catatan', label: 'Catatan Faktur', width: 32 },
      { key: 'dibuat_pada', label: 'Waktu Input', width: 20, isText: true },
    ];

    return {
      entity: 'supplier_invoices',
      title: 'Data Faktur Pembelian Supplier',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Riwayat Mutasi Stok
   */
  static async buildStockMovementsDataset(): Promise<ExportDataset> {
    const sql = `
      SELECT 
        sm.id as id_mutasi,
        to_char(sm.created_at, 'YYYY-MM-DD HH24:MI:SS') as tanggal,
        p.sku as sku_produk,
        p.name as nama_produk,
        pv.sku as sku_varian,
        pv.variant_name as nama_varian,
        sm.movement_type as tipe_mutasi,
        sm.quantity_change as perubahan_stok,
        sm.previous_stock as stok_sebelum,
        sm.current_stock as stok_sesudah,
        sm.reference_no as nomor_referensi,
        sm.notes as keterangan,
        COALESCE(sm.created_by, 'Sistem') as operator
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN product_variants pv ON sm.variant_id = pv.id
      ORDER BY sm.created_at DESC
      LIMIT 10000
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      id_mutasi: r.id_mutasi || '',
      tanggal: r.tanggal || '',
      sku_produk: r.sku_produk || '',
      nama_produk: r.nama_produk || '',
      sku_varian: r.sku_varian || '',
      nama_varian: r.nama_varian || '',
      tipe_mutasi: r.tipe_mutasi || '',
      perubahan_stok: Number(r.perubahan_stok) || 0,
      stok_sebelum: Number(r.stok_sebelum) || 0,
      stok_sesudah: Number(r.stok_sesudah) || 0,
      nomor_referensi: r.nomor_referensi || '',
      keterangan: r.keterangan || '',
      operator: r.operator || '',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'tanggal', label: 'Waktu Mutasi', width: 20, isText: true },
      { key: 'sku_produk', label: 'SKU Produk', width: 18, isText: true },
      { key: 'nama_produk', label: 'Nama Produk', width: 32 },
      { key: 'sku_varian', label: 'SKU Varian', width: 18, isText: true },
      { key: 'nama_varian', label: 'Varian', width: 22 },
      { key: 'tipe_mutasi', label: 'Tipe Mutasi', width: 16 },
      { key: 'perubahan_stok', label: 'Perubahan', width: 14 },
      { key: 'stok_sebelum', label: 'Stok Awal', width: 14 },
      { key: 'stok_sesudah', label: 'Stok Akhir', width: 14 },
      { key: 'nomor_referensi', label: 'No. Referensi', width: 20, isText: true },
      { key: 'keterangan', label: 'Keterangan', width: 35 },
      { key: 'operator', label: 'Operator / Kasir', width: 20 },
    ];

    return {
      entity: 'stock_movements',
      title: 'Data Riwayat Mutasi Stok',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Dataset Nota Titip Barang (Reservasi)
   */
  static async buildReservationsDataset(): Promise<ExportDataset> {
    const sql = `
      SELECT 
        sr.reservation_code as nomor_nota,
        sr.invoice_no as nomor_invoice,
        sr.customer_name as nama_pelanggan,
        sr.customer_phone as no_telepon,
        sr.customer_address as alamat_pelanggan,
        sr.status,
        to_char(sr.pickup_deadline, 'YYYY-MM-DD HH24:MI') as batas_tempo,
        COALESCE(SUM(sri.qty_reserved_base), 0) as total_item,
        COALESCE(SUM(sri.qty_picked_up_base), 0) as total_diambil,
        COALESCE(SUM(sri.qty_reserved_base - sri.qty_picked_up_base), 0) as sisa_titipan,
        sr.notes as keterangan,
        sr.created_by as dibuat_oleh,
        to_char(sr.created_at, 'YYYY-MM-DD HH24:MI:SS') as tanggal_nota,
        to_char(sr.completed_at, 'YYYY-MM-DD HH24:MI:SS') as tanggal_selesai
      FROM stock_reservations sr
      LEFT JOIN stock_reservation_items sri ON sri.reservation_id = sr.id
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      nomor_nota: r.nomor_nota || '',
      nomor_invoice: r.nomor_invoice || '',
      nama_pelanggan: r.nama_pelanggan || '',
      no_telepon: r.no_telepon || '',
      alamat_pelanggan: r.alamat_pelanggan || '',
      status: r.status || '',
      batas_tempo: r.batas_tempo || '',
      total_item: Number(r.total_item) || 0,
      total_diambil: Number(r.total_diambil) || 0,
      sisa_titipan: Number(r.sisa_titipan) || 0,
      keterangan: r.keterangan || '',
      dibuat_oleh: r.dibuat_oleh || '',
      tanggal_nota: r.tanggal_nota || '',
      tanggal_selesai: r.tanggal_selesai || '',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'nomor_nota', label: 'No. Nota Titip', width: 20, isText: true },
      { key: 'nomor_invoice', label: 'No. Faktur Penjualan', width: 22, isText: true },
      { key: 'nama_pelanggan', label: 'Nama Pelanggan', width: 26 },
      { key: 'no_telepon', label: 'No. Telepon', width: 18, isText: true },
      { key: 'alamat_pelanggan', label: 'Alamat Pelanggan', width: 34 },
      { key: 'status', label: 'Status Titipan', width: 16 },
      { key: 'batas_tempo', label: 'Batas Tempo Ambil', width: 18, isText: true },
      { key: 'total_item', label: 'Total Titip (Dasar)', width: 18 },
      { key: 'total_diambil', label: 'Sudah Diambil', width: 16 },
      { key: 'sisa_titipan', label: 'Sisa Belum Diambil', width: 18 },
      { key: 'keterangan', label: 'Keterangan', width: 30 },
      { key: 'dibuat_oleh', label: 'Dibuat Oleh', width: 18 },
      { key: 'tanggal_nota', label: 'Waktu Dibuat', width: 20, isText: true },
      { key: 'tanggal_selesai', label: 'Waktu Selesai', width: 20, isText: true },
    ];

    return {
      entity: 'reservations',
      title: 'Data Nota Titip Barang (Reservasi)',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  private static async buildPriceHistoryDataset(canViewBuyPrice: boolean): Promise<ExportDataset> {
    const sql = `
      SELECT
        ph.id,
        TO_CHAR(ph.created_at, 'YYYY-MM-DD HH24:MI:SS') as tanggal,
        p.name as nama_produk,
        p.sku as sku_produk,
        pv.variant_name as nama_varian,
        pv.sku as sku_varian,
        ph.unit_name as satuan,
        s.name as supplier_name,
        ph.old_buy_price,
        ph.new_buy_price,
        ph.buy_price_diff,
        ph.buy_price_change_pct,
        ph.old_sell_price,
        ph.new_sell_price,
        ph.sell_price_diff,
        ph.sell_price_change_pct,
        ph.old_wholesale_price,
        ph.new_wholesale_price,
        ph.old_margin_pct,
        ph.new_margin_pct,
        ph.discount_pct,
        ph.discount_amount,
        ph.tax_pct,
        ph.tax_amount,
        ph.total_additional_cost,
        ph.change_direction,
        ph.change_source,
        ph.reference_no,
        ph.reason,
        ph.created_by
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN product_variants pv ON ph.variant_id = pv.id
      LEFT JOIN suppliers s ON ph.supplier_id = s.id
      ORDER BY ph.created_at DESC
      LIMIT 10000
    `;

    const res = await query(sql);
    const rows = res.rows.map((r) => ({
      tanggal: r.tanggal || '',
      sku_produk: r.sku_produk || '',
      nama_produk: r.nama_produk || '',
      sku_varian: r.sku_varian || '',
      nama_varian: r.nama_varian || '',
      satuan: r.satuan || '',
      supplier: r.supplier_name || '-',
      harga_modal_lama: canViewBuyPrice ? (r.old_buy_price !== null ? Number(r.old_buy_price) : '-') : 'SENSITIF',
      harga_modal_baru: canViewBuyPrice ? Number(r.new_buy_price) || 0 : 'SENSITIF',
      selisih_modal: canViewBuyPrice ? (r.buy_price_diff !== null ? Number(r.buy_price_diff) : 0) : 'SENSITIF',
      persen_modal: canViewBuyPrice ? (r.buy_price_change_pct !== null ? `${r.buy_price_change_pct}%` : '-') : 'SENSITIF',
      diskon_supplier: canViewBuyPrice ? (Number(r.discount_pct) > 0 ? `${r.discount_pct}%` : Number(r.discount_amount) > 0 ? `Rp ${r.discount_amount}` : '-') : 'SENSITIF',
      ppn_supplier: canViewBuyPrice ? (Number(r.tax_pct) > 0 ? `${r.tax_pct}%` : Number(r.tax_amount) > 0 ? `Rp ${r.tax_amount}` : '-') : 'SENSITIF',
      biaya_tambahan: canViewBuyPrice ? (Number(r.total_additional_cost) > 0 ? `Rp ${r.total_additional_cost}` : '-') : 'SENSITIF',
      harga_jual_lama: r.old_sell_price !== null ? Number(r.old_sell_price) : '-',
      harga_jual_baru: Number(r.new_sell_price) || 0,
      selisih_jual: r.sell_price_diff !== null ? Number(r.sell_price_diff) : 0,
      persen_jual: r.sell_price_change_pct !== null ? `${r.sell_price_change_pct}%` : '-',
      harga_grosir_lama: r.old_wholesale_price !== null ? Number(r.old_wholesale_price) : '-',
      harga_grosir_baru: r.new_wholesale_price !== null ? Number(r.new_wholesale_price) : '-',
      margin_lama: canViewBuyPrice ? (r.old_margin_pct !== null ? `${r.old_margin_pct}%` : '-') : 'SENSITIF',
      margin_baru: canViewBuyPrice ? (r.new_margin_pct !== null ? `${r.new_margin_pct}%` : '-') : 'SENSITIF',
      arah_perubahan: r.change_direction,
      sumber: r.change_source,
      no_referensi: r.reference_no || '-',
      alasan: r.reason || '-',
      operator: r.created_by || 'Sistem',
    }));

    const columns: ExportColumnDef[] = [
      { key: 'tanggal', label: 'Waktu Perubahan', width: 20, isText: true },
      { key: 'sku_produk', label: 'SKU Produk', width: 16, isText: true },
      { key: 'nama_produk', label: 'Nama Produk', width: 30 },
      { key: 'sku_varian', label: 'SKU Varian', width: 16, isText: true },
      { key: 'nama_varian', label: 'Nama Varian', width: 22 },
      { key: 'satuan', label: 'Satuan', width: 12 },
      { key: 'supplier', label: 'Supplier', width: 22 },
      ...(canViewBuyPrice ? [
        { key: 'harga_modal_lama', label: 'Modal Lama (Rp)', width: 16 },
        { key: 'harga_modal_baru', label: 'Modal Baru (Rp)', width: 16 },
        { key: 'selisih_modal', label: 'Selisih Modal (Rp)', width: 16 },
        { key: 'persen_modal', label: 'Perubahan Modal (%)', width: 18 },
        { key: 'diskon_supplier', label: 'Diskon Supplier', width: 16 },
        { key: 'ppn_supplier', label: 'PPN Supplier', width: 16 },
        { key: 'biaya_tambahan', label: 'Biaya Tambahan (Landed)', width: 20 },
      ] : []),
      { key: 'harga_jual_lama', label: 'Jual Lama (Rp)', width: 16 },
      { key: 'harga_jual_baru', label: 'Jual Baru (Rp)', width: 16 },
      { key: 'selisih_jual', label: 'Selisih Jual (Rp)', width: 16 },
      { key: 'persen_jual', label: 'Perubahan Jual (%)', width: 18 },
      { key: 'harga_grosir_lama', label: 'Grosir Lama (Rp)', width: 16 },
      { key: 'harga_grosir_baru', label: 'Grosir Baru (Rp)', width: 16 },
      ...(canViewBuyPrice ? [
        { key: 'margin_lama', label: 'Gross Margin Lama (%)', width: 20 },
        { key: 'margin_baru', label: 'Gross Margin Baru (%)', width: 20 },
      ] : []),
      { key: 'arah_perubahan', label: 'Arah', width: 12 },
      { key: 'sumber', label: 'Sumber Perubahan', width: 18 },
      { key: 'no_referensi', label: 'No. Referensi / Nota', width: 20, isText: true },
      { key: 'alasan', label: 'Alasan Perubahan', width: 35 },
      { key: 'operator', label: 'Diubah Oleh', width: 18 },
    ];

    return {
      entity: 'price_history',
      title: 'Data Riwayat Perubahan Harga',
      columns,
      rows,
      totalRows: rows.length,
    };
  }

  /**
   * Router untuk mengambil dataset berdasarkan nama entitas
   */
  static async getDatasetByEntity(
    entity: ExportEntityType,
    canViewBuyPrice: boolean
  ): Promise<ExportDataset> {
    switch (entity) {
      case 'products':
        return this.buildProductsDataset(canViewBuyPrice);
      case 'suppliers':
        return this.buildSuppliersDataset();
      case 'categories':
        return this.buildCategoriesDataset();
      case 'brands':
        return this.buildBrandsDataset();
      case 'units':
        return this.buildUnitsDataset();
      case 'supplier_invoices':
        return this.buildSupplierInvoicesDataset();
      case 'stock_movements':
        return this.buildStockMovementsDataset();
      case 'reservations':
        return this.buildReservationsDataset();
      case 'price_history':
        return this.buildPriceHistoryDataset(canViewBuyPrice);
      default:
        throw new AppHttpError(400, `Entitas ekspor "${entity}" tidak didukung`);
    }
  }

  /**
   * Format Dataset menjadi Single-Sheet Excel (.xlsx) dengan ExcelJS
   */
  static async exportToExcel(dataset: ExportDataset): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BangunJaya POS System';
    workbook.lastModifiedBy = 'BangunJaya Export Service';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheetName = dataset.title.slice(0, 31).replace(/[*?:/\\\[\]]/g, ' ');
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    this.populateWorksheet(worksheet, dataset);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Helper internal untuk memformat dan mengisi lembar ExcelJS
   */
  private static populateWorksheet(worksheet: ExcelJS.Worksheet, dataset: ExportDataset) {
    // 1. Definisikan header kolom
    worksheet.columns = dataset.columns.map((col) => ({
      header: col.label,
      key: col.key,
      width: col.width || 20,
    }));

    // 2. Styling Header Row (Row 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Dark slate blue
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // 3. Masukkan Data Rows
    dataset.rows.forEach((dataRow, idx) => {
      const row = worksheet.addRow(dataRow);
      row.height = 22;
      const isEven = idx % 2 === 1;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = dataset.columns[colNumber - 1];
        if (!colDef) return;

        cell.font = { name: 'Segoe UI', size: 9.5 };
        cell.alignment = { vertical: 'middle' };

        // Zebra striping lembut
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }, // Slate 50
          };
        }

        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        // Number vs Text Formatting
        if (colDef.isText) {
          cell.numFmt = '@';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (typeof cell.value === 'number') {
          if (Number.isInteger(cell.value)) {
            cell.numFmt = '#,##0';
          } else {
            cell.numFmt = '#,##0.00';
          }
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
      });
    });

    // 4. Auto Filter pada Header
    if (dataset.columns.length > 0 && dataset.rows.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: dataset.rows.length + 1, column: dataset.columns.length },
      };
    }
  }

  /**
   * Format Dataset menjadi CSV dengan UTF-8 BOM
   */
  static exportToCsv(dataset: ExportDataset): Buffer {
    const lines: string[] = [];

    // Header baris pertama
    const headerLine = dataset.columns.map((col) => escapeCsvValue(col.label)).join(',');
    lines.push(headerLine);

    // Baris data
    for (const row of dataset.rows) {
      const rowLine = dataset.columns.map((col) => escapeCsvValue(row[col.key])).join(',');
      lines.push(rowLine);
    }

    // Gabungkan dengan CRLF dan tambahkan UTF-8 BOM
    const csvContent = '\uFEFF' + lines.join('\r\n');
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Format Dataset menjadi JSON terstruktur
   */
  static exportToJson(dataset: ExportDataset): string {
    return JSON.stringify(
      {
        entity: dataset.entity,
        title: dataset.title,
        exported_at: new Date().toISOString(),
        total_records: dataset.totalRows,
        data: dataset.rows,
      },
      null,
      2
    );
  }

  /**
   * Ekspor Full Multi-Sheet Excel Workbook berisi seluruh data master & operasional
   */
  static async exportFullWorkbookExcel(canViewBuyPrice: boolean): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BangunJaya POS System';
    workbook.lastModifiedBy = 'BangunJaya Export Service';
    workbook.created = new Date();
    workbook.modified = new Date();

    const stats = await this.getExportStats();

    // Sheet 1: Ringkasan Backup
    const summarySheet = workbook.addWorksheet('Ringkasan Backup', {
      views: [{ showGridLines: true }],
    });
    summarySheet.columns = [
      { header: 'Parameter', key: 'param', width: 32 },
      { header: 'Nilai / Keterangan', key: 'val', width: 50 },
    ];
    const sHeader = summarySheet.getRow(1);
    sHeader.height = 28;
    sHeader.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    summarySheet.addRow({ param: 'Aplikasi', val: 'BangunJaya POS & Inventory Toko Bangunan' });
    summarySheet.addRow({ param: 'Waktu Backup', val: new Date().toLocaleString('id-ID') });
    summarySheet.addRow({ param: 'Ukuran Database', val: stats.databaseSize });
    summarySheet.addRow({ param: 'PostgreSQL Versi', val: stats.postgresVersion.split(',')[0] });
    summarySheet.addRow({ param: 'Akses Harga Modal', val: canViewBuyPrice ? 'Ya (Lengkap)' : 'Tidak (Sensor Otomatis)' });
    summarySheet.addRow({ param: '---', val: '---' });

    for (const t of stats.tables) {
      summarySheet.addRow({
        param: `${t.displayName} (${t.tableName})`,
        val: `${t.count.toLocaleString('id-ID')} baris data`,
      });
    }

    // Sheet 2: Produk & Variasi
    const dsProducts = await this.buildProductsDataset(canViewBuyPrice);
    const pSheet = workbook.addWorksheet('Produk & Variasi', { views: [{ showGridLines: true }] });
    this.populateWorksheet(pSheet, dsProducts);

    // Sheet 3: Supplier & Sales
    const dsSuppliers = await this.buildSuppliersDataset();
    const sSheet = workbook.addWorksheet('Supplier & Sales', { views: [{ showGridLines: true }] });
    this.populateWorksheet(sSheet, dsSuppliers);

    // Sheet 4: Kategori
    const dsCategories = await this.buildCategoriesDataset();
    const cSheet = workbook.addWorksheet('Kategori', { views: [{ showGridLines: true }] });
    this.populateWorksheet(cSheet, dsCategories);

    // Sheet 5: Merek
    const dsBrands = await this.buildBrandsDataset();
    const bSheet = workbook.addWorksheet('Merek', { views: [{ showGridLines: true }] });
    this.populateWorksheet(bSheet, dsBrands);

    // Sheet 6: Satuan
    const dsUnits = await this.buildUnitsDataset();
    const uSheet = workbook.addWorksheet('Satuan Ukuran', { views: [{ showGridLines: true }] });
    this.populateWorksheet(uSheet, dsUnits);

    // Sheet 7: Faktur Pembelian Supplier
    const dsInvoices = await this.buildSupplierInvoicesDataset();
    const iSheet = workbook.addWorksheet('Faktur Supplier', { views: [{ showGridLines: true }] });
    this.populateWorksheet(iSheet, dsInvoices);

    // Sheet 8: Mutasi Stok
    const dsMovements = await this.buildStockMovementsDataset();
    const mSheet = workbook.addWorksheet('Mutasi Stok', { views: [{ showGridLines: true }] });
    this.populateWorksheet(mSheet, dsMovements);

    // Sheet 9: Reservasi
    const dsReservations = await this.buildReservationsDataset();
    const rSheet = workbook.addWorksheet('Titip Barang', { views: [{ showGridLines: true }] });
    this.populateWorksheet(rSheet, dsReservations);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Ekspor Full JSON Snapshot seluruh sistem
   */
  static async exportFullJsonSnapshot(canViewBuyPrice: boolean): Promise<string> {
    const stats = await this.getExportStats();
    const [
      products,
      suppliers,
      categories,
      brands,
      units,
      supplierInvoices,
      stockMovements,
      reservations,
    ] = await Promise.all([
      this.buildProductsDataset(canViewBuyPrice),
      this.buildSuppliersDataset(),
      this.buildCategoriesDataset(),
      this.buildBrandsDataset(),
      this.buildUnitsDataset(),
      this.buildSupplierInvoicesDataset(),
      this.buildStockMovementsDataset(),
      this.buildReservationsDataset(),
    ]);

    const snapshot = {
      system: 'BangunJaya POS System',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      stats,
      data: {
        categories: categories.rows,
        brands: brands.rows,
        units: units.rows,
        suppliers: suppliers.rows,
        products: products.rows,
        supplier_invoices: supplierInvoices.rows,
        stock_movements: stockMovements.rows,
        reservations: reservations.rows,
      },
    };

    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Helper untuk escape nilai literal SQL PostgreSQL secara aman
   */
  private static escapeSqlLiteral(val: any, colName?: string): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return 'NULL';
      return String(val);
    }
    if (val instanceof Date) {
      return `'${val.toISOString()}'::timestamptz`;
    }
    if (Array.isArray(val) && (colName === 'embedding' || (val.length > 0 && typeof val[0] === 'number'))) {
      const numbers = val.map((n) => (Number.isFinite(n) ? Number(n) : 0));
      return `ARRAY[${numbers.join(', ')}]::real[]`;
    }
    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val).replace(/'/g, "''");
      return `'${jsonStr}'::jsonb`;
    }
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
  }

  /**
   * Generate Full Database PostgreSQL SQL Dump (.sql)
   * Berisi transactional TRUNCATE dan INSERT dalam urutan foreign-key aman.
   */
  static async generateDatabaseSqlDump(): Promise<string> {
    const timestamp = new Date().toISOString();
    const stats = await this.getExportStats();

    // Urutan topologis pemuatan data (Foreign-Key Dependent Order)
    const tablesInOrder = [
      'roles',
      'users',
      'user_sessions',
      'categories',
      'brands',
      'units',
      'suppliers',
      'supplier_sales',
      'supplier_invoices',
      'products',
      'product_variants',
      'variant_units',
      'price_history',
      'store_settings',
      'stock_movements',
      'stock_reservations',
      'stock_reservation_items',
      'stock_reservation_pickups',
    ];

    const lines: string[] = [
      '-- ==========================================================================',
      '-- BANGUNJAYA POS & INVENTORY SYSTEM - FULL POSTGRESQL DATABASE BACKUP',
      `-- Generated at: ${timestamp}`,
      `-- Database Size: ${stats.databaseSize}`,
      `-- Target Engine: ${stats.postgresVersion.split(',')[0]}`,
      '-- Instructions: File ini dapat di-restore langsung melalui psql, pgAdmin,',
      '--               DBeaver, atau menu Restore Database di dalam aplikasi POS.',
      '-- ==========================================================================',
      '',
      'BEGIN;',
      '',
      '-- 1. Tangguhkan evaluasi foreign-key constraints sementara selama bulk restoration',
      'SET CONSTRAINTS ALL DEFERRED;',
      '',
      '-- 2. Bersihkan isi tabel dalam urutan reverse cascade agar aman dari constraint',
    ];

    // Truncate reverse order
    for (let i = tablesInOrder.length - 1; i >= 0; i--) {
      lines.push(`TRUNCATE TABLE ${tablesInOrder[i]} CASCADE;`);
    }

    lines.push('');
    lines.push('-- 3. Masukkan kembali seluruh record data dalam urutan dependensi');
    lines.push('');

    const countsSummary: Array<{ table: string; count: number }> = [];

    // Ambil dan buat INSERT statement untuk setiap tabel
    for (const table of tablesInOrder) {
      lines.push(`-- --------------------------------------------------------------------------`);
      lines.push(`-- Table: ${table}`);
      lines.push(`-- --------------------------------------------------------------------------`);

      const res = await query(`SELECT * FROM ${table}`);
      countsSummary.push({ table, count: res.rows.length });

      if (res.rows.length === 0) {
        lines.push(`-- (Tabel ${table} kosong, tidak ada record)`);
        lines.push('');
        continue;
      }

      // Ambil daftar kolom dari baris pertama
      const columns = Object.keys(res.rows[0]);
      const columnList = columns.map((c) => `"${c}"`).join(', ');

      // Batch INSERT statement per 50 rows agar file efisien dan parsing cepat
      const batchSize = 50;
      for (let i = 0; i < res.rows.length; i += batchSize) {
        const chunk = res.rows.slice(i, i + batchSize);
        const valueTuples = chunk.map((row) => {
          const rowVals = columns.map((col) => this.escapeSqlLiteral(row[col], col));
          return `  (${rowVals.join(', ')})`;
        });

        lines.push(`INSERT INTO "${table}" (${columnList}) VALUES`);
        lines.push(valueTuples.join(',\n') + ';');
      }

      lines.push('');
    }

    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- ==========================================================================');
    lines.push('-- RINGKASAN RECORD YANG BERHASIL DI-BACKUP:');
    for (const c of countsSummary) {
      lines.push(`--  * ${c.table.padEnd(28)} : ${c.count.toLocaleString('id-ID')} rows`);
    }
    lines.push('-- ==========================================================================');
    lines.push('-- END OF SQL BACKUP DUMP');

    return lines.join('\n');
  }

  /**
   * Memulihkan (restore) seluruh database dari file SQL dump
   */
  static async restoreDatabaseFromSql(
    sqlScript: string,
    operatorUserId: string
  ): Promise<RestoreDatabaseResult> {
    if (!sqlScript || typeof sqlScript !== 'string' || sqlScript.trim().length === 0) {
      throw new AppHttpError(400, 'File backup SQL kosong atau tidak valid');
    }

    // Validasi keamanan script: pastikan berisi token yang sah dari backup BangunJaya POS
    const normalized = sqlScript.toUpperCase();
    if (!normalized.includes('BEGIN') || !normalized.includes('TRUNCATE') || !normalized.includes('COMMIT')) {
      throw new AppHttpError(
        400,
        'Format file SQL tidak dikenali. File harus merupakan hasil backup dump resmi BangunJaya POS.'
      );
    }

    logger.warn('DATABASE_RESTORE', 'Initiating full database restoration from SQL script', {
      operatorUserId,
      scriptLength: sqlScript.length,
    });

    const client = await pool.connect();
    try {
      // Eksekusi script SQL langsung di dalam transaksi
      await client.query(sqlScript);

      // Sinkronkan cache in-memory peran & hak akses (Dynamic RBAC) setelah data roles pulih
      await syncRolesCacheFromDb();

      // Muat ulang indeks vektor embedding AI lokal dari database yang dipulihkan
      await EmbeddingService.reloadIndexFromDb();
      EmbeddingService.initializeInBackground().catch(() => {});

      // Hitung total record setelah restore
      const stats = await this.getExportStats();
      const totalRecords = stats.tables.reduce((acc, t) => acc + t.count, 0);

      logger.info('DATABASE_RESTORE', 'Database restored successfully', {
        operatorUserId,
        tablesRestored: stats.tables.length,
        totalRecords,
      });

      return {
        success: true,
        message: 'Database berhasil dipulihkan secara penuh tanpa error',
        tablesRestored: stats.tables.length,
        recordsRestored: totalRecords,
        executedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      logger.error('DATABASE_RESTORE', `Restoration failed: ${err.message}`, {
        operatorUserId,
      }, err);
      throw new AppHttpError(
        500,
        `Gagal memulihkan database: ${err.message}. Perubahan telah dibatalkan (rollback).`
      );
    } finally {
      client.release();
    }
  }
}
