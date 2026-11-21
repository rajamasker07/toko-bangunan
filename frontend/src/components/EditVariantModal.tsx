import React, { useState, useEffect, useMemo } from 'react';
import { Product, ProductVariant } from '../types';
import { api } from '../services/api';
import { X, CheckCircle2, Layers, Tag, Plus, Trash2 } from 'lucide-react';

interface EditVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant: ProductVariant | null;
  productName: string;
  product?: Product | null;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EditVariantModal: React.FC<EditVariantModalProps> = ({
  isOpen,
  onClose,
  variant,
  productName,
  product,
  onSuccess,
  showToast,
}) => {
  const [variantName, setVariantName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [minStock, setMinStock] = useState<number>(5);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [newAttrName, setNewAttrName] = useState('');
  const [showAddAttrInput, setShowAddAttrInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute all known attribute keys from product options and variant attributes
  const knownAttributeKeys = useMemo(() => {
    const keys = new Set<string>(product?.variant_options || []);
    if (variant?.attributes) {
      Object.keys(variant.attributes).forEach((k) => keys.add(k));
    }
    if (product?.variants) {
      product.variants.forEach((v) => {
        if (v.attributes) {
          Object.keys(v.attributes).forEach((k) => keys.add(k));
        }
      });
    }
    return Array.from(keys);
  }, [product, variant]);

  // Compute suggestions for datalist
  const attributeValueSuggestions = useMemo(() => {
    const map: Record<string, string[]> = {};
    knownAttributeKeys.forEach((key) => {
      const values = new Set<string>();
      if (product?.variants) {
        product.variants.forEach((v) => {
          const val = v.attributes?.[key];
          if (val) values.add(val);
        });
      }
      map[key] = Array.from(values);
    });
    return map;
  }, [knownAttributeKeys, product]);

  useEffect(() => {
    if (isOpen && variant) {
      setVariantName(variant.variant_name || '');
      setSku(variant.sku || '');
      setBarcode(variant.barcode || '');
      setMinStock(Number(variant.min_stock) || 5);
      setIsActive(variant.is_active !== false);
      setNewAttrName('');
      setShowAddAttrInput(false);

      // Initialize attributes
      const initialAttrs: Record<string, string> = { ...(variant.attributes || {}) };
      // Make sure all product.variant_options exist as keys
      if (product?.variant_options) {
        product.variant_options.forEach((opt) => {
          if (initialAttrs[opt] === undefined) {
            initialAttrs[opt] = '';
          }
        });
      }
      setAttributes(initialAttrs);
    }
  }, [isOpen, variant, product]);

  if (!isOpen || !variant) return null;

  const activeAttributeKeys = Array.from(
    new Set([...knownAttributeKeys, ...Object.keys(attributes)])
  );

  const handleAttributeChange = (key: string, value: string) => {
    setAttributes((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddCustomAttribute = () => {
    const trimmed = newAttrName.trim();
    if (!trimmed) return;
    if (activeAttributeKeys.includes(trimmed)) {
      showToast(`Atribut "${trimmed}" sudah ada`, 'error');
      return;
    }
    setAttributes((prev) => ({ ...prev, [trimmed]: '' }));
    setNewAttrName('');
    setShowAddAttrInput(false);
  };

  const handleRemoveAttribute = (key: string) => {
    setAttributes((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantName.trim()) {
      showToast('Nama varian wajib diisi', 'error');
      return;
    }
    if (!sku.trim()) {
      showToast('SKU varian wajib diisi', 'error');
      return;
    }

    // Filter out empty attribute values
    const cleanAttributes: Record<string, string> = {};
    Object.entries(attributes).forEach(([k, v]) => {
      if (v && v.trim()) {
        cleanAttributes[k.trim()] = v.trim();
      }
    });

    try {
      setIsSubmitting(true);
      await api.updateVariant(variant.id, {
        variant_name: variantName.trim(),
        sku: sku.trim(),
        barcode: barcode.trim() || null,
        min_stock: Number(minStock) || 5,
        is_active: isActive,
        attributes: cleanAttributes,
      });

      showToast(`Varian "${variantName}" berhasil diperbarui`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui varian', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Informasi Varian
              </h2>
              <p className="text-xs text-slate-500">
                Produk: <strong className="text-slate-800 dark:text-slate-200">{productName}</strong>
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
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Status Penjualan Varian Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Status Penjualan Varian
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Hentikan penjualan spesifik varian ini tanpa memengaruhi varian lain
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs font-semibold">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Masih Dijual (Aktif di Kasir)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Sudah Tidak Dijual (Disembunyikan dari Kasir)
                </span>
              )}
            </div>
          </div>

          {/* Dynamic Variant Attributes Section */}
          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-500" />
                Atribut Varian (Spesifikasi Dinamis)
              </span>

              {!showAddAttrInput && (
                <button
                  type="button"
                  onClick={() => setShowAddAttrInput(true)}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 dark:hover:text-amber-400 inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Tambah Atribut
                </button>
              )}
            </div>

            {/* Inline Add Custom Attribute Input */}
            {showAddAttrInput && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomAttribute();
                    }
                  }}
                  placeholder="Nama Atribut Baru (cth: Kemasan, Warna)..."
                  className="flex-1 px-2.5 py-1 text-xs bg-transparent border-0 focus:outline-none text-slate-900 dark:text-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCustomAttribute}
                  className="px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddAttrInput(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Attributes Inputs Grid */}
            {activeAttributeKeys.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeAttributeKeys.map((key) => {
                  const suggestions = attributeValueSuggestions[key] || [];
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">
                          {key}:
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttribute(key)}
                          className="text-rose-500 hover:text-rose-700 text-[10px]"
                          title="Hapus atribut ini"
                        >
                          Hapus
                        </button>
                      </div>
                      <input
                        type="text"
                        list={`edit-var-datalist-${key}`}
                        value={attributes[key] || ''}
                        onChange={(e) => handleAttributeChange(key, e.target.value)}
                        placeholder={`Nilai ${key}...`}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500"
                      />
                      <datalist id={`edit-var-datalist-${key}`}>
                        {suggestions.map((sug) => (
                          <option key={sug} value={sug} />
                        ))}
                      </datalist>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Belum ada atribut varian. Klik "+ Tambah Atribut" untuk menambahkan spesifikasi khusus (Kemasan, Warna, dll).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nama Varian (Spesifikasi / Ukuran / Warna) <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder="Misal: 1/2 inch AW, Putih Salju 5kg, Ulir 10mm..."
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                SKU Varian <span className="text-rose-500">*</span>:
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Barcode Scan:
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan / ketik barcode"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Batas Minimal Stok (Alert Kritis):
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(Number(e.target.value))}
              required
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shadow-md shadow-amber-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
