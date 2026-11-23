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
  Plus,
  Minus,
  Receipt,
  Tag,
  ShieldCheck,
  Calculator,
  Truck,
  HelpCircle,
  User,
  UserCheck,
  Ban,
} from 'lucide-react';
import { NumericInput, formatIdNumber, parseIdNumber } from './common/NumericInput';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { Pagination } from './common/Pagination';

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
  { id: 'CONFIGURE_PRICE', stepNumber: 3, title: 'Tentukan Harga', subtitle: 'Atur formula & biaya', icon: Sliders },
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
  const { can, user: currentUser } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('SELECT_PRODUCTS');

  // Master Data
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // STEP 1: Single Product Selection (Hanya 1 produk yang bisa dipilih)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    product && product.is_active !== false ? product.id : null
  );
  const [productSearch, setProductSearch] = useState<string>('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('');
  const [productBrandFilter, setProductBrandFilter] = useState<string>('');
  const [productSupplierFilter, setProductSupplierFilter] = useState<string>('');
  const [productPage, setProductPage] = useState<number>(1);
  const [productPageSize, setProductPageSize] = useState<number>(12);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return allProducts.find((p) => p.id === selectedProductId) || null;
  }, [allProducts, selectedProductId]);

  const selectedProductIds = useMemo(() => {
    return selectedProductId ? new Set([selectedProductId]) : new Set<string>();
  }, [selectedProductId]);

  // STEP 2: Variant Selection & Filters
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [variantSearch, setVariantSearch] = useState<string>('');
  const [variantProductFilter, setVariantProductFilter] = useState<string>('');
  const [variantUnitFilter, setVariantUnitFilter] = useState<string>('');
  const [variantAttrKeyFilter, setVariantAttrKeyFilter] = useState<string>('');
  const [variantAttrValFilter, setVariantAttrValFilter] = useState<string>('');
  const [variantStockFilter, setVariantStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [variantPage, setVariantPage] = useState<number>(1);
  const [variantPageSize, setVariantPageSize] = useState<number>(20);

  // STEP 3: Price Configuration
  const [targetField, setTargetField] = useState<'sell_price' | 'buy_price' | 'wholesale_price'>('sell_price');
  const [targetUnits, setTargetUnits] = useState<'BASE_ONLY' | 'ALL_UNITS'>('ALL_UNITS');
  const [adjustmentMode, setAdjustmentMode] = useState<'PERCENT' | 'FIXED_AMOUNT' | 'SET_VALUE'>('PERCENT');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'+' | '-'>('+');
  const [adjustmentValue, setAdjustmentValue] = useState<number>(5);
  const [rounding, setRounding] = useState<'NONE' | 'FIVE_HUNDRED' | 'THOUSAND' | 'FIVE_THOUSAND'>('THOUSAND');
  const [sellPriceAction, setSellPriceAction] = useState<'NONE' | 'AUTO_MARGIN' | 'MANUAL'>('NONE');
  const [manualSellMode, setManualSellMode] = useState<'PERCENT' | 'FIXED_AMOUNT' | 'SET_VALUE'>('FIXED_AMOUNT');
  const [manualSellDirection, setManualSellDirection] = useState<'+' | '-'>('+');
  const [manualSellValue, setManualSellValue] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');

  // STEP 3: Supplier Tax & Discount (Optional for buy_price)
  const [applySupplierTaxDiscount, setApplySupplierTaxDiscount] = useState<boolean>(false);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxType, setTaxType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [taxPct, setTaxPct] = useState<number>(11); // Default standard PPN Indonesia 11%
  const [taxAmount, setTaxAmount] = useState<number>(0);

  // STEP 3: Biaya Tambahan Pengadaan (Include ke Modal)
  const [applyAdditionalCosts, setApplyAdditionalCosts] = useState<boolean>(false);
  const [additionalCosts, setAdditionalCosts] = useState<Array<{ id: string; name: string; amount: number }>>([
    { id: 'cost-1', name: 'Biaya Pengiriman', amount: 0 },
  ]);

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

      if (product && product.is_active !== false) {
        setSelectedProductId(product.id);
        const activeVariants = (product.variants || []).filter((v) => v.is_active !== false);
        setSelectedVariantIds(new Set(activeVariants.map((v) => v.id)));
      } else {
        setSelectedProductId(null);
        setSelectedVariantIds(new Set());
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
      setProductPage(1);
      setVariantSearch('');
      setVariantProductFilter('');
      setVariantUnitFilter('');
      setVariantAttrKeyFilter('');
      setVariantAttrValFilter('');
      setVariantStockFilter('ALL');
      setVariantPage(1);
      setTargetField('sell_price');
      setTargetUnits('ALL_UNITS');
      setAdjustmentMode('PERCENT');
      setAdjustmentDirection('+');
      setAdjustmentValue(5);
      setRounding('THOUSAND');
      setSellPriceAction('NONE');
      setManualSellMode('FIXED_AMOUNT');
      setManualSellDirection('+');
      setManualSellValue(0);
      setReason('');
      setReferenceNo('');
      setApplySupplierTaxDiscount(false);
      setDiscountType('PERCENT');
      setDiscountPct(0);
      setDiscountAmount(0);
      setTaxType('PERCENT');
      setTaxPct(11);
      setTaxAmount(0);
      setApplyAdditionalCosts(false);
      setAdditionalCosts([{ id: 'cost-1', name: 'Biaya Pengiriman', amount: 0 }]);
      setPreviewResult(null);
      setConfirmedCommit(false);
      setCommitResult(null);

      loadInitialData();
    }
  }, [isOpen, product]);

  // Reset product page when product filters change
  useEffect(() => {
    setProductPage(1);
  }, [productSearch, productCategoryFilter, productBrandFilter, productSupplierFilter]);

  // Reset variant page when variant filters change
  useEffect(() => {
    setVariantPage(1);
  }, [variantSearch, variantProductFilter, variantUnitFilter, variantAttrKeyFilter, variantAttrValFilter, variantStockFilter]);

  // =========================================================================
  // REQUIREMENT 1.b: Dynamic Filter Options (HANYA MEMUAT DATA YANG DITAMPILKAN)
  // =========================================================================
  const availableCategoryOptions: SearchableOption[] = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    allProducts.forEach((p) => {
      if (p.category_id && p.category_name) {
        const existing = map.get(p.category_id);
        if (existing) {
          existing.count++;
        } else {
          map.set(p.category_id, { id: p.category_id, name: p.category_name, count: 1 });
        }
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        value: c.id,
        label: `${c.name} (${c.count})`,
        subtitle: `${c.count} produk aktif`,
      }));
  }, [allProducts]);

  const availableBrandOptions: SearchableOption[] = useMemo(() => {
    const map = new Map<string, number>();
    allProducts.forEach((p) => {
      if (p.brand && p.brand.trim()) {
        const b = p.brand.trim();
        map.set(b, (map.get(b) || 0) + 1);
      }
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brand, count]) => ({
        value: brand,
        label: `${brand} (${count})`,
        subtitle: `${count} produk`,
      }));
  }, [allProducts]);

  const availableSupplierOptions: SearchableOption[] = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    allProducts.forEach((p) => {
      if (p.supplier_id && p.supplier_name) {
        const existing = map.get(p.supplier_id);
        if (existing) {
          existing.count++;
        } else {
          map.set(p.supplier_id, { id: p.supplier_id, name: p.supplier_name, count: 1 });
        }
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        value: s.id,
        label: `${s.name} (${s.count})`,
        subtitle: `${s.count} produk aktif`,
      }));
  }, [allProducts]);

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

  // REQUIREMENT 1.c: Paginated products to prevent heavy memory / DOM overload
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * productPageSize;
    return filteredProducts.slice(start, start + productPageSize);
  }, [filteredProducts, productPage, productPageSize]);

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

  // REQUIREMENT 2.a: Paginated variants to prevent heavy memory / DOM overhead
  const paginatedVariants = useMemo(() => {
    const start = (variantPage - 1) * variantPageSize;
    return filteredVariants.slice(start, start + variantPageSize);
  }, [filteredVariants, variantPage, variantPageSize]);

  // Handlers for Step 1: Single Product Selection (Hanya 1 produk yang bisa dipilih)
  const toggleSelectProduct = (productId: string) => {
    const prod = allProducts.find((p) => p.id === productId);
    // Produk tidak dijual tidak bisa dipilih
    if (!prod || prod.is_active === false) return;

    if (selectedProductId === productId) {
      setSelectedProductId(null);
      setSelectedVariantIds(new Set());
    } else {
      setSelectedProductId(productId);
      // Otomatis pilih semua varian aktif dari produk ini
      const activeVariants = (prod.variants || []).filter((v) => v.is_active !== false);
      setSelectedVariantIds(new Set(activeVariants.map((v) => v.id)));
    }
    setVariantPage(1);
  };

  const handleDeselectProduct = () => {
    setSelectedProductId(null);
    setSelectedVariantIds(new Set());
    setVariantPage(1);
  };

  // Handlers for Step 2: Multi Variant Selection
  const toggleSelectVariant = (variantId: string) => {
    const v = variantsOfSelectedProducts.find((item) => item.id === variantId);
    // Varian tidak dijual tidak bisa dipilih
    if (!v || v.is_active === false || v.parentProduct.is_active === false) {
      return;
    }

    const next = new Set(selectedVariantIds);
    if (next.has(variantId)) {
      next.delete(variantId);
    } else {
      next.add(variantId);
    }
    setSelectedVariantIds(next);
  };

  const handleSelectPageVariants = () => {
    const next = new Set(selectedVariantIds);
    paginatedVariants.forEach((v) => {
      if (v.is_active !== false && v.parentProduct.is_active !== false) {
        next.add(v.id);
      }
    });
    setSelectedVariantIds(next);
  };

  const handleDeselectPageVariants = () => {
    const next = new Set(selectedVariantIds);
    paginatedVariants.forEach((v) => next.delete(v.id));
    setSelectedVariantIds(next);
  };

  const handleSelectAllFilteredVariants = () => {
    const next = new Set(selectedVariantIds);
    filteredVariants.forEach((v) => {
      if (v.is_active !== false && v.parentProduct.is_active !== false) {
        next.add(v.id);
      }
    });
    setSelectedVariantIds(next);
  };

  const handleDeselectAllFilteredVariants = () => {
    const next = new Set(selectedVariantIds);
    filteredVariants.forEach((v) => next.delete(v.id));
    setSelectedVariantIds(next);
  };

  // Total Additional Cost calculation
  const totalAdditionalCost = useMemo(() => {
    if (!applyAdditionalCosts) return 0;
    return additionalCosts.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [applyAdditionalCosts, additionalCosts]);

  // Effective signed value for calculation
  const effectiveValue = useMemo(() => {
    if (adjustmentMode === 'SET_VALUE') {
      return Math.abs(adjustmentValue);
    }
    return adjustmentDirection === '-' ? -Math.abs(adjustmentValue) : Math.abs(adjustmentValue);
  }, [adjustmentMode, adjustmentDirection, adjustmentValue]);

  // Validation for Adjustment Value
  const isAdjustmentValid = useMemo(() => {
    if (isNaN(adjustmentValue)) return false;
    if (adjustmentMode === 'SET_VALUE') return adjustmentValue > 0;
    return adjustmentValue > 0;
  }, [adjustmentMode, adjustmentValue]);

  // Step 3 Validation & Transition to Step 4
  const handleProceedToSimulation = async () => {
    if (!reason.trim()) {
      triggerToast('Wajib mengisi alasan penyesuaian harga untuk jejak audit', 'error');
      return;
    }
    if (!isAdjustmentValid) {
      triggerToast('Nilai penyesuaian harus lebih dari 0', 'error');
      return;
    }

    setCurrentStep('SIMULATE_PRICE');
    await fetchSimulationPreview();
  };

  // Step 4 Simulation Request
  const fetchSimulationPreview = async () => {
    try {
      setIsLoadingPreview(true);
      const validExtraCosts = applyAdditionalCosts && targetField === 'buy_price'
        ? additionalCosts
            .filter((c) => c.name.trim() && c.amount > 0)
            .map((c) => ({ name: c.name.trim(), amount: Number(c.amount) }))
        : undefined;

      const payload: BulkPriceUpdatePayload = {
        scope: 'PRODUCTS',
        product_ids: Array.from(selectedProductIds),
        variant_ids: Array.from(selectedVariantIds),
        target_field: targetField,
        target_units: targetUnits,
        adjustment_mode: adjustmentMode,
        value: effectiveValue,
        rounding,
        auto_maintain_margin: targetField === 'buy_price' && sellPriceAction === 'AUTO_MARGIN',
        manual_sell_adjustment_mode:
          targetField === 'buy_price' && sellPriceAction === 'MANUAL' ? manualSellMode : undefined,
        manual_sell_value:
          targetField === 'buy_price' && sellPriceAction === 'MANUAL'
            ? manualSellMode === 'SET_VALUE'
              ? manualSellValue
              : manualSellDirection === '-'
                ? -Math.abs(manualSellValue)
                : Math.abs(manualSellValue)
            : undefined,
        discount_type: applySupplierTaxDiscount && targetField === 'buy_price' ? discountType : undefined,
        discount_pct:
          applySupplierTaxDiscount && targetField === 'buy_price' && discountType === 'PERCENT'
            ? discountPct || 0
            : undefined,
        discount_amount:
          applySupplierTaxDiscount && targetField === 'buy_price' && discountType === 'AMOUNT'
            ? discountAmount || 0
            : undefined,
        tax_type: applySupplierTaxDiscount && targetField === 'buy_price' ? taxType : undefined,
        tax_pct:
          applySupplierTaxDiscount && targetField === 'buy_price' && taxType === 'PERCENT'
            ? taxPct || 0
            : undefined,
        tax_amount:
          applySupplierTaxDiscount && targetField === 'buy_price' && taxType === 'AMOUNT'
            ? taxAmount || 0
            : undefined,
        additional_costs: validExtraCosts,
        total_additional_cost: applyAdditionalCosts && targetField === 'buy_price' ? totalAdditionalCost : undefined,
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
      const validExtraCosts = applyAdditionalCosts && targetField === 'buy_price'
        ? additionalCosts
            .filter((c) => c.name.trim() && c.amount > 0)
            .map((c) => ({ name: c.name.trim(), amount: Number(c.amount) }))
        : undefined;

      const payload: BulkPriceUpdatePayload = {
        scope: 'PRODUCTS',
        product_ids: Array.from(selectedProductIds),
        variant_ids: Array.from(selectedVariantIds),
        target_field: targetField,
        target_units: targetUnits,
        adjustment_mode: adjustmentMode,
        value: effectiveValue,
        rounding,
        auto_maintain_margin: targetField === 'buy_price' && sellPriceAction === 'AUTO_MARGIN',
        manual_sell_adjustment_mode:
          targetField === 'buy_price' && sellPriceAction === 'MANUAL' ? manualSellMode : undefined,
        manual_sell_value:
          targetField === 'buy_price' && sellPriceAction === 'MANUAL'
            ? manualSellMode === 'SET_VALUE'
              ? manualSellValue
              : manualSellDirection === '-'
                ? -Math.abs(manualSellValue)
                : Math.abs(manualSellValue)
            : undefined,
        discount_type: applySupplierTaxDiscount && targetField === 'buy_price' ? discountType : undefined,
        discount_pct:
          applySupplierTaxDiscount && targetField === 'buy_price' && discountType === 'PERCENT'
            ? discountPct || 0
            : undefined,
        discount_amount:
          applySupplierTaxDiscount && targetField === 'buy_price' && discountType === 'AMOUNT'
            ? discountAmount || 0
            : undefined,
        tax_type: applySupplierTaxDiscount && targetField === 'buy_price' ? taxType : undefined,
        tax_pct:
          applySupplierTaxDiscount && targetField === 'buy_price' && taxType === 'PERCENT'
            ? taxPct || 0
            : undefined,
        tax_amount:
          applySupplierTaxDiscount && targetField === 'buy_price' && taxType === 'AMOUNT'
            ? taxAmount || 0
            : undefined,
        additional_costs: validExtraCosts,
        total_additional_cost: applyAdditionalCosts && targetField === 'buy_price' ? totalAdditionalCost : undefined,
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

  // Live simulation pipeline example calculation for Step 3
  const samplePipeline = useMemo(() => {
    const sampleBase = 100000;
    let baseAdjusted = sampleBase;
    if (adjustmentMode === 'PERCENT') {
      baseAdjusted = sampleBase * (1 + effectiveValue / 100);
    } else if (adjustmentMode === 'FIXED_AMOUNT') {
      baseAdjusted = Math.max(0, sampleBase + effectiveValue);
    } else if (adjustmentMode === 'SET_VALUE') {
      baseAdjusted = Math.max(0, effectiveValue);
    }

    let discountVal = 0;
    if (applySupplierTaxDiscount) {
      if (discountType === 'PERCENT' && discountPct > 0) {
        discountVal = baseAdjusted * (discountPct / 100);
      } else if (discountType === 'AMOUNT' && discountAmount > 0) {
        discountVal = Math.min(baseAdjusted, discountAmount);
      }
    }

    const netBeforeTax = Math.max(0, baseAdjusted - discountVal);

    let taxVal = 0;
    if (applySupplierTaxDiscount) {
      if (taxType === 'PERCENT' && taxPct > 0) {
        taxVal = netBeforeTax * (taxPct / 100);
      } else if (taxType === 'AMOUNT' && taxAmount > 0) {
        taxVal = taxAmount;
      }
    }

    const extraCost = applyAdditionalCosts ? totalAdditionalCost : 0;
    const effectiveBuy = netBeforeTax + taxVal + extraCost;

    // Pembulatan HANYA berlaku untuk harga jual
    let sampleSell = 125000; // asumsi harga jual awal Rp 125.000 (margin 20% dari 100.000)
    if (sellPriceAction === 'AUTO_MARGIN') {
      sampleSell = effectiveBuy / (1 - 0.2); // estimasi margin 20%
    } else if (sellPriceAction === 'MANUAL') {
      const effectiveManualSell =
        manualSellMode === 'SET_VALUE'
          ? manualSellValue
          : manualSellDirection === '-'
            ? -Math.abs(manualSellValue)
            : Math.abs(manualSellValue);
      if (manualSellMode === 'PERCENT') {
        sampleSell = sampleSell * (1 + effectiveManualSell / 100);
      } else if (manualSellMode === 'FIXED_AMOUNT') {
        sampleSell = Math.max(0, sampleSell + effectiveManualSell);
      } else if (manualSellMode === 'SET_VALUE') {
        sampleSell = Math.max(0, effectiveManualSell);
      }
    }

    if (sellPriceAction === 'AUTO_MARGIN' || sellPriceAction === 'MANUAL') {
      let step = 0;
      if (rounding === 'FIVE_HUNDRED') step = 500;
      else if (rounding === 'THOUSAND') step = 1000;
      else if (rounding === 'FIVE_THOUSAND') step = 5000;
      if (step > 1) {
        sampleSell = Math.ceil(sampleSell / step) * step;
      }
    }

    return {
      sampleBase,
      baseAdjusted,
      discountVal,
      netBeforeTax,
      taxVal,
      extraCost,
      effectiveBuy,
      sampleSell,
    };
  }, [
    adjustmentMode,
    effectiveValue,
    applySupplierTaxDiscount,
    discountType,
    discountPct,
    discountAmount,
    taxType,
    taxPct,
    taxAmount,
    applyAdditionalCosts,
    totalAdditionalCost,
    sellPriceAction,
    manualSellMode,
    manualSellDirection,
    manualSellValue,
    rounding,
  ]);

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
          {/* STEP 1: PILIH PRODUK SASARAN (HANYA 1 PRODUK)                             */}
          {/* ========================================================================= */}
          {currentStep === 'SELECT_PRODUCTS' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span>Langkah 1: Pilih 1 Produk Sasaran</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pilih satu produk yang akan disesuaikan harganya. Varian dari produk terpilih akan disaring dan dipilih pada langkah berikutnya.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProduct ? (
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-300 dark:border-amber-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                      <span className="truncate max-w-[220px]">1 Produk: {selectedProduct.name}</span>
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                      Belum Ada Produk Dipilih
                    </span>
                  )}
                </div>
              </div>

              {/* Searchable Filters with ONLY active data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Cari nama / SKU produk..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <SearchableSelect
                    value={productCategoryFilter}
                    onChange={setProductCategoryFilter}
                    options={availableCategoryOptions}
                    placeholder="Semua Kategori"
                    searchPlaceholder="Cari kategori produk..."
                    allowClear={true}
                    clearLabel="Semua Kategori"
                    size="sm"
                  />
                </div>

                <div>
                  <SearchableSelect
                    value={productBrandFilter}
                    onChange={setProductBrandFilter}
                    options={availableBrandOptions}
                    placeholder="Semua Merek"
                    searchPlaceholder="Cari merek produk..."
                    allowClear={true}
                    clearLabel="Semua Merek"
                    size="sm"
                  />
                </div>

                <div>
                  <SearchableSelect
                    value={productSupplierFilter}
                    onChange={setProductSupplierFilter}
                    options={availableSupplierOptions}
                    placeholder="Semua Supplier"
                    searchPlaceholder="Cari supplier..."
                    allowClear={true}
                    clearLabel="Semua Supplier"
                    size="sm"
                  />
                </div>
              </div>

              {/* Status info & Reset Selection */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Menampilkan <strong>{paginatedProducts.length}</strong> produk di halaman ini (dari total{' '}
                  <strong>{filteredProducts.length}</strong> produk terfilter)
                </span>
                {selectedProductId && (
                  <button
                    type="button"
                    onClick={handleDeselectProduct}
                    className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold flex items-center gap-1 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Batal Pilih Produk</span>
                  </button>
                )}
              </div>

              {/* Products Grid with Lazy Load / Pagination */}
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
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {paginatedProducts.map((p) => {
                      const isSelected = selectedProductId === p.id;
                      const isInactive = p.is_active === false;
                      const allVars = p.variants || [];
                      const activeVCount = allVars.filter((v) => v.is_active !== false).length;
                      const inactiveVCount = allVars.length - activeVCount;

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (!isInactive) toggleSelectProduct(p.id);
                          }}
                          className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                            isInactive
                              ? 'opacity-60 bg-slate-100/70 dark:bg-slate-900/40 border-dashed border-rose-200 dark:border-rose-900/30 cursor-not-allowed select-none'
                              : isSelected
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600 shadow-sm ring-1 ring-amber-400/40 cursor-pointer'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                          }`}
                        >
                          <div className="pt-0.5">
                            <input
                              type="radio"
                              name="selected_single_product"
                              checked={isSelected}
                              disabled={isInactive}
                              onChange={() => {
                                if (!isInactive) toggleSelectProduct(p.id);
                              }}
                              className={`w-4 h-4 text-amber-600 focus:ring-amber-500 border-slate-300 ${
                                isInactive ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                              }`}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`font-bold text-xs truncate ${
                                  isInactive ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {p.name}
                              </span>

                              {/* Status Tidak Dijual vs Masih Dijual */}
                              {isInactive ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded-full shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Tidak Dijual
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                                  {activeVCount} Varian Aktif
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                              <span className="font-mono text-slate-500">{p.sku}</span>
                              {p.category_name && <span>• {p.category_name}</span>}
                              {p.brand && <span>• {p.brand}</span>}
                            </div>

                            {isInactive ? (
                              <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                                <Ban className="w-3 h-3 shrink-0" />
                                <span>Produk sudah tidak dijual dan tidak dapat dipilih.</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500">
                                <span>
                                  Stok Total:{' '}
                                  <strong className="text-slate-800 dark:text-slate-200 font-bold">
                                    {p.total_stock}
                                  </strong>
                                  {inactiveVCount > 0 && (
                                    <span className="text-rose-500 ml-1.5">({inactiveVCount} nonaktif)</span>
                                  )}
                                </span>
                                {p.supplier_name && (
                                  <span className="truncate max-w-[140px]">Supp: {p.supplier_name}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Controls for Step 1 */}
                  {filteredProducts.length > productPageSize && (
                    <Pagination
                      currentPage={productPage}
                      totalItems={filteredProducts.length}
                      pageSize={productPageSize}
                      onPageChange={setProductPage}
                      pageSizeOptions={[8, 12, 24, 48]}
                      onPageSizeChange={(sz) => {
                        setProductPageSize(sz);
                        setProductPage(1);
                      }}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
                    />
                  )}
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
                    <span>Langkah 2: Pilih Multi Varian</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Produk: <strong className="text-slate-800 dark:text-slate-200">{selectedProduct?.name || '-'}</strong> ({selectedProduct?.sku}). Saring dan centang varian aktif yang ingin disesuaikan harganya.
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
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Produk Induk Read-only Info */}
                  <div className="py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 truncate">
                    <Package className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">{selectedProduct?.name || 'Produk Induk'}</span>
                  </div>

                  {/* Filter by Satuan */}
                  <div>
                    <select
                      value={variantUnitFilter}
                      onChange={(e) => setVariantUnitFilter(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                      className="w-full py-1.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                      className="py-1 px-2.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                        className="py-1 px-2.5 text-[11px] rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Menampilkan <strong>{paginatedVariants.length}</strong> varian di halaman ini (dari total{' '}
                  <strong>{filteredVariants.length}</strong> varian terfilter)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectPageVariants}
                    className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Pilih Varian Aktif Halaman Ini</span>
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredVariants}
                    className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Pilih Semua Varian Aktif</span>
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

              {/* Paginated Variants List to prevent heavy memory overhead */}
              {filteredVariants.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  Tidak ada varian yang cocok dengan filter di atas.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {paginatedVariants.map((v) => {
                      const isSelected = selectedVariantIds.has(v.id);
                      const isInactive = v.is_active === false || v.parentProduct.is_active === false;
                      const attrs = v.attributes && typeof v.attributes === 'object' ? Object.entries(v.attributes) : [];

                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            if (!isInactive) toggleSelectVariant(v.id);
                          }}
                          className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                            isInactive
                              ? 'opacity-60 bg-slate-100/70 dark:bg-slate-900/40 border-dashed border-rose-200 dark:border-rose-900/30 cursor-not-allowed select-none'
                              : isSelected
                              ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs cursor-pointer'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                          }`}
                        >
                          <div className="pt-0.5">
                            <input
                              type="checkbox"
                              checked={isSelected && !isInactive}
                              disabled={isInactive}
                              onChange={() => {
                                if (!isInactive) toggleSelectVariant(v.id);
                              }}
                              className={`w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 ${
                                isInactive ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                              }`}
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                                  {v.parentProduct.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-bold text-xs ${
                                      isInactive ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {v.variant_name}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                    {v.sku}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isInactive ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    Tidak Dijual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 px-2 py-0.5 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    Masih Dijual
                                  </span>
                                )}
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  Stok: {v.current_stock}
                                </span>
                              </div>
                            </div>

                            {/* Status Tidak Dijual Alert Note */}
                            {isInactive && (
                              <div className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                                <Ban className="w-3 h-3 shrink-0" />
                                <span>Varian ini berstatus tidak dijual dan tidak dapat diperbarui harganya.</span>
                              </div>
                            )}

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

                  {/* Pagination Controls for Step 2 */}
                  {filteredVariants.length > variantPageSize && (
                    <Pagination
                      currentPage={variantPage}
                      totalItems={filteredVariants.length}
                      pageSize={variantPageSize}
                      onPageChange={setVariantPage}
                      pageSizeOptions={[10, 20, 50, 100]}
                      onPageSizeChange={(sz) => {
                        setVariantPageSize(sz);
                        setVariantPage(1);
                      }}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
                    />
                  )}
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
                  Tentukan kolom harga sasaran, metode formula, pembulatan harga jual, PPN/diskon, dan biaya tambahan modal.
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

                {/* Info Multi-Satuan Proportional Scaling */}
                <div className="sm:col-span-2 p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs flex items-start gap-2.5">
                  <Calculator className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      Perhitungan Multi-Satuan Proporsional (Faktor Konversi Otomatis):
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 block leading-relaxed">
                      Nilai penyesuaian nominal, biaya tambahan, dan diskon tetap diinput berbasis <strong>satuan dasar</strong> (misal per sak).
                      Untuk satuan bertingkat (misal Bag di mana 1 Bag = 40 Sak), sistem otomatis mengalikan nilai penyesuaian secara proporsional sesuai rasio konversi (contoh: kenaikan modal Rp 1.000/Sak otomatis menjadi Rp 40.000/Bag).
                    </span>
                  </div>
                </div>
              </div>

              {/* REQUIREMENT 3.a, 3.b, 3.c: Ergonomic Formatted Numeric Input with Direction Toggle & Presets */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Metode & Nilai Penyesuaian:
                  </label>

                  {/* Direction toggle for Percent & Fixed Amount */}
                  {adjustmentMode !== 'SET_VALUE' && (
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setAdjustmentDirection('+')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          adjustmentDirection === '+'
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Kenaikan (+)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentDirection('-')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          adjustmentDirection === '-'
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>Penurunan / Diskon (-)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Adjustment Mode Selection */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentMode('PERCENT');
                      if (adjustmentValue === 0) setAdjustmentValue(5);
                    }}
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
                    onClick={() => {
                      setAdjustmentMode('FIXED_AMOUNT');
                      if (adjustmentValue === 0 || adjustmentValue < 100) setAdjustmentValue(1000);
                    }}
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
                    onClick={() => {
                      setAdjustmentMode('SET_VALUE');
                      if (adjustmentValue < 100) setAdjustmentValue(50000);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      adjustmentMode === 'SET_VALUE'
                        ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Set Nilai Pasti (Rp)
                  </button>
                </div>

                {/* Formatted Numeric Input with Indonesian Separator & 2-Decimal Precision */}
                <div className="space-y-1.5">
                  {adjustmentMode === 'PERCENT' && (
                    <NumericInput
                      value={adjustmentValue}
                      onChange={(v) => setAdjustmentValue(v)}
                      allowDecimals={true}
                      maxDecimals={2}
                      min={0}
                      suffixText="%"
                      placeholder="Contoh: 10,00"
                      className="font-bold text-sm"
                    />
                  )}

                  {adjustmentMode === 'FIXED_AMOUNT' && (
                    <NumericInput
                      value={adjustmentValue}
                      onChange={(v) => setAdjustmentValue(v)}
                      allowDecimals={true}
                      maxDecimals={2}
                      min={0}
                      prefixText="Rp"
                      placeholder="Contoh: 5.000,00"
                      className="font-bold text-sm"
                    />
                  )}

                  {adjustmentMode === 'SET_VALUE' && (
                    <NumericInput
                      value={adjustmentValue}
                      onChange={(v) => setAdjustmentValue(v)}
                      allowDecimals={true}
                      maxDecimals={2}
                      min={0}
                      prefixText="Rp"
                      placeholder="Contoh: 75.000,00"
                      className="font-bold text-sm"
                    />
                  )}

                  {/* Validation message */}
                  {!isAdjustmentValid && (
                    <span className="text-[11px] font-semibold text-rose-500 block">
                      ⚠️ Nilai penyesuaian harus lebih dari 0 dan valid.
                    </span>
                  )}
                </div>

                {/* Quick Presets Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Rekomendasi Cepat:</span>
                  {adjustmentMode === 'PERCENT' ? (
                    <>
                      {[2.5, 5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setAdjustmentValue(pct);
                            setAdjustmentDirection('+');
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all ${
                            adjustmentValue === pct && adjustmentDirection === '+'
                              ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-300 font-bold'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          +{pct}%
                        </button>
                      ))}
                      {[5, 10].map((pct) => (
                        <button
                          key={`neg-${pct}`}
                          type="button"
                          onClick={() => {
                            setAdjustmentValue(pct);
                            setAdjustmentDirection('-');
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all ${
                            adjustmentValue === pct && adjustmentDirection === '-'
                              ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-300 text-rose-800 dark:text-rose-300 font-bold'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          -{pct}%
                        </button>
                      ))}
                    </>
                  ) : adjustmentMode === 'FIXED_AMOUNT' ? (
                    <>
                      {[500, 1000, 2000, 5000, 10000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setAdjustmentValue(amt);
                            setAdjustmentDirection('+');
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all ${
                            adjustmentValue === amt && adjustmentDirection === '+'
                              ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-300 font-bold'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          +Rp {formatIdNumber(amt, false)}
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              </div>

              {/* SUPPLIER PPN & DISCOUNT FORM (OPTIONAL) */}
              {targetField === 'buy_price' && canViewBuyPrice && (
                <div className="bg-gradient-to-br from-amber-500/5 via-slate-50 to-slate-50 dark:from-amber-500/10 dark:via-slate-800/40 dark:to-slate-800/40 p-4 rounded-2xl border border-amber-500/30 dark:border-amber-500/20 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="applySupplierTaxDiscountCheck"
                        checked={applySupplierTaxDiscount}
                        onChange={(e) => setApplySupplierTaxDiscount(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <label
                          htmlFor="applySupplierTaxDiscountCheck"
                          className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5 text-amber-500" />
                          <span>Terapkan Diskon dan/atau PPN Pembelian Supplier (Opsional)</span>
                        </label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Gunakan jika faktur distributor menerapkan diskon bertingkat atau PPN pembelian (11% / 12%) pada harga modal dasar.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                      Opsional Faktur
                    </span>
                  </div>

                  {applySupplierTaxDiscount && (
                    <div className="space-y-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Diskon Supplier */}
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <Tag className="w-3 h-3 text-emerald-500" />
                              <span>Diskon Supplier:</span>
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => setDiscountType('PERCENT')}
                                className={`px-2 py-0.5 rounded ${
                                  discountType === 'PERCENT'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => setDiscountType('AMOUNT')}
                                className={`px-2 py-0.5 rounded ${
                                  discountType === 'AMOUNT'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                Rp
                              </button>
                            </div>
                          </div>

                          {discountType === 'PERCENT' ? (
                            <NumericInput
                              value={discountPct}
                              onChange={(v) => setDiscountPct(v)}
                              allowDecimals={true}
                              maxDecimals={2}
                              min={0}
                              max={100}
                              suffixText="%"
                              placeholder="0,00"
                              size="sm"
                              className="font-mono font-bold"
                            />
                          ) : (
                            <NumericInput
                              value={discountAmount}
                              onChange={(v) => setDiscountAmount(v)}
                              allowDecimals={true}
                              maxDecimals={2}
                              min={0}
                              prefixText="Rp"
                              placeholder="0"
                              size="sm"
                              className="font-mono font-bold"
                            />
                          )}

                          {/* Quick discount pills */}
                          <div className="flex items-center gap-1 pt-0.5">
                            <span className="text-[9px] text-slate-400">Pilihan:</span>
                            {[0, 2, 5, 10].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  setDiscountType('PERCENT');
                                  setDiscountPct(d);
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                                  discountType === 'PERCENT' && discountPct === d
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 text-emerald-800 dark:text-emerald-300 font-bold'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {d}%
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* PPN Supplier */}
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <Receipt className="w-3 h-3 text-amber-500" />
                              <span>PPN Supplier:</span>
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => setTaxType('PERCENT')}
                                className={`px-2 py-0.5 rounded ${
                                  taxType === 'PERCENT'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => setTaxType('AMOUNT')}
                                className={`px-2 py-0.5 rounded ${
                                  taxType === 'AMOUNT'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                Rp
                              </button>
                            </div>
                          </div>

                          {taxType === 'PERCENT' ? (
                            <NumericInput
                              value={taxPct}
                              onChange={(v) => setTaxPct(v)}
                              allowDecimals={true}
                              maxDecimals={2}
                              min={0}
                              max={100}
                              suffixText="%"
                              placeholder="11,00"
                              size="sm"
                              className="font-mono font-bold"
                            />
                          ) : (
                            <NumericInput
                              value={taxAmount}
                              onChange={(v) => setTaxAmount(v)}
                              allowDecimals={true}
                              maxDecimals={2}
                              min={0}
                              prefixText="Rp"
                              placeholder="0"
                              size="sm"
                              className="font-mono font-bold"
                            />
                          )}

                          {/* Quick tax pills */}
                          <div className="flex items-center gap-1 pt-0.5">
                            <span className="text-[9px] text-slate-400">Pilihan:</span>
                            {[0, 11, 12].map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  setTaxType('PERCENT');
                                  setTaxPct(t);
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                                  taxType === 'PERCENT' && taxPct === t
                                    ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-300 font-bold'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {t}%{t === 11 ? ' (Standar)' : t === 12 ? ' (UU HPP)' : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* FITUR BIAYA TAMBAHAN PENGADAAN (INCLUDE KE MODAL & TERCATAT DI RIWAYAT) */}
              {targetField === 'buy_price' && canViewBuyPrice && (
                <div className="bg-gradient-to-br from-indigo-500/5 via-slate-50 to-slate-50 dark:from-indigo-500/10 dark:via-slate-800/40 dark:to-slate-800/40 p-4 rounded-2xl border border-indigo-500/30 dark:border-indigo-500/20 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="applyAdditionalCostsCheck"
                        checked={applyAdditionalCosts}
                        onChange={(e) => setApplyAdditionalCosts(e.target.checked)}
                        className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <label
                          htmlFor="applyAdditionalCostsCheck"
                          className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <Truck className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Biaya Tambahan Pengadaan (Include ke Harga Modal)</span>
                        </label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Tambahkan komponen biaya logistik seperti ongkir/ekspedisi, kontainer, dan upah buruh bongkar. Biaya ini langsung di-include ke harga modal akhir barang dan dicatat pada riwayat audit.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shrink-0">
                      Landed Cost
                    </span>
                  </div>

                  {applyAdditionalCosts && (
                    <div className="space-y-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 animate-in fade-in duration-150">
                      {/* List of Additional Costs */}
                      <div className="space-y-2">
                        {additionalCosts.map((cost, idx) => (
                          <div
                            key={cost.id}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          >
                            {/* Cost Name Input with quick presets */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={cost.name}
                                onChange={(e) => {
                                  const next = [...additionalCosts];
                                  next[idx].name = e.target.value;
                                  setAdditionalCosts(next);
                                }}
                                placeholder="Nama Biaya (cth: Biaya Pengiriman)"
                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            {/* Cost Amount (NumericInput with Rp) */}
                            <div className="w-full sm:w-48">
                              <NumericInput
                                value={cost.amount}
                                onChange={(v) => {
                                  const next = [...additionalCosts];
                                  next[idx].amount = v;
                                  setAdditionalCosts(next);
                                }}
                                allowDecimals={true}
                                maxDecimals={2}
                                min={0}
                                prefixText="Rp"
                                placeholder="0"
                                size="sm"
                                className="font-mono font-bold"
                              />
                            </div>

                            {/* Remove Row Button */}
                            {additionalCosts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAdditionalCosts(additionalCosts.filter((_, i) => i !== idx));
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 self-end sm:self-auto transition-colors"
                                title="Hapus baris biaya ini"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Quick Add Presets and Add More Button */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-semibold mr-1">Tambah Cepat:</span>
                          {[
                            { name: 'Biaya Pengiriman', defaultAmt: 2000 },
                            { name: 'Biaya Kontainer', defaultAmt: 5000 },
                            { name: 'Biaya Buruh / Bongkar', defaultAmt: 1000 },
                            { name: 'Asuransi Pengiriman', defaultAmt: 500 },
                          ].map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => {
                                setAdditionalCosts((prev) => [
                                  ...prev,
                                  { id: `cost-${Date.now()}-${Math.random()}`, name: preset.name, amount: preset.defaultAmt },
                                ]);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 font-medium"
                            >
                              + {preset.name}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setAdditionalCosts((prev) => [
                              ...prev,
                              { id: `cost-${Date.now()}`, name: '', amount: 0 },
                            ]);
                          }}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tambah Biaya Lainnya</span>
                        </button>
                      </div>

                      {/* Subtotal of Additional Costs */}
                      <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between text-xs">
                        <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                          Total Biaya Tambahan yang Di-include ke Modal:
                        </span>
                        <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                          Rp {formatIdNumber(totalAdditionalCost, false)} / satuan
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LIVE INTERACTIVE FORMULA PIPELINE (WHEN ADJUSTING BUY_PRICE) */}
              {targetField === 'buy_price' && canViewBuyPrice && (
                <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Calculator className="w-4 h-4 text-amber-500" />
                    <span>Rantai Perhitungan Harga Modal & Jual (Contoh Nilai Dasar Rp 100.000):</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                    <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                      Dasar: Rp {formatIdNumber(samplePipeline.baseAdjusted, false)}
                    </span>
                    {samplePipeline.discountVal > 0 && (
                      <>
                        <span className="text-slate-400 font-sans">➔</span>
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300">
                          - Diskon: Rp {formatIdNumber(samplePipeline.discountVal, false)}
                        </span>
                      </>
                    )}
                    {samplePipeline.taxVal > 0 && (
                      <>
                        <span className="text-slate-400 font-sans">➔</span>
                        <span className="bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-200/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-300">
                          + PPN: Rp {formatIdNumber(samplePipeline.taxVal, false)}
                        </span>
                      </>
                    )}
                    {samplePipeline.extraCost > 0 && (
                      <>
                        <span className="text-slate-400 font-sans">➔</span>
                        <span className="bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-200/60 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                          + Biaya: Rp {formatIdNumber(samplePipeline.extraCost, false)}
                        </span>
                      </>
                    )}
                    <span className="text-slate-400 font-sans">➔</span>
                    <span className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 font-bold">
                      = Modal Akhir: Rp {formatIdNumber(samplePipeline.effectiveBuy, false)}
                    </span>
                    {(sellPriceAction === 'AUTO_MARGIN' || sellPriceAction === 'MANUAL') && (
                      <>
                        <span className="text-slate-400 font-sans">➔</span>
                        <span className="bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold shadow-xs">
                          Jual: Rp {formatIdNumber(samplePipeline.sampleSell, false)} (Dibulatkan)
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ATURAN PEMBULATAN (HANYA BERLAKU UNTUK HARGA JUAL) & AUTO MAINTAIN MARGIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {targetField === 'sell_price' ? (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Aturan Pembulatan Harga Jual:
                      </label>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                        Khusus Harga Jual
                      </span>
                    </div>
                    <select
                      value={rounding}
                      onChange={(e) => setRounding(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="NONE">Tanpa Pembulatan (Sesuai Hasil)</option>
                      <option value="FIVE_HUNDRED">Bulatkan ke 500-an Terdekat (500)</option>
                      <option value="THOUSAND">Bulatkan ke Ribuan Terdekat (1.000)</option>
                      <option value="FIVE_THOUSAND">Bulatkan ke 5 Ribuan Terdekat (5.000)</option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Membulatkan harga jual ke kelipatan tertentu agar kembalian kasir rapi.
                    </p>
                  </div>
                ) : targetField === 'buy_price' && (sellPriceAction === 'AUTO_MARGIN' || sellPriceAction === 'MANUAL') ? (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Pembulatan Harga Jual ({sellPriceAction === 'AUTO_MARGIN' ? 'Penyesuaian Margin' : 'Manual'}):
                      </label>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                        Khusus Harga Jual
                      </span>
                    </div>
                    <select
                      value={rounding}
                      onChange={(e) => setRounding(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="NONE">Tanpa Pembulatan</option>
                      <option value="FIVE_HUNDRED">Bulatkan ke 500-an Terdekat (500)</option>
                      <option value="THOUSAND">Bulatkan ke Ribuan Terdekat (1.000)</option>
                      <option value="FIVE_THOUSAND">Bulatkan ke 5 Ribuan Terdekat (5.000)</option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Hanya harga jual hasil penyesuaian yang dibulatkan. Harga modal tetap disimpan presisi.
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 mt-0.5">
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">
                        Pembulatan Dinonaktifkan untuk Harga Modal
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Aturan pembulatan hanya berlaku untuk harga jual. Harga modal dicatat presisi sesuai faktur dan biaya tambahan.
                      </p>
                    </div>
                  </div>
                )}

                {targetField === 'buy_price' && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Penyesuaian Harga Jual:
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sellPriceAction"
                          checked={sellPriceAction === 'NONE'}
                          onChange={() => setSellPriceAction('NONE')}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            Jangan Ubah Harga Jual
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Hanya memperbarui harga modal saja.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sellPriceAction"
                          checked={sellPriceAction === 'AUTO_MARGIN'}
                          onChange={() => setSellPriceAction('AUTO_MARGIN')}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            Otomatis Jaga Gross Margin (%)
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Otomatis naikkan harga jual proporsional agar % margin kotor tidak tergerus.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sellPriceAction"
                          checked={sellPriceAction === 'MANUAL'}
                          onChange={() => setSellPriceAction('MANUAL')}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            Atur Harga Jual Manual
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Tentukan kenaikan/penurunan atau nilai harga jual sendiri.
                          </span>
                        </div>
                      </label>
                    </div>

                    {sellPriceAction === 'MANUAL' && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManualSellMode('FIXED_AMOUNT')}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              manualSellMode === 'FIXED_AMOUNT'
                                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-200'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Nominal (+/- Rp)
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualSellMode('PERCENT')}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              manualSellMode === 'PERCENT'
                                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-200'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Persentase (%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualSellMode('SET_VALUE')}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              manualSellMode === 'SET_VALUE'
                                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-200'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Tetapkan (Rp)
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {manualSellMode !== 'SET_VALUE' && (
                            <div className="flex rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0">
                              <button
                                type="button"
                                onClick={() => setManualSellDirection('+')}
                                className={`px-2.5 py-1.5 text-xs font-bold ${
                                  manualSellDirection === '+'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => setManualSellDirection('-')}
                                className={`px-2.5 py-1.5 text-xs font-bold ${
                                  manualSellDirection === '-'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                -
                              </button>
                            </div>
                          )}
                          <div className="relative flex-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={manualSellValue === 0 ? '' : formatIdNumber(manualSellValue, false)}
                              onChange={(e) => {
                                const parsed = parseIdNumber(e.target.value);
                                setManualSellValue(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                              }}
                              placeholder={
                                manualSellMode === 'PERCENT'
                                  ? 'Contoh: 5'
                                  : 'Contoh: 2.000'
                              }
                              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                              {manualSellMode === 'PERCENT' ? '%' : 'Rp'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Petugas Penanggung Jawab Audit Card */}
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                      Petugas Penanggung Jawab Perubahan Harga
                    </span>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                      <span>{currentUser?.full_name || currentUser?.username || 'Admin'}</span>
                      {currentUser?.username && (
                        <span className="text-slate-400 font-mono text-[11px]">(@{currentUser.username})</span>
                      )}
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 uppercase">
                        {currentUser?.role || 'Staff'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tercatat Otomatis
                  </span>
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

                  {/* Supplier Diskon & PPN indicator badge if enabled */}
                  {applySupplierTaxDiscount && targetField === 'buy_price' && (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>
                          <strong>Perhitungan Supplier Diterapkan:</strong> Diskon:{' '}
                          {discountType === 'PERCENT' ? `${discountPct}%` : `Rp ${formatIdNumber(discountAmount)}`} | PPN:{' '}
                          {taxType === 'PERCENT' ? `${taxPct}%` : `Rp ${formatIdNumber(taxAmount)}`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                        Masuk Riwayat Audit
                      </span>
                    </div>
                  )}

                  {/* Additional Costs indicator badge if enabled */}
                  {applyAdditionalCosts && targetField === 'buy_price' && totalAdditionalCost > 0 && (
                    <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          <strong>Biaya Tambahan Di-include ke Modal:</strong> +Rp {formatIdNumber(totalAdditionalCost, false)} / satuan (
                          {additionalCosts
                            .filter((c) => c.name.trim() && c.amount > 0)
                            .map((c) => `${c.name}: Rp ${formatIdNumber(c.amount, false)}`)
                            .join(', ')}
                          )
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-indigo-300 dark:border-indigo-700">
                        Include Modal & Log
                      </span>
                    </div>
                  )}

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
                        className="w-full pl-8 pr-3 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                          {canViewBuyPrice && <th className="p-3">Harga Modal Akhir</th>}
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
                              <td className="p-3">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                  {item.unit_name}
                                </span>
                                {item.conversion_factor && item.conversion_factor > 1 ? (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono block">
                                    1 {item.unit_name} = {item.conversion_factor} satuan dasar
                                  </span>
                                ) : item.is_base_unit ? (
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    (Satuan Dasar)
                                  </span>
                                ) : null}
                              </td>
                              <td className="p-3 font-mono">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="line-through text-slate-400 text-[11px]">
                                    {formatIdNumber(item.current_sell_price, false)}
                                  </span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    → {formatIdNumber(item.next_sell_price, false)}
                                  </span>
                                  {item.next_sell_price !== item.current_sell_price && (
                                    <span
                                      className={`text-[10px] font-bold ${
                                        item.next_sell_price > item.current_sell_price
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      ({item.next_sell_price > item.current_sell_price ? '+' : ''}
                                      {formatIdNumber(item.next_sell_price - item.current_sell_price, false)})
                                    </span>
                                  )}
                                </div>
                              </td>
                              {canViewBuyPrice && (
                                <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="line-through text-slate-400 text-[11px]">
                                        {formatIdNumber(item.current_buy_price, false)}
                                      </span>
                                      <span className="font-bold text-slate-900 dark:text-white">
                                        → {formatIdNumber(item.next_buy_price, false)}
                                      </span>
                                      {item.next_buy_price !== item.current_buy_price && (
                                        <span
                                          className={`text-[10px] font-bold ${
                                            item.next_buy_price > item.current_buy_price
                                              ? 'text-rose-600 dark:text-rose-400'
                                              : 'text-emerald-600 dark:text-emerald-400'
                                          }`}
                                        >
                                          ({item.next_buy_price > item.current_buy_price ? '+' : ''}
                                          {formatIdNumber(item.next_buy_price - item.current_buy_price, false)})
                                        </span>
                                      )}
                                    </div>
                                    {(item.discount_amount || item.tax_amount || item.total_additional_cost) ? (
                                      <div className="text-[10px] flex flex-wrap gap-1 text-slate-500">
                                        {item.discount_amount ? (
                                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                            Disc: -Rp {formatIdNumber(item.discount_amount, false)}
                                          </span>
                                        ) : null}
                                        {item.tax_amount ? (
                                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                            PPN: +Rp {formatIdNumber(item.tax_amount, false)}
                                          </span>
                                        ) : null}
                                        {item.total_additional_cost ? (
                                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                                            Biaya: +Rp {formatIdNumber(item.total_additional_cost, false)}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
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

                  {/* Responsible User Info in Step 4 */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block">Petugas Penanggung Jawab Audit:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {currentUser?.full_name || currentUser?.username || 'Admin'}
                          </span>
                          {currentUser?.username && (
                            <span className="text-slate-400 font-mono text-[11px]">(@{currentUser.username})</span>
                          )}
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            {currentUser?.role || 'Staff'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Tercatat Resmi
                    </span>
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
                      ? `${effectiveValue > 0 ? '+' : ''}${effectiveValue}%`
                      : adjustmentMode === 'FIXED_AMOUNT'
                      ? `${effectiveValue > 0 ? '+' : ''}Rp ${formatIdNumber(effectiveValue, false)}`
                      : `Rp ${formatIdNumber(effectiveValue, false)}`}
                  </span>
                </div>
                {applySupplierTaxDiscount && targetField === 'buy_price' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Diskon Supplier:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {discountType === 'PERCENT' ? `${discountPct}%` : `Rp ${formatIdNumber(discountAmount, false)}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PPN Supplier:</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {taxType === 'PERCENT' ? `${taxPct}%` : `Rp ${formatIdNumber(taxAmount, false)}`}
                      </span>
                    </div>
                  </>
                )}
                {applyAdditionalCosts && targetField === 'buy_price' && totalAdditionalCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Biaya Tambahan (Landed):</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      +Rp {formatIdNumber(totalAdditionalCost, false)} (
                      {additionalCosts
                        .filter((c) => c.name.trim() && c.amount > 0)
                        .map((c) => c.name)
                        .join(', ')}
                      )
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Petugas Penanggung Jawab:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {currentUser?.full_name || currentUser?.username || 'Admin'}
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
                  disabled={!selectedProductId}
                  onClick={() => setCurrentStep('SELECT_VARIANTS')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                >
                  <span>Lanjut: Pilih Multi Varian</span>
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
                  disabled={!reason.trim() || !isAdjustmentValid}
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