import React, { useState, useEffect, useMemo } from 'react';
import {
  Product,
  ProductVariant,
  Category,
  Brand,
  Supplier,
  BulkPriceUpdatePayload,
  BulkPricePreviewResponse,
  BulkPricePreviewItem,
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
  ArrowLeft,
  Package,
  Layers,
  Sliders,
  Filter,
  Check,
  RotateCcw,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';
import { formatIdNumber } from './common/NumericInput';

interface BulkPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSuccess: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Step = 'SELECT_PRODUCTS' | 'SELECT_VARIANTS' | 'CONFIGURE_PRICE' | 'SIMULATE_PRICE' | 'COMPLETED';

interface StepItem {
  id: Step;
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}

const STEPS: StepItem[] = [
  { id: 'SELECT_PRODUCTS', stepNumber: 1, title: 'Pilih Produk', subtitle: 'Pilih produk sasaran', icon: Package },
  { id: 'SELECT_VARIANTS', stepNumber: 2, title: 'Pilih Multi Varian', subtitle: 'Filter & pilih varian', icon: Layers },
  { id: 'CONFIGURE_PRICE', stepNumber: 3, title: 'Tentukan Harga', subtitle: 'Atur formula & aturan', icon: Sliders },
  { id: 'SIMULATE_PRICE', stepNumber: 4, title: 'Simulasikan Harga', subtitle: 'Review dampak margin', icon: Sparkles },
  { id: 'COMPLETED', stepNumber: 5, title: 'Selesai', subtitle: 'Ringkasan perubahan', icon: CheckCircle2 },
];

const PRESET_REASONS = [
  'Penyesuaian harga distributor/supplier',
  'Penyesuaian margin target toko',
  'Penyesuaian inflasi tahunan',
  'Promo diskon katalog musiman',
  'Kenaikan biaya angkut logistik',
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

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('SELECT_PRODUCTS');

  // Master Data
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // STEP 1: Product Selection & Filters
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState<string>('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('');
  const [productBrandFilter, setProductBrandFilter] = useState<string>('');
  const [productSupplierFilter, setProductSupplierFilter] = useState<string>('');

  // STEP 2: Variant Selection & Filters
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [variantSearch, setVariantSearch] = useState<string>('');
  const [variantProductFilter, setVariantProductFilter] = useState<string>('');
  const [variantUnitFilter, setVariantUnitFilter] = useState<string>('');
  const [variantAttrKeyFilter, setVariantAttrKeyFilter] = useState<string>('');
  const [variantAttrValFilter, setVariantAttrValFilter] = useState<string>('');
  const [variantStockFilter, setVariantStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // STEP 3: Price Configuration
  const [targetField, setTargetField] = useState<'sell_price' | 'buy_price' | 'wholesale_price'>('sell_price');
  const [targetUnits, setTargetUnits] = useState<'BASE_ONLY' | 'ALL_UNITS'>('ALL_UNITS');
  const [adjustmentMode, setAdjustmentMode] = useState<'PERCENT' | 'FIXED_AMOUNT' | 'SET_VALUE'>('PERCENT');
  const [value, setValue] = useState<number>(5);
  const [rounding, setRounding] = useState<'NONE' | 'HUNDRED' | 'THOUSAND' | 'FIVE_THOUSAND'>('THOUSAND');
  const [autoMaintainMargin, setAutoMaintainMargin] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');

  // STEP 4: Simulation & Preview
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkPricePreviewResponse | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [previewOnlyLoss, setPreviewOnlyLoss] = useState<boolean>(false);
  const [confirmedCommit, setConfirmedCommit] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // STEP 5: Completed result
  const [commitResult, setCommitResult] = useState<{ updated_count: number; batch_id?: string } | null>(null);

  // Load products & master data
  const loadInitialData = async () => {
    try {
      setIsLoadingProducts(true);
      const [prods, cats, brs, supps] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
        api.getBrands(),
        api.getSuppliers(),
      ]);
      setAllProducts(prods || []);
      setCategories(cats || []);
      setBrands(brs || []);
      setSuppliers(supps || []);

      if (product) {
        setSelectedProductIds(new Set([product.id]));
        const pVariants = product.variants || [];
        setSelectedVariantIds(new Set(pVariants.map((v) => v.id)));
      }
    } catch (err: any) {
      console.error('Failed to load bulk pricing initial data', err);
      triggerToast('Gagal memuat data produk & master', 'error');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentStep('SELECT_PRODUCTS');
      setProductSearch('');
      setProductCategoryFilter('');
      setProductBrandFilter('');
      setProductSupplierFilter('');
      setVariantSearch('');
      setVariantProductFilter('');
      setVariantUnitFilter('');
      setVariantAttrKeyFilter('');
      setVariantAttrValFilter('');
      setVariantStockFilter('ALL');
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
      setCommitResult(null);

      loadInitialData();
    }
  }, [isOpen, product]);

  // Derived: Filtered products in Step 1
  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (product && p.id !== product.id) return false;

      if (productCategoryFilter && p.category_id !== productCategoryFilter) return false;
      if (productBrandFilter && p.brand !== productBrandFilter) return false;
      if (productSupplierFilter && p.supplier_id !== productSupplierFilter) return false;

      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(q);
        const matchBrand = (p.brand || '').toLowerCase().includes(q);
        const matchCategory = (p.category_name || '').toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchBarcode && !matchBrand && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [allProducts, product, productCategoryFilter, productBrandFilter, productSupplierFilter, productSearch]);

  // Derived: All variants belonging to selected products
  const variantsOfSelectedProducts = useMemo(() => {
    const list: Array<ProductVariant & { parentProduct: Product }> = [];
    for (const p of allProducts) {
      if (selectedProductIds.has(p.id)) {
        for (const v of p.variants || []) {
          list.push({ ...v, parentProduct: p });
        }
      }
    }
    return list;
  }, [allProducts, selectedProductIds]);

  // Discover all unique attribute keys from variants of selected products
  const availableAttributeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const v of variantsOfSelectedProducts) {
      if (v.attributes && typeof v.attributes === 'object') {
        Object.keys(v.attributes).forEach((k) => keys.add(k));
      }
    }
    return Array.from(keys);
  }, [variantsOfSelectedProducts]);

  // Discover available attribute values for the currently selected key
  const availableAttributeValues = useMemo(() => {
    if (!variantAttrKeyFilter) return [];
    const vals = new Set<string>();
    for (const v of variantsOfSelectedProducts) {
      if (v.attributes && v.attributes[variantAttrKeyFilter] !== undefined) {
        vals.add(String(v.attributes[variantAttrKeyFilter]));
      }
    }
    return Array.from(vals);
  }, [variantsOfSelectedProducts, variantAttrKeyFilter]);

  // Discover unique unit names from variants of selected products
  const availableUnitNames = useMemo(() => {
    const units = new Set<string>();
    for (const v of variantsOfSelectedProducts) {
      for (const u of v.units || []) {
        if (u.unit_name) units.add(u.unit_name);
      }
    }
    return Array.from(units);
  }, [variantsOfSelectedProducts]);

  // Derived: Filtered variants in Step 2
  const filteredVariants = useMemo(() => {
    return variantsOfSelectedProducts.filter((v) => {
      // 1. Filter by Parent Product
      if (variantProductFilter && v.parentProduct.id !== variantProductFilter) return false;

      // 2. Filter by Satuan
      if (variantUnitFilter) {
        const hasUnit = (v.units || []).some((u) => u.unit_name.toLowerCase() === variantUnitFilter.toLowerCase());
        if (!hasUnit) return false;
      }

      // 3. Filter by Dynamic Attribute
      if (variantAttrKeyFilter) {
        if (!v.attributes || v.attributes[variantAttrKeyFilter] === undefined) return false;
        if (variantAttrValFilter && String(v.attributes[variantAttrKeyFilter]) !== variantAttrValFilter) {
          return false;
        }
      }

      // 4. Filter by Stock Status
      const stock = Number(v.current_stock) || 0;
      const minStock = Number(v.min_stock) || 0;
      if (variantStockFilter === 'IN_STOCK' && stock <= 0) return false;
      if (variantStockFilter === 'OUT_OF_STOCK' && stock > 0) return false;
      if (variantStockFilter === 'LOW_STOCK' && (stock <= 0 || stock > minStock)) return false;

      // 5. Search text (variant name, sku, barcode, parent product name, or attribute value)
      if (variantSearch.trim()) {
        const q = variantSearch.toLowerCase().trim();
        const matchName = (v.variant_name || '').toLowerCase().includes(q);
        const matchSku = (v.sku || '').toLowerCase().includes(q);
        const matchBarcode = (v.barcode || '').toLowerCase().includes(q);
        const matchProduct = (v.parentProduct.name || '').toLowerCase().includes(q);
        const matchAttr = v.attributes
          ? Object.values(v.attributes).some((val) => String(val).toLowerCase().includes(q))
          : false;

        if (!matchName && !matchSku && !matchBarcode && !matchProduct && !matchAttr) {
          return false;
        }
      }

      return true;
    });
  }, [
    variantsOfSelectedProducts,
    variantProductFilter,
    variantUnitFilter,
    variantAttrKeyFilter,
    variantAttrValFilter,
    variantStockFilter,
    variantSearch,
  ]);

  // Handlers for Step 1
  const toggleSelectProduct = (productId: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(productId)) {
      next.delete(productId);
      // Also uncheck its variants
      const prod = allProducts.find((p) => p.id === productId);
      if (prod && prod.variants) {
        const nextVariants = new Set(selectedVariantIds);
        prod.variants.forEach((v) => nextVariants.delete(v.id));
        setSelectedVariantIds(nextVariants);
      }
    } else {
      next.add(productId);
      // Automatically select all variants of this added product
      const prod = allProducts.find((p) => p.id === productId);
      if (prod && prod.variants) {
        const nextVariants = new Set(selectedVariantIds);
        prod.variants.forEach((v) => nextVariants.add(v.id));
        setSelectedVariantIds(nextVariants);
      }
    }
    setSelectedProductIds(next);
  };

  const handleSelectAllFilteredProducts = () => {
    const next = new Set(selectedProductIds);
    const nextVariants = new Set(selectedVariantIds);
    filteredProducts.forEach((p) => {
      next.add(p.id);
      (p.variants || []).forEach((v) => nextVariants.add(v.id));
    });
    setSelectedProductIds(next);
    setSelectedVariantIds(nextVariants);
  };

  const handleDeselectAllFilteredProducts = () => {
    const next = new Set(selectedProductIds);
    const nextVariants = new Set(selectedVariantIds);
    filteredProducts.forEach((p) => {
      next.delete(p.id);
      (p.variants || []).forEach((v) => nextVariants.delete(v.id));
    });
    setSelectedProductIds(next);
    setSelectedVariantIds(nextVariants);
  };

  // Handlers for Step 2
  const toggleSelectVariant = (variantId: string) => {
    const next = new Set(selectedVariantIds);
    if (next.has(variantId)) {
      next.delete(variantId);
    } else {
      next.add(variantId);
    }
    setSelectedVariantIds(next);
  };

  const handleSelectAllFilteredVariants = () => {
    const next = new Set(selectedVariantIds);
    filteredVariants.forEach((v) => next.add(v.id));
    setSelectedVariantIds(next);
  };

  const handleDeselectAllFilteredVariants = () => {
    const next = new Set(selectedVariantIds);
    filteredVariants.forEach((v) => next.delete(v.id));
    setSelectedVariantIds(next);
  };

  // Step 3 Validation & Transition to Step 4
  const handleProceedToSimulation = async () => {
    if (!reason.trim()) {
      triggerToast('Wajib mengisi alasan penyesuaian harga untuk jejak audit', 'error');
      return;
    }
    if (isNaN(value)) {
      triggerToast('Nilai penyesuaian harus berupa angka yang valid', 'error');
      return;
    }

    setCurrentStep('SIMULATE_PRICE');
    await fetchSimulationPreview();
  };

  // Step 4 Simulation Request
  const fetchSimulationPreview = async () => {
    try {
      setIsLoadingPreview(true);
      const payload: BulkPriceUpdatePayload = {
        scope: 'PRODUCTS',
        product_ids: Array.from(selectedProductIds),
        variant_ids: Array.from(selectedVariantIds),
        target_field: targetField,
        target_units: targetUnits,
        adjustment_mode: adjustmentMode,
        value: Number(value),
        rounding,
        auto_maintain_margin: autoMaintainMargin,
        reason: reason.trim() || 'Penyesuaian harga massal',
        reference_no: referenceNo.trim() || undefined,
      };

      const res = await api.previewBulkPriceUpdate(payload);
      setPreviewResult(res);
      setConfirmedCommit(false);
    } catch (err: any) {
      console.error('Preview bulk price error:', err);
      triggerToast(err.message || 'Gagal menghitung simulasi dampak harga', 'error');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Commit Execution
  const handleCommit = async () => {
    if (!reason.trim()) {
      triggerToast('Wajib mengisi alasan penyesuaian harga', 'error');
      return;
    }
    if (!confirmedCommit) {
      triggerToast('Harap centang konfirmasi persetujuan simulasi sebelum menerapkan', 'error');
      return;
    }

    try {
      setIsCommitting(true);
      const payload: BulkPriceUpdatePayload = {
        scope: 'PRODUCTS',
        product_ids: Array.from(selectedProductIds),
        variant_ids: Array.from(selectedVariantIds),
        target_field: targetField,
        target_units: targetUnits,
        adjustment_mode: adjustmentMode,
        value: Number(value),
        rounding,
        auto_maintain_margin: autoMaintainMargin,
        reason: reason.trim(),
        reference_no: referenceNo.trim() || undefined,
      };

      const res = await api.commitBulkPriceUpdate(payload);
      setCommitResult({
        updated_count: res.updated_count || previewResult?.total_units_affected || 0,
        batch_id: res.batch_id,
      });
      triggerToast(`Berhasil menerapkan perubahan pada ${res.updated_count} satuan harga!`, 'success');
      onSuccess();
      setCurrentStep('COMPLETED');
    } catch (err: any) {
      console.error('Commit bulk price error:', err);
      triggerToast(err.message || 'Gagal menerapkan perubahan harga massal', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  // Filter items inside simulation table
  const filteredPreviewItems = useMemo(() => {
    if (!previewResult || !previewResult.items) return [];
    return previewResult.items.filter((item: BulkPricePreviewItem) => {
      if (previewOnlyLoss && (!item.warning || item.warning.toLowerCase().indexOf('rugi') === -1)) {
        if ((item.next_margin ?? 1) > 0) return false;
      }
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const matchProduct = (item.product_name || '').toLowerCase().includes(q);
        const matchVariant = (item.variant_name || '').toLowerCase().includes(q);
        const matchUnit = (item.unit_name || '').toLowerCase().includes(q);
        if (!matchProduct && !matchVariant && !matchUnit) return false;
      }
      return true;
    });
  }, [previewResult, previewSearch, previewOnlyLoss]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Update Harga Massal Bertahap (Step Wizard)
                </h2>
                {product && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                    Produk Terkunci: {product.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alur terkontrol: Pilih Produk → Pilih Multi Varian → Tentukan Harga → Simulasikan → Selesai
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEPPER PROGRESS BAR */}
        <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isCurrent = currentStep === step.id;
              const isPast =
                STEPS.findIndex((s) => s.id === currentStep) > STEPS.findIndex((s) => s.id === step.id);

              return (
                <React.Fragment key={step.id}>
                  <div
                    className={`flex items-center gap-2.5 ${
                      isCurrent
                        ? 'text-amber-600 dark:text-amber-400'
                        : isPast
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                        isCurrent
                          ? 'bg-amber-500 text-white shadow-amber-500/25 ring-4 ring-amber-500/15'
                          : isPast
                          ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isPast ? <Check className="w-4 h-4 stroke-[3]" /> : step.stepNumber}
                    </div>
                    <div className="hidden sm:block text-left">
                      <span className="block text-xs font-bold leading-none">{step.title}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                        {step.subtitle}
                      </span>
                    </div>
                  </div>

                  {idx < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${
                        isPast
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

        {/* STEP CONTENT BODY (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* ========================================================================= */}
          {/* STEP 1: PILIH PRODUK                                                     */}
          {/* ========================================================================= */}
          {currentStep === 'SELECT_PRODUCTS' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span>Langkah 1: Pilih Produk Sasaran</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Centang produk yang ingin Anda perbarui harganya. Varian dari produk terpilih akan disaring di langkah berikutnya.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/60">
                    {selectedProductIds.size} Produk Terpilih
                  </span>
                </div>
              </div>

              {/* Filters for Products */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Cari produk / SKU / merek..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <select
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                    className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Semua Kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={productBrandFilter}
                    onChange={(e) => setProductBrandFilter(e.target.value)}
                    className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Semua Merek</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={productSupplierFilter}
                    onChange={(e) => setProductSupplierFilter(e.target.value)}
                    className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Semua Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bulk Select Actions for Filtered Products */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Menampilkan <strong>{filteredProducts.length}</strong> produk dari total{' '}
                  {allProducts.length} produk
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredProducts}
                    className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Pilih Semua yang Tampil</span>
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFilteredProducts}
                    className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-semibold flex items-center gap-1"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Batal Pilih Semua</span>
                  </button>
                </div>
              </div>

              {/* Products List / Grid */}
              {isLoadingProducts ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                  <span>Memuat daftar produk toko...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  Tidak ada produk yang sesuai dengan filter pencarian.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p.id);
                    const vCount = (p.variants || []).length;
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleSelectProduct(p.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Handled by card click
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {p.name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                              {vCount} Varian
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            <span className="font-mono text-slate-500">{p.sku}</span>
                            {p.category_name && <span>• {p.category_name}</span>}
                            {p.brand && <span>• {p.brand}</span>}
                          </div>

                          <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500">
                            <span>
                              Stok Total:{' '}
                              <strong className="text-slate-800 dark:text-slate-200 font-bold">
                                {p.total_stock}
                              </strong>
                            </span>
                            {p.supplier_name && (
                              <span className="truncate max-w-[140px]">Supp: {p.supplier_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: PILIH MULTI VARIANT DENGAN FILTER DETAIL                           */}
          {/* ========================================================================= */}
          {currentStep === 'SELECT_VARIANTS' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span>Langkah 2: Pilih Multi Varian dengan Filter</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Saring dan pilih varian spesifik berdasarkan nama, SKU, produk induk, satuan, atau atribut dinamis (warna, ukuran, tebal, dll).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/60">
                    {selectedVariantIds.size} Varian Terpilih
                  </span>
                </div>
              </div>

              {/* ADVANCED MULTI-VARIANT FILTERS */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Filter className="w-3.5 h-3.5 text-amber-500" />
                  <span>Filter Multi Varian</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {/* Search query */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={variantSearch}
                      onChange={(e) => setVariantSearch(e.target.value)}
                      placeholder="Cari varian / SKU / atribut..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Filter by Parent Product */}
                  <div>
                    <select
                      value={variantProductFilter}
                      onChange={(e) => setVariantProductFilter(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">Semua Produk Induk ({selectedProductIds.size})</option>
                      {allProducts
                        .filter((p) => selectedProductIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Filter by Satuan */}
                  <div>
                    <select
                      value={variantUnitFilter}
                      onChange={(e) => setVariantUnitFilter(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="">Semua Satuan</option>
                      {availableUnitNames.map((u) => (
                        <option key={u} value={u}>
                          Satuan: {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter by Stock Status */}
                  <div>
                    <select
                      value={variantStockFilter}
                      onChange={(e) => setVariantStockFilter(e.target.value as any)}
                      className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="ALL">Semua Status Stok</option>
                      <option value="IN_STOCK">Stok Tersedia (&gt; 0)</option>
                      <option value="LOW_STOCK">Stok Kritis (&le; min)</option>
                      <option value="OUT_OF_STOCK">Stok Habis (0)</option>
                    </select>
                  </div>
                </div>

                {/* Filter by Dynamic Attributes (Warna, Ukuran, dll.) */}
                {availableAttributeKeys.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[11px] font-semibold text-slate-500">Filter Atribut Dinamis:</span>
                    <select
                      value={variantAttrKeyFilter}
                      onChange={(e) => {
                        setVariantAttrKeyFilter(e.target.value);
                        setVariantAttrValFilter('');
                      }}
                      className="py-1 px-2.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    >
                      <option value="">-- Pilih Kunci Atribut --</option>
                      {availableAttributeKeys.map((k) => (
                        <option key={k} value={k}>
                          Atribut: {k}
                        </option>
                      ))}
                    </select>

                    {variantAttrKeyFilter && (
                      <select
                        value={variantAttrValFilter}
                        onChange={(e) => setVariantAttrValFilter(e.target.value)}
                        className="py-1 px-2.5 text-[11px] rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold"
                      >
                        <option value="">Semua Nilai ({variantAttrKeyFilter})</option>
                        {availableAttributeValues.map((val) => (
                          <option key={val} value={val}>
                            {variantAttrKeyFilter}: {val}
                          </option>
                        ))}
                      </select>
                    )}

                    {(variantAttrKeyFilter || variantAttrValFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setVariantAttrKeyFilter('');
                          setVariantAttrValFilter('');
                        }}
                        className="text-[10px] text-rose-500 hover:underline"
                      >
                        Reset Atribut
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bulk Select Actions for Filtered Variants */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Menampilkan <strong>{filteredVariants.length}</strong> varian dari total{' '}
                  {variantsOfSelectedProducts.length} varian produk terpilih
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredVariants}
                    className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Pilih Semua yang Tampil ({filteredVariants.length})</span>
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFilteredVariants}
                    className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-semibold flex items-center gap-1"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Batal Pilih Semua</span>
                  </button>
                </div>
              </div>

              {/* Variants Grid / Cards */}
              {filteredVariants.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  Tidak ada varian yang cocok dengan filter di atas.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {filteredVariants.map((v) => {
                    const isSelected = selectedVariantIds.has(v.id);
                    const attrs = v.attributes && typeof v.attributes === 'object' ? Object.entries(v.attributes) : [];

                    return (
                      <div
                        key={v.id}
                        onClick={() => toggleSelectVariant(v.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Handled by card click
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                                {v.parentProduct.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {v.variant_name}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                  {v.sku}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                                Stok: {v.current_stock}
                              </span>
                            </div>
                          </div>

                          {/* Dynamic Attribute Pills */}
                          {attrs.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {attrs.map(([k, val]) => (
                                <span
                                  key={k}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40 font-medium"
                                >
                                  <strong>{k}:</strong> {String(val)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Units Pricing Table Preview */}
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-[11px]">
                            {(v.units || []).map((u) => {
                              const sell = Number(u.sell_price) || 0;
                              const buy = Number(u.buy_price) || 0;
                              const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0;

                              return (
                                <div
                                  key={u.id}
                                  className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60"
                                >
                                  <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {u.unit_name}:
                                  </span>
                                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                    Rp {formatIdNumber(sell, false)}
                                  </span>
                                  {canViewBuyPrice && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      (M: {formatIdNumber(buy, false)})
                                    </span>
                                  )}
                                  {canViewBuyPrice && (
                                    <span
                                      className={`text-[9px] font-bold px-1 rounded ${
                                        margin <= 0
                                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                      }`}
                                    >
                                      {margin.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: TENTUKAN HARGA & ATURAN PENYESUAIAN                                */}
          {/* ========================================================================= */}
          {currentStep === 'CONFIGURE_PRICE' && (
            <div className="space-y-4 animate-in fade-in duration-200 max-w-3xl mx-auto">
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span>Langkah 3: Tentukan Parameter & Aturan Harga</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tentukan kolom harga yang diubah, metode formula (persen / nominal), pembulatan, dan alasan audit.
                </p>
              </div>

              {/* Target Field & Target Satuan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Kolom Target yang Disesuaikan:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTargetField('sell_price')}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        targetField === 'sell_price'
                          ? 'bg-emerald-600 border-emerald-700 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Harga Jual
                    </button>
                    {canViewBuyPrice && (
                      <button
                        type="button"
                        onClick={() => setTargetField('buy_price')}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                          targetField === 'buy_price'
                            ? 'bg-rose-600 border-rose-700 text-white font-bold shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Harga Modal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTargetField('wholesale_price')}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        targetField === 'wholesale_price'
                          ? 'bg-indigo-600 border-indigo-700 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Harga Grosir
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Cakupan Satuan:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTargetUnits('ALL_UNITS')}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        targetUnits === 'ALL_UNITS'
                          ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Semua Satuan
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetUnits('BASE_ONLY')}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        targetUnits === 'BASE_ONLY'
                          ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Hanya Satuan Dasar
                    </button>
                  </div>
                </div>
              </div>

              {/* Adjustment Mode & Value */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Metode & Nilai Penyesuaian:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('PERCENT')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      adjustmentMode === 'PERCENT'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Persentase (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('FIXED_AMOUNT')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      adjustmentMode === 'FIXED_AMOUNT'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Nominal (+/- Rp)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('SET_VALUE')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      adjustmentMode === 'SET_VALUE'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Set Nilai Pasti (Rp)
                  </button>
                </div>

                <div className="relative mt-2">
                  <input
                    type="number"
                    step={adjustmentMode === 'PERCENT' ? '0.1' : '100'}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder="Contoh: 10 untuk naik 10%, -5 untuk diskon 5%"
                  />
                  <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">
                    {adjustmentMode === 'PERCENT' ? '%' : 'Rupiah (IDR)'}
                  </span>
                </div>
              </div>

              {/* Rounding & Margin Maintenance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Aturan Pembulatan (Rounding):
                  </label>
                  <select
                    value={rounding}
                    onChange={(e) => setRounding(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  >
                    <option value="NONE">Tanpa Pembulatan</option>
                    <option value="HUNDRED">Bulatkan ke Ratusan Terdekat (100)</option>
                    <option value="THOUSAND">Bulatkan ke Ribuan Terdekat (1.000)</option>
                    <option value="FIVE_THOUSAND">Bulatkan ke 5 Ribuan Terdekat (5.000)</option>
                  </select>
                </div>

                {targetField === 'buy_price' && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="autoMaintainMarginStep3"
                      checked={autoMaintainMargin}
                      onChange={(e) => setAutoMaintainMargin(e.target.checked)}
                      className="mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <label
                      htmlFor="autoMaintainMarginStep3"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Pertahankan Gross Margin Otomatis
                      <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                        Otomatis naikkan harga jual proporsional agar % margin kotor toko tidak tergerus kenaikan modal.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Reason & Reference No */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Alasan Perubahan (Wajib untuk Log Audit): <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_REASONS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setReason(p)}
                        className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                          reason === p
                            ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-200 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
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
                    placeholder="Contoh: Kenaikan harga pabrik kuartal 2"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Referensi / Surat Jalan (Opsional):
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Contoh: SJ-2026/04/1102"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: SIMULASIKAN HARGA (PREVIEW & COMMIT)                              */}
          {/* ========================================================================= */}
          {currentStep === 'SIMULATE_PRICE' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Langkah 4: Simulasikan & Verifikasi Dampak Harga</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tinjau simulasi sebelum dan sesudah perubahan untuk menghindari kerugian atau penurunan margin kotor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchSimulationPreview}
                  disabled={isLoadingPreview}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                  <span>Hitung Ulang</span>
                </button>
              </div>

              {isLoadingPreview ? (
                <div className="p-16 text-center text-xs text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                  <span>Menghitung simulasi dampak harga terhadap seluruh satuan terpilih...</span>
                </div>
              ) : previewResult ? (
                <div className="space-y-4">
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Satuan Terdampak
                      </span>
                      <span className="text-lg font-black text-slate-900 dark:text-white">
                        {previewResult.total_units_affected} Satuan
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Gross Margin Sebelum vs Sesudah
                      </span>
                      <div className="flex items-center justify-center gap-2 text-sm font-black">
                        <span className="text-slate-400 font-normal">
                          {previewResult.summary.avg_margin_before.toFixed(1).replace('.', ',')}%
                        </span>
                        <span>→</span>
                        <span
                          className={
                            previewResult.summary.avg_margin_after < previewResult.summary.avg_margin_before
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {previewResult.summary.avg_margin_after.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Potensi Jual Rugi
                      </span>
                      <span
                        className={`text-lg font-black ${
                          previewResult.summary.potential_losses_count > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {previewResult.summary.potential_losses_count} Satuan
                      </span>
                    </div>
                  </div>

                  {/* Warning Box if potential losses */}
                  {previewResult.summary.potential_losses_count > 0 && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex items-start gap-2.5 text-xs">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold block text-sm">Peringatan: Kerugian Terdeteksi!</strong>
                        <span>
                          Terdapat {previewResult.summary.potential_losses_count} produk yang harga jualnya
                          menjadi di bawah atau sama dengan harga modal. Harap periksa sebelum menerapkan!
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Filter Simulation Rows */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        placeholder="Cari dalam hasil simulasi..."
                        className="w-full pl-8 pr-3 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={previewOnlyLoss}
                        onChange={(e) => setPreviewOnlyLoss(e.target.checked)}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                      />
                      <span>Tampilkan hanya yang berpotensi rugi / bermasalah</span>
                    </label>
                  </div>

                  {/* Simulation Items Table */}
                  <div className="overflow-x-auto max-h-80 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 font-bold text-[11px] text-slate-600 dark:text-slate-300 z-10">
                        <tr>
                          <th className="p-3">Produk & Varian</th>
                          <th className="p-3">Satuan</th>
                          <th className="p-3">Harga Jual</th>
                          {canViewBuyPrice && <th className="p-3">Harga Modal</th>}
                          {canViewBuyPrice && <th className="p-3">Gross Margin</th>}
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {filteredPreviewItems.map((item, idx) => {
                          const isLoss = item.warning && item.warning.toLowerCase().includes('rugi');
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3">
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {item.product_name}
                                </span>
                                <span className="text-[10px] text-slate-400">{item.variant_name}</span>
                              </td>
                              <td className="p-3 font-semibold">{item.unit_name}</td>
                              <td className="p-3 font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span className="line-through text-slate-400 text-[11px]">
                                    {formatIdNumber(item.current_sell_price, false)}
                                  </span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    → {formatIdNumber(item.next_sell_price, false)}
                                  </span>
                                </div>
                              </td>
                              {canViewBuyPrice && (
                                <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                                  <div className="flex items-center gap-1.5">
                                    <span className="line-through text-slate-400 text-[11px]">
                                      {formatIdNumber(item.current_buy_price, false)}
                                    </span>
                                    <span className="font-bold">
                                      → {formatIdNumber(item.next_buy_price, false)}
                                    </span>
                                  </div>
                                </td>
                              )}
                              {canViewBuyPrice && (
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 text-[11px]">
                                      {typeof item.current_margin === 'number'
                                        ? `${item.current_margin.toFixed(1).replace('.', ',')}%`
                                        : '-'}
                                    </span>
                                    <span
                                      className={`font-black ${
                                        typeof item.next_margin === 'number' && item.next_margin <= 0
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      →{' '}
                                      {typeof item.next_margin === 'number'
                                        ? `${item.next_margin.toFixed(1).replace('.', ',')}%`
                                        : '-'}
                                    </span>
                                  </div>
                                </td>
                              )}
                              <td className="p-3">
                                {isLoss ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                                    Jual Rugi
                                  </span>
                                ) : item.warning ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                    {item.warning}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    OK
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Confirmation Checkbox */}
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="confirmCommitStep4"
                      checked={confirmedCommit}
                      onChange={(e) => setConfirmedCommit(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                    />
                    <label
                      htmlFor="confirmCommitStep4"
                      className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      Saya telah memeriksa simulasi dampak harga di atas dan menyetujui perubahan ini.
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 5: SELESAI & RINGKASAN                                               */}
          {/* ========================================================================= */}
          {currentStep === 'COMPLETED' && (
            <div className="space-y-6 py-8 text-center animate-in zoom-in-95 duration-200 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Perubahan Harga Massal Berhasil Diterapkan!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Seluruh perubahan harga telah disimpan dan dicatat ke dalam log audit riwayat harga toko.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Satuan Diperbarui:</span>
                  <strong className="font-bold text-slate-900 dark:text-white">
                    {commitResult?.updated_count} Satuan
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Field:</span>
                  <span className="font-semibold capitalize">
                    {targetField === 'sell_price'
                      ? 'Harga Jual'
                      : targetField === 'buy_price'
                      ? 'Harga Modal'
                      : 'Harga Grosir'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Formula Penyesuaian:</span>
                  <span className="font-mono font-bold">
                    {adjustmentMode === 'PERCENT'
                      ? `${value > 0 ? '+' : ''}${value}%`
                      : adjustmentMode === 'FIXED_AMOUNT'
                      ? `${value > 0 ? '+' : ''}Rp ${formatIdNumber(value, false)}`
                      : `Rp ${formatIdNumber(value, false)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Alasan:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                    {reason}
                  </span>
                </div>
                {commitResult?.batch_id && (
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 text-[10px]">
                    <span className="text-slate-400">ID Batch Audit:</span>
                    <span className="font-mono text-slate-500">{commitResult.batch_id}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep('SELECT_PRODUCTS');
                    setPreviewResult(null);
                    setConfirmedCommit(false);
                    setCommitResult(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Update Harga Lainnya</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER STEP NAVIGATION (Hidden in Completed Step) */}
        {currentStep !== 'COMPLETED' && (
          <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
            {/* Left Button (Back / Cancel) */}
            {currentStep === 'SELECT_PRODUCTS' ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            ) : currentStep === 'SELECT_VARIANTS' ? (
              <button
                type="button"
                onClick={() => setCurrentStep('SELECT_PRODUCTS')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Pilih Produk</span>
              </button>
            ) : currentStep === 'CONFIGURE_PRICE' ? (
              <button
                type="button"
                onClick={() => setCurrentStep('SELECT_VARIANTS')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Pilih Varian</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep('CONFIGURE_PRICE')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ubah Parameter Harga</span>
              </button>
            )}

            {/* Right Button (Next / Action) */}
            <div className="flex items-center gap-2">
              {currentStep === 'SELECT_PRODUCTS' && (
                <button
                  type="button"
                  disabled={selectedProductIds.size === 0}
                  onClick={() => setCurrentStep('SELECT_VARIANTS')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                >
                  <span>Lanjut: Pilih Multi Varian ({selectedProductIds.size})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 'SELECT_VARIANTS' && (
                <button
                  type="button"
                  disabled={selectedVariantIds.size === 0}
                  onClick={() => setCurrentStep('CONFIGURE_PRICE')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                >
                  <span>Lanjut: Tentukan Harga ({selectedVariantIds.size})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 'CONFIGURE_PRICE' && (
                <button
                  type="button"
                  onClick={handleProceedToSimulation}
                  disabled={!reason.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulasikan Harga</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 'SIMULATE_PRICE' && (
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={isCommitting || !previewResult || !confirmedCommit}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isCommitting
                      ? 'Menerapkan Perubahan...'
                      : `Terapkan Perubahan (${previewResult?.total_units_affected || 0} Satuan)`}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
