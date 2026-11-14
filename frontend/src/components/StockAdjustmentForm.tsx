import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import { Product, VariantUnit } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatStock } from '../utils/format';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { 
  Search, 
  X, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft, 
  Scale, 
  Package, 
  Info, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw, 
  Barcode,
  ShieldCheck,
  Boxes,
  Folder,
  User
} from 'lucide-react';

export interface FlattenedVariant {
  id: string;
  variant_name: string;
  sku: string;
  barcode?: string | null;
  current_stock: number;
  min_stock: number;
  is_active?: boolean;
  units: VariantUnit[];
  product_id: string;
  product_name: string;
  product_sku: string;
  category_name?: string | null;
  brand?: string | null;
  supplier_name?: string | null;
  product_is_active?: boolean;
  _searchIndex: string;
}

interface StockAdjustmentFormProps {
  products: Product[];
  initialVariantId?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isModal?: boolean;
}

/**
 * Memoized Variant List Item Row to prevent unnecessary re-rendering
 * of hundreds/thousands of items when only selection changes.
 */
interface VariantListItemProps {
  variant: FlattenedVariant;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDoubleSelect: (id: string) => void;
}

const VariantListItem = React.memo<VariantListItemProps>(({
  variant: v,
  isSelected,
  onSelect,
  onDoubleSelect,
}) => {
  const isLow = v.current_stock <= v.min_stock && v.current_stock > 0;
  const isOut = v.current_stock <= 0;
  const primaryUnit = v.units?.find((u) => u.is_base_unit) || v.units?.[0];

  return (
    <div
      onClick={() => onSelect(v.id)}
      onDoubleClick={() => onDoubleSelect(v.id)}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
        isSelected
          ? 'border-amber-500 bg-amber-500/[0.08] dark:bg-amber-500/15 ring-2 ring-amber-500/40 shadow-xs'
          : 'border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      {/* Left: Radio Selector & Info */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="mt-0.5 shrink-0">
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              isSelected
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
        </div>

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {v.product_name}
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
              {v.variant_name}
            </span>
            {v.is_active === false && (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-1.5 py-0.2 rounded">
                Tidak Dijual
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              SKU: {v.sku}
            </span>
            {v.barcode && (
              <span className="font-mono flex items-center gap-0.5">
                <Barcode className="w-3 h-3" /> {v.barcode}
              </span>
            )}
            {v.category_name && (
              <span>• {v.category_name}</span>
            )}
            {v.brand && (
              <span>• Merk: {v.brand}</span>
            )}
          </div>

          {/* Units summary */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap pt-0.5">
            <span className="font-medium text-slate-500">Satuan:</span>
            {v.units.map((u) => (
              <span
                key={u.id}
                className={`px-1.5 py-0.2 rounded text-[10px] ${
                  u.is_base_unit
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500'
                }`}
              >
                {u.unit_name} {Number(u.conversion_factor) > 1 ? `(x${u.conversion_factor})` : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Stock Metrics */}
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Stok:</span>
          <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
            {formatStock(v.current_stock)}
          </span>
          <span className="text-[11px] text-slate-500">
            {primaryUnit?.unit_name || 'unit'}
          </span>
        </div>

        {isOut ? (
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
            Habis (0)
          </span>
        ) : isLow ? (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" /> Kritis
          </span>
        ) : (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <ShieldCheck className="w-3 h-3" /> Aman
          </span>
        )}
      </div>
    </div>
  );
});

VariantListItem.displayName = 'VariantListItem';

const DISPLAY_CHUNK_SIZE = 40;

export const StockAdjustmentForm: React.FC<StockAdjustmentFormProps> = ({
  products,
  initialVariantId,
  onSuccess,
  onCancel,
  showToast,
  isModal = false,
}) => {
  const { user } = useAuth();

  // Stepper State (Step 1: Cari Variant Produk -> Step 2: Metode Penyesuaian)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Step 1: Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  // React 18 useDeferredValue keeps input typing silky smooth at 120 FPS
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStockFilter, setSelectedStockFilter] = useState<'all' | 'critical' | 'out' | 'multi_unit'>('all');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  // Pagination / Windowing for rendering (prevents DOM bloat and browser freeze)
  const [displayLimit, setDisplayLimit] = useState<number>(DISPLAY_CHUNK_SIZE);

  // Step 2: Adjustment Method States
  const [mode, setMode] = useState<'SET' | 'ADD' | 'SUBTRACT'>('SET');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [rawAmount, setRawAmount] = useState<string>('');
  const [movementType, setMovementType] = useState<string>('STOCK_OPNAME');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Flatten all variants from products and precompute normalized search index
  const allVariants = useMemo<FlattenedVariant[]>(() => {
    const list: FlattenedVariant[] = [];
    for (const p of products) {
      const vars = p.variants || [];
      for (const v of vars) {
        // Pre-normalize search tokens into a single lowercase index for O(1) matching
        const searchIndex = `${p.name} ${v.variant_name} ${v.sku} ${p.sku} ${v.barcode || ''} ${p.category_name || ''} ${p.brand || ''}`.toLowerCase();
        list.push({
          id: v.id,
          variant_name: v.variant_name,
          sku: v.sku,
          barcode: v.barcode,
          current_stock: Number(v.current_stock) || 0,
          min_stock: Number(v.min_stock) || 0,
          is_active: v.is_active !== false,
          units: v.units || [],
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          category_name: p.category_name,
          brand: p.brand,
          supplier_name: p.supplier_name,
          product_is_active: p.is_active !== false,
          _searchIndex: searchIndex,
        });
      }
    }
    return list;
  }, [products]);

  // Fast O(1) lookup Map by variant ID
  const variantMap = useMemo(() => {
    const map = new Map<string, FlattenedVariant>();
    for (const v of allVariants) {
      map.set(v.id, v);
    }
    return map;
  }, [allVariants]);

  // Precomputed stats for quick filter chips (avoids repeated full array scans during re-render)
  const stockStats = useMemo(() => {
    let criticalCount = 0;
    let outCount = 0;
    let multiUnitCount = 0;
    for (const v of allVariants) {
      if (v.current_stock <= 0) {
        outCount++;
      } else if (v.current_stock <= v.min_stock) {
        criticalCount++;
      }
      if (v.units && v.units.length > 1) {
        multiUnitCount++;
      }
    }
    return {
      total: allVariants.length,
      critical: criticalCount,
      out: outCount,
      multiUnit: multiUnitCount,
    };
  }, [allVariants]);

  // Extract unique categories for filter
  const categoryList = useMemo(() => {
    const set = new Set<string>();
    for (const v of allVariants) {
      if (v.category_name) set.add(v.category_name);
    }
    return Array.from(set).sort();
  }, [allVariants]);

  // Options for SearchableSelect category filter with variant counts
  const categoryOptions = useMemo<SearchableOption[]>(() => {
    const counts = new Map<string, number>();
    for (const v of allVariants) {
      if (v.category_name) {
        counts.set(v.category_name, (counts.get(v.category_name) || 0) + 1);
      }
    }
    return categoryList.map((cat) => ({
      value: cat,
      label: cat,
      subtitle: `${counts.get(cat) || 0} varian`,
    }));
  }, [categoryList, allVariants]);

  // If initialVariantId is passed, preselect it and optionally advance to Step 2
  useEffect(() => {
    if (initialVariantId) {
      setSelectedVariantId(initialVariantId);
      setCurrentStep(2);
    }
  }, [initialVariantId]);

  // Safe autofocus without memory leak
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (currentStep === 1) {
      timer = setTimeout(() => searchInputRef.current?.focus(), 80);
    } else if (currentStep === 2) {
      timer = setTimeout(() => amountInputRef.current?.focus(), 80);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [currentStep]);

  // Reset pagination limit when search query or filters change
  useEffect(() => {
    setDisplayLimit(DISPLAY_CHUNK_SIZE);
  }, [deferredSearchQuery, selectedCategory, selectedStockFilter]);

  // Selected Variant lookup in O(1) time
  const currentVariant = useMemo(() => {
    if (!selectedVariantId) return null;
    return variantMap.get(selectedVariantId) || null;
  }, [variantMap, selectedVariantId]);

  // Available units for the selected variant
  const availableUnits = useMemo(() => {
    if (!currentVariant || !currentVariant.units || currentVariant.units.length === 0) {
      return [{ id: 'base', unit_name: 'Pcs', conversion_factor: 1, is_base_unit: true, buy_price: 0, sell_price: 0 }];
    }
    return currentVariant.units;
  }, [currentVariant]);

  // Sync selected unit when variant changes
  useEffect(() => {
    if (currentVariant) {
      const base = currentVariant.units?.find((u) => u.is_base_unit) || currentVariant.units?.[0];
      if (base) {
        setSelectedUnitId(base.id);
      }
    }
  }, [currentVariant]);

  // Selected unit object & conversion factor
  const activeUnit = useMemo(() => {
    return availableUnits.find((u) => u.id === selectedUnitId) || availableUnits[0];
  }, [availableUnits, selectedUnitId]);

  const conversionFactor = Number(activeUnit?.conversion_factor) || 1;
  const baseUnit = useMemo(() => {
    return availableUnits.find((u) => u.is_base_unit) || availableUnits[0];
  }, [availableUnits]);

  // High performance multi-token search & filter for Step 1
  const filteredVariants = useMemo(() => {
    const rawTokens = deferredSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return allVariants.filter((v) => {
      // Category filter check first (cheapest comparison)
      if (selectedCategory && v.category_name !== selectedCategory) {
        return false;
      }

      // Quick Stock Filter check
      if (selectedStockFilter === 'critical') {
        if (!(v.current_stock <= v.min_stock && v.current_stock > 0)) return false;
      } else if (selectedStockFilter === 'out') {
        if (v.current_stock > 0) return false;
      } else if (selectedStockFilter === 'multi_unit') {
        if (!v.units || v.units.length <= 1) return false;
      }

      // Multi-token search: all typed words must exist in pre-indexed string
      if (rawTokens.length > 0) {
        const matchesAll = rawTokens.every((token) => v._searchIndex.includes(token));
        if (!matchesAll) return false;
      }

      return true;
    });
  }, [allVariants, deferredSearchQuery, selectedCategory, selectedStockFilter]);

  // Progressive slicing to cap DOM nodes and eliminate UI freezing
  const displayedVariants = useMemo(() => {
    return filteredVariants.slice(0, displayLimit);
  }, [filteredVariants, displayLimit]);

  const hasMoreVariants = filteredVariants.length > displayLimit;

  const handleLoadMore = useCallback(() => {
    setDisplayLimit((prev) => Math.min(prev + DISPLAY_CHUNK_SIZE, filteredVariants.length));
  }, [filteredVariants.length]);

  // Compute stock simulation values
  const currentStock = currentVariant ? currentVariant.current_stock : 0;
  const inputQty = parseFloat(rawAmount) || 0;
  const amountInBaseUnit = inputQty * conversionFactor;

  let targetStock = currentStock;
  let diffInBase = 0;

  if (mode === 'SET') {
    targetStock = amountInBaseUnit;
    diffInBase = targetStock - currentStock;
  } else if (mode === 'ADD') {
    diffInBase = amountInBaseUnit;
    targetStock = currentStock + amountInBaseUnit;
  } else if (mode === 'SUBTRACT') {
    diffInBase = -amountInBaseUnit;
    targetStock = currentStock - amountInBaseUnit;
  }

  const isTargetNegative = targetStock < 0;

  // Change mode handler with smart default movement_type
  const handleSelectMode = useCallback((newMode: 'SET' | 'ADD' | 'SUBTRACT') => {
    setMode(newMode);
    if (newMode === 'SET') {
      setMovementType('STOCK_OPNAME');
    } else if (newMode === 'ADD') {
      setMovementType('PURCHASE_RESTOCK');
    } else if (newMode === 'SUBTRACT') {
      setMovementType('DAMAGED_EXPIRED');
    }
  }, []);

  // Variant selection handlers
  const handleSelectVariant = useCallback((id: string) => {
    setSelectedVariantId(id);
  }, []);

  const handleDoubleSelectVariant = useCallback((id: string) => {
    setSelectedVariantId(id);
    setCurrentStep(2);
  }, []);

  // Step 1 Validation & Proceed to Step 2
  const handleProceedToStep2 = useCallback(() => {
    if (!selectedVariantId || !currentVariant) {
      showToast('Silakan pilih salah satu varian produk terlebih dahulu!', 'error');
      return;
    }
    setCurrentStep(2);
  }, [selectedVariantId, currentVariant, showToast]);

  // Submit Handler
  const handleSubmitForm = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!currentVariant) {
      showToast('Varian produk belum dipilih!', 'error');
      setCurrentStep(1);
      return;
    }

    if (rawAmount === '' || isNaN(Number(rawAmount)) || Number(rawAmount) < 0) {
      showToast('Masukkan jumlah penyesuaian yang valid (minimal 0)!', 'error');
      amountInputRef.current?.focus();
      return;
    }

    if (isTargetNegative) {
      showToast(`Stok akhir tidak boleh kurang dari 0! (Stok saat ini: ${currentStock}, Pengurangan: ${amountInBaseUnit})`, 'error');
      return;
    }

    if (!notes.trim()) {
      showToast('Harap isi alasan atau catatan penyesuaian stok!', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      let finalNotes = notes.trim();
      if (conversionFactor > 1 && activeUnit) {
        finalNotes = `[${inputQty} ${activeUnit.unit_name} @${conversionFactor} ${baseUnit.unit_name}] ${finalNotes}`;
      }

      await api.adjustStock({
        variant_id: currentVariant.id,
        adjustment_mode: mode,
        amount: mode === 'SET' ? targetStock : amountInBaseUnit,
        movement_type: movementType,
        reference_no: referenceNo.trim() || `ADJ-${Date.now().toString().slice(-6)}`,
        notes: finalNotes,
      });

      showToast(`Penyesuaian stok untuk "${currentVariant.product_name} (${currentVariant.variant_name})" berhasil disimpan!`, 'success');
      
      // Reset form
      setRawAmount('');
      setNotes('');
      setReferenceNo('');
      setCurrentStep(1);

      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan penyesuaian stok', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentVariant, 
    rawAmount, 
    isTargetNegative, 
    notes, 
    conversionFactor, 
    activeUnit, 
    inputQty, 
    baseUnit, 
    mode, 
    targetStock, 
    amountInBaseUnit, 
    movementType, 
    referenceNo, 
    currentStock, 
    showToast, 
    onSuccess
  ]);

  // Keyboard navigation: Shift+Enter to advance, Ctrl+Enter to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.shiftKey && e.key === 'Enter') {
      if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (currentStep === 1) {
          handleProceedToStep2();
        }
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (currentStep === 2) {
        handleSubmitForm();
      }
    }
  }, [currentStep, handleProceedToStep2, handleSubmitForm]);

  return (
    <div onKeyDown={handleKeyDown} className="flex flex-col h-full">
      {/* ========================================================================= */}
      {/* STEPPER WIZARD HEADER (TAHAP 1 -> TAHAP 2) */}
      {/* ========================================================================= */}
      <div className="px-6 py-3.5 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          {/* Step 1 Button */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer group ${
              currentStep === 1
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                currentStep === 1
                  ? 'bg-amber-600 text-white ring-4 ring-amber-500/20'
                  : 'bg-emerald-600 text-white group-hover:scale-105'
              }`}
            >
              {currentStep > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
            </div>
            <div className="text-left hidden sm:block">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Tahap 1
              </span>
              <span className="text-xs">Cari & Pilih Varian</span>
            </div>
          </button>

          {/* Divider Line */}
          <div className="flex-1 mx-4 h-0.5 bg-slate-200 dark:bg-slate-700 relative">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: currentStep === 2 ? '100%' : '0%' }}
            />
          </div>

          {/* Step 2 Button */}
          <button
            type="button"
            onClick={() => {
              if (selectedVariantId) setCurrentStep(2);
              else showToast('Pilih varian produk terlebih dahulu', 'info');
            }}
            disabled={!selectedVariantId}
            className={`flex items-center gap-2.5 text-xs font-semibold transition-colors ${
              currentStep === 2
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : selectedVariantId
                ? 'text-slate-600 dark:text-slate-300 hover:text-amber-600 cursor-pointer'
                : 'text-slate-400 dark:text-slate-600 opacity-60 cursor-not-allowed'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                currentStep === 2
                  ? 'bg-amber-600 text-white ring-4 ring-amber-500/20'
                  : selectedVariantId
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
              }`}
            >
              2
            </div>
            <div className="text-left hidden sm:block">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Tahap 2
              </span>
              <span className="text-xs">Metode Penyesuaian</span>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CARI & PILIH VARIAN PRODUK */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="p-6 space-y-4 flex-1 overflow-y-auto animate-in fade-in duration-200">
          {/* Header Info & Search Input */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-amber-500" />
                  <span>Pilih Varian Barang yang Akan Disesuaikan</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Cari berdasarkan nama semen, pipa, cat, merk, SKU, atau scan barcode barang langsung
                </p>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-center">
                <span className="text-xs text-slate-400 font-medium">
                  Ditemukan: <strong className="text-slate-700 dark:text-slate-200">{filteredVariants.length}</strong> varian
                </span>
                {filteredVariants.length > displayLimit && (
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-300/40">
                    Menampilkan {displayedVariants.length} teratas
                  </span>
                )}
              </div>
            </div>

            {/* Instant Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama produk, SKU, barcode, atau spesifikasi ukuran/warna..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-semibold text-[11px] mr-1">Filter Cepat:</span>
                <button
                  type="button"
                  onClick={() => setSelectedStockFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    selectedStockFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Semua ({stockStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStockFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                    selectedStockFilter === 'critical'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Stok Kritis ({stockStats.critical})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStockFilter('out')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                    selectedStockFilter === 'out'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                  <span>Stok Habis ({stockStats.out})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStockFilter('multi_unit')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                    selectedStockFilter === 'multi_unit'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                  }`}
                >
                  <Boxes className="w-3 h-3" />
                  <span>Multi-Satuan ({stockStats.multiUnit})</span>
                </button>
              </div>

              {categoryList.length > 0 && (
                <div className="w-full sm:w-56 shrink-0">
                  <SearchableSelect
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    options={categoryOptions}
                    placeholder="Semua Kategori"
                    searchPlaceholder="Cari kategori..."
                    size="sm"
                    allowClear={true}
                    clearLabel="Semua Kategori"
                    icon={Folder}
                    iconColor="text-amber-500"
                    align="right"
                    className="w-full text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Variants List / Grid */}
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredVariants.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Tidak ada varian produk yang cocok
                </p>
                <p className="text-[11px] text-slate-400">
                  Coba ubah kata kunci pencarian atau reset filter di atas.
                </p>
              </div>
            ) : (
              <>
                {displayedVariants.map((v) => (
                  <VariantListItem
                    key={v.id}
                    variant={v}
                    isSelected={selectedVariantId === v.id}
                    onSelect={handleSelectVariant}
                    onDoubleSelect={handleDoubleSelectVariant}
                  />
                ))}

                {/* Progressive load more button to prevent browser freeze on large inventories */}
                {hasMoreVariants && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-xl border border-amber-200 dark:border-amber-800/80 transition-colors shadow-2xs"
                    >
                      Tampilkan {Math.min(DISPLAY_CHUNK_SIZE, filteredVariants.length - displayLimit)} Varian Lagi (Menampilkan {displayedVariants.length} dari {filteredVariants.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Selected Variant Summary Card & Next Step Button */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              {currentVariant ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500">Terpilih:</span>
                  <span className="font-bold text-xs text-slate-900 dark:text-white bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800">
                    {currentVariant.product_name} — {currentVariant.variant_name} ({formatStock(currentVariant.current_stock)} {baseUnit?.unit_name})
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic">
                  Klik pada salah satu varian di atas untuk melanjutkan ke Tahap 2
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={handleProceedToStep2}
                disabled={!selectedVariantId}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>Lanjut ke Metode Penyesuaian</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: METODE PENYESUAIAN & NILAI STOK */}
      {/* ========================================================================= */}
      {currentStep === 2 && currentVariant && (
        <form onSubmit={handleSubmitForm} className="p-6 space-y-4 flex-1 overflow-y-auto animate-in fade-in duration-200">
          {/* Active Product & Variant Banner */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {currentVariant.product_name}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  {currentVariant.variant_name}
                </span>
                <span className="font-mono text-[10px] text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                  SKU: {currentVariant.sku}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>
                  Stok Sistem Saat Ini: <strong className="font-mono font-bold text-slate-800 dark:text-slate-100">{formatStock(currentStock)}</strong> {baseUnit?.unit_name}
                </span>
                <span>• Batas Min Alert: {formatStock(currentVariant.min_stock)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-colors shrink-0 self-start sm:self-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ganti Varian</span>
            </button>
          </div>

          {/* Mode Penyesuaian: 3 Big Interactive Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Pilih Metode Penyesuaian Stok:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Mode SET: Opname Fisik (=) */}
              <div
                onClick={() => handleSelectMode('SET')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  mode === 'SET'
                    ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-amber-500" />
                    Opname Fisik (=)
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      mode === 'SET'
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {mode === 'SET' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tetapkan jumlah stok fisik riil hasil hitung manual. Sistem otomatis menghitung selisih.
                </p>
              </div>

              {/* Mode ADD: Tambah (+) */}
              <div
                onClick={() => handleSelectMode('ADD')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  mode === 'ADD'
                    ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15 ring-2 ring-emerald-500/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                    Tambah Stok (+)
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      mode === 'ADD'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {mode === 'ADD' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tambahkan kuantitas barang (misal: barang masuk dari supplier, temuan gudang, retur masuk).
                </p>
              </div>

              {/* Mode SUBTRACT: Kurang (-) */}
              <div
                onClick={() => handleSelectMode('SUBTRACT')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  mode === 'SUBTRACT'
                    ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-500/15 ring-2 ring-rose-500/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                    Kurangi Stok (-)
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      mode === 'SUBTRACT'
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {mode === 'SUBTRACT' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Kurangi kuantitas barang (misal: semen sobek, keramik pecah, pipa retak, barang hilang).
                </p>
              </div>
            </div>
          </div>

          {/* Quantity Input with Multi-Satuan Selector */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
            {/* Amount Number Input */}
            <div className="md:col-span-7 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {mode === 'SET'
                  ? 'Jumlah Stok Fisik Riil Hasil Hitung:'
                  : mode === 'ADD'
                  ? 'Jumlah Kuantitas Penambahan:'
                  : 'Jumlah Kuantitas Pengurangan:'}{' '}
                <span className="text-rose-500">*</span>
              </label>

              <div className="relative">
                <input
                  ref={amountInputRef}
                  type="number"
                  step="any"
                  min="0"
                  value={rawAmount}
                  onChange={(e) => setRawAmount(e.target.value)}
                  placeholder="Ketik angka jumlah..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-base font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="absolute right-3.5 top-3 text-xs font-semibold text-slate-400">
                  {activeUnit?.unit_name}
                </span>
              </div>

              {/* Conversion note if package unit selected */}
              {conversionFactor > 1 && inputQty > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 p-2 rounded-lg">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Setara dengan <strong className="font-mono">{formatStock(amountInBaseUnit)} {baseUnit?.unit_name}</strong> (faktor konversi: 1 {activeUnit?.unit_name} = {conversionFactor} {baseUnit?.unit_name})
                  </span>
                </div>
              )}

              {/* Quick Increment Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 font-medium">Shortcut:</span>
                {[1, 5, 10, 50, 100].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(rawAmount) || 0;
                      setRawAmount(String(cur + inc));
                    }}
                    className="px-2 py-0.5 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    +{inc}
                  </button>
                ))}
                {rawAmount && (
                  <button
                    type="button"
                    onClick={() => setRawAmount('')}
                    className="px-2 py-0.5 text-[11px] font-semibold text-rose-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Satuan Penghitungan (Multi-Unit) */}
            <div className="md:col-span-5 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Pilihan Satuan Penghitungan:
              </label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name} {u.is_base_unit ? '(Satuan Dasar)' : `(Konversi: ${u.conversion_factor} ${baseUnit?.unit_name})`}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Pilih kemasan fisik yang dihitung di lapangan (misal Dus / Zak)
              </p>
            </div>
          </div>

          {/* Movement Type & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Kategori / Tipe Mutasi: <span className="text-rose-500">*</span>
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {mode === 'SET' && (
                  <>
                    <option value="STOCK_OPNAME">Opname Fisik Berkala (STOCK_OPNAME)</option>
                    <option value="MANUAL_ADJUSTMENT">Koreksi Manual Lainnya (MANUAL_ADJUSTMENT)</option>
                  </>
                )}
                {mode === 'ADD' && (
                  <>
                    <option value="PURCHASE_RESTOCK">Barang Masuk / Pembelian (PURCHASE_RESTOCK)</option>
                    <option value="RETURN_IN">Retur Masuk dari Pelanggan (RETURN_IN)</option>
                    <option value="STOCK_OPNAME">Opname Fisik Selisih Lebih (STOCK_OPNAME)</option>
                    <option value="MANUAL_ADJUSTMENT">Koreksi Tambah Manual (MANUAL_ADJUSTMENT)</option>
                  </>
                )}
                {mode === 'SUBTRACT' && (
                  <>
                    <option value="DAMAGED_EXPIRED">Barang Rusak / Pecah / Cacat (DAMAGED_EXPIRED)</option>
                    <option value="RETURN_OUT">Retur Keluar ke Pabrik / Pemasok (RETURN_OUT)</option>
                    <option value="SALE_DEDUCT">Penjualan Manual / Koreksi Kasir (SALE_DEDUCT)</option>
                    <option value="STOCK_OPNAME">Opname Fisik Selisih Kurang (STOCK_OPNAME)</option>
                    <option value="MANUAL_ADJUSTMENT">Koreksi Kurang Manual (MANUAL_ADJUSTMENT)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                No. Dokumen / Referensi (Opsional):
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Misal: OPN-2026-11, DO-9988, BA-RUSAK-01"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes & Penanggung Jawab */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Alasan / Catatan Penyesuaian: <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ketik keterangan rinci alasan penyesuaian stok..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Quick reason suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">Saran Catatan:</span>
              {[
                'Hasil opname fisik bulanan',
                'Barang rusak saat bongkar muat',
                'Semen robek kena hujan',
                'Pipa retak tertimpa besi',
                'Koreksi selisih hitung kasir',
                'Barang masuk supplier tanpa PO',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNotes(suggestion)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Live Stock Simulation Card */}
          {rawAmount !== '' && (
            <div
              className={`p-4 rounded-xl border transition-all ${
                isTargetNegative
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-200'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Stok Awal:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {formatStock(currentStock)} {baseUnit?.unit_name}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-amber-600 shrink-0" />

                  <div>
                    <span className="text-slate-500 block text-[11px]">Mutasi / Selisih:</span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        diffInBase >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {diffInBase > 0 ? `+${formatStock(diffInBase)}` : formatStock(diffInBase)} {baseUnit?.unit_name}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-amber-600 shrink-0" />

                  <div>
                    <span className="text-slate-500 block text-[11px]">Stok Akhir Baru:</span>
                    <span
                      className={`font-mono font-black text-base ${
                        isTargetNegative
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatStock(targetStock)} {baseUnit?.unit_name}
                    </span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="self-end sm:self-center">
                  {isTargetNegative ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-500/20 px-2.5 py-1 rounded-full border border-rose-300 dark:border-rose-800">
                      <AlertCircle className="w-3.5 h-3.5" /> Stok Negatif!
                    </span>
                  ) : targetStock <= 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-500/10 px-2.5 py-1 rounded-full">
                      Stok Habis (0)
                    </span>
                  ) : targetStock <= currentVariant.min_stock ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-500/15 px-2.5 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Stok Kritis
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      <ShieldCheck className="w-3 h-3" /> Stok Aman
                    </span>
                  )}
                </div>
              </div>

              {isTargetNegative && (
                <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Pengurangan melebihi stok yang tersedia saat ini! Stok fisik tidak dapat bernilai kurang dari 0.
                </p>
              )}
            </div>
          )}

          {/* Read-only authenticated officer badge */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-xs">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-semibold">
              <User className="w-3.5 h-3.5 text-amber-500" />
              Petugas Pencatat:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {user ? `${user.full_name} (@${user.username})` : '-'}
            </span>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Cari Varian</span>
            </button>

            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting || isTargetNegative}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Penyesuaian Stok</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
