import React, { useState, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Category, Brand } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { findLongestCommonPrefix, suggestVariantName } from '../utils/catalogGrouping';
import { formatStock } from '../utils/format';
import {
  X,
  GitMerge,
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  Trash2,
  PowerOff,
  Info,
  Sparkles,
  Plus,
  Building2,
  Folder,
  ArrowRight,
  Lock,
} from 'lucide-react';

interface BulkMergeProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSourceProducts: Product[];
  lockedTargetProduct?: Product | null;
  allProducts: Product[];
  categories?: Category[];
  brands?: Brand[];
  onSuccess: (targetProductId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface SourceVariantFlattened extends ProductVariant {
  sourceProductId: string;
  sourceProductName: string;
  sourceProductSku: string;
}

export const BulkMergeProductsModal: React.FC<BulkMergeProductsModalProps> = ({
  isOpen,
  onClose,
  initialSourceProducts,
  lockedTargetProduct,
  allProducts,
  categories = [],
  brands = [],
  onSuccess,
  showToast,
}) => {
  const { can } = useAuth();
  const canDeleteProduct = can('products:delete');

  // List of source products currently in this merge batch
  const [sourceProducts, setSourceProducts] = useState<Product[]>([]);

  // Target Mode: 'existing' | 'new'
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');

  // If targetMode === 'existing'
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [targetProductName, setTargetProductName] = useState<string>('');
  const [targetStandardVariantName, setTargetStandardVariantName] = useState<string>('');

  // If targetMode === 'new'
  const [newProductName, setNewProductName] = useState<string>('');
  const [newProductSku, setNewProductSku] = useState<string>('');
  const [newCategoryId, setNewCategoryId] = useState<string>('');
  const [newBrand, setNewBrand] = useState<string>('');

  // Variant renaming & SKU maps
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [skuMap, setSkuMap] = useState<Record<string, string>>({});

  // Action on source products
  const [sourceEmptyAction, setSourceEmptyAction] = useState<'delete' | 'deactivate'>('deactivate');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Search to add more products to the source batch
  const [productToAddId, setProductToAddId] = useState<string>('');

  // Reset and initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialSources = lockedTargetProduct
        ? initialSourceProducts.filter((p) => p.id !== lockedTargetProduct.id)
        : [...initialSourceProducts];

      setSourceProducts(initialSources);

      if (lockedTargetProduct) {
        setTargetMode('existing');
        setTargetProductId(lockedTargetProduct.id);
        setTargetProductName(lockedTargetProduct.name);
      } else {
        setTargetMode('new');
        setTargetProductId('');
        setTargetProductName('');
      }

      setTargetStandardVariantName('');
      setRenameMap({});
      setSkuMap({});
      setSourceEmptyAction('deactivate');
      setNotes('');
      setProductToAddId('');
    }
  }, [isOpen, initialSourceProducts, lockedTargetProduct]);

  // Target product object if mode === 'existing'
  const targetProduct = useMemo(() => {
    if (targetMode !== 'existing') return null;
    if (lockedTargetProduct && lockedTargetProduct.id === targetProductId) {
      return lockedTargetProduct;
    }
    return allProducts.find((p) => p.id === targetProductId) || null;
  }, [allProducts, targetProductId, targetMode, lockedTargetProduct]);

  // Flatten all variants from all selected source products
  const flattenedSourceVariants: SourceVariantFlattened[] = useMemo(() => {
    const list: SourceVariantFlattened[] = [];
    for (const p of sourceProducts) {
      const vars = p.variants || [];
      for (const v of vars) {
        list.push({
          ...v,
          sourceProductId: p.id,
          sourceProductName: p.name,
          sourceProductSku: p.sku,
        });
      }
    }
    return list;
  }, [sourceProducts]);

  // Detect Longest Common Prefix across all source products (Solusi 2)
  const commonPrefix = useMemo(() => {
    const names = sourceProducts.map((p) => p.name);
    return findLongestCommonPrefix(names);
  }, [sourceProducts]);

  // Auto-fill suggested new product name & category/brand when mode is 'new'
  useEffect(() => {
    if (targetMode === 'new' && sourceProducts.length > 0) {
      if (!newProductName || newProductName === commonPrefix) {
        setNewProductName(commonPrefix || sourceProducts[0].name);
      }

      const firstWithCat = sourceProducts.find((p) => p.category_id);
      if (firstWithCat?.category_id && !newCategoryId) {
        setNewCategoryId(firstWithCat.category_id);
      }

      const firstWithBrand = sourceProducts.find((p) => p.brand);
      if (firstWithBrand?.brand && !newBrand) {
        setNewBrand(firstWithBrand.brand);
      }
    }
  }, [targetMode, commonPrefix, sourceProducts]);

  // Smart Auto-Naming generator function
  const applySmartAutoNaming = () => {
    const newRenameMap: Record<string, string> = {};
    for (const v of flattenedSourceVariants) {
      const suggested = suggestVariantName(v.sourceProductName, commonPrefix);
      if (v.variant_name.trim().toLowerCase() === 'standar') {
        newRenameMap[v.id] = suggested;
      } else {
        newRenameMap[v.id] = `${suggested} - ${v.variant_name}`;
      }
    }
    setRenameMap(newRenameMap);
  };

  // Run auto-naming when source products change or modal first opens
  useEffect(() => {
    if (flattenedSourceVariants.length > 0 && Object.keys(renameMap).length === 0) {
      applySmartAutoNaming();
    }
  }, [flattenedSourceVariants, commonPrefix]);

  // Collision detection for variant names in target product
  const collisionWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    const existingNames = new Set<string>();

    if (targetMode === 'existing' && targetProduct) {
      for (const v of targetProduct.variants || []) {
        existingNames.add(v.variant_name.trim().toLowerCase());
      }
    }

    const seenInBatch = new Set<string>();

    for (const v of flattenedSourceVariants) {
      const plannedName = (renameMap[v.id] ?? v.variant_name).trim().toLowerCase();

      if (existingNames.has(plannedName)) {
        warnings[v.id] = `Nama varian "${renameMap[v.id] ?? v.variant_name}" sudah ada di produk target.`;
      } else if (seenInBatch.has(plannedName)) {
        warnings[v.id] = `Nama varian "${renameMap[v.id] ?? v.variant_name}" duplikat dengan produk sumber lain di batch ini.`;
      }
      seenInBatch.add(plannedName);
    }

    return warnings;
  }, [flattenedSourceVariants, renameMap, targetMode, targetProduct]);

  const hasCollisions = Object.keys(collisionWarnings).length > 0;

  // Options for selecting existing target product (excluding products in source list)
  const targetProductOptions: SearchableOption[] = useMemo(() => {
    const sourceIdsSet = new Set(sourceProducts.map((p) => p.id));
    return allProducts
      .filter((p) => !sourceIdsSet.has(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name,
        subtitle: `SKU: ${p.sku} | ${p.variants?.length || 0} varian | Stok: ${formatStock(p.total_stock)}`,
      }));
  }, [allProducts, sourceProducts]);

  // Options for adding more products to source batch
  const addMoreSourceOptions: SearchableOption[] = useMemo(() => {
    const alreadySelectedSet = new Set(sourceProducts.map((p) => p.id));
    if (targetProductId) alreadySelectedSet.add(targetProductId);

    return allProducts
      .filter((p) => !alreadySelectedSet.has(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name,
        subtitle: `SKU: ${p.sku} | Stok: ${formatStock(p.total_stock)}`,
      }));
  }, [allProducts, sourceProducts, targetProductId]);

  const handleAddProductToBatch = (productId: string) => {
    if (!productId) return;
    const prod = allProducts.find((p) => p.id === productId);
    if (prod && !sourceProducts.some((p) => p.id === prod.id)) {
      setSourceProducts((prev) => [...prev, prod]);
      setProductToAddId('');
    }
  };

  const handleRemoveProductFromBatch = (productId: string) => {
    setSourceProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sourceProducts.length === 0) {
      showToast('Pilih minimal satu produk sumber untuk digabungkan', 'error');
      return;
    }

    if (targetMode === 'existing' && !targetProductId) {
      showToast('Pilih produk target yang ada terlebih dahulu', 'error');
      return;
    }

    if (targetMode === 'new' && (!newProductName || !newProductName.trim())) {
      showToast('Nama produk induk baru wajib diisi', 'error');
      return;
    }

    if (hasCollisions) {
      showToast('Terdapat bentrokan nama varian. Silakan sesuaikan nama varian sebelum menggabungkan.', 'error');
      return;
    }

    // Clean maps
    const cleanRenameMap: Record<string, string> = {};
    const cleanSkuMap: Record<string, string> = {};

    for (const v of flattenedSourceVariants) {
      if (renameMap[v.id] && renameMap[v.id].trim() !== v.variant_name.trim()) {
        cleanRenameMap[v.id] = renameMap[v.id].trim();
      }
      if (skuMap[v.id] && skuMap[v.id].trim() !== v.sku.trim()) {
        cleanSkuMap[v.id] = skuMap[v.id].trim();
      }
    }

    try {
      setIsSubmitting(true);
      const res = await api.bulkMergeProducts({
        source_product_ids: sourceProducts.map((p) => p.id),
        target_mode: targetMode,
        target_product_id: targetMode === 'existing' ? targetProductId : undefined,
        target_product_name:
          targetMode === 'existing' && targetProductName.trim() !== targetProduct?.name
            ? targetProductName.trim()
            : undefined,
        target_standard_variant_name:
          targetMode === 'existing' && targetStandardVariantName.trim()
            ? targetStandardVariantName.trim()
            : undefined,
        new_product_name: targetMode === 'new' ? newProductName.trim() : undefined,
        new_product_sku: targetMode === 'new' && newProductSku.trim() ? newProductSku.trim() : undefined,
        category_id: targetMode === 'new' && newCategoryId ? newCategoryId : undefined,
        brand: targetMode === 'new' && newBrand.trim() ? newBrand.trim() : undefined,
        rename_map: Object.keys(cleanRenameMap).length > 0 ? cleanRenameMap : undefined,
        sku_map: Object.keys(cleanSkuMap).length > 0 ? cleanSkuMap : undefined,
        source_empty_action: sourceEmptyAction,
        notes: notes.trim() || undefined,
      });

      showToast(res.message || 'Produk berhasil digabungkan massal!', 'success');
      onSuccess(res.target_product_id);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal menggabungkan produk massal', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Gabung Banyak Produk Menjadi Varian</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-extrabold">
                  {sourceProducts.length} Produk Sumber ({flattenedSourceVariants.length} Varian)
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pindahkan seluruh varian, stok, konversi satuan, dan riwayat mutasi dari banyak produk ke dalam satu produk induk
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Mode Selector (if not locked) */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Tentukan Tujuan Penggabungan:
            </label>

            {lockedTargetProduct ? (
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-200 dark:border-indigo-900/50 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 block font-semibold">
                      Target Penggabungan Terkunci (Serap ke Produk Ini):
                    </span>
                    <strong className="text-sm font-bold text-slate-900 dark:text-white">
                      {lockedTargetProduct.name}
                    </strong>
                    <span className="font-mono text-slate-500 ml-2">({lockedTargetProduct.sku})</span>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                  {lockedTargetProduct.variants?.length || 1} Varian Ada
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    targetMode === 'new'
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="target_mode"
                    value="new"
                    checked={targetMode === 'new'}
                    onChange={() => setTargetMode('new')}
                    className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                  <div>
                    <strong className="text-xs text-slate-900 dark:text-white block">
                      1. Buat Produk Induk Baru (Paling Cepat)
                    </strong>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Sistem membuat master produk baru dan semua produk terpilih akan dilebur menjadi varian di dalamnya.
                    </p>
                  </div>
                </label>

                <label
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    targetMode === 'existing'
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="target_mode"
                    value="existing"
                    checked={targetMode === 'existing'}
                    onChange={() => setTargetMode('existing')}
                    className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                  <div>
                    <strong className="text-xs text-slate-900 dark:text-white block">
                      2. Gabung ke Produk yang Sudah Ada
                    </strong>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Pilih produk yang sudah ada di katalog sebagai induk tujuan bagi produk-produk terpilih.
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Target Configuration Section */}
          {targetMode === 'new' ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-500" />
                  Informasi Master Produk Induk Baru:
                </span>
                {commonPrefix && (
                  <span className="text-[11px] text-slate-500 bg-slate-200/70 dark:bg-slate-700 px-2 py-0.5 rounded">
                    Awalan Nama Sama: <strong>"{commonPrefix}"</strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Produk Induk Baru <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="Contoh: Pipa PVC Rucika AW atau Cat Dulux Weathershield"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SKU Produk Induk (Opsional)
                  </label>
                  <input
                    type="text"
                    value={newProductSku}
                    onChange={(e) => setNewProductSku(e.target.value)}
                    placeholder="Otomatis PRD-XXXXXX jika kosong"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Merek / Brand
                  </label>
                  <input
                    type="text"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="Merek produk induk"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          ) : !lockedTargetProduct ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Pilih Produk Tujuan yang Sudah Ada <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                value={targetProductId}
                onChange={(val) => {
                  setTargetProductId(val);
                  const p = allProducts.find((item) => item.id === val);
                  if (p) {
                    setTargetProductName(p.name);
                  }
                }}
                options={targetProductOptions}
                placeholder="Cari nama produk target atau SKU..."
                searchPlaceholder="Ketik untuk mencari produk..."
                icon={Package}
                iconColor="text-indigo-500"
              />

              {targetProduct && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-200 dark:border-indigo-900/50 space-y-2 text-xs text-indigo-900 dark:text-indigo-200">
                  <div className="flex items-center justify-between">
                    <strong>Target: {targetProduct.name}</strong>
                    <span className="font-mono text-[11px]">({targetProduct.variants?.length || 1} Varian Saat Ini)</span>
                  </div>

                  {/* Optional: rename standard variant if target only had 1 variant */}
                  {(targetProduct.variants?.length || 1) === 1 && (
                    <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                          Ubah Nama Varian Standar Target (Opsional):
                        </label>
                        <input
                          type="text"
                          value={targetStandardVariantName}
                          onChange={(e) => setTargetStandardVariantName(e.target.value)}
                          placeholder="Misal: Standar / Ukuran 1/2 inch"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                          Ubah Nama Master Produk Target (Opsional):
                        </label>
                        <input
                          type="text"
                          value={targetProductName}
                          onChange={(e) => setTargetProductName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Source Products Batch List (With ability to remove or add more) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Daftar Produk yang Dilebur ({sourceProducts.length} Produk):
              </label>
              <span className="text-[11px] text-slate-400">
                Total Stok Sumber: <strong>{formatStock(sourceProducts.reduce((sum, p) => sum + (Number(p.total_stock) || 0), 0))}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
              {sourceProducts.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs group"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-slate-900 dark:text-white block truncate" title={p.name}>
                      {p.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      SKU: {p.sku} | Stok: {formatStock(p.total_stock)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveProductFromBatch(p.id)}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                    title="Keluarkan dari daftar gabung"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick selector to add another product to source batch */}
            <div className="pt-1">
              <SearchableSelect
                value={productToAddId}
                onChange={(val) => handleAddProductToBatch(val)}
                options={addMoreSourceOptions}
                placeholder="+ Tambah produk lain ke daftar gabung ini..."
                searchPlaceholder="Cari nama produk atau SKU..."
                allowClear={true}
                size="sm"
                icon={Plus}
                iconColor="text-indigo-500"
              />
            </div>
          </div>

          {/* Variants Renaming Table (Solusi 2: Smart Auto-Naming) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Konfigurasi Nama Varian di Produk Tujuan:
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nama varian otomatis diekstrak dari pembeda nama produk asal. Anda dapat mengeditnya secara bebas.
                </p>
              </div>

              <button
                type="button"
                onClick={applySmartAutoNaming}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors shrink-0 self-start sm:self-auto"
                title="Terapkan kembali saran nama otomatis berdasarkan awalan yang sama"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Reset Saran Nama Otomatis</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {flattenedSourceVariants.map((v) => {
                  const hasCollision = Boolean(collisionWarnings[v.id]);
                  return (
                    <div
                      key={v.id}
                      className={`p-3 space-y-2 text-xs transition-colors ${
                        hasCollision
                          ? 'bg-rose-50/60 dark:bg-rose-950/30'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="font-medium">
                            Asal: <strong className="text-slate-900 dark:text-white">{v.sourceProductName}</strong>
                            {v.variant_name.toLowerCase() !== 'standar' && (
                              <span className="text-slate-500"> ({v.variant_name})</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          <span>SKU: {v.sku}</span>
                          <span>Stok: <strong>{formatStock(v.current_stock)}</strong></span>
                        </div>
                      </div>

                      {hasCollision && (
                        <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-[11px] font-semibold">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{collisionWarnings[v.id]}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Nama Varian di Produk Tujuan:
                          </label>
                          <input
                            type="text"
                            value={renameMap[v.id] ?? v.variant_name}
                            onChange={(e) =>
                              setRenameMap((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                              hasCollision
                                ? 'border-rose-400 focus:ring-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500'
                            }`}
                            placeholder="Nama varian"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            SKU Varian (Tetap / Opsional):
                          </label>
                          <input
                            type="text"
                            value={skuMap[v.id] ?? v.sku}
                            onChange={(e) =>
                              setSkuMap((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="SKU varian"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action on Source Products */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="text-xs">
              <strong className="text-slate-900 dark:text-white">
                Tindakan pada {sourceProducts.length} Produk Asal:
              </strong>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                Setelah seluruh varian dipindahkan ke produk target, tentukan perlakuan untuk master produk asal:
              </p>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
                <input
                  type="radio"
                  name="bulk_merge_source_empty_action"
                  value="deactivate"
                  checked={sourceEmptyAction === 'deactivate'}
                  onChange={() => setSourceEmptyAction('deactivate')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <PowerOff className="w-4 h-4 text-slate-500" />
                  <span>
                    <strong>Nonaktifkan Produk Asal (Direkomendasikan)</strong>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Disembunyikan dari penjualan kasir namun data historis tetap utuh.
                    </span>
                  </span>
                </div>
              </label>

              {canDeleteProduct && (
                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-rose-500/5 transition-colors">
                  <input
                    type="radio"
                    name="bulk_merge_source_empty_action"
                    value="delete"
                    checked={sourceEmptyAction === 'delete'}
                    onChange={() => setSourceEmptyAction('delete')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>
                      <strong className="text-rose-600 dark:text-rose-400">Hapus Produk Asal Sepenuhnya</strong>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Master produk asal dihapus karena seluruh varian dan mutasinya sudah dilebur ke produk target.
                      </span>
                    </span>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Notes Input */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Catatan Alasan Penggabungan Massal (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Merapikan produk terpisah pasca-import Excel"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              sourceProducts.length === 0 ||
              hasCollisions ||
              (targetMode === 'existing' && !targetProductId) ||
              (targetMode === 'new' && !newProductName.trim())
            }
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Menggabungkan {sourceProducts.length} Produk...</span>
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                <span>
                  Gabungkan {sourceProducts.length} Produk Menjadi Varian
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
