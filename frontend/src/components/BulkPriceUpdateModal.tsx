import React, { useState, useEffect } from 'react';
import {
  Product,
  Category,
  Brand,
  Supplier,
  BulkPriceUpdatePayload,
  BulkPricePreviewResponse,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Percent,
  Search,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { formatIdNumber } from './common/NumericInput';

interface BulkPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSuccess: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const PRESET_REASONS = [
  'Penyesuaian harga distributor/supplier',
  'Penyesuaian margin target toko',
  'Penyesuaian inflasi tahunan',
  'Promo diskon katalog musiman',
];

export const BulkPriceUpdateModal: React.FC<BulkPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
  showToast,
}) => {
  const triggerToast = showToast || ((msg: string) => console.log(msg));
  const { can } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');
  const canWritePricing = can('pricing:write');

  // Master data for filters (when product is not fixed)
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Form states
  const [scope, setScope] = useState<'ALL' | 'CATEGORY' | 'BRAND' | 'SUPPLIER' | 'PRODUCTS'>(
    product ? 'PRODUCTS' : 'CATEGORY'
  );
  const [categoryId, setCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [targetField, setTargetField] = useState<'sell_price' | 'buy_price' | 'wholesale_price'>('sell_price');
  const [targetUnits, setTargetUnits] = useState<'BASE_ONLY' | 'ALL_UNITS'>('ALL_UNITS');
  const [adjustmentMode, setAdjustmentMode] = useState<'PERCENT' | 'FIXED_AMOUNT' | 'SET_VALUE'>('PERCENT');
  const [value, setValue] = useState<number>(5);
  const [rounding, setRounding] = useState<'NONE' | 'HUNDRED' | 'THOUSAND' | 'FIVE_THOUSAND'>('THOUSAND');
  const [autoMaintainMargin, setAutoMaintainMargin] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');

  // Preview & submission state
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkPricePreviewResponse | null>(null);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [confirmedCommit, setConfirmedCommit] = useState<boolean>(false);

  // Load filter options if not targeting a single product
  useEffect(() => {
    if (isOpen && !product) {
      api.getCategories().then(setCategories).catch(console.error);
      api.getBrands().then(setBrands).catch(console.error);
      api.getSuppliers().then(setSuppliers).catch(console.error);
    }
  }, [isOpen, product]);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setScope(product ? 'PRODUCTS' : 'CATEGORY');
      setTargetField('sell_price');
      setTargetUnits('ALL_UNITS');
      setAdjustmentMode('PERCENT');
      setValue(5);
      setRounding('THOUSAND');
      setAutoMaintainMargin(false);
      setReason('');
      setReferenceNo('');
      setPreviewResult(null);
      setConfirmedCommit(false);
    }
  }, [isOpen, product]);

  if (!isOpen) return null;

  const buildPayload = (): BulkPriceUpdatePayload => ({
    scope: product ? 'PRODUCTS' : scope,
    product_ids: product ? [product.id] : undefined,
    category_id: !product && scope === 'CATEGORY' ? categoryId || undefined : undefined,
    brand_id: !product && scope === 'BRAND' ? brandId || undefined : undefined,
    supplier_id: !product && scope === 'SUPPLIER' ? supplierId || undefined : undefined,
    target_field: targetField,
    target_units: targetUnits,
    adjustment_mode: adjustmentMode,
    value: Number(value),
    rounding,
    auto_maintain_margin: autoMaintainMargin,
    reason: reason.trim() || 'Penyesuaian harga massal',
    reference_no: referenceNo.trim() || undefined,
  });

  const handleFetchPreview = async () => {
    if (!reason.trim()) {
      triggerToast('Wajib mengisi alasan perubahan harga untuk riwayat audit', 'error');
      return;
    }

    try {
      setIsLoadingPreview(true);
      const payload = buildPayload();
      const res = await api.previewBulkPriceUpdate(payload);
      setPreviewResult(res);
      setConfirmedCommit(false);
    } catch (err: any) {
      triggerToast(err.message || 'Gagal memuat simulasi dampak harga', 'error');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCommit = async () => {
    if (!reason.trim()) {
      triggerToast('Wajib mengisi alasan perubahan harga untuk riwayat audit', 'error');
      return;
    }

    try {
      setIsCommitting(true);
      const payload = buildPayload();
      const res = await api.commitBulkPriceUpdate(payload);
      triggerToast(res.message || `Berhasil memperbarui ${res.updated_count} harga satuan`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menerapkan perubahan harga massal', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Update Harga Massal (Bulk Pricing)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {product
                  ? `Perbarui harga seluruh varian produk: "${product.name}"`
                  : 'Sesuaikan harga jual/modal banyak produk sekaligus dengan simulasi margin'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Body */}
        <div className="space-y-4">
          {/* Scope Selector (Only if product is not locked) */}
          {!product && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                1. Tentukan Ruang Lingkup Produk:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'CATEGORY', label: 'Per Kategori' },
                    { id: 'BRAND', label: 'Per Merek/Brand' },
                    { id: 'SUPPLIER', label: 'Per Supplier' },
                    { id: 'ALL', label: 'Semua Produk' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setScope(s.id);
                      setPreviewResult(null);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      scope === s.id
                        ? 'bg-amber-500 border-amber-600 text-white shadow-xs font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {scope === 'CATEGORY' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Pilih Kategori Sasaran:
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setPreviewResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scope === 'BRAND' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Pilih Merek Sasaran:
                  </label>
                  <select
                    value={brandId}
                    onChange={(e) => {
                      setBrandId(e.target.value);
                      setPreviewResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="">-- Pilih Merek --</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scope === 'SUPPLIER' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Pilih Supplier Sasaran:
                  </label>
                  <select
                    value={supplierId}
                    onChange={(e) => {
                      setSupplierId(e.target.value);
                      setPreviewResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="">-- Pilih Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Pricing Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Field & Target Units */}
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Target Field Harga:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetField('sell_price');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      targetField === 'sell_price'
                        ? 'bg-emerald-600 border-emerald-700 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Harga Jual
                  </button>

                  {canViewBuyPrice && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetField('buy_price');
                        setPreviewResult(null);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                        targetField === 'buy_price'
                          ? 'bg-rose-600 border-rose-700 text-white font-bold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Harga Modal
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setTargetField('wholesale_price');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      targetField === 'wholesale_price'
                        ? 'bg-indigo-600 border-indigo-700 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Harga Grosir
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Satuan Target:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUnits('ALL_UNITS');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      targetUnits === 'ALL_UNITS'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Semua Satuan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUnits('BASE_ONLY');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      targetUnits === 'BASE_ONLY'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Hanya Satuan Dasar
                  </button>
                </div>
              </div>
            </div>

            {/* Formula & Adjustment Mode */}
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Metode Penyesuaian:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentMode('PERCENT');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      adjustmentMode === 'PERCENT'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Persentase (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentMode('FIXED_AMOUNT');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      adjustmentMode === 'FIXED_AMOUNT'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Nominal (+/- Rp)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentMode('SET_VALUE');
                      setPreviewResult(null);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      adjustmentMode === 'SET_VALUE'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Set Nilai Pasti
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Nilai Penyesuaian ({adjustmentMode === 'PERCENT' ? '%' : 'Rp'}):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={adjustmentMode === 'PERCENT' ? '0.1' : '100'}
                    value={value}
                    onChange={(e) => {
                      setValue(Number(e.target.value));
                      setPreviewResult(null);
                    }}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder="Contoh: 5 untuk naik 5%, -3 untuk turun 3%"
                  />
                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                    {adjustmentMode === 'PERCENT' ? '%' : 'Rp'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Options: Rounding & Auto-Maintain Margin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Aturan Pembulatan (Rounding):
              </label>
              <select
                value={rounding}
                onChange={(e) => {
                  setRounding(e.target.value as any);
                  setPreviewResult(null);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
              >
                <option value="NONE">Tanpa Pembulatan</option>
                <option value="HUNDRED">Bulatkan ke Ratusan Terdekat (100)</option>
                <option value="THOUSAND">Bulatkan ke Ribuan Terdekat (1.000)</option>
                <option value="FIVE_THOUSAND">Bulatkan ke 5 Ribuan Terdekat (5.000)</option>
              </select>
            </div>

            {targetField === 'buy_price' && (
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="autoMaintainMargin"
                  checked={autoMaintainMargin}
                  onChange={(e) => {
                    setAutoMaintainMargin(e.target.checked);
                    setPreviewResult(null);
                  }}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <label
                  htmlFor="autoMaintainMargin"
                  className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Pertahankan Gross Margin Otomatis
                  <span className="block text-[10px] text-slate-400 font-normal">
                    Otomatis sesuaikan harga jual agar % margin tetap sama dengan sebelum kenaikan modal.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Reason & Reference No */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Alasan Perubahan (Wajib untuk Riwayat Audit): <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {PRESET_REASONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setReason(p)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      reason === p
                        ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-200 font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="Misal: Penyesuaian harga distributor semen Tiga Roda per sak"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No. Referensi / Nota (Opsional):
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Misal: FAKTUR-SUPP-2026/04/001"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Action to Trigger Preview */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleFetchPreview}
              disabled={isLoadingPreview}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 transition-all shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{isLoadingPreview ? 'Menghitung Simulasi...' : 'Hitung Simulasi Dampak'}</span>
            </button>
          </div>

          {/* Preview Results Panel */}
          {previewResult && (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Hasil Simulasi Dampak Perubahan Harga
                  </span>
                </div>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                  {previewResult.total_units_affected} Satuan Terdampak
                </span>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Rata-rata Margin Sebelum
                  </span>
                  <span className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                    {previewResult.summary.avg_margin_before.toFixed(1).replace('.', ',')}%
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Rata-rata Margin Sesudah
                  </span>
                  <span
                    className={`text-sm font-black ${
                      previewResult.summary.avg_margin_after < previewResult.summary.avg_margin_before
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {previewResult.summary.avg_margin_after.toFixed(1).replace('.', ',')}%
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Potensi Jual Rugi
                  </span>
                  <span
                    className={`text-sm font-black ${
                      previewResult.summary.potential_losses_count > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {previewResult.summary.potential_losses_count} Satuan
                  </span>
                </div>
              </div>

              {previewResult.summary.potential_losses_count > 0 && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Peringatan: Potensi Kerugian Terdeteksi!</strong>
                    <span>
                      Terdapat {previewResult.summary.potential_losses_count} produk yang harga jualnya
                      menjadi lebih rendah atau sama dengan harga modal. Harap periksa sebelum menerapkan!
                    </span>
                  </div>
                </div>
              )}

              {/* Sample Table */}
              <div className="overflow-x-auto max-h-56 rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 font-bold text-[11px] text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">Produk & Varian</th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">Satuan</th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">Harga Jual</th>
                      {canViewBuyPrice && (
                        <th className="p-2 border-b border-slate-200 dark:border-slate-700">Gross Margin</th>
                      )}
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {previewResult.items.slice(0, 30).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2">
                          <span className="font-semibold text-slate-900 dark:text-white block">
                            {item.product_name}
                          </span>
                          <span className="text-[10px] text-slate-400">{item.variant_name}</span>
                        </td>
                        <td className="p-2 font-medium">{item.unit_name}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1 font-mono">
                            <span className="line-through text-slate-400 text-[11px]">
                              {formatIdNumber(item.current_sell_price, false)}
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              → {formatIdNumber(item.next_sell_price, false)}
                            </span>
                          </div>
                        </td>
                        {canViewBuyPrice && (
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400 text-[11px]">
                                {item.current_margin !== null
                                  ? `${item.current_margin.toFixed(1).replace('.', ',')}%`
                                  : '-'}
                              </span>
                              <span
                                className={`font-bold ${
                                  item.next_margin !== null && item.next_margin <= 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                →{' '}
                                {item.next_margin !== null
                                  ? `${item.next_margin.toFixed(1).replace('.', ',')}%`
                                  : '-'}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="p-2">
                          {item.warning ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {item.warning}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewResult.items.length > 30 && (
                <p className="text-[10px] text-slate-400 text-center italic">
                  Menampilkan 30 dari total {previewResult.total_units_affected} satuan terdampak.
                </p>
              )}

              {/* Commit Confirmation Checkbox */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confirmCommitCheckbox"
                  checked={confirmedCommit}
                  onChange={(e) => setConfirmedCommit(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="confirmCommitCheckbox"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Saya telah memeriksa simulasi dampak harga di atas dan menyetujui perubahan ini.
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isCommitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting || !previewResult || !confirmedCommit}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isCommitting
                  ? 'Menerapkan Perubahan...'
                  : `Terapkan Perubahan (${previewResult ? previewResult.total_units_affected : 0} Satuan)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
