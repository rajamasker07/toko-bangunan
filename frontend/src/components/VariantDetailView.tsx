import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Product,
  ProductVariant,
  StockMovement,
  VariantUnit,
  VariantPriceAnalytics,
  PriceHistoryEntry,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatStock, formatDate } from '../utils/format';
import { Pagination } from './common/Pagination';
import { EditUnitModal } from './EditUnitModal';
import { PriceTrendChart } from './common/PriceTrendChart';
import { formatIdNumber } from './common/NumericInput';
import { 
  ArrowLeft, 
  Layers, 
  Tag, 
  SlidersHorizontal, 
  History, 
  AlertTriangle, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw,
  Plus,
  Trash2,
  Calendar,
  User,
  Barcode,
  Edit2,
  Power,
  ArrowRightLeft,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from 'lucide-react';

interface VariantDetailViewProps {
  product: Product;
  variant: ProductVariant;
  onBackToProduct: () => void;
  onBackToCatalog: () => void;
  onOpenAdjust: (variantId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onEditVariant?: (variant: ProductVariant) => void;
  onToggleVariantStatus?: (variantId: string) => void;
  onMoveVariant?: (variant: ProductVariant) => void;
  onPromoteVariant?: (variant: ProductVariant) => void;
  onRefresh?: () => void;
}

export const VariantDetailView: React.FC<VariantDetailViewProps> = ({
  product,
  variant,
  onBackToProduct,
  onBackToCatalog,
  onOpenAdjust,
  showToast,
  onEditVariant,
  onToggleVariantStatus,
  onMoveVariant,
  onPromoteVariant,
  onRefresh,
}) => {
  const { can } = useAuth();
  const canUpdateVariant = can('products:update');
  const canAdjustStock = can('stock:adjust');
  const canWritePricing = can('pricing:write');
  const canViewBuyPrice = can('products:view_buy_price');
  const canViewPricingAnalytics = can('pricing:analytics');

  // Sub-tab selection: 'pricing' | 'movements'
  const [activeSubTab, setActiveSubTab] = useState<'pricing' | 'movements'>(
    canViewPricingAnalytics ? 'pricing' : 'movements'
  );

  // Price analytics state
  const [priceAnalytics, setPriceAnalytics] = useState<VariantPriceAnalytics | null>(null);
  const [priceHistoryList, setPriceHistoryList] = useState<PriceHistoryEntry[]>([]);
  const [loadingPriceAnalytics, setLoadingPriceAnalytics] = useState<boolean>(false);

  // Movements log state with paging
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [totalMovements, setTotalMovements] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [movementType, setMovementType] = useState<string>('ALL');
  const [loadingMovements, setLoadingMovements] = useState<boolean>(true);

  // Add Unit modal state
  const [isAddUnitOpen, setIsAddUnitOpen] = useState<boolean>(false);
  const [newUnitName, setNewUnitName] = useState<string>('Dus');
  const [newConversion, setNewConversion] = useState<number>(10);
  const [newSellPrice, setNewSellPrice] = useState<number>(0);
  const [newBuyPrice, setNewBuyPrice] = useState<number>(0);
  const [newWholesalePrice, setNewWholesalePrice] = useState<string>('');
  const [isSubmittingUnit, setIsSubmittingUnit] = useState<boolean>(false);

  // Edit Unit modal state
  const [editingUnit, setEditingUnit] = useState<VariantUnit | null>(null);
  const [isEditUnitOpen, setIsEditUnitOpen] = useState<boolean>(false);

  // Determine base unit name for default chart filtering
  const baseUnitName = useMemo(() => {
    const analyticsUnits = priceAnalytics?.units_summary || [];
    const baseFromAnalytics = analyticsUnits.find((u) => u.is_base_unit) || analyticsUnits[0];
    if (baseFromAnalytics?.unit_name) return baseFromAnalytics.unit_name;

    const variantUnits = variant.units || [];
    const baseFromVariant = variantUnits.find((u) => u.is_base_unit) || variantUnits[0];
    return baseFromVariant?.unit_name;
  }, [priceAnalytics?.units_summary, variant.units]);

  // Fetch variant-specific movements with pagination
  const fetchVariantMovements = useCallback(async () => {
    try {
      setLoadingMovements(true);
      const offset = (currentPage - 1) * pageSize;
      const res = await api.getStockMovements({
        variantId: variant.id,
        type: movementType,
        limit: pageSize,
        offset: offset,
      });
      setMovements(res.items);
      setTotalMovements(res.total);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memuat log mutasi varian', 'error');
    } finally {
      setLoadingMovements(false);
    }
  }, [variant.id, currentPage, pageSize, movementType, showToast]);

  useEffect(() => {
    fetchVariantMovements();
  }, [fetchVariantMovements]);

  // Fetch variant-specific price analytics and history
  const fetchPriceAnalytics = useCallback(async () => {
    if (!canViewPricingAnalytics) return;
    try {
      setLoadingPriceAnalytics(true);
      const [analyticsData, historyData] = await Promise.all([
        api.getVariantPriceAnalytics(variant.id),
        api.getPriceHistory({ variant_id: variant.id, limit: 30 }),
      ]);
      setPriceAnalytics(analyticsData);
      setPriceHistoryList(historyData.entries);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingPriceAnalytics(false);
    }
  }, [variant.id, canViewPricingAnalytics]);

  useEffect(() => {
    if (activeSubTab === 'pricing') {
      fetchPriceAnalytics();
    }
  }, [activeSubTab, fetchPriceAnalytics]);

  // Handle Add Unit Price
  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) {
      showToast('Nama satuan wajib diisi', 'error');
      return;
    }
    if (newSellPrice <= 0) {
      showToast('Harga jual harus lebih dari 0', 'error');
      return;
    }

    try {
      setIsSubmittingUnit(true);
      await api.addUnit(variant.id, {
        unit_name: newUnitName.trim(),
        conversion_factor: Number(newConversion) || 1,
        is_base_unit: false,
        buy_price: Number(newBuyPrice) || 0,
        sell_price: Number(newSellPrice),
        wholesale_price: newWholesalePrice ? Number(newWholesalePrice) : null,
      });

      showToast(`Satuan "${newUnitName}" berhasil ditambahkan ke varian`, 'success');
      setIsAddUnitOpen(false);
      setNewUnitName('');
      setNewConversion(1);
      setNewSellPrice(0);
      setNewBuyPrice(0);
      setNewWholesalePrice('');

      // Refresh product data
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan satuan harga', 'error');
    } finally {
      setIsSubmittingUnit(false);
    }
  };

  const handleDeleteUnit = async (unitId: string, unitName: string) => {
    if (!confirm(`Hapus satuan harga "${unitName}" dari varian ini?`)) return;
    try {
      await api.deleteUnit(unitId);
      showToast(`Satuan "${unitName}" berhasil dihapus`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus satuan', 'error');
    }
  };

  const isLow = Number(variant.current_stock) <= Number(variant.min_stock);
  const isOut = Number(variant.current_stock) <= 0;

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'INITIAL_STOCK':
        return <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">Stok Awal</span>;
      case 'STOCK_OPNAME':
        return <span className="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold">Opname Fisik</span>;
      case 'PURCHASE_RESTOCK':
        return <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold">Barang Masuk</span>;
      case 'DAMAGED_EXPIRED':
        return <span className="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold">Rusak / Pecah</span>;
      case 'SALE_DEDUCT':
        return <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">Penjualan</span>;
      case 'RETURN_IN':
        return <span className="bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 px-2 py-0.5 rounded text-[10px] font-bold">Retur Masuk</span>;
      case 'RETURN_OUT':
        return <span className="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400 px-2 py-0.5 rounded text-[10px] font-bold">Retur Keluar</span>;
      case 'VARIANT_MOVED':
        return <span className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400 px-2 py-0.5 rounded text-[10px] font-bold">Pindah Produk</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">{type}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Breadcrumb Navigation Flow */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
        <button
          onClick={onBackToCatalog}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors"
        >
          Katalog Produk
        </button>
        <span>/</span>
        <button
          onClick={onBackToProduct}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors max-w-[200px] truncate"
          title={product.name}
        >
          {product.name}
        </button>
        <span>/</span>
        <span className="font-bold text-slate-900 dark:text-white max-w-[250px] truncate">
          Varian: {variant.variant_name}
        </span>
      </nav>

      {/* Header Card for Variant */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onBackToProduct}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Kembali ke Detail Produk"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {variant.is_active === false ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Status Varian: Sudah Tidak Dijual
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-900/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Status Varian: Masih Dijual
                  </span>
                )}
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {product.name}
                </span>
                {isOut ? (
                  <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    Stok Habis (0)
                  </span>
                ) : isLow ? (
                  <span className="text-xs font-bold text-amber-600 bg-amber-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Stok Menipis
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Stok Aman
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Layers className="w-6 h-6 text-amber-500 shrink-0" />
                <span>{variant.variant_name}</span>
              </h1>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                  SKU: {variant.sku}
                </span>
                {variant.barcode && (
                  <span className="flex items-center gap-1 font-mono">
                    <Barcode className="w-3.5 h-3.5" /> {variant.barcode}
                  </span>
                )}
                <span>• ID Varian: <code className="font-mono">{variant.id.slice(0, 10)}...</code></span>
              </div>

              {/* Dynamic Variant Attributes Badges */}
              {variant.attributes && Object.keys(variant.attributes).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-amber-500" />
                    Atribut Varian:
                  </span>
                  {Object.entries(variant.attributes).map(([attrKey, attrVal]) => (
                    <span
                      key={attrKey}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60"
                    >
                      <span className="text-slate-500 dark:text-slate-400 font-normal">{attrKey}:</span>
                      <span>{attrVal}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-right min-w-[150px] shrink-0 self-start lg:self-center shadow-sm">
            <span className="text-[11px] text-slate-400 block font-medium">Stok Fisik Saat Ini</span>
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {formatStock(variant.current_stock)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Batas Min: {formatStock(variant.min_stock)}
            </span>
          </div>
        </div>

        {/* Dedicated Action Toolbar */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Status & Restructure Tools */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {canUpdateVariant && (
              <button
                type="button"
                onClick={async () => {
                  if (onToggleVariantStatus) {
                    onToggleVariantStatus(variant.id);
                  } else {
                    try {
                      const res = await api.toggleVariantStatus(variant.id);
                      showToast(res.message || 'Status varian berhasil diubah', 'success');
                      if (onRefresh) onRefresh();
                    } catch (err: any) {
                      showToast(err.message || 'Gagal mengubah status varian', 'error');
                    }
                  }
                }}
                className={`group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  variant.is_active !== false
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                    : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300'
                }`}
                title={
                  variant.is_active !== false
                    ? 'Status: Masih Dijual. Klik untuk menghentikan penjualan varian ini.'
                    : 'Status: Tidak Dijual. Klik untuk mulai menjual varian ini kembali.'
                }
              >
                <Power className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                <span>
                  {variant.is_active !== false ? (
                    <>
                      <span className="group-hover:hidden">Status: Masih Dijual</span>
                      <span className="hidden group-hover:inline font-bold">Hentikan Penjualan</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:hidden">Status: Tidak Dijual</span>
                      <span className="hidden group-hover:inline font-bold">Jual Kembali</span>
                    </>
                  )}
                </span>
              </button>
            )}

            {canUpdateVariant && onMoveVariant && (
              <button
                type="button"
                onClick={() => onMoveVariant(variant)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-colors"
                title="Pindahkan varian ini ke produk lain"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Pindah Produk</span>
              </button>
            )}

            {can('products:create') && onPromoteVariant && (
              <button
                type="button"
                onClick={() => onPromoteVariant(variant)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 transition-colors"
                title="Pisahkan varian ini menjadi produk mandiri baru"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Jadikan Produk Mandiri</span>
              </button>
            )}
          </div>

          {/* Right: Core CTAs */}
          <div className="flex items-center gap-2.5 flex-wrap sm:justify-end">
            {canUpdateVariant && onEditVariant && (
              <button
                type="button"
                onClick={() => onEditVariant(variant)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
                title="Edit Data Varian"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Edit Varian</span>
              </button>
            )}

            {canAdjustStock && (
              <button
                type="button"
                onClick={() => onOpenAdjust(variant.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-600/20 transition-all"
                title="Penyesuaian Stok Fisik Varian"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Penyesuaian Stok</span>
              </button>
            )}
          </div>
        </div>

        {/* Warning banner if Parent Product is Inactive */}
        {product.is_active === false && (
          <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Perhatian: Produk Induk ({product.name}) Sedang Tidak Dijual.</strong>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                Meskipun status varian ini aktif, produk induk harus diaktifkan kembali agar varian ini dapat muncul pada transaksi kasir.
              </p>
            </div>
          </div>
        )}

        {/* Warning banner if Variant is Inactive */}
        {variant.is_active === false && (
          <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Varian ini Berstatus Sudah Tidak Dijual (Nonaktif).</strong>
              <p className="mt-0.5 text-rose-700 dark:text-rose-400">
                Varian ini tidak akan muncul pada menu kasir atau transaksi penjualan baru.
                Klik tombol "Jual Kembali Varian" jika ingin mengaktifkannya kembali.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Section: Multi-Satuan Harga (Satuan Bertingkat) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-500" />
              <span>Pilihan Satuan Harga (Multi-Satuan)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Harga eceran, grosir/kontraktor, dan faktor konversi satuan terhadap stok dasar
            </p>
          </div>

          {canWritePricing && (
            <button
              onClick={() => setIsAddUnitOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Satuan Baru</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {variant.units?.map((u) => (
            <div
              key={u.id}
              className={`p-4 rounded-xl border text-xs transition-all ${
                u.is_base_unit
                  ? 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-500/10'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  {u.unit_name}
                </span>
                <div className="flex items-center gap-1.5">
                  {u.is_base_unit ? (
                    <span className="text-[10px] font-extrabold uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      Satuan Dasar
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400">
                      1 {u.unit_name} = {formatStock(u.conversion_factor)} unit dasar
                    </span>
                  )}
                  {canWritePricing && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUnit(u);
                          setIsEditUnitOpen(true);
                        }}
                        className="p-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors ml-1"
                        title="Edit Satuan & Harga"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!u.is_base_unit && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUnit(u.id, u.unit_name)}
                          className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Hapus Satuan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Harga Jual:</span>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {formatRupiah(u.sell_price)}
                  </span>
                </div>
                {canViewBuyPrice && u.buy_price != null && Number(u.buy_price) > 0 && (
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Harga Modal:</span>
                    <span>{formatRupiah(u.buy_price)}</span>
                  </div>
                )}
                {u.wholesale_price && Number(u.wholesale_price) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                    <span>Harga Grosir:</span>
                    <span>{formatRupiah(u.wholesale_price)}</span>
                  </div>
                )}
                {canViewBuyPrice && (
                  <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-medium">Gross Margin:</span>
                    {(() => {
                      const sell = Number(u.sell_price) || 0;
                      const buy = Number(u.buy_price) || 0;
                      if (sell <= 0) return <span className="text-slate-400">-</span>;
                      const margin = ((sell - buy) / sell) * 100;
                      return (
                        <span
                          className={`font-black px-1.5 py-0.5 rounded-md text-[10px] ${
                            margin <= 0
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                              : margin < 10
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {margin.toFixed(1).replace('.', ',')}%
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Tabs: Analitik & Riwayat Harga VS Log Mutasi Stok */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        {canViewPricingAnalytics && (
          <button
            type="button"
            onClick={() => setActiveSubTab('pricing')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeSubTab === 'pricing'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Analitik & Riwayat Harga</span>
            {priceAnalytics && priceAnalytics.total_changes > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {priceAnalytics.total_changes}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveSubTab('movements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeSubTab === 'movements'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Log Riwayat Mutasi Stok</span>
          {totalMovements > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {totalMovements}
            </span>
          )}
        </button>
      </div>

      {/* Sub-Tab 1: Analitik & Riwayat Harga Varian */}
      {activeSubTab === 'pricing' && canViewPricingAnalytics && (
        <div className="space-y-6">
          {/* SVG Price Trend Chart (Default: Satuan Dasar & 90 Hari) */}
          <PriceTrendChart
            data={priceAnalytics?.time_series || []}
            canViewBuyPrice={canViewBuyPrice}
            defaultUnit={baseUnitName}
            baseUnitName={baseUnitName}
            defaultRange="90d"
            height={280}
            title={`Tren Riwayat Harga Varian: ${variant.variant_name}`}
          />

          {/* Unit Price Performance Cards */}
          {priceAnalytics && priceAnalytics.units_summary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {priceAnalytics.units_summary.map((summary) => (
                <div
                  key={summary.unit_id}
                  className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Satuan: {summary.unit_name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {summary.history_count}x penyesuaian
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Jual Terendah</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        Rp {formatIdNumber(summary.min_sell_price, false)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Jual Tertinggi</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        Rp {formatIdNumber(summary.max_sell_price, false)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400">Rata-rata Jual:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      Rp {formatIdNumber(Math.round(summary.avg_sell_price), false)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price History Table for This Variant */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-500" />
                <span>Riwayat Audit Perubahan Harga Varian Ini</span>
              </h3>
              <button
                type="button"
                onClick={fetchPriceAnalytics}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPriceAnalytics ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingPriceAnalytics ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                <span>Memuat riwayat harga...</span>
              </div>
            ) : priceHistoryList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada riwayat perubahan harga untuk varian ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="p-3">Waktu</th>
                      <th className="p-3">Satuan</th>
                      <th className="p-3">Harga Jual</th>
                      {canViewBuyPrice && <th className="p-3">Harga Modal</th>}
                      {canViewBuyPrice && <th className="p-3">Gross Margin</th>}
                      <th className="p-3">Alasan / Referensi</th>
                      <th className="p-3">Sumber & Pengubah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {priceHistoryList.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 whitespace-nowrap text-[11px] text-slate-500">
                          {new Date(row.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="p-3 font-semibold">{row.unit_name}</td>

                        <td className="p-3 font-mono">
                          <div className="flex items-center gap-1">
                            {row.old_sell_price ? (
                              <span className="line-through text-slate-400 text-[11px]">
                                {formatIdNumber(row.old_sell_price, false)}
                              </span>
                            ) : null}
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatIdNumber(row.new_sell_price, false)}
                            </span>
                          </div>
                          {row.sell_price_diff !== 0 && (
                            <div className="text-[10px]">
                              {row.sell_price_diff > 0 ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  +{formatIdNumber(row.sell_price_diff, false)} (+
                                  {row.sell_price_percent_change.toFixed(1).replace('.', ',')}%)
                                </span>
                              ) : (
                                <span className="font-semibold text-rose-600 dark:text-rose-400">
                                  -{formatIdNumber(Math.abs(row.sell_price_diff), false)} (
                                  {row.sell_price_percent_change.toFixed(1).replace('.', ',')}%)
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {canViewBuyPrice && (
                          <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                            {row.new_buy_price !== null ? (
                              <div>
                                <div className="flex items-center gap-1">
                                  {row.old_buy_price !== null && (
                                    <span className="line-through text-slate-400 text-[11px]">
                                      {formatIdNumber(row.old_buy_price, false)}
                                    </span>
                                  )}
                                  <span className="font-semibold">
                                    {formatIdNumber(row.new_buy_price, false)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        )}

                        {canViewBuyPrice && (
                          <td className="p-3">
                            {typeof row.gross_margin_after === 'number' ? (
                              <div className="flex items-center gap-1">
                                {typeof row.gross_margin_before === 'number' && (
                                  <span className="text-slate-400 text-[10px]">
                                    {row.gross_margin_before.toFixed(1).replace('.', ',')}% →
                                  </span>
                                )}
                                <span
                                  className={`font-black ${
                                    row.gross_margin_after <= 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {row.gross_margin_after.toFixed(1).replace('.', ',')}%
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        )}

                        <td className="p-3">
                          <div className="text-slate-800 dark:text-slate-200">
                            {row.reason || '-'}
                          </div>
                          {row.reference_no && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono block">
                              Ref: {row.reference_no}
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 inline-block mb-0.5">
                            {row.change_source}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {row.created_by || 'Sistem'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Riwayat Log Mutasi Stok Varian (DENGAN PAGINATION) */}
      {activeSubTab === 'movements' && (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-500" />
              <span>Log Riwayat Mutasi Stok Varian</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit lengkap transaksi masuk, keluar, dan penyesuaian fisik opname khusus varian ini
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Filter Type */}
            <select
              value={movementType}
              onChange={(e) => {
                setMovementType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">Semua Tipe Mutasi</option>
              <option value="STOCK_OPNAME">Opname Fisik</option>
              <option value="PURCHASE_RESTOCK">Barang Masuk / Pembelian</option>
              <option value="DAMAGED_EXPIRED">Barang Rusak / Pecah</option>
              <option value="SALE_DEDUCT">Penjualan</option>
              <option value="INITIAL_STOCK">Stok Awal</option>
            </select>

            <button
              onClick={fetchVariantMovements}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Muat Ulang Log"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMovements ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table of Movements */}
        {loadingMovements ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <div className="w-7 h-7 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Memuat riwayat log mutasi varian...
          </div>
        ) : movements.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada riwayat mutasi stok untuk varian ini pada filter yang dipilih.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Tipe Mutasi</th>
                    <th className="py-3 px-4 text-center">Stok Sebelum</th>
                    <th className="py-3 px-4 text-center">Perubahan (+/-)</th>
                    <th className="py-3 px-4 text-center">Stok Sesudah</th>
                    <th className="py-3 px-4">Referensi & Alasan</th>
                    <th className="py-3 px-4">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.map((m) => {
                    const change = Number(m.quantity_change);
                    const isPositive = change > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {formatDate(m.created_at)}
                          </div>
                          <span className="font-mono text-[9px] text-slate-400">
                            ID: {m.id.slice(0, 10)}...
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {getMovementBadge(m.movement_type)}
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-500">
                          {formatStock(m.previous_stock)}
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full ${
                              change === 0
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                : isPositive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {change === 0 ? (
                              '0'
                            ) : isPositive ? (
                              <>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                +{formatStock(change)}
                              </>
                            ) : (
                              <>
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                {formatStock(change)}
                              </>
                            )}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-extrabold text-slate-900 dark:text-white">
                          {formatStock(m.current_stock)}
                        </td>

                        <td className="py-3 px-4 max-w-[200px]">
                          {m.reference_no && (
                            <span className="block font-mono text-[10px] text-slate-400 mb-0.5">
                              Ref: {m.reference_no}
                            </span>
                          )}
                          <p className="text-slate-700 dark:text-slate-300 text-xs truncate" title={m.notes || ''}>
                            {m.notes || '-'}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <span
                            className="flex items-center gap-1 text-[11px]"
                            title={
                              m.created_by_username
                                ? `@${m.created_by_username}`
                                : undefined
                            }
                          >
                            <User className="w-3 h-3 text-slate-400" />
                            {m.created_by || 'Sistem'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination for Variant Movements */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalMovements}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20, 50]}
            />
          </div>
        )}
      </div>
      )}

      {/* Add Unit Modal */}
      {isAddUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tambah Satuan Harga untuk Varian
            </h3>
            <p className="text-xs text-slate-500">
              Tambahkan satuan eceran atau grosir untuk varian <strong className="text-slate-800 dark:text-slate-200">{variant.variant_name}</strong>
            </p>

            <form onSubmit={handleAddUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Satuan:
                </label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="Misal: Dus, Truk, Ikat, Kg..."
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Faktor Konversi (Berisi berapa unit dasar):
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={newConversion}
                  onChange={(e) => setNewConversion(Number(e.target.value))}
                  placeholder="Misal: 1 Truk = 200 Sak, isi 200"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className={canViewBuyPrice ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Jual Standar:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold"
                  />
                </div>

                {canViewBuyPrice && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Harga Modal / Beli:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newBuyPrice}
                      onChange={(e) => setNewBuyPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Harga Grosir / Tukang (Opsional):
                </label>
                <input
                  type="number"
                  min="0"
                  value={newWholesalePrice}
                  onChange={(e) => setNewWholesalePrice(e.target.value)}
                  placeholder="Kosongkan jika tidak ada"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddUnitOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUnit}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
                >
                  {isSubmittingUnit ? 'Menyimpan...' : 'Simpan Satuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Unit Modal */}
      <EditUnitModal
        isOpen={isEditUnitOpen}
        onClose={() => {
          setIsEditUnitOpen(false);
          setEditingUnit(null);
        }}
        unit={editingUnit}
        variantName={variant.variant_name}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
        showToast={showToast}
      />
    </div>
  );
};
