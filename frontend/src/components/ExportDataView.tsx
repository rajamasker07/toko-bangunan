import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Database,
  FileSpreadsheet,
  FileText,
  FileCode,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Upload,
  HardDrive,
  Layers,
  Sparkles,
  Info,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  X,
  FileDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type {
  ExportEntityType,
  ExportFileFormat,
  ExportStatsResponse,
  TableRecordCount,
} from '../types';

interface ExportDataViewProps {
  initialEntity?: ExportEntityType | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshMasterData?: () => void;
}

interface ExportEntityCardConfig {
  entity: ExportEntityType;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  roundTripCompatible: boolean;
  tableKeys: string[];
}

const ENTITY_CONFIGS: ExportEntityCardConfig[] = [
  {
    entity: 'products',
    title: 'Produk, Varian & Multi-Satuan',
    badge: 'Round-Trip Restore',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
    description:
      'Katalog produk induk, varian ukuran/tipe, barcode, batas stok minimum, dan harga bertingkat multi-satuan. File hasil export 100% kompatibel untuk di-import ulang.',
    roundTripCompatible: true,
    tableKeys: ['products', 'product_variants', 'variant_units'],
  },
  {
    entity: 'suppliers',
    title: 'Pemasok & Kontak Sales',
    badge: 'Round-Trip Restore',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
    description:
      'Data profil distributor, kontak utama PIC kantor, nomor telepon, alamat, dan seluruh kontak sales lapangan beserta nomor WhatsApp.',
    roundTripCompatible: true,
    tableKeys: ['suppliers', 'supplier_sales'],
  },
  {
    entity: 'categories',
    title: 'Kategori Bertingkat (Material)',
    badge: 'Round-Trip Restore',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
    description:
      'Daftar kategori dan sub-kategori material bangunan dengan format path hierarki pohon ("Induk > Sub-Kategori").',
    roundTripCompatible: true,
    tableKeys: ['categories'],
  },
  {
    entity: 'brands',
    title: 'Master Merek (Brand)',
    badge: 'Round-Trip Restore',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
    description:
      'Daftar produsen dan merek dagang material yang terdaftar dalam inventaris toko bangunan.',
    roundTripCompatible: true,
    tableKeys: ['brands'],
  },
  {
    entity: 'units',
    title: 'Master Satuan Ukuran',
    badge: 'Master Ukuran',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800',
    description:
      'Daftar satuan fisik transaksi toko bangunan (Sak, Batang, Pcs, Dus, Roll, Truk, Ikat, M2).',
    roundTripCompatible: false,
    tableKeys: ['units'],
  },
  {
    entity: 'supplier_invoices',
    title: 'Faktur Hutang Pembelian',
    badge: 'Operasional',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800',
    description:
      'Catatan nomor faktur tagihan supplier, jatuh tempo pembayaran, total tagihan, jumlah terbayar, dan sisa hutang dagang.',
    roundTripCompatible: false,
    tableKeys: ['supplier_invoices'],
  },
  {
    entity: 'stock_movements',
    title: 'Riwayat Mutasi Stok Gudang',
    badge: 'Buku Kartu Stok',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-800',
    description:
      'Audit log seluruh pergerakan persediaan: barang masuk, keluar, penyesuaian stock opname fisik, beserta nama operator penanggung jawab.',
    roundTripCompatible: false,
    tableKeys: ['stock_movements'],
  },
  {
    entity: 'reservations',
    title: 'Nota Titip Barang (Reservasi)',
    badge: 'Layanan Titipan',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800',
    description:
      'Riwayat pesanan pelanggan yang lunas/uang muka dengan barang dititipkan di gudang toko, kuantiti diambil, sisa titipan, dan batas tempo.',
    roundTripCompatible: false,
    tableKeys: ['stock_reservations', 'stock_reservation_items', 'stock_reservation_pickups'],
  },
  {
    entity: 'price_history',
    title: 'Riwayat & Audit Perubahan Harga',
    badge: 'Analitik & Audit',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
    description:
      'Log audit historis kenaikan/penurunan harga modal, harga jual, harga grosir, gross margin, alasan perubahan, dan user penanggung jawab.',
    roundTripCompatible: false,
    tableKeys: ['price_history'],
  },
];

export const ExportDataView: React.FC<ExportDataViewProps> = ({
  initialEntity,
  showToast,
  onRefreshMasterData,
}) => {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'owner';
  const canViewBuyPrice = can('products:view_buy_price');

  const [stats, setStats] = useState<ExportStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Filter tab entitas
  const [filterType, setFilterType] = useState<'all' | 'roundtrip' | 'operational'>('all');

  // State Modal Restore Database (Khusus Owner)
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState<string>('');
  const [restoring, setRestoring] = useState<boolean>(false);

  // Ambil data statistik dari backend
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await api.getExportStats();
      setStats(res);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat statistik database', 'error');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Map jumlah record per tabel
  const tableCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (stats?.tables) {
      for (const t of stats.tables) {
        map.set(t.tableName, t.count);
      }
    }
    return map;
  }, [stats]);

  // Handler download spesifik per-entitas
  const handleDownloadEntity = async (entity: ExportEntityType, format: ExportFileFormat) => {
    const downloadKey = `${entity}-${format}`;
    setDownloadingKey(downloadKey);
    try {
      await api.downloadEntityExport(entity, format);
      showToast(`Berhasil mengekspor data ${entity.replace('_', ' ')} (${format.toUpperCase()})`, 'success');
    } catch (err: any) {
      showToast(err.message || `Gagal mengekspor data ${entity}`, 'error');
    } finally {
      setDownloadingKey(null);
    }
  };

  // Handler download Full Multi-Sheet Workbook
  const handleDownloadWorkbook = async (format: 'xlsx' | 'json') => {
    const downloadKey = `full-workbook-${format}`;
    setDownloadingKey(downloadKey);
    try {
      await api.downloadFullWorkbook(format);
      showToast(
        format === 'xlsx'
          ? 'Multi-sheet Excel Workbook berhasil diunduh'
          : 'Full JSON System Snapshot berhasil diunduh',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunduh backup lengkap', 'error');
    } finally {
      setDownloadingKey(null);
    }
  };

  // Handler download Direct Database SQL Dump
  const handleDownloadDatabaseSql = async () => {
    setDownloadingKey('database-sql');
    try {
      await api.downloadDatabaseSql();
      showToast('Full PostgreSQL Database Dump (.sql) berhasil diunduh', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat dump SQL database', 'error');
    } finally {
      setDownloadingKey(null);
    }
  };

  // Handler submit file restore SQL
  const handleExecuteRestore = async () => {
    if (!restoreFile) {
      showToast('Pilih file backup SQL (.sql) terlebih dahulu', 'error');
      return;
    }
    if (confirmPhrase.trim() !== 'PULIHKAN DATABASE') {
      showToast('Ketik frasa konfirmasi "PULIHKAN DATABASE" persis dengan benar', 'error');
      return;
    }

    setRestoring(true);
    try {
      const result = await api.restoreDatabase(restoreFile);
      showToast(result.message || 'Database berhasil dipulihkan secara penuh!', 'success');
      setShowRestoreModal(false);
      setRestoreFile(null);
      setConfirmPhrase('');
      await fetchStats();
      if (onRefreshMasterData) {
        onRefreshMasterData();
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memulihkan database. Perubahan dibatalkan.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  // Filter konfigurasi entitas berdasarkan pilihan
  const filteredConfigs = useMemo(() => {
    if (filterType === 'roundtrip') {
      return ENTITY_CONFIGS.filter((c) => c.roundTripCompatible);
    }
    if (filterType === 'operational') {
      return ENTITY_CONFIGS.filter((c) => !c.roundTripCompatible);
    }
    return ENTITY_CONFIGS;
  }, [filterType]);

  const totalAllRecords = useMemo(() => {
    if (!stats?.tables) return 0;
    return stats.tables.reduce((acc, t) => acc + t.count, 0);
  }, [stats]);

  return (
    <div className="space-y-8 pb-16">
      {/* Header & Deskripsi Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Export Data & Cadangan Database
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Unduh file cadangan mandiri untuk arsip data, re-import produk, atau pemulihan darurat database.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={loadingStats}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm transition disabled:opacity-50"
            title="Segarkan ukuran dan jumlah record database"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin text-blue-600' : ''}`} />
            <span>Segarkan Metrik</span>
          </button>

          {isOwner && (
            <button
              onClick={() => {
                setRestoreFile(null);
                setConfirmPhrase('');
                setShowRestoreModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition"
            >
              <Upload className="w-4 h-4" />
              <span>Restore Database</span>
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan Status Database (Database Health & Stats Card) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Baris Data
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {loadingStats ? '...' : totalAllRecords.toLocaleString('id-ID')}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tersebar di {stats?.tables?.length ?? 16} tabel sistem
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ukuran Fisik Database
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {loadingStats ? '...' : stats?.databaseSize ?? '0 MB'}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {stats?.postgresVersion ? stats.postgresVersion.split(',')[0] : 'PostgreSQL Engine'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Proteksi Harga Modal
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base font-bold text-slate-900 dark:text-white">
            {canViewBuyPrice ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Termasuk Harga Modal
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                Sensor Harga Modal
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {canViewBuyPrice
              ? 'Akun Anda memiliki izin melihat HPP'
              : 'Harga beli disembunyikan otomatis'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pembaruan Terkini
            </span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            {stats?.generatedAt
              ? new Date(stats.generatedAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }) + ' WIB'
              : 'Baru saja'}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {stats?.generatedAt
              ? new Date(stats.generatedAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Hari ini'}
          </p>
        </div>
      </div>

      {/* SECTION 1: FULL SYSTEM BACKUP (Hero Cards) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Pencadangan Penuh (Full System Backup)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pilihan ideal untuk cadangan rutin seluruh operasional toko dalam 1 berkas mandiri.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Direct SQL Dump */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-700 flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Database className="w-36 h-36" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Database className="w-3 h-3" />
                  Langsung Import ke DB
                </span>
                <span className="text-xs text-slate-400 font-mono">.SQL</span>
              </div>

              <h3 className="text-xl font-bold mt-4">PostgreSQL Database Dump</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                File SQL mandiri berstandar ANSI PostgreSQL dengan instruksi transaksional lengkap
                (<code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">BEGIN ... COMMIT</code>).
                Dapat langsung di-import via CLI <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-300">psql</code>,
                pgAdmin, DBeaver, atau menu Restore sistem.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                <span>Cakupan:</span>
                <span className="font-semibold text-slate-200">16 Tabel & Relasi FK</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleDownloadDatabaseSql}
                disabled={downloadingKey === 'database-sql'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow transition disabled:opacity-50"
              >
                {downloadingKey === 'database-sql' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mempersiapkan SQL Dump...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Unduh Database Dump (.sql)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 2: Multi-Sheet Excel Workbook */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <FileSpreadsheet className="w-3 h-3" />
                  Excel Multi-Sheet
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">.XLSX</span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">
                Full Workbook Excel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Buku kerja spreadsheet lengkap berisi 9 lembar kerja (Ringkasan, Produk, Supplier,
                Kategori, Merek, Satuan, Faktur, Mutasi, Reservasi) dengan pemformatan mata uang,
                kode teks, dan filter otomatis.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Struktur:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  9 Lembar Terpisah
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => handleDownloadWorkbook('xlsx')}
                disabled={downloadingKey === 'full-workbook-xlsx'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {downloadingKey === 'full-workbook-xlsx' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyusun Workbook...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Unduh Excel Workbook (.xlsx)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 3: Full JSON System Snapshot */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <FileCode className="w-3 h-3" />
                  Format Terbuka
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">.JSON</span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">
                Full JSON Snapshot
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Snapshot data terstruktur dalam format JSON standar. Sangat cocok untuk arsip
                pemrograman, migrasi ke data warehouse, analitik big data, atau integrasi pihak ketiga.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Format:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  JSON UTF-8 Bersarang
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => handleDownloadWorkbook('json')}
                disabled={downloadingKey === 'full-workbook-json'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {downloadingKey === 'full-workbook-json' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan JSON...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Unduh Snapshot JSON (.json)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ENTITY LEVEL EXPORTS (Per-Entity Data Export) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Ekspor Spesifik Per-Entitas</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Unduh entitas terpisah dalam format Excel atau CSV. Baris data pada label{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">"Round-Trip Restore"</strong>{' '}
              dapat di-import kembali 100% tanpa modifikasi header.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 self-start">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filterType === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Semua ({ENTITY_CONFIGS.length})
            </button>
            <button
              onClick={() => setFilterType('roundtrip')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filterType === 'roundtrip'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Round-Trip Re-import (4)
            </button>
            <button
              onClick={() => setFilterType('operational')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filterType === 'operational'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Operasional & Audit (4)
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {filteredConfigs.map((cfg) => {
            const count = cfg.tableKeys.reduce((acc, k) => acc + (tableCountsMap.get(k) || 0), 0);

            return (
              <div
                key={cfg.entity}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.badgeColor}`}
                      >
                        {cfg.roundTripCompatible && <CheckCircle2 className="w-3 h-3" />}
                        {cfg.badge}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-2">
                        {cfg.title}
                      </h3>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {loadingStats ? '...' : count.toLocaleString('id-ID')}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        baris data
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed">
                    {cfg.description}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadEntity(cfg.entity, 'xlsx')}
                      disabled={Boolean(downloadingKey)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition disabled:opacity-50"
                      title="Unduh dalam format Excel (.xlsx) dengan styling warna"
                    >
                      {downloadingKey === `${cfg.entity}-xlsx` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      )}
                      <span>Excel (.xlsx)</span>
                    </button>

                    <button
                      onClick={() => handleDownloadEntity(cfg.entity, 'csv')}
                      disabled={Boolean(downloadingKey)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg transition disabled:opacity-50"
                      title="Unduh dalam format CSV UTF-8 dengan BOM"
                    >
                      {downloadingKey === `${cfg.entity}-csv` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      <span>CSV (.csv)</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleDownloadEntity(cfg.entity, 'json')}
                    disabled={Boolean(downloadingKey)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline font-medium"
                    title="Unduh payload JSON mentah"
                  >
                    JSON
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: PANDUAN TEKNIS & KEBIJAKAN BACKUP */}
      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Panduan Penggunaan Backup & Prosedur Restore Mandiri</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 text-xs text-slate-600 dark:text-slate-300">
          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
              1. Jadwal Backup Rutin
            </h4>
            <p className="leading-relaxed">
              Disarankan mengunduh berkas <strong>PostgreSQL Database Dump (.sql)</strong> secara berkala
              (misalnya setiap tutup buku harian atau mingguan) dan menyimpannya di media penyimpanan
              eksternal atau cloud drive terpisah.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
              2. Round-Trip Re-import
            </h4>
            <p className="leading-relaxed">
              File hasil ekspor Produk, Supplier, Kategori, dan Merek menggunakan header yang persis sama
              dengan template Import. Anda dapat langsung mengunggah file tersebut ke menu{' '}
              <strong>Import Data</strong> saat melakukan inisialisasi toko baru atau migrasi database.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
              3. Restore via Command Line
            </h4>
            <p className="leading-relaxed font-mono bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
              psql -U postgres -d bangunjaya_app -f backup.sql
            </p>
            <p className="mt-1 leading-relaxed">
              File .sql telah dilengkapi blok <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">TRUNCATE ... CASCADE</code> dan
              transaksional penuh sehingga aman dieksekusi tanpa bentrok foreign-key.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL RESTORE DATABASE (Khusus Owner) */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-xl">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Pemulihan Database (Restore Database)
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    Tindakan Berisiko Tinggi • Khusus Peran Owner
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!restoring) setShowRestoreModal(false);
                }}
                disabled={restoring}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Box */}
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>PERINGATAN KRUSIAL: DATA AKAN DITIMPA</span>
              </div>
              <p className="leading-relaxed">
                Proses pemulihan akan <strong>MENGHAPUS SEMUA DATA SEKARANG</strong> dan menggantikannya
                dengan data yang tersimpan di dalam file backup SQL. Seluruh transaksi penjualan, mutasi,
                dan penambahan produk setelah tanggal file backup akan hilang secara permanen.
              </p>
            </div>

            {/* File Upload Area */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Pilih Berkas SQL Backup (.sql)
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-xl p-4 text-center cursor-pointer transition bg-slate-50 dark:bg-slate-800/50">
                <input
                  type="file"
                  accept=".sql"
                  disabled={restoring}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setRestoreFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  id="sql-file-input"
                />
                <label htmlFor="sql-file-input" className="cursor-pointer block">
                  <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  {restoreFile ? (
                    <div>
                      <span className="font-semibold text-sm text-blue-600 dark:text-blue-400 block truncate">
                        {restoreFile.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {(restoreFile.size / 1024).toFixed(1)} KB • Klik untuk mengganti
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                        Klik untuk memilih file backup SQL
                      </span>
                      <span className="text-xs text-slate-500">
                        Format file wajib berakhiran .sql (Maks. 50 MB)
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Safety Confirmation Text Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Konfirmasi Keamanan: Ketik <span className="font-mono text-rose-600">PULIHKAN DATABASE</span>
              </label>
              <input
                type="text"
                disabled={restoring}
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="PULIHKAN DATABASE"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                disabled={restoring}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={restoring || !restoreFile || confirmPhrase.trim() !== 'PULIHKAN DATABASE'}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memulihkan Database...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Eksekusi Pemulihan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
