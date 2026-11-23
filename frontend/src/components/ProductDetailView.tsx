import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, ProductVariant, ProductPriceAnalytics } from '../types';
import { api } from '../services/api';
import { formatRupiah, formatStock } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { Pagination } from './common/Pagination';
import { MarginTrendChart } from './common/MarginTrendChart';
import { BulkPriceUpdateModal } from './BulkPriceUpdateModal';
import { formatIdNumber } from './common/NumericInput';
import { 
  ArrowLeft, 
  Package, 
  Layers, 
  Tag, 
  SlidersHorizontal, 
  AlertTriangle, 
  ShieldCheck, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Barcode, 
  Building2, 
  Folder,
  Edit2,
  Truck,
  Power,
  ArrowRightLeft,
  GitMerge,
  FolderInput,
  CheckSquare,
  Square,
  Search,
  Grid,
  List,
  RotateCcw,
  Filter,
  Check,
  X,
  Sparkles,
  Wand2,
  BookmarkPlus,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface ProductDetailViewProps {
  product: Product;
  onBackToCatalog: () => void;
  onSelectVariant: (variant: ProductVariant) => void;
  onOpenAdjust: (variantId: string) => void;
  onAddVariant: (productId: string) => void;
  onDeleteProduct: (id: string, name: string) => void;
  onEditProduct?: (product: Product) => void;
  onEditVariant?: (variant: ProductVariant) => void;
  onToggleProductStatus?: (product: Product) => void;
  onToggleVariantStatus?: (variantId: string) => void;
  onMergeProduct?: (product: Product) => void;
  onAbsorbProducts?: (targetProduct: Product) => void;
  onMoveVariants?: (variants: ProductVariant[]) => void;
  onRefresh?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  onBackToCatalog,
  onSelectVariant,
  onOpenAdjust,
  onAddVariant,
  onDeleteProduct,
  onEditProduct,
  onEditVariant,
  onToggleProductStatus,
  onToggleVariantStatus,
  onMergeProduct,
  onAbsorbProducts,
  onMoveVariants,
  onRefresh,
  showToast,
}) => {
  const { can } = useAuth();
  const canCreate = can('products:create');
  const canUpdate = can('products:update');
  const canDelete = can('products:delete');
  const canAdjust = can('stock:adjust');
  const canViewBuyPrice = can('products:view_buy_price');
  const canViewPricingAnalytics = can('pricing:analytics');
  const canWritePricing = can('pricing:write');

  // Multi-selection for variants
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);

  // Search & Faceted Filter states
  const [variantSearch, setVariantSearch] = useState<string>('');
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  // View Mode: 'list' (default) vs 'matrix' (2D Grid) vs 'analytics'
  const [viewMode, setViewMode] = useState<'list' | 'matrix' | 'analytics'>('list');

  // Product price analytics state
  const [priceAnalytics, setPriceAnalytics] = useState<ProductPriceAnalytics | null>(null);
  const [loadingPriceAnalytics, setLoadingPriceAnalytics] = useState<boolean>(false);
  const [isBulkPricingModalOpen, setIsBulkPricingModalOpen] = useState<boolean>(false);

  const fetchPriceAnalytics = useCallback(async () => {
    if (!canViewPricingAnalytics) return;
    try {
      setLoadingPriceAnalytics(true);
      const data = await api.getProductPriceAnalytics(product.id);
      setPriceAnalytics(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingPriceAnalytics(false);
    }
  }, [product.id, canViewPricingAnalytics]);

  useEffect(() => {
    if (viewMode === 'analytics') {
      fetchPriceAnalytics();
    }
  }, [viewMode, fetchPriceAnalytics]);

  // Auto-Extract Attributes Modal state (Tahap 2)
  const [isExtractModalOpen, setIsExtractModalOpen] = useState<boolean>(false);
  const [extractDelimiter, setExtractDelimiter] = useState<string>('-');
  const [customDelimiter, setCustomDelimiter] = useState<string>('');
  const [segmentMappings, setSegmentMappings] = useState<string[]>(['Kemasan', 'Warna']);
  const [isExtractSubmitting, setIsExtractSubmitting] = useState<boolean>(false);

  // Bulk Tag Modal state (Tahap 2)
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState<boolean>(false);
  const [bulkTagKey, setBulkTagKey] = useState<string>('');
  const [bulkTagValue, setBulkTagValue] = useState<string>('');
  const [isBulkTagSubmitting, setIsBulkTagSubmitting] = useState<boolean>(false);

  // Pagination for variants list
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const rawVariants = useMemo(() => product.variants || [], [product.variants]);

  // Compute all available attribute keys dynamically from product.variant_options and variants' attributes
  const allAttributeKeys = useMemo(() => {
    const keys = new Set<string>(product.variant_options || []);
    rawVariants.forEach((v) => {
      if (v.attributes && typeof v.attributes === 'object') {
        Object.keys(v.attributes).forEach((k) => {
          if (k.trim()) keys.add(k.trim());
        });
      }
    });
    return Array.from(keys);
  }, [product.variant_options, rawVariants]);

  // Compute unique values for each attribute key along with match counts
  const attributeValuesMap = useMemo(() => {
    const map: Record<string, { value: string; count: number }[]> = {};
    allAttributeKeys.forEach((key) => {
      const counts: Record<string, number> = {};
      rawVariants.forEach((v) => {
        const val = v.attributes?.[key];
        if (val && typeof val === 'string' && val.trim()) {
          const trimmed = val.trim();
          counts[trimmed] = (counts[trimmed] || 0) + 1;
        }
      });
      map[key] = Object.entries(counts).map(([value, count]) => ({ value, count }));
    });
    return map;
  }, [allAttributeKeys, rawVariants]);

  // Matrix axes selection (defaults to first two attribute keys if available)
  const [matrixRowAttr, setMatrixRowAttr] = useState<string>(allAttributeKeys[0] || '');
  const [matrixColAttr, setMatrixColAttr] = useState<string>(allAttributeKeys[1] || allAttributeKeys[0] || '');

  // Keep matrix axes synced when attribute keys change
  React.useEffect(() => {
    if (allAttributeKeys.length > 0) {
      if (!allAttributeKeys.includes(matrixRowAttr)) {
        setMatrixRowAttr(allAttributeKeys[0]);
      }
      if (!allAttributeKeys.includes(matrixColAttr)) {
        setMatrixColAttr(allAttributeKeys[1] || allAttributeKeys[0]);
      }
    }
  }, [allAttributeKeys, matrixRowAttr, matrixColAttr]);

  // Toggle filter chip for an attribute
  const handleToggleAttributeFilter = (key: string, value: string) => {
    setSelectedAttributes((prev) => {
      const copy = { ...prev };
      if (copy[key] === value) {
        delete copy[key];
      } else {
        copy[key] = value;
      }
      return copy;
    });
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setVariantSearch('');
    setSelectedAttributes({});
    setCurrentPage(1);
  };

  const isFilteringActive = variantSearch.trim() !== '' || Object.keys(selectedAttributes).length > 0;

  // Filtered variants based on search text and selected attribute facets
  const filteredVariants = useMemo(() => {
    return rawVariants.filter((v) => {
      // 1. Text Search across name, SKU, barcode, and attribute values
      if (variantSearch.trim()) {
        const q = variantSearch.toLowerCase().trim();
        const matchesName = (v.variant_name || '').toLowerCase().includes(q);
        const matchesSku = (v.sku || '').toLowerCase().includes(q);
        const matchesBarcode = (v.barcode || '').toLowerCase().includes(q);
        const matchesAttrVal = v.attributes
          ? Object.values(v.attributes).some((val) =>
              String(val).toLowerCase().includes(q)
            )
          : false;

        if (!matchesName && !matchesSku && !matchesBarcode && !matchesAttrVal) {
          return false;
        }
      }

      // 2. Attribute Facet Filter
      for (const [filterKey, filterVal] of Object.entries(selectedAttributes)) {
        if (!v.attributes || v.attributes[filterKey] !== filterVal) {
          return false;
        }
      }

      return true;
    });
  }, [rawVariants, variantSearch, selectedAttributes]);

  const totalFilteredVariants = filteredVariants.length;
  const paginatedVariants = filteredVariants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSelectVariant = (id: string) => {
    setSelectedVariantIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedVariantIds.length === filteredVariants.length) {
      setSelectedVariantIds([]);
    } else {
      setSelectedVariantIds(filteredVariants.map((v) => v.id));
    }
  };

  // Helper active delimiter for auto-extract modal
  const activeDelimiter = extractDelimiter === 'custom' ? customDelimiter : extractDelimiter;

  // Compute maximum segments in variant names for auto-extract modal
  const maxSegmentsCount = useMemo(() => {
    if (!activeDelimiter) return 1;
    let maxCount = 1;
    rawVariants.forEach((v) => {
      const parts = v.variant_name.split(activeDelimiter);
      if (parts.length > maxCount) maxCount = parts.length;
    });
    return Math.min(maxCount, 5); // cap at 5
  }, [rawVariants, activeDelimiter]);

  // Sync segmentMappings length when maxSegmentsCount changes
  React.useEffect(() => {
    setSegmentMappings((prev) => {
      const next = [...prev];
      while (next.length < maxSegmentsCount) {
        next.push(allAttributeKeys[next.length] || `Atribut ${next.length + 1}`);
      }
      return next.slice(0, maxSegmentsCount);
    });
  }, [maxSegmentsCount, allAttributeKeys]);

  // Handle auto-extract submit
  const handleExecuteAutoExtract = async () => {
    if (!activeDelimiter) {
      if (showToast) showToast('Tentukan karakter pemisah terlebih dahulu', 'error');
      return;
    }

    const validMappings = segmentMappings.filter((m) => m && m.trim());
    if (validMappings.length === 0) {
      if (showToast) showToast('Petakan minimal 1 segmen ke nama atribut', 'error');
      return;
    }

    try {
      setIsExtractSubmitting(true);
      const updates = rawVariants.map((v) => {
        const parts = v.variant_name.split(activeDelimiter).map((s) => s.trim());
        const extractedAttrs: Record<string, string> = { ...(v.attributes || {}) };

        segmentMappings.forEach((attrName, idx) => {
          if (attrName && attrName.trim() && parts[idx]) {
            extractedAttrs[attrName.trim()] = parts[idx];
          }
        });

        return {
          variant_id: v.id,
          attributes: extractedAttrs,
        };
      });

      // Combine with existing product options
      const combinedOptions = Array.from(
        new Set([...(product.variant_options || []), ...validMappings.map((m) => m.trim())])
      );

      const res = await api.bulkUpdateVariantAttributes(product.id, {
        updates,
        variant_options: combinedOptions,
      });

      if (showToast) {
        showToast(res.message || `Berhasil mengekstrak atribut untuk ${updates.length} varian!`, 'success');
      }
      setIsExtractModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(err.message || 'Gagal mengekstrak atribut varian', 'error');
    } finally {
      setIsExtractSubmitting(false);
    }
  };

  // Handle bulk tag submit on selected variants
  const handleExecuteBulkTag = async () => {
    const trimmedKey = bulkTagKey.trim();
    const trimmedVal = bulkTagValue.trim();

    if (!trimmedKey) {
      if (showToast) showToast('Nama atribut wajib diisi', 'error');
      return;
    }
    if (!trimmedVal) {
      if (showToast) showToast('Nilai atribut wajib diisi', 'error');
      return;
    }

    try {
      setIsBulkTagSubmitting(true);
      const updates = selectedVariantIds.map((vId) => {
        const v = rawVariants.find((x) => x.id === vId);
        return {
          variant_id: vId,
          attributes: {
            ...(v?.attributes || {}),
            [trimmedKey]: trimmedVal,
          },
        };
      });

      const combinedOptions = Array.from(
        new Set([...(product.variant_options || []), trimmedKey])
      );

      const res = await api.bulkUpdateVariantAttributes(product.id, {
        updates,
        variant_options: combinedOptions,
      });

      if (showToast) {
        showToast(res.message || `Atribut berhasil diterapkan ke ${updates.length} varian`, 'success');
      }
      setIsBulkTagModalOpen(false);
      setSelectedVariantIds([]);
      setBulkTagKey('');
      setBulkTagValue('');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(err.message || 'Gagal menerapkan atribut massal', 'error');
    } finally {
      setIsBulkTagSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <button
          onClick={onBackToCatalog}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors"
        >
          Katalog Produk
        </button>
        <span>/</span>
        <span className="font-bold text-slate-900 dark:text-white max-w-[300px] truncate">
          {product.name}
        </span>
      </nav>

      {/* Product Master Info Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onBackToCatalog}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Kembali ke Daftar Produk"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {product.is_active === false ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Status Produk: Sudah Tidak Dijual
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-900/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Status Produk: Masih Dijual
                  </span>
                )}
                {product.category_name && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Folder className="w-3 h-3 text-amber-500" />
                    {product.category_name}
                  </span>
                )}
                {product.brand && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Building2 className="w-3 h-3" />
                    {product.brand}
                  </span>
                )}
                {product.supplier_name && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Truck className="w-3 h-3" />
                    {product.supplier_name}
                  </span>
                )}
                <span className="text-[11px] font-medium text-slate-400">
                  {product.has_variants ? 'Multi-Varian' : 'Varian Standar'}
                </span>
              </div>

              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {product.name}
              </h1>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                  SKU Master: {product.sku}
                </span>
                {product.barcode && (
                  <span className="flex items-center gap-1 font-mono">
                    <Barcode className="w-3.5 h-3.5" /> {product.barcode}
                  </span>
                )}
                <span>• ID: <code className="font-mono">{product.id.slice(0, 10)}...</code></span>

                {/* Display Defined Product Variant Options */}
                {allAttributeKeys.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-[11px] font-medium text-slate-400">Atribut Varian:</span>
                    {allAttributeKeys.map((key) => (
                      <span
                        key={key}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-right min-w-[150px] shrink-0 self-start lg:self-center shadow-sm">
            <span className="text-[11px] text-slate-400 block font-medium">Total Stok Seluruh Varian</span>
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {formatStock(product.total_stock)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Batas Min Alert: {formatStock(product.min_stock_alert)}
            </span>
          </div>
        </div>

        {/* Dedicated Action Toolbar */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Status & Restructure Utilities */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {canUpdate && onToggleProductStatus && (
              <button
                type="button"
                onClick={() => onToggleProductStatus(product)}
                className={`group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  product.is_active !== false
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                    : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300'
                }`}
                title={
                  product.is_active !== false
                    ? 'Status: Masih Dijual. Klik untuk menghentikan penjualan produk ini.'
                    : 'Status: Tidak Dijual. Klik untuk mulai menjual produk ini kembali.'
                }
              >
                <Power className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                <span>
                  {product.is_active !== false ? (
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

            {canUpdate && onMergeProduct && (
              <button
                type="button"
                onClick={() => onMergeProduct(product)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors"
                title="Pindahkan seluruh varian produk ini dan gabungkan ke produk lain"
              >
                <GitMerge className="w-3.5 h-3.5 text-indigo-500" />
                <span>Gabung ke Produk Lain</span>
              </button>
            )}

            {canUpdate && onAbsorbProducts && (
              <button
                type="button"
                onClick={() => onAbsorbProducts(product)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-purple-200 dark:border-purple-900/60 bg-purple-50/70 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-colors"
                title="Serap produk-produk lain ke dalam produk ini sebagai varian baru"
              >
                <FolderInput className="w-3.5 h-3.5 text-purple-500" />
                <span>Serap Produk Lain</span>
              </button>
            )}
          </div>

          {/* Right: Core CTAs & Deletion */}
          <div className="flex items-center gap-2.5 flex-wrap sm:justify-end">
            {canUpdate && onEditProduct && (
              <button
                type="button"
                onClick={() => onEditProduct(product)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
                title="Edit Informasi Master Produk"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Edit Produk</span>
              </button>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={() => onAddVariant(product.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-600/20 transition-all"
                title="Tambah Varian Baru untuk Produk ini"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Varian</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDeleteProduct(product.id, product.name)}
                className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                title="Hapus Produk"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Discontinued Status Banner */}
        {product.is_active === false && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Produk ini berstatus Sudah Tidak Dijual (Nonaktif).</strong>
              <p className="mt-0.5 text-rose-700 dark:text-rose-400">
                Produk dan seluruh variannya tidak akan muncul pada menu kasir dan transaksi penjualan baru.
                Klik tombol "Jual Kembali" di atas jika ingin mengaktifkan penjualan kembali sewaktu-waktu.
              </p>
            </div>
          </div>
        )}

        {/* Product Description */}
        {product.description && (
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <strong className="text-slate-700 dark:text-slate-300 block mb-1">Deskripsi & Spesifikasi Produk:</strong>
            <p className="leading-relaxed">{product.description}</p>
          </div>
        )}
      </div>

      {/* Section: List of Variants (DENGAN FILTER ATRIBUT DINAMIS & MODE MATRIKS 2D) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-500" />
                <span>Daftar Varian Produk</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold font-mono">
                  {filteredVariants.length} dari {rawVariants.length} varian
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilah varian cepat berdasarkan atribut dinamis atau beralih ke Mode Matriks 2D untuk membandingkan stok & harga
              </p>
            </div>

            {/* View Mode Switcher, Auto-Extract & Move Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Auto-Extract Attributes Button (Tahap 2) */}
              {canUpdate && rawVariants.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsExtractModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-800/60 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 transition-colors shadow-2xs"
                  title="Ekstrak atribut dinamis (Kemasan, Warna, dll) otomatis dari nama varian yang sudah ada"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Ekstrak Atribut Otomatis</span>
                </button>
              )}

              {/* Toggle View Mode: List vs Matrix vs Analytics */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tampilan Daftar Standar"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Daftar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'matrix'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tampilan Matriks 2D (Tabel Silang Atribut)"
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Matriks 2D</span>
                </button>
                {canViewPricingAnalytics && (
                  <button
                    type="button"
                    onClick={() => setViewMode('analytics')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'analytics'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Tampilan Analitik & Tren Riwayat Harga Varian"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Tren Harga</span>
                  </button>
                )}
              </div>

              {/* Bulk Price Update Button for this product */}
              {canWritePricing && rawVariants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBulkPricingModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-300 dark:border-emerald-800/60 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition-colors shadow-2xs"
                  title="Sesuaikan harga varian produk ini secara massal"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Update Harga Massal</span>
                </button>
              )}

              {/* Selection Actions (Move & Bulk Tag) */}
              {canUpdate && rawVariants.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedVariantIds.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                        {selectedVariantIds.length} Dipilih
                      </span>
                      {/* Bulk Tag Button (Tahap 2) */}
                      <button
                        type="button"
                        onClick={() => setIsBulkTagModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all"
                        title="Atur nilai atribut bersama untuk varian yang dicentang"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Atur Atribut ({selectedVariantIds.length})</span>
                      </button>

                      {onMoveVariants && (
                        <button
                          type="button"
                          onClick={() =>
                            onMoveVariants(rawVariants.filter((v) => selectedVariantIds.includes(v.id)))
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Pindahkan</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedVariantIds([])}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                      Pilih Semua
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search Bar & Dynamic Attribute Filter Bar */}
          <div className="pt-2 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Instant Variant Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={variantSearch}
                  onChange={(e) => {
                    setVariantSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Cari varian berdasarkan nama, SKU, barcode, atau atribut (cth: 1kg, black, 3m)..."
                  className="w-full pl-9.5 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                {variantSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setVariantSearch('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Reset All Filters Button */}
              {isFilteringActive && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 transition-colors shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            {/* Faceted Dynamic Attribute Filter Chips */}
            {allAttributeKeys.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                {allAttributeKeys.map((attrKey) => {
                  const values = attributeValuesMap[attrKey] || [];
                  if (values.length === 0) return null;
                  const currentSelected = selectedAttributes[attrKey];

                  return (
                    <div key={attrKey} className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 shrink-0 min-w-[70px]">
                        <Tag className="w-3 h-3 text-amber-500" />
                        {attrKey}:
                      </span>

                      {/* Pill "Semua" */}
                      <button
                        type="button"
                        onClick={() => {
                          if (currentSelected) {
                            handleToggleAttributeFilter(attrKey, currentSelected);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          !currentSelected
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        Semua
                      </button>

                      {/* Pill for each attribute value */}
                      {values.map(({ value, count }) => {
                        const isSelected = currentSelected === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleToggleAttributeFilter(attrKey, value)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                              isSelected
                                ? 'bg-amber-600 text-white font-bold shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 hover:border-amber-400 hover:text-amber-600'
                            }`}
                          >
                            <span>{value}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* VIEW MODE 1: STANDARD LIST VIEW */}
        {/* ========================================================= */}
        {viewMode === 'list' && (
          <div>
            {rawVariants.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada varian pada produk ini.
              </div>
            ) : filteredVariants.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <AlertTriangle className="w-8 h-8 text-amber-500/60 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Tidak ada varian yang cocok dengan kriteria filter atau pencarian Anda.
                </p>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="text-xs text-amber-600 hover:underline font-semibold"
                >
                  Hapus filter pencarian
                </button>
              </div>
            ) : (
              <div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedVariants.map((v) => {
                    const isLow = Number(v.current_stock) <= Number(v.min_stock);
                    const isOut = Number(v.current_stock) <= 0;

                    return (
                      <div
                        key={v.id}
                        className={`p-5 hover:bg-amber-500/[0.03] dark:hover:bg-slate-800/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group ${
                          v.is_active === false ? 'bg-rose-500/[0.02] dark:bg-rose-950/[0.05]' : ''
                        }`}
                        onClick={() => onSelectVariant(v)}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectVariant(v.id);
                              }}
                              className="mt-0.5 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                              title={selectedVariantIds.includes(v.id) ? 'Batalkan pilihan' : 'Pilih varian ini'}
                            >
                              {selectedVariantIds.includes(v.id) ? (
                                <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                              )}
                            </button>
                          )}

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {v.variant_name}
                              </span>
                              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                SKU: {v.sku}
                              </span>

                              {/* Variant Sale Status Pill */}
                              {v.is_active === false ? (
                                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-200 dark:border-rose-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Varian: Tidak Dijual
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Varian: Masih Dijual
                                </span>
                              )}

                              {isOut ? (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                  Habis (0)
                                </span>
                              ) : isLow ? (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Kritis
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" /> Aman
                                </span>
                              )}
                            </div>

                            {/* Dynamic Attribute Badges on Variant Card */}
                            {v.attributes && Object.keys(v.attributes).length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                {Object.entries(v.attributes).map(([attrKey, attrVal]) => (
                                  <span
                                    key={attrKey}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60"
                                  >
                                    <Tag className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                    <span className="text-slate-500 dark:text-slate-400 font-normal">{attrKey}:</span>
                                    <span>{attrVal}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Units Pills */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 pt-0.5">
                              <span>Pilihan Satuan:</span>
                              {v.units?.map((u) => (
                                <span
                                  key={u.id}
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    u.is_base_unit
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {u.unit_name}: {formatRupiah(u.sell_price)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Stock & Navigation Link */}
                        <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                          <div className="text-right mr-1">
                            <span className="text-[10px] text-slate-400 block font-medium">Stok Varian</span>
                            <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                              {formatStock(v.current_stock)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              Min: {formatStock(v.min_stock)}
                            </span>
                          </div>

                          {/* Variant Action Toolbar */}
                          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                            {/* Toggle Variant Status */}
                            {canUpdate && onToggleVariantStatus && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleVariantStatus(v.id);
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  v.is_active !== false
                                    ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                    : 'text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                }`}
                                title={
                                  v.is_active !== false
                                    ? 'Status: Masih Dijual (Klik untuk hentikan penjualan varian ini)'
                                    : 'Status: Tidak Dijual (Klik untuk aktifkan kembali varian ini)'
                                }
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canUpdate && onEditVariant && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditVariant(v);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                                title="Edit Varian"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canUpdate && onMoveVariants && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveVariants([v]);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                                title="Pindahkan Varian ke Produk Lain"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {canAdjust && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAdjust(v.id);
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                              title="Penyesuaian Stok Cepat"
                            >
                              Adjust
                            </button>
                          )}

                          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination for Variants */}
                {totalFilteredVariants > pageSize && (
                  <Pagination
                    currentPage={currentPage}
                    totalItems={totalFilteredVariants}
                    pageSize={pageSize}
                    onPageChange={(page) => setCurrentPage(page)}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20]}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW MODE 2: 2D MATRIX VIEW (TABEL SILANG KOMBINASI ATRIBUT) */}
        {/* ========================================================= */}
        {viewMode === 'matrix' && (
          <div className="p-6 space-y-4">
            {allAttributeKeys.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <Grid className="w-8 h-8 text-amber-500/50 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Produk ini belum memiliki atribut varian dinamis.
                </p>
                <p className="text-slate-500 max-w-md mx-auto">
                  Mode Matriks 2D memerlukan setidaknya 1 atau 2 atribut (seperti Kemasan × Warna atau Ukuran × Tebal).
                  Gunakan tombol <strong>"Ekstrak Atribut Otomatis"</strong> di atas untuk memecah nama varian lama secara massal, atau edit varian untuk menambahkan atribut.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Axis Selector Bar (if >= 2 attributes) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-700/70 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Grid className="w-4 h-4 text-amber-500" />
                      Konfigurasi Matriks 2D:
                    </span>

                    <div className="flex items-center gap-2">
                      <label className="text-slate-500">Sumbu Baris (↓):</label>
                      <select
                        value={matrixRowAttr}
                        onChange={(e) => setMatrixRowAttr(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {allAttributeKeys.map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    </div>

                    {allAttributeKeys.length > 1 && (
                      <div className="flex items-center gap-2">
                        <label className="text-slate-500">Sumbu Kolom (→):</label>
                        <select
                          value={matrixColAttr}
                          onChange={(e) => setMatrixColAttr(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {allAttributeKeys.map((key) => (
                            <option key={key} value={key} disabled={key === matrixRowAttr}>
                              {key}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400">
                    Klik sel varian untuk membuka rincian satuan & log mutasi
                  </span>
                </div>

                {/* 2D Matrix Table Grid */}
                {(() => {
                  const rowValues = (attributeValuesMap[matrixRowAttr] || []).map((v) => v.value);
                  const isTwoDimensional = allAttributeKeys.length > 1 && matrixRowAttr !== matrixColAttr;
                  const colValues = isTwoDimensional
                    ? (attributeValuesMap[matrixColAttr] || []).map((v) => v.value)
                    : ['Varian Info'];

                  if (rowValues.length === 0) {
                    return (
                      <div className="py-10 text-center text-slate-400 text-xs">
                        Tidak ada data nilai untuk atribut <strong>{matrixRowAttr}</strong>.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <th className="p-3.5 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 min-w-[140px] sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                              <span className="text-slate-400 font-normal block text-[10px]">
                                {matrixRowAttr} (↓) \ {isTwoDimensional ? `${matrixColAttr} (→)` : ''}
                              </span>
                              <span className="text-slate-900 dark:text-white font-bold">
                                {matrixRowAttr}
                              </span>
                            </th>
                            {colValues.map((colVal) => (
                              <th
                                key={colVal}
                                className="p-3.5 font-bold text-slate-800 dark:text-slate-200 text-center min-w-[170px] border-r border-slate-200 dark:border-slate-700 last:border-r-0"
                              >
                                <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold">
                                  {colVal}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {rowValues.map((rowVal) => (
                            <tr
                              key={rowVal}
                              className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                            >
                              {/* Row Header */}
                              <td className="p-3.5 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                  <span>{rowVal}</span>
                                </div>
                              </td>

                              {/* Matrix Data Cells */}
                              {colValues.map((colVal) => {
                                // Find variant matching this row and col combination
                                const matchedVariant = filteredVariants.find((v) => {
                                  const rowMatch = v.attributes?.[matrixRowAttr] === rowVal;
                                  if (!isTwoDimensional) return rowMatch;
                                  const colMatch = v.attributes?.[matrixColAttr] === colVal;
                                  return rowMatch && colMatch;
                                });

                                if (!matchedVariant) {
                                  // Empty combination cell
                                  return (
                                    <td
                                      key={colVal}
                                      className="p-3 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 bg-slate-50/30 dark:bg-slate-950/20"
                                    >
                                      <div className="py-2.5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1 text-slate-400">
                                        <span className="text-[11px]">- Kosong -</span>
                                        {canCreate && (
                                          <button
                                            type="button"
                                            onClick={() => onAddVariant(product.id)}
                                            className="text-[10px] text-amber-600 dark:text-amber-400 font-bold hover:underline inline-flex items-center gap-0.5"
                                          >
                                            <Plus className="w-3 h-3" /> Tambah
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  );
                                }

                                const isLow = Number(matchedVariant.current_stock) <= Number(matchedVariant.min_stock);
                                const isOut = Number(matchedVariant.current_stock) <= 0;
                                const baseUnit = matchedVariant.units?.find((u) => u.is_base_unit) || matchedVariant.units?.[0];

                                return (
                                  <td
                                    key={colVal}
                                    onClick={() => onSelectVariant(matchedVariant)}
                                    className={`p-3 border-r border-slate-200 dark:border-slate-800 last:border-r-0 cursor-pointer transition-all hover:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.12] ${
                                      matchedVariant.is_active === false
                                        ? 'bg-rose-500/[0.03] dark:bg-rose-950/[0.08]'
                                        : ''
                                    }`}
                                  >
                                    <div className="space-y-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-amber-400 dark:hover:border-amber-500 transition-colors">
                                      {/* Variant Name & SKU */}
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                          {matchedVariant.variant_name}
                                        </span>
                                        {matchedVariant.is_active === false && (
                                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Nonaktif" />
                                        )}
                                      </div>

                                      <div className="text-[10px] font-mono text-slate-400 truncate">
                                        SKU: {matchedVariant.sku}
                                      </div>

                                      {/* Stock Indicator */}
                                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                                        <span className="text-[10px] text-slate-500">Stok:</span>
                                        <div className="flex items-center gap-1.5 font-mono">
                                          <span
                                            className={`font-black text-xs ${
                                              isOut
                                                ? 'text-rose-600'
                                                : isLow
                                                ? 'text-amber-600'
                                                : 'text-emerald-600 dark:text-emerald-400'
                                            }`}
                                          >
                                            {formatStock(matchedVariant.current_stock)}
                                          </span>
                                          {baseUnit?.unit_name && (
                                            <span className="text-[10px] text-slate-400">
                                              {baseUnit.unit_name}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Base Sell Price */}
                                      {baseUnit && (
                                        <div className="flex items-center justify-between gap-2 text-[10px]">
                                          <span className="text-slate-400">Harga:</span>
                                          <span className="font-bold text-slate-800 dark:text-slate-200">
                                            {formatRupiah(baseUnit.sell_price)}
                                          </span>
                                        </div>
                                      )}

                                      {/* Cell Quick Actions */}
                                      {canAdjust && (
                                        <div className="pt-1 flex items-center justify-end">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenAdjust(matchedVariant.id);
                                            }}
                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                                            title="Penyesuaian Stok Cepat"
                                          >
                                            Adjust Stok
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW MODE 3: ANALYTICS (TREN & HISTORI HARGA VARIAN)      */}
        {/* ========================================================= */}
        {viewMode === 'analytics' && canViewPricingAnalytics && (
          <div className="space-y-6 animate-in fade-in">
            {/* SVG Average Cost/Sell Price & Margin Trend Chart across all active variants */}
            <MarginTrendChart
              data={priceAnalytics?.margin_time_series || []}
              canViewBuyPrice={canViewBuyPrice}
              marginThreshold={priceAnalytics?.summary?.margin_threshold_pct ?? 10}
              totalVariants={priceAnalytics?.summary?.total_variants ?? rawVariants.length}
              height={300}
              title={`Tren Rata-Rata Harga Modal & Jual: ${product.name}`}
            />

            {/* Variants Pricing Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span>Daftar Harga & Gross Margin Seluruh Varian</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Ringkasan performa harga dan marjin kotor per satuan untuk setiap varian
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchPriceAnalytics}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPriceAnalytics ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingPriceAnalytics ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                  <span>Memuat analitik harga varian...</span>
                </div>
              ) : !priceAnalytics || priceAnalytics.variants_summary.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Belum ada data harga varian yang dapat ditampilkan.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                      <tr>
                        <th className="p-3">Nama Varian & SKU</th>
                        <th className="p-3">Satuan</th>
                        <th className="p-3">Harga Jual Saat Ini</th>
                        {canViewBuyPrice && <th className="p-3">Harga Modal</th>}
                        {canViewBuyPrice && <th className="p-3">Gross Margin</th>}
                        <th className="p-3">Rentang Jual (Min - Max)</th>
                        <th className="p-3">Perubahan Sejak Awal</th>
                        <th className="p-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {priceAnalytics.variants_summary.map((vSummary) => {
                        const matchedVariant = rawVariants.find((v) => v.id === vSummary.variant_id);
                        return vSummary.units.map((unitSummary, uIdx) => (
                          <tr
                            key={`${vSummary.variant_id}-${unitSummary.unit_id}`}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            {uIdx === 0 ? (
                              <td
                                rowSpan={vSummary.units.length}
                                className="p-3 border-r border-slate-100 dark:border-slate-800 align-top"
                              >
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {vSummary.variant_name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {vSummary.sku}
                                </span>
                              </td>
                            ) : null}

                            <td className="p-3">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {unitSummary.unit_name}
                              </span>
                              {unitSummary.is_base_unit && (
                                <span className="ml-1 text-[9px] uppercase font-bold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded">
                                  Dasar
                                </span>
                              )}
                            </td>

                            <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                              Rp {formatIdNumber(unitSummary.current_sell_price, false)}
                            </td>

                            {canViewBuyPrice && (
                              <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                                {unitSummary.current_buy_price !== null
                                  ? `Rp ${formatIdNumber(unitSummary.current_buy_price, false)}`
                                  : '-'}
                              </td>
                            )}

                            {canViewBuyPrice && (
                              <td className="p-3">
                                {unitSummary.current_gross_margin !== null ? (
                                  <span
                                    className={`font-black text-xs ${
                                      unitSummary.current_gross_margin <= 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : unitSummary.current_gross_margin < 10
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                    }`}
                                  >
                                    {unitSummary.current_gross_margin.toFixed(1).replace('.', ',')}%
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                            )}

                            <td className="p-3 font-mono text-slate-500 text-[11px]">
                              Rp {formatIdNumber(unitSummary.min_sell_price, false)} - Rp {formatIdNumber(unitSummary.max_sell_price, false)}
                            </td>

                            <td className="p-3 font-mono text-[11px]">
                              {unitSummary.all_time_sell_diff > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  +{formatIdNumber(unitSummary.all_time_sell_diff, false)} (+
                                  {unitSummary.all_time_sell_percent_change.toFixed(1).replace('.', ',')}%)
                                </span>
                              ) : unitSummary.all_time_sell_diff < 0 ? (
                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                  -{formatIdNumber(Math.abs(unitSummary.all_time_sell_diff), false)} (
                                  {unitSummary.all_time_sell_percent_change.toFixed(1).replace('.', ',')}%)
                                </span>
                              ) : (
                                <span className="text-slate-400">Tetap (0%)</span>
                              )}
                            </td>

                            <td className="p-3 text-right">
                              {matchedVariant && (
                                <button
                                  type="button"
                                  onClick={() => onSelectVariant(matchedVariant)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                >
                                  Detail Varian →
                                </button>
                              )}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: AUTO-EXTRACT ATTRIBUTES FROM VARIANT NAMES (TAHAP 2) */}
      {/* ========================================================= */}
      {isExtractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Ekstrak Atribut Otomatis dari Nama Varian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pecah nama varian lama (misal: "1kg - Super Black") menjadi atribut dinamis terstruktur secara massal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Delimiter Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                1. Pilih Karakter Pemisah (Pemisah Antara Atribut):
              </label>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {[
                  { label: 'Strip / Dash ( - )', val: '-' },
                  { label: 'Garis Miring ( / )', val: '/' },
                  { label: 'Koma ( , )', val: ',' },
                  { label: 'Pipa ( | )', val: '|' },
                  { label: 'Spasi (   )', val: ' ' },
                  { label: 'Kustom', val: 'custom' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setExtractDelimiter(item.val)}
                    className={`px-3 py-1.5 rounded-xl font-semibold border transition-all ${
                      extractDelimiter === item.val
                        ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {extractDelimiter === 'custom' && (
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Ketik Pemisah:</span>
                  <input
                    type="text"
                    value={customDelimiter}
                    onChange={(e) => setCustomDelimiter(e.target.value)}
                    placeholder="Contoh: _ atau x"
                    className="w-24 px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-center"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Segment Mapping */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                2. Petakan Tiap Bagian Hasil Pecahan ke Nama Atribut:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {segmentMappings.map((attrName, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        Bagian #{idx + 1}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        Contoh: "
                        {rawVariants[0]?.variant_name?.split(activeDelimiter)?.[idx]?.trim() || '...'}"
                      </span>
                    </div>

                    <input
                      type="text"
                      list="extract-attr-suggestions"
                      value={attrName}
                      onChange={(e) => {
                        const copy = [...segmentMappings];
                        copy[idx] = e.target.value;
                        setSegmentMappings(copy);
                      }}
                      placeholder="Nama atribut (Kemasan, Warna, dll)..."
                      className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                    />
                  </div>
                ))}
              </div>

              <datalist id="extract-attr-suggestions">
                {['Kemasan', 'Warna', 'Ukuran', 'Panjang', 'Ketebalan', 'Tipe', 'Finishing', 'Diameter'].map((sug) => (
                  <option key={sug} value={sug} />
                ))}
              </datalist>
            </div>

            {/* Live Preview Table */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  3. Live Preview Hasil Ekstraksi ({Math.min(5, rawVariants.length)} Contoh Varian):
                </label>
                <span className="text-[11px] text-slate-400">
                  Total {rawVariants.length} varian akan diperbarui
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                    <tr>
                      <th className="p-2.5">Nama Varian Saat Ini</th>
                      <th className="p-2.5">Hasil Parsing Atribut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rawVariants.slice(0, 5).map((v) => {
                      const parts = v.variant_name.split(activeDelimiter).map((s) => s.trim());
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-medium text-slate-900 dark:text-white font-mono text-[11px]">
                            {v.variant_name}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {segmentMappings.map((attrName, idx) => {
                                const val = parts[idx];
                                if (!attrName || !val) return null;
                                return (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300/40"
                                  >
                                    <span className="text-slate-400 font-normal">{attrName}:</span>
                                    <span>{val}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                disabled={isExtractSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteAutoExtract}
                disabled={isExtractSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isExtractSubmitting
                    ? 'Menyimpan...'
                    : `Ekstrak & Simpan ke ${rawVariants.length} Varian`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: BULK TAG ATTRIBUTE ON SELECTED VARIANTS (TAHAP 2) */}
      {/* ========================================================= */}
      {isBulkTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <BookmarkPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Set Atribut Massal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Terapkan atribut bersama untuk {selectedVariantIds.length} varian terpilih
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkTagModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inputs */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Atribut:
                </label>
                <input
                  type="text"
                  list="bulk-tag-key-suggestions"
                  value={bulkTagKey}
                  onChange={(e) => setBulkTagKey(e.target.value)}
                  placeholder="Contoh: Kemasan, Warna, Ukuran..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                />
                <datalist id="bulk-tag-key-suggestions">
                  {allAttributeKeys.concat(['Kemasan', 'Warna', 'Ukuran', 'Panjang', 'Tipe', 'Ketebalan']).map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nilai Atribut:
                </label>
                <input
                  type="text"
                  list="bulk-tag-val-suggestions"
                  value={bulkTagValue}
                  onChange={(e) => setBulkTagValue(e.target.value)}
                  placeholder="Contoh: 1kg, Super Black, 3 Meter..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                />
                <datalist id="bulk-tag-val-suggestions">
                  {(attributeValuesMap[bulkTagKey] || []).map((v) => (
                    <option key={v.value} value={v.value} />
                  ))}
                </datalist>
              </div>

              {/* Selected Variants Preview */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 text-[11px] space-y-1">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Varian yang akan terupdate ({selectedVariantIds.length}):
                </span>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {rawVariants
                    .filter((v) => selectedVariantIds.includes(v.id))
                    .map((v) => (
                      <div key={v.id} className="text-slate-600 dark:text-slate-400 truncate">
                        • {v.variant_name} <span className="font-mono text-[10px]">({v.sku})</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsBulkTagModalOpen(false)}
                disabled={isBulkTagSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkTag}
                disabled={isBulkTagSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>
                  {isBulkTagSubmitting
                    ? 'Menyimpan...'
                    : `Terapkan ke ${selectedVariantIds.length} Varian`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Price Update Modal */}
      <BulkPriceUpdateModal
        isOpen={isBulkPricingModalOpen}
        onClose={() => setIsBulkPricingModalOpen(false)}
        product={product}
        onSuccess={() => {
          fetchPriceAnalytics();
          if (onRefresh) onRefresh();
        }}
        showToast={showToast}
      />
    </div>
  );
};
