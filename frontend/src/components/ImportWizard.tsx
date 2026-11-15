import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ImportEntityType,
  ImportFileFormat,
  ImportDuplicateMode,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportCommitResult,
} from '../types';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Pagination } from './common/Pagination';
import {
  Package,
  Truck,
  FolderTree,
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Search,
  X,
  Info,
  ShieldAlert,
  Sparkles,
  FileUp,
  Layers,
  Eye,
  LucideIcon,
} from 'lucide-react';

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface EntityConfig {
  id: ImportEntityType;
  label: string;
  shortLabel: string;
  description: string;
  naturalKey: string;
  autoCreateNote: string;
  tips: string;
  requiredColumns: string[];
  optionalColumns: string[];
  icon: LucideIcon;
  targetPageLabel: string;
}

const ENTITY_CONFIGS: Record<ImportEntityType, EntityConfig> = {
  products: {
    id: 'products',
    label: 'Produk, Varian & Multi-Satuan',
    shortLabel: 'Produk & Varian',
    description:
      'Import katalog barang bangunan beserta varian ukuran/warna, multi-satuan konversi, stok awal, dan harga.',
    naturalKey: 'sku_produk (level produk) & sku_varian (level varian)',
    autoCreateNote:
      'Kategori, Merek, dan Satuan yang belum terdaftar di master akan dibuat otomatis saat commit.',
    tips: '1 baris merepresentasikan 1 kombinasi Produk–Varian–Satuan. Ulangi sku_produk pada baris berikutnya untuk menambah varian atau satuan bertingkat.',
    requiredColumns: ['sku_produk*', 'nama_produk*', 'nama_satuan*', 'harga_jual*'],
    optionalColumns: [
      'kategori',
      'merek',
      'kode_supplier',
      'sku_varian',
      'nama_varian',
      'satuan_dasar',
      'faktor_konversi',
      'harga_beli',
      'harga_grosir',
      'stok_awal',
      'stok_minimum_produk',
      'stok_minimum_varian',
      'status_produk',
      'status_varian',
      'barcode_produk',
      'barcode_varian',
      'deskripsi',
      'berat_kg',
      'panjang_cm',
      'lebar_cm',
      'tinggi_cm',
      'material',
      'spesifikasi',
    ],
    icon: Package,
    targetPageLabel: 'Katalog Produk',
  },
  suppliers: {
    id: 'suppliers',
    label: 'Master Supplier & Kontak Sales',
    shortLabel: 'Master Supplier',
    description:
      'Import daftar distributor/pemasok material beserta tim sales dan nomor telepon berganda.',
    naturalKey: 'kode_supplier (prioritas) atau nama_supplier + nama_sales',
    autoCreateNote:
      'Pada mode Skip, profil supplier lama dilewati namun kontak sales baru di bawah supplier tersebut tetap ditambahkan.',
    tips: 'Ulangi kode_supplier atau nama_supplier pada baris berikutnya untuk menambahkan lebih dari satu kontak sales ke supplier yang sama.',
    requiredColumns: ['nama_supplier*'],
    optionalColumns: [
      'kode_supplier',
      'kontak_utama',
      'telepon_kantor',
      'email_supplier',
      'kota',
      'alamat',
      'catatan_supplier',
      'status_supplier',
      'nama_sales',
      'email_sales',
      'no_hp_sales',
      'catatan_sales',
      'status_sales',
    ],
    icon: Truck,
    targetPageLabel: 'Master Supplier',
  },
  categories: {
    id: 'categories',
    label: 'Master Kategori Bertingkat',
    shortLabel: 'Master Kategori',
    description:
      'Import struktur kategori dan sub-kategori material bangunan dengan jalur hierarki bertingkat.',
    naturalKey: 'nama_kategori + jalur kategori_induk (parent path)',
    autoCreateNote:
      'Kategori induk (parent) dapat dituliskan menggunakan pemisah ">" untuk sub-kategori bertingkat.',
    tips: 'Gunakan pemisah ">" pada kolom kategori_induk untuk sub-kategori bertingkat (contoh: Material Dasar > Semen & Mortar).',
    requiredColumns: ['nama_kategori*'],
    optionalColumns: ['kategori_induk', 'deskripsi'],
    icon: FolderTree,
    targetPageLabel: 'Kategori Bertingkat',
  },
  brands: {
    id: 'brands',
    label: 'Master Merek (Brand)',
    shortLabel: 'Master Merek',
    description:
      'Import daftar merek material bangunan dengan normalisasi kunci anti-duplikat otomatis.',
    naturalKey: 'nama_merek ternormalisasi (name_key)',
    autoCreateNote:
      'Mode Upsert akan memperbarui ejaan/kapitalisasi nama merek sesuai data terbaru di file.',
    tips: 'Sistem menormalisasi huruf besar/kecil, spasi, dan simbol sehingga merek seperti "Tiga Roda" dan "tiga-roda" dikenali sebagai merek yang sama.',
    requiredColumns: ['nama_merek*'],
    optionalColumns: [],
    icon: Award,
    targetPageLabel: 'Master Merek',
  },
};

const ENTITY_ORDER: ImportEntityType[] = ['products', 'suppliers', 'categories', 'brands'];

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

export interface ImportWizardProps {
  initialEntity?: ImportEntityType;
  onImportSuccess?: (entity: ImportEntityType, result: ImportCommitResult) => void;
  onNavigateToEntity?: (entity: ImportEntityType) => void;
  onBack?: () => void;
  backLabel?: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  className?: string;
}

type WizardStep = 1 | 2 | 3 | 4;
type PreviewFilter = 'all' | 'create' | 'update' | 'skip' | 'warning' | 'error';

export const ImportWizard: React.FC<ImportWizardProps> = ({
  initialEntity,
  onImportSuccess,
  onNavigateToEntity,
  onBack,
  backLabel,
  showToast,
  className = '',
}) => {
  const { can } = useAuth();
  const canImportData = can('data:import');
  const canImportProducts = canImportData && can('products:create');
  const canUpdateProducts = can('products:update');
  const canViewBuyPrice = can('products:view_buy_price');
  const canWritePricing = can('pricing:write');
  const canImportMaster = canImportData && can('master:write');

  const isEntityPermitted = (entity: ImportEntityType): boolean => {
    if (entity === 'products') return canImportProducts;
    return canImportMaster;
  };

  const permittedEntities = useMemo(
    () => ENTITY_ORDER.filter((e) => isEntityPermitted(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canImportProducts, canImportMaster]
  );

  const resolveInitialEntity = (): ImportEntityType => {
    if (initialEntity && isEntityPermitted(initialEntity)) {
      return initialEntity;
    }
    return permittedEntities[0] || 'products';
  };

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [selectedEntity, setSelectedEntity] = useState<ImportEntityType>(resolveInitialEntity);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>('skip');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Async loading states
  const [downloadingFormat, setDownloadingFormat] = useState<ImportFileFormat | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Results
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [commitErrorMessage, setCommitErrorMessage] = useState<string | null>(null);

  // Preview table filter & pagination
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync if initialEntity prop changes (e.g. clicking shortcut from another view)
  useEffect(() => {
    if (initialEntity && isEntityPermitted(initialEntity)) {
      setSelectedEntity(initialEntity);
      setCurrentStep(1);
      setSelectedFile(null);
      setPreviewResult(null);
      setCommitResult(null);
      setFileError(null);
      setCommitErrorMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEntity]);

  // If products + upsert is not permitted, fall back to skip automatically
  useEffect(() => {
    if (selectedEntity === 'products' && !canUpdateProducts && duplicateMode === 'upsert') {
      setDuplicateMode('skip');
    }
  }, [selectedEntity, canUpdateProducts, duplicateMode]);

  const activeConfig = ENTITY_CONFIGS[selectedEntity];
  const canUseUpsert = selectedEntity !== 'products' || canUpdateProducts;

  const handleSelectEntity = (entity: ImportEntityType) => {
    if (!isEntityPermitted(entity)) {
      showToast('Anda tidak memiliki izin mengimport tipe data ini.', 'error');
      return;
    }
    if (entity !== selectedEntity) {
      setSelectedEntity(entity);
      setSelectedFile(null);
      setPreviewResult(null);
      setCommitResult(null);
      setFileError(null);
      setCommitErrorMessage(null);
    }
  };

  const handleDownloadTemplate = async (format: ImportFileFormat) => {
    if (!isEntityPermitted(selectedEntity)) {
      showToast('Anda tidak memiliki izin mengunduh template ini.', 'error');
      return;
    }

    try {
      setDownloadingFormat(format);
      const { blob, filename } = await api.downloadImportTemplate(selectedEntity, format);
      triggerBlobDownload(blob, filename);
      showToast(`Template ${activeConfig.shortLabel} (.${format}) berhasil diunduh`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh template import', 'error');
    } finally {
      setDownloadingFormat(null);
    }
  };

  const validateAndSetFile = (file: File | null) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      setPreviewResult(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      const msg = 'Format file tidak didukung. Gunakan file Excel (.xlsx) atau CSV (.csv).';
      setFileError(msg);
      showToast(msg, 'error');
      return;
    }

    if (file.size === 0) {
      const msg = 'File yang dipilih kosong (0 byte).';
      setFileError(msg);
      showToast(msg, 'error');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const msg = `Ukuran file (${formatBytes(file.size)}) melebihi batas maksimal 5 MB.`;
      setFileError(msg);
      showToast(msg, 'error');
      return;
    }

    setSelectedFile(file);
    setPreviewResult(null);
    setCommitResult(null);
    setCommitErrorMessage(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    if (file) {
      validateAndSetFile(file);
    }
  };

  const runPreview = async (modeOverride?: ImportDuplicateMode) => {
    if (!selectedFile) {
      showToast('Pilih file Excel (.xlsx) atau CSV (.csv) terlebih dahulu.', 'error');
      return;
    }

    const effectiveMode = modeOverride ?? duplicateMode;
    try {
      setIsPreviewing(true);
      setCommitErrorMessage(null);
      const result = await api.previewImport(selectedEntity, selectedFile, effectiveMode);
      setPreviewResult(result);
      setPreviewFilter('all');
      setPreviewSearch('');
      setCurrentPage(1);
      setCurrentStep(3);

      if (result.summary.error_rows > 0) {
        showToast(
          `Preview selesai: ditemukan ${result.summary.error_rows} baris yang perlu diperbaiki.`,
          'info'
        );
      } else {
        showToast(
          `Validasi selesai: ${result.summary.valid_rows} baris siap diproses.`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'Gagal memvalidasi file import', 'error');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSwitchModeInPreview = async (nextMode: ImportDuplicateMode) => {
    if (nextMode === duplicateMode) return;
    if (nextMode === 'upsert' && !canUseUpsert) {
      showToast('Anda memerlukan izin products:update untuk mode Upsert produk.', 'error');
      return;
    }
    setDuplicateMode(nextMode);
    if (selectedFile) {
      await runPreview(nextMode);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile || !previewResult) return;

    if (previewResult.summary.error_rows > 0) {
      showToast('Perbaiki seluruh baris error terlebih dahulu sebelum menjalankan import.', 'error');
      return;
    }

    try {
      setIsCommitting(true);
      setCommitErrorMessage(null);
      const result = await api.commitImport(selectedEntity, selectedFile, duplicateMode, false);
      setCommitResult(result);
      setCurrentStep(4);
      showToast(
        `Import ${activeConfig.shortLabel} selesai (${result.summary.created_count} ditambah, ${result.summary.updated_count} diperbarui).`,
        'success'
      );
      onImportSuccess?.(selectedEntity, result);
    } catch (err: any) {
      const msg = err?.message || 'Gagal mengeksekusi import data.';
      setCommitErrorMessage(msg);
      if (err instanceof ApiError && err.details && typeof err.details === 'object') {
        const detailObj = err.details as { errors?: Array<{ row_number?: number; message?: string }> };
        if (Array.isArray(detailObj.errors) && detailObj.errors.length > 0) {
          const firstErr = detailObj.errors[0];
          showToast(
            `${msg} (Baris ${firstErr.row_number ?? '-'}: ${firstErr.message ?? ''})`,
            'error'
          );
          return;
        }
      }
      showToast(msg, 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleResetWizard = (goToStep: WizardStep = 1) => {
    setSelectedFile(null);
    setFileError(null);
    setPreviewResult(null);
    setCommitResult(null);
    setCommitErrorMessage(null);
    setPreviewFilter('all');
    setPreviewSearch('');
    setCurrentPage(1);
    setCurrentStep(goToStep);
  };

  // Filtered preview rows
  const filteredPreviewRows = useMemo<ImportPreviewRow[]>(() => {
    if (!previewResult) return [];
    const q = previewSearch.trim().toLowerCase();

    return previewResult.rows.filter((row) => {
      if (previewFilter === 'create' && row.action !== 'create') return false;
      if (previewFilter === 'update' && row.action !== 'update') return false;
      if (previewFilter === 'skip' && row.action !== 'skip') return false;
      if (previewFilter === 'error' && row.status !== 'error') return false;
      if (previewFilter === 'warning' && row.status !== 'warning') return false;

      if (!q) return true;

      const matchBasic =
        String(row.row_number).includes(q) ||
        (row.identifier && row.identifier.toLowerCase().includes(q)) ||
        (row.label && row.label.toLowerCase().includes(q));
      const matchMsg = row.messages.some(
        (m) =>
          m.message.toLowerCase().includes(q) ||
          (m.field && m.field.toLowerCase().includes(q))
      );
      const matchRaw = Object.values(row.raw || {}).some(
        (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      );

      return Boolean(matchBasic || matchMsg || matchRaw);
    });
  }, [previewResult, previewFilter, previewSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [previewFilter, previewSearch]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPreviewRows.slice(start, start + pageSize);
  }, [filteredPreviewRows, currentPage, pageSize]);

  if (permittedEntities.length === 0) {
    return (
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3 ${className}`}>
        <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Akses Import Data Tidak Tersedia
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Akun Anda belum memiliki izin import data atau izin tulis entitas terkait. Hubungi Owner/Admin untuk pengaturan hak akses.
        </p>
      </div>
    );
  }

  const steps: Array<{ step: WizardStep; label: string }> = [
    { step: 1, label: '1. Tipe Data & Template' },
    { step: 2, label: '2. Upload & Mode' },
    { step: 3, label: '3. Preview & Validasi' },
    { step: 4, label: '4. Ringkasan Hasil' },
  ];

  const canGoToStep = (target: WizardStep): boolean => {
    if (target === 1) return currentStep !== 4;
    if (target === 2) return currentStep !== 4;
    if (target === 3) return Boolean(previewResult) && currentStep !== 4;
    if (target === 4) return Boolean(commitResult);
    return false;
  };

  const renderActionBadge = (row: ImportPreviewRow) => {
    if (row.status === 'error' || row.action === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      );
    }

    if (row.action === 'create') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          Baru
        </span>
      );
    }

    if (row.action === 'update') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <RefreshCw className="w-3 h-3" />
          Update
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        Lewati
      </span>
    );
  };

  const getAutoCreatedDepsCount = () => {
    const deps = previewResult?.summary.auto_create_dependencies;
    if (!deps) return 0;
    return (deps.categories?.length || 0) + (deps.brands?.length || 0) + (deps.units?.length || 0);
  };

  const canCommitNow =
    Boolean(previewResult) &&
    !isCommitting &&
    !isPreviewing &&
    (previewResult?.summary.error_rows || 0) === 0 &&
    ((previewResult?.summary.to_create || 0) + (previewResult?.summary.to_update || 0) > 0);

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Stepper Header Card (Consistent with ProductFormModal wizard style) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto">
          {steps.map((s, idx) => {
            const isActive = currentStep === s.step;
            const isCompleted = currentStep > s.step;
            const clickable = canGoToStep(s.step);

            return (
              <React.Fragment key={s.step}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setCurrentStep(s.step)}
                  className={`flex items-center gap-2 text-xs font-semibold transition-colors ${
                    clickable ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isActive
                      ? 'text-amber-600 dark:text-amber-400 font-bold'
                      : isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${
                      isActive
                        ? 'bg-amber-600 text-white ring-4 ring-amber-500/20 shadow-xs'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s.step}
                  </div>
                  <span className="hidden md:inline whitespace-nowrap">{s.label}</span>
                </button>

                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 sm:mx-3 rounded-full transition-colors ${
                      currentStep > s.step
                        ? 'bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ================================================================= */}
      {/* STEP 1: PILIH TIPE DATA & DOWNLOAD TEMPLATE                       */}
      {/* ================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {/* Entity Selection Grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>Langkah 1: Pilih Jenis Data yang Akan Diimport</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih entitas target, unduh template resmi, lalu isi data sesuai struktur kolom.
                </p>
              </div>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 self-start sm:self-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{backLabel || 'Kembali'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ENTITY_ORDER.map((entityKey) => {
                const cfg = ENTITY_CONFIGS[entityKey];
                const Icon = cfg.icon;
                const permitted = isEntityPermitted(entityKey);
                const isSelected = selectedEntity === entityKey;

                return (
                  <button
                    key={entityKey}
                    type="button"
                    disabled={!permitted}
                    onClick={() => handleSelectEntity(entityKey)}
                    className={`text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 relative ${
                      !permitted
                        ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                        : isSelected
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20 ring-2 ring-amber-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isSelected
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {cfg.label}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600 text-white shrink-0">
                            <Check className="w-3 h-3" /> Dipilih
                          </span>
                        )}
                        {!permitted && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 shrink-0">
                            Tanpa Izin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {cfg.description}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-0.5">
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Kunci unik:</span>{' '}
                        {cfg.naturalKey}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template & Column Guide Panel for Selected Entity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Template Resmi: {activeConfig.label}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeConfig.tips}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={downloadingFormat !== null}
                  onClick={() => handleDownloadTemplate('xlsx')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors disabled:opacity-50"
                >
                  {downloadingFormat === 'xlsx' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>Download Template .xlsx</span>
                </button>

                <button
                  type="button"
                  disabled={downloadingFormat !== null}
                  onClick={() => handleDownloadTemplate('csv')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-50"
                >
                  {downloadingFormat === 'csv' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  <span>Download Template .csv</span>
                </button>
              </div>
            </div>

            {/* Column badges summary */}
            <div className="space-y-2.5">
              <div className="text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 mr-2">
                  Kolom Wajib (*):
                </span>
                <div className="inline-flex flex-wrap gap-1.5 mt-1">
                  {activeConfig.requiredColumns.map((col) => (
                    <span
                      key={col}
                      className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {activeConfig.optionalColumns.length > 0 && (
                <div className="text-xs">
                  <span className="font-bold text-slate-600 dark:text-slate-400 mr-2">
                    Kolom Opsional:
                  </span>
                  <div className="inline-flex flex-wrap gap-1.5 mt-1">
                    {activeConfig.optionalColumns.map((col) => (
                      <span
                        key={col}
                        className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>{activeConfig.autoCreateNote}</p>
                  {selectedEntity === 'products' && !canViewBuyPrice && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      Catatan RBAC: Akun Anda tidak memiliki izin melihat/mengubah harga modal (<code>products:view_buy_price</code>), sehingga kolom <code>harga_beli</code> akan diabaikan/dipertahankan.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
              >
                <span>Lanjut ke Upload File</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP 2: UPLOAD FILE & PILIH MODE DUPLIKAT                         */}
      {/* ================================================================= */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
          {/* Header + quick template download */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileUp className="w-4 h-4 text-amber-500" />
                <span>Langkah 2: Upload File & Pilih Mode Duplikat ({activeConfig.shortLabel})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Unggah file .xlsx atau .csv (maks. 5 MB, 2.000 baris) untuk divalidasi sebelum disimpan.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={downloadingFormat !== null}
                onClick={() => handleDownloadTemplate('xlsx')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Template .xlsx</span>
              </button>
              <button
                type="button"
                disabled={downloadingFormat !== null}
                onClick={() => handleDownloadTemplate('csv')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Template .csv</span>
              </button>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all ${
              !selectedFile ? 'cursor-pointer' : ''
            } ${
              isDragging
                ? 'border-amber-500 bg-amber-500/10'
                : fileError
                ? 'border-rose-400 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/10'
                : selectedFile
                ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/10'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 hover:border-amber-400 dark:hover:border-amber-500/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-left max-w-2xl mx-auto">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    {selectedFile.name.toLowerCase().endsWith('.xlsx') ? (
                      <FileSpreadsheet className="w-6 h-6" />
                    ) : (
                      <FileText className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Ukuran: <span className="font-semibold">{formatBytes(selectedFile.size)}</span> • Format:{' '}
                      <span className="uppercase font-semibold">
                        {selectedFile.name.toLowerCase().endsWith('.xlsx') ? 'Excel (.xlsx)' : 'CSV (.csv)'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                  >
                    Ganti File
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      validateAndSetFile(null);
                    }}
                    className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Hapus file terpilih"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="inline-flex p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Seret & lepas file Excel (.xlsx) atau CSV (.csv) ke sini
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    atau{' '}
                    <span className="text-amber-600 dark:text-amber-400 font-bold underline">
                      klik untuk memilih file dari komputer
                    </span>{' '}
                    (maks. 5 MB)
                  </p>
                </div>
              </div>
            )}
          </div>

          {fileError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Duplicate Mode Selection */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Mode Penanganan Data Duplikat:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDuplicateMode('skip')}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  duplicateMode === 'skip'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Skip (Lewati Data yang Sudah Ada)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Aman / Default
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Hanya menambahkan data baru. Jika data dengan kunci yang sama sudah ada di database, baris tersebut akan dilewati tanpa mengubah data lama.
                </p>
              </button>

              <button
                type="button"
                disabled={!canUseUpsert}
                onClick={() => canUseUpsert && setDuplicateMode('upsert')}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  !canUseUpsert
                    ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50'
                    : duplicateMode === 'upsert'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Upsert (Tambah Baru & Perbarui yang Ada)
                  </span>
                  {!canUseUpsert ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500">
                      Perlu products:update
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      Update + Insert
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedEntity === 'products'
                    ? 'Menambah produk/varian baru dan memperbarui atribut/harga data lama. Stok awal pada varian existing tetap tidak ditimpa demi keamanan stok berjalan.'
                    : 'Menambahkan entri baru dan memperbarui field entri yang sudah cocok berdasarkan kunci unik.'}
                </p>
              </button>
            </div>

            {selectedEntity === 'products' && duplicateMode === 'upsert' && !canWritePricing && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Akun Anda tidak memiliki izin <code>pricing:write</code>. Perubahan harga jual/grosir pada satuan produk yang sudah ada dapat dibatasi oleh server.
                </span>
              </div>
            )}
          </div>

          {/* Step 2 Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Tipe Data</span>
            </button>

            <button
              type="button"
              disabled={!selectedFile || isPreviewing}
              onClick={() => runPreview()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isPreviewing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memvalidasi File...</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Validasi & Preview (Dry-Run)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP 3: DRY-RUN PREVIEW & VALIDASI BARIS                          */}
      {/* ================================================================= */}
      {currentStep === 3 && previewResult && (
        <div className="space-y-4">
          {/* File Context & Inline Mode Switch */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Hasil Validasi Dry-Run: {previewResult.file_name}
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {activeConfig.shortLabel} • .{previewResult.file_format}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Periksa status setiap baris di bawah sebelum menyimpan ke database secara permanen.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start lg:self-auto">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-2">
                Mode:
              </span>
              <button
                type="button"
                disabled={isPreviewing || isCommitting}
                onClick={() => handleSwitchModeInPreview('skip')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  duplicateMode === 'skip'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Skip
              </button>
              <button
                type="button"
                disabled={!canUseUpsert || isPreviewing || isCommitting}
                onClick={() => handleSwitchModeInPreview('upsert')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${
                  duplicateMode === 'upsert'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Upsert
              </button>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">Total Baris Data</span>
              <span className="text-xl font-black text-slate-900 dark:text-white">
                {previewResult.summary.total_rows}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {previewResult.summary.valid_rows} baris valid
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">Siap Ditambahkan (Baru)</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {previewResult.summary.to_create}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Entri/baris baru</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">
                {duplicateMode === 'upsert' ? 'Akan Diperbarui' : 'Akan Dilewati (Duplikat)'}
              </span>
              <span
                className={`text-xl font-black ${
                  duplicateMode === 'upsert'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {duplicateMode === 'upsert'
                  ? previewResult.summary.to_update
                  : previewResult.summary.to_skip}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {duplicateMode === 'upsert'
                  ? `${previewResult.summary.to_skip} dilewati`
                  : `${previewResult.summary.to_update} diperbarui`}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">Baris Error</span>
              <span
                className={`text-xl font-black ${
                  previewResult.summary.error_rows > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {previewResult.summary.error_rows}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {previewResult.summary.warning_rows} peringatan
              </span>
            </div>
          </div>

          {/* Auto-create dependencies notice */}
          {getAutoCreatedDepsCount() > 0 && previewResult.summary.auto_create_dependencies && (
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs">
              <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Master Data yang Akan Dibuat Otomatis Saat Commit:</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px]">
                {previewResult.summary.auto_create_dependencies.categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Kategori:</span>
                    {previewResult.summary.auto_create_dependencies.categories.slice(0, 6).map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 text-slate-700 dark:text-slate-200">
                        {c}
                      </span>
                    ))}
                    {previewResult.summary.auto_create_dependencies.categories.length > 6 && (
                      <span className="text-slate-500">
                        +{previewResult.summary.auto_create_dependencies.categories.length - 6} lainnya
                      </span>
                    )}
                  </div>
                )}

                {previewResult.summary.auto_create_dependencies.brands.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Merek:</span>
                    {previewResult.summary.auto_create_dependencies.brands.slice(0, 6).map((b) => (
                      <span key={b} className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 text-slate-700 dark:text-slate-200">
                        {b}
                      </span>
                    ))}
                    {previewResult.summary.auto_create_dependencies.brands.length > 6 && (
                      <span className="text-slate-500">
                        +{previewResult.summary.auto_create_dependencies.brands.length - 6} lainnya
                      </span>
                    )}
                  </div>
                )}

                {previewResult.summary.auto_create_dependencies.units.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Satuan:</span>
                    {previewResult.summary.auto_create_dependencies.units.slice(0, 6).map((u) => (
                      <span key={u} className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 text-slate-700 dark:text-slate-200">
                        {u}
                      </span>
                    ))}
                    {previewResult.summary.auto_create_dependencies.units.length > 6 && (
                      <span className="text-slate-500">
                        +{previewResult.summary.auto_create_dependencies.units.length - 6} lainnya
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error / Warning / Truncation Alerts */}
          {previewResult.summary.error_rows > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">
                  Terdapat {previewResult.summary.error_rows} baris error — Commit import dinonaktifkan.
                </p>
                <p className="text-rose-700 dark:text-rose-300">
                  Filter tabel ke tab <strong>Error</strong> untuk melihat detail kesalahan per baris, perbaiki file Anda, lalu klik <strong>Upload Ulang</strong>.
                </p>
              </div>
            </div>
          )}

          {previewResult.truncated && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Tampilan preview dibatasi untuk menjaga performa browser. Seluruh baris tetap akan diproses saat eksekusi import.
              </span>
            </div>
          )}

          {commitErrorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{commitErrorMessage}</span>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder="Cari baris, SKU, nama, atau pesan validasi..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: `Semua (${previewResult.rows.length})`, show: true },
                  { id: 'create', label: `Baru (${previewResult.summary.to_create})`, show: true },
                  {
                    id: 'update',
                    label: `Update (${previewResult.summary.to_update})`,
                    show: duplicateMode === 'upsert' || previewResult.summary.to_update > 0,
                  },
                  {
                    id: 'skip',
                    label: `Lewati (${previewResult.summary.to_skip})`,
                    show: duplicateMode === 'skip' || previewResult.summary.to_skip > 0,
                  },
                  {
                    id: 'warning',
                    label: `Peringatan (${previewResult.summary.warning_rows})`,
                    show: previewResult.summary.warning_rows > 0,
                  },
                  { id: 'error', label: `Error (${previewResult.summary.error_rows})`, show: true },
                ] as Array<{ id: PreviewFilter; label: string; show: boolean }>
              )
                .filter((t) => t.show)
                .map((tab) => {
                  const active = previewFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        active
                          ? tab.id === 'error'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : tab.id === 'create'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : tab.id === 'update'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Preview Rows Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            {isPreviewing ? (
              <div className="py-14 text-center text-slate-400 text-xs space-y-2">
                <RefreshCw className="w-7 h-7 mx-auto text-amber-500 animate-spin" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  Memperbarui simulasi preview...
                </p>
              </div>
            ) : filteredPreviewRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  Tidak ada baris yang cocok dengan filter saat ini.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 w-20">Baris</th>
                        <th className="py-3 px-4 w-32">Aksi</th>
                        <th className="py-3 px-4 min-w-[240px]">Identitas & Data</th>
                        <th className="py-3 px-4 min-w-[260px]">Validasi & Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedRows.map((row) => {
                        const rawEntries = Object.entries(row.raw || {})
                          .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                          .slice(0, 6);

                        return (
                          <tr
                            key={row.row_number}
                            className={`transition-colors ${
                              row.status === 'error'
                                ? 'bg-rose-500/[0.04] dark:bg-rose-950/15'
                                : row.status === 'warning'
                                ? 'bg-amber-500/[0.03] dark:bg-amber-950/10'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 px-4 align-top font-mono font-bold text-slate-700 dark:text-slate-300">
                              #{row.row_number}
                            </td>
                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col items-start gap-1">
                                {renderActionBadge(row)}
                                {row.status === 'warning' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="w-3 h-3" /> Peringatan
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 align-top space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {row.label && (
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {row.label}
                                  </span>
                                )}
                                {row.identifier && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {row.identifier}
                                  </span>
                                )}
                              </div>
                              {rawEntries.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {rawEntries.map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                    >
                                      <span className="text-slate-400">{k}:</span>{' '}
                                      <span className="font-medium">{String(v)}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top">
                              {row.messages.length === 0 ? (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                  Data valid, siap diproses.
                                </span>
                              ) : (
                                <ul className="space-y-1">
                                  {row.messages.map((issue, idx) => (
                                    <li
                                      key={idx}
                                      className={`text-[11px] flex items-start gap-1.5 ${
                                        issue.severity === 'error'
                                          ? 'text-rose-600 dark:text-rose-400 font-medium'
                                          : 'text-amber-700 dark:text-amber-300'
                                      }`}
                                    >
                                      {issue.severity === 'error' ? (
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      )}
                                      <span>
                                        {issue.field && (
                                          <code className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded mr-1">
                                            {issue.field}
                                          </code>
                                        )}
                                        {issue.message}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredPreviewRows.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[10, 20, 50, 100]}
                />
              </>
            )}
          </div>

          {/* Step 3 Footer Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              disabled={isCommitting}
              onClick={() => setCurrentStep(2)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Upload Ulang / Ubah Mode</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              {previewResult.summary.error_rows === 0 &&
                previewResult.summary.to_create + previewResult.summary.to_update === 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Semua baris sudah ada & dilewati (tidak ada perubahan).
                  </span>
                )}

              <button
                type="button"
                disabled={!canCommitNow}
                onClick={handleCommit}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Jalankan Import ({previewResult.summary.to_create + previewResult.summary.to_update} Baris)
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP 4: HASIL RINGKASAN IMPORT                                    */}
      {/* ================================================================= */}
      {currentStep === 4 && commitResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-6">
          {/* Status Banner */}
          <div
            className={`p-5 rounded-2xl border flex items-start gap-4 ${
              commitResult.committed && commitResult.summary.failed_count === 0
                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
            }`}
          >
            <div
              className={`p-3 rounded-xl shrink-0 ${
                commitResult.committed && commitResult.summary.failed_count === 0
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {commitResult.committed && commitResult.summary.failed_count === 0 ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Import {activeConfig.label} Selesai
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                File telah diproses dalam 1 transaksi atomik dengan mode{' '}
                <strong className="uppercase">{commitResult.mode}</strong>. Data master & katalog terkait telah diperbarui.
              </p>
            </div>
          </div>

          {/* Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block">Ditambahkan</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {commitResult.summary.created_count}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block">Diperbarui</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {commitResult.summary.updated_count}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block">Dilewati</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {commitResult.summary.skipped_count}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block">Gagal</span>
              <span
                className={`text-2xl font-black ${
                  commitResult.summary.failed_count > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {commitResult.summary.failed_count}
              </span>
            </div>
          </div>

          {/* Auto-created master counts */}
          {commitResult.summary.auto_created &&
            (commitResult.summary.auto_created.categories > 0 ||
              commitResult.summary.auto_created.brands > 0 ||
              commitResult.summary.auto_created.units > 0) && (
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Master Dibuat Otomatis:
                </span>
                {commitResult.summary.auto_created.categories > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 font-semibold text-slate-700 dark:text-slate-200">
                    +{commitResult.summary.auto_created.categories} Kategori
                  </span>
                )}
                {commitResult.summary.auto_created.brands > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 font-semibold text-slate-700 dark:text-slate-200">
                    +{commitResult.summary.auto_created.brands} Merek
                  </span>
                )}
                {commitResult.summary.auto_created.units > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700 font-semibold text-slate-700 dark:text-slate-200">
                    +{commitResult.summary.auto_created.units} Satuan
                  </span>
                )}
              </div>
            )}

          {/* Error details if any */}
          {commitResult.errors && commitResult.errors.length > 0 && (
            <div className="border border-rose-200 dark:border-rose-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
                Detail Baris Gagal ({commitResult.errors.length})
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-rose-100 dark:divide-rose-900/40 text-xs">
                {commitResult.errors.map((errItem, idx) => (
                  <div key={idx} className="px-4 py-2.5 flex items-start gap-3">
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      Baris #{errItem.row_number}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {errItem.identifier && (
                        <strong className="mr-1.5">[{errItem.identifier}]</strong>
                      )}
                      {errItem.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleResetWizard(1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Upload className="w-4 h-4" />
              <span>Import File Lain</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{backLabel || 'Kembali'}</span>
                </button>
              )}

              {onNavigateToEntity && (
                <button
                  type="button"
                  onClick={() => onNavigateToEntity(selectedEntity)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
                >
                  <span>Lihat {activeConfig.targetPageLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
