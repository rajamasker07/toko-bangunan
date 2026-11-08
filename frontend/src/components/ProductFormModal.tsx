import React, { useState } from 'react';
import { Category } from '../types';
import { X, Plus, Trash2, CheckCircle2, Layers, Package, Tag, Sparkles } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSuccess,
  showToast,
}) => {
  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Common Product Info
  const [name, setName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  // Simple Product Form States
  const [initialStock, setInitialStock] = useState<number>(0);
  const [baseUnitName, setBaseUnitName] = useState<string>('Pcs');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<string>('');

  // Additional units for simple product
  const [simpleAdditionalUnits, setSimpleAdditionalUnits] = useState<Array<{
    unit_name: string;
    conversion_factor: number;
    sell_price: number;
    buy_price: number;
  }>>([]);

  // Multi-variant Form States
  const [variantsList, setVariantsList] = useState<Array<{
    variant_name: string;
    sku: string;
    barcode: string;
    initial_stock: number;
    min_stock: number;
    units: Array<{
      unit_name: string;
      conversion_factor: number;
      is_base_unit: boolean;
      buy_price: number;
      sell_price: number;
      wholesale_price?: number;
    }>;
  }>>([
    {
      variant_name: '',
      sku: '',
      barcode: '',
      initial_stock: 0,
      min_stock: 5,
      units: [
        {
          unit_name: 'Pcs',
          conversion_factor: 1,
          is_base_unit: true,
          buy_price: 0,
          sell_price: 0,
        },
      ],
    },
  ]);

  if (!isOpen) return null;

  // Flatten categories with visual indent for subcategories
  const renderCategoryOptions = () => {
    const options: React.ReactNode[] = [];

    const traverse = (cats: Category[], level = 0) => {
      for (const cat of cats) {
        const prefix = '\u00A0\u00A0\u00A0\u00A0'.repeat(level) + (level > 0 ? '↳ ' : '');
        options.push(
          <option key={cat.id} value={cat.id}>
            {prefix}{cat.name}
          </option>
        );
        if (cat.children && cat.children.length > 0) {
          traverse(cat.children, level + 1);
        }
      }
    };

    traverse(categories);
    return options;
  };

  // Variant handlers
  const handleAddVariant = () => {
    setVariantsList((prev) => [
      ...prev,
      {
        variant_name: '',
        sku: '',
        barcode: '',
        initial_stock: 0,
        min_stock: 5,
        units: [
          {
            unit_name: 'Pcs',
            conversion_factor: 1,
            is_base_unit: true,
            buy_price: 0,
            sell_price: 0,
          },
        ],
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    if (variantsList.length <= 1) {
      showToast('Minimal harus ada 1 varian jika menggunakan multi-varian', 'error');
      return;
    }
    setVariantsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVariantChange = (index: number, field: string, value: any) => {
    setVariantsList((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddUnitToVariant = (variantIdx: number) => {
    setVariantsList((prev) => {
      const copy = [...prev];
      copy[variantIdx].units.push({
        unit_name: 'Dus',
        conversion_factor: 10,
        is_base_unit: false,
        buy_price: 0,
        sell_price: 0,
      });
      return copy;
    });
  };

  const handleRemoveUnitFromVariant = (variantIdx: number, unitIdx: number) => {
    setVariantsList((prev) => {
      const copy = [...prev];
      if (copy[variantIdx].units[unitIdx].is_base_unit) {
        showToast('Satuan dasar utama tidak boleh dihapus!', 'error');
        return copy;
      }
      copy[variantIdx].units = copy[variantIdx].units.filter((_, i) => i !== unitIdx);
      return copy;
    });
  };

  const handleUnitChange = (variantIdx: number, unitIdx: number, field: string, value: any) => {
    setVariantsList((prev) => {
      const copy = [...prev];
      copy[variantIdx].units[unitIdx] = {
        ...copy[variantIdx].units[unitIdx],
        [field]: value,
      };
      return copy;
    });
  };

  // Additional units for simple product
  const handleAddSimpleUnit = () => {
    setSimpleAdditionalUnits((prev) => [
      ...prev,
      { unit_name: 'Dus', conversion_factor: 10, buy_price: 0, sell_price: 0 },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama produk wajib diisi', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      let payload: any = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        category_id: categoryId || null,
        brand: brand.trim() || undefined,
        description: description.trim() || undefined,
        min_stock_alert: Number(minStockAlert) || 5,
        has_variants: hasVariants,
      };

      if (!hasVariants) {
        // Simple product: backend automatically creates 1 variant and its units
        const units = [
          {
            unit_name: baseUnitName,
            conversion_factor: 1,
            is_base_unit: true,
            buy_price: Number(buyPrice) || 0,
            sell_price: Number(sellPrice) || 0,
            wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
          },
          ...simpleAdditionalUnits.map((u) => ({
            unit_name: u.unit_name,
            conversion_factor: Number(u.conversion_factor) || 1,
            is_base_unit: false,
            buy_price: Number(u.buy_price) || 0,
            sell_price: Number(u.sell_price) || 0,
            wholesale_price: null,
          })),
        ];

        payload = {
          ...payload,
          initial_stock: Number(initialStock) || 0,
          min_stock: Number(minStockAlert) || 5,
          base_unit_name: baseUnitName,
          buy_price: Number(buyPrice) || 0,
          sell_price: Number(sellPrice) || 0,
          wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
          units,
        };
      } else {
        // Multi-variant validation
        for (let i = 0; i < variantsList.length; i++) {
          if (!variantsList[i].variant_name.trim()) {
            throw new Error(`Nama varian ke-${i + 1} wajib diisi!`);
          }
        }

        payload = {
          ...payload,
          variants: variantsList.map((v) => ({
            variant_name: v.variant_name.trim(),
            sku: v.sku.trim() || undefined,
            barcode: v.barcode.trim() || undefined,
            initial_stock: Number(v.initial_stock) || 0,
            min_stock: Number(v.min_stock) || 5,
            units: v.units.map((u) => ({
              unit_name: u.unit_name,
              conversion_factor: Number(u.conversion_factor) || 1,
              is_base_unit: Boolean(u.is_base_unit),
              buy_price: Number(u.buy_price) || 0,
              sell_price: Number(u.sell_price) || 0,
              wholesale_price: u.wholesale_price ? Number(u.wholesale_price) : null,
            })),
          })),
        };
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan produk');
      }

      showToast('Produk dan varian baru berhasil ditambahkan!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Tambah Produk Bahan Bangunan Baru
              </h2>
              <p className="text-xs text-slate-500">
                Otomatis menghasilkan ID UUIDv7 dan 1 varian default jika tanpa varian
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              1. Informasi Utama Produk
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Misal: Semen Gresik PPC 50kg, Cat Dulux Weathershield, Pipa PVC..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori / Sub-Kategori:
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">-- Pilih Kategori --</option>
                  {renderCategoryOptions()}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Merk / Brand:
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Misal: Holcim, Rucika, Dulux, Roman..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  SKU Master (Opsional):
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate unik"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Batas Peringatan Stok Minimal:
                </label>
                <input
                  type="number"
                  min="1"
                  value={minStockAlert}
                  onChange={(e) => setMinStockAlert(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi / Spesifikasi:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Keterangan dimensi, daya sebar, sertifikasi SNI, dll..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Mode Varian Selector */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>Struktur Varian Produk</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {hasVariants
                    ? 'Mode Multi-Varian aktif: Tambahkan varian ukuran/warna beserta harga masing-masing.'
                    : 'Mode Sederhana aktif: Sistem otomatis membuat 1 Varian Standar di database.'}
                </p>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <button
                  type="button"
                  onClick={() => setHasVariants(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !hasVariants
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Tanpa Varian (Otomatis 1)
                </button>
                <button
                  type="button"
                  onClick={() => setHasVariants(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    hasVariants
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Multi-Varian
                </button>
              </div>
            </div>
          </div>

          {/* Simple Product Configuration Form */}
          {!hasVariants && (
            <div className="space-y-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Pengaturan Stok & Satuan Harga (Varian Otomatis)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Satuan Dasar (Stock Unit):
                  </label>
                  <select
                    value={baseUnitName}
                    onChange={(e) => setBaseUnitName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Sak">Sak (Semen / Mortar)</option>
                    <option value="Dus">Dus (Keramik / Granite)</option>
                    <option value="Batang">Batang (Pipa / Besi)</option>
                    <option value="Pail / Galon">Pail / Galon (Cat)</option>
                    <option value="Pcs">Pcs / Buah</option>
                    <option value="Meter">Meter (Kabel / Selang)</option>
                    <option value="Roll">Roll (Kawat / Talang)</option>
                    <option value="Kg">Kg (Paku / Pasir)</option>
                    <option value="Lembar">Lembar (Triplek / GRC)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Stok Awal Fisik:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Jual Standar (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    placeholder="Contoh: 68000"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Beli / Modal (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(Number(e.target.value))}
                    placeholder="Contoh: 62000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Grosir / Proyek (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    placeholder="Contoh: 65000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Extra multi-unit pricing for single variant */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Satuan Harga Tambahan (Multi-Satuan e.g. Truk, Ikat, Dus):
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSimpleUnit}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Satuan Lain
                  </button>
                </div>

                {simpleAdditionalUnits.map((u, uIdx) => (
                  <div key={uIdx} className="grid grid-cols-4 gap-2 items-center mb-2">
                    <input
                      type="text"
                      placeholder="Nama Satuan (e.g. Truk)"
                      value={u.unit_name}
                      onChange={(e) => {
                        const copy = [...simpleAdditionalUnits];
                        copy[uIdx].unit_name = e.target.value;
                        setSimpleAdditionalUnits(copy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Konversi (Isi berapa sak/pcs)"
                      value={u.conversion_factor}
                      onChange={(e) => {
                        const copy = [...simpleAdditionalUnits];
                        copy[uIdx].conversion_factor = Number(e.target.value);
                        setSimpleAdditionalUnits(copy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                    />
                    <input
                      type="number"
                      placeholder="Harga Jual"
                      value={u.sell_price}
                      onChange={(e) => {
                        const copy = [...simpleAdditionalUnits];
                        copy[uIdx].sell_price = Number(e.target.value);
                        setSimpleAdditionalUnits(copy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setSimpleAdditionalUnits(prev => prev.filter((_, i) => i !== uIdx))}
                      className="p-1 text-rose-500 hover:text-rose-700 justify-self-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Variant Configuration Form */}
          {hasVariants && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Konfigurasi Varian & Multi-Satuan
                </h4>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Varian Baru</span>
                </button>
              </div>

              <div className="space-y-4">
                {variantsList.map((variant, vIdx) => (
                  <div
                    key={vIdx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        <span>Varian #{vIdx + 1}</span>
                      </span>
                      {variantsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(vIdx)}
                          className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Varian
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          Nama Varian (Spesifikasi/Warna/Ukuran):
                        </label>
                        <input
                          type="text"
                          value={variant.variant_name}
                          onChange={(e) => handleVariantChange(vIdx, 'variant_name', e.target.value)}
                          placeholder="Contoh: 1/2 inch AW, Putih Salju 5kg, Ulir 10mm"
                          required
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          SKU Varian (Opsional):
                        </label>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => handleVariantChange(vIdx, 'sku', e.target.value)}
                          placeholder="Auto-generate jika kosong"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          Stok Awal Fisik:
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={variant.initial_stock}
                          onChange={(e) => handleVariantChange(vIdx, 'initial_stock', Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 font-medium"
                        />
                      </div>
                    </div>

                    {/* Units inside this variant */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Satuan Harga Varian:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddUnitToVariant(vIdx)}
                          className="text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                        >
                          + Tambah Satuan
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {variant.units.map((u, uIdx) => (
                          <div key={uIdx} className="grid grid-cols-5 gap-2 items-center">
                            <input
                              type="text"
                              value={u.unit_name}
                              onChange={(e) => handleUnitChange(vIdx, uIdx, 'unit_name', e.target.value)}
                              placeholder="Nama Satuan (Pcs/Dus/Sak)"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                            />
                            <input
                              type="number"
                              step="any"
                              value={u.conversion_factor}
                              onChange={(e) => handleUnitChange(vIdx, uIdx, 'conversion_factor', Number(e.target.value))}
                              placeholder="Konversi"
                              disabled={u.is_base_unit}
                              className={`px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs ${
                                u.is_base_unit ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-500' : 'bg-white dark:bg-slate-800'
                              }`}
                            />
                            <input
                              type="number"
                              value={u.sell_price}
                              onChange={(e) => handleUnitChange(vIdx, uIdx, 'sell_price', Number(e.target.value))}
                              placeholder="Harga Jual (Rp)"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 font-bold"
                            />
                            <input
                              type="number"
                              value={u.buy_price}
                              onChange={(e) => handleUnitChange(vIdx, uIdx, 'buy_price', Number(e.target.value))}
                              placeholder="Harga Beli (Rp)"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                            />
                            <div>
                              {u.is_base_unit ? (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded">
                                  Dasar
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveUnitFromVariant(vIdx, uIdx)}
                                  className="text-rose-500 hover:text-rose-700 p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menyimpan Produk...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Produk</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
