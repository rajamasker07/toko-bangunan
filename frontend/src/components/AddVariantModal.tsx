import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductVariant } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { NumericInput } from './common/NumericInput';
import { 
  X, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Layers, 
  Boxes, 
  AlertTriangle, 
  ArrowLeftRight, 
  Banknote, 
  Coins, 
  Tag 
} from 'lucide-react';

interface AddVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  product?: Product | null;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AddVariantModal: React.FC<AddVariantModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  product,
  onSuccess,
  showToast,
}) => {
  const { can } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');

  const [variantName, setVariantName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic attributes state
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [newAttrName, setNewAttrName] = useState('');
  const [showAddAttrInput, setShowAddAttrInput] = useState(false);

  // Units for new variant
  const [units, setUnits] = useState<Array<{
    unit_name: string;
    conversion_factor: number;
    is_base_unit: boolean;
    buy_price: number;
    sell_price: number;
    wholesale_price?: number;
  }>>([
    {
      unit_name: 'Pcs',
      conversion_factor: 1,
      is_base_unit: true,
      buy_price: 0,
      sell_price: 0,
    },
  ]);

  // Compute all known attribute keys from product definition and existing variants
  const knownAttributeKeys = useMemo(() => {
    const keys = new Set<string>(product?.variant_options || []);
    if (product?.variants) {
      product.variants.forEach((v) => {
        if (v.attributes) {
          Object.keys(v.attributes).forEach((k) => keys.add(k));
        }
      });
    }
    return Array.from(keys);
  }, [product]);

  // Compute distinct existing values for each attribute key
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

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setVariantName('');
      setSku('');
      setBarcode('');
      setInitialStock(0);
      setMinStock(5);
      setNewAttrName('');
      setShowAddAttrInput(false);

      // Pre-populate empty keys for known attributes
      const initialAttrs: Record<string, string> = {};
      knownAttributeKeys.forEach((key) => {
        initialAttrs[key] = '';
      });
      setAttributes(initialAttrs);

      // Inherit base unit from first existing variant if available
      const existingBaseUnit = product?.variants?.[0]?.units?.find((u) => u.is_base_unit);
      setUnits([
        {
          unit_name: existingBaseUnit?.unit_name || 'Pcs',
          conversion_factor: 1,
          is_base_unit: true,
          buy_price: 0,
          sell_price: 0,
        },
      ]);
    }
  }, [isOpen, knownAttributeKeys, product]);

  if (!isOpen) return null;

  // Active attribute keys: combination of known options and any custom keys added
  const activeAttributeKeys = Array.from(
    new Set([...knownAttributeKeys, ...Object.keys(attributes)])
  );

  const handleAttributeChange = (key: string, value: string) => {
    const newAttrs = { ...attributes, [key]: value };
    setAttributes(newAttrs);

    // Auto compose variant name if user hasn't explicitly customized it
    const autoName = activeAttributeKeys
      .map((k) => newAttrs[k])
      .filter(Boolean)
      .join(' - ');

    const isCurrentDefault =
      !variantName.trim() ||
      activeAttributeKeys.some((k) => variantName.includes(attributes[k] || '___'));

    if (isCurrentDefault && autoName) {
      setVariantName(autoName);
    }
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

  const handleAddUnit = () => {
    setUnits((prev) => [
      ...prev,
      {
        unit_name: 'Dus',
        conversion_factor: 10,
        is_base_unit: false,
        buy_price: 0,
        sell_price: 0,
      },
    ]);
  };

  const handleRemoveUnit = (index: number) => {
    if (units[index].is_base_unit) {
      showToast('Satuan dasar utama tidak boleh dihapus!', 'error');
      return;
    }
    setUnits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUnitChange = (index: number, field: string, value: any) => {
    setUnits((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantName.trim()) {
      showToast('Nama varian wajib diisi', 'error');
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
      await api.addVariant(productId, {
        variant_name: variantName.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        initial_stock: Number(initialStock) || 0,
        min_stock: Number(minStock) || 5,
        attributes: Object.keys(cleanAttributes).length > 0 ? cleanAttributes : undefined,
        units: units.map((u) => ({
          unit_name: u.unit_name.trim(),
          conversion_factor: Number(u.conversion_factor) || 1,
          is_base_unit: Boolean(u.is_base_unit),
          ...(canViewBuyPrice ? { buy_price: Number(u.buy_price) || 0 } : {}),
          sell_price: Number(u.sell_price) || 0,
          wholesale_price: u.wholesale_price ? Number(u.wholesale_price) : null,
        })),
      });

      showToast(`Varian "${variantName}" berhasil ditambahkan ke produk!`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan varian', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Tambah Varian Baru
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Dynamic Variant Attributes Section */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  Atribut Dinamis Varian
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Isi spesifikasi atribut varian ini (nama varian akan otomatis terisi).
                </p>
              </div>

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
                  placeholder="Nama Atribut Baru (cth: Kemasan, Warna, Ketebalan)..."
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
                        {!knownAttributeKeys.includes(key) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAttribute(key)}
                            className="text-rose-500 hover:text-rose-700 text-[10px]"
                            title="Hapus atribut ini"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        list={`add-var-datalist-${key}`}
                        value={attributes[key] || ''}
                        onChange={(e) => handleAttributeChange(key, e.target.value)}
                        placeholder={`Ketik / pilih ${key}...`}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500"
                      />
                      <datalist id={`add-var-datalist-${key}`}>
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
                Belum ada atribut varian yang didefinisikan. Klik "+ Tambah Atribut" di atas untuk menambahkan atribut seperti Kemasan, Warna, atau Ukuran.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nama Varian (Ukuran / Warna / Spesifikasi) <span className="text-rose-500">*</span>:
              </label>
              <input
                type="text"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder="Misal: 1 inch AW, Putih Salju 20 Kg, Ulir 12mm..."
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                SKU Varian (Opsional):
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Kosongkan untuk auto-generate"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Barcode Scan (Opsional):
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan / ketik barcode"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Stok Awal Fisik:
              </label>
              <NumericInput
                size="sm"
                value={initialStock}
                onChange={setInitialStock}
                allowDecimals={true}
                maxDecimals={2}
                prefixIcon={Boxes}
                suffixText="Unit"
                placeholder="0"
                inputClassName="font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Batas Minimal Alert:
              </label>
              <NumericInput
                size="sm"
                value={minStock}
                onChange={setMinStock}
                min={1}
                prefixIcon={AlertTriangle}
                suffixText="Unit"
                placeholder="5"
              />
            </div>
          </div>

          {/* Unit Pricing Section */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-500" />
                  Satuan Harga Varian
                </span>
                <span className="text-[11px] text-slate-500">
                  Satuan dasar pokok dan satuan konversi (Dus/Pack/Ikat)
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddUnit}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Satuan
              </button>
            </div>

            <div className="space-y-3">
              {units.map((u, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    u.is_base_unit
                      ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      {u.is_base_unit ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase">
                          Satuan Dasar Pokok
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase">
                          Satuan Konversi Bertingkat
                        </span>
                      )}
                      <span>{u.unit_name || 'Satuan'}</span>
                    </span>

                    {!u.is_base_unit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveUnit(idx)}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                        Nama Satuan:
                      </label>
                      <input
                        type="text"
                        value={u.unit_name}
                        onChange={(e) => handleUnitChange(idx, 'unit_name', e.target.value)}
                        placeholder="Pcs, Dus, Zak..."
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                        Faktor Konversi:
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        disabled={u.is_base_unit}
                        value={u.is_base_unit ? 1 : u.conversion_factor}
                        onChange={(e) => handleUnitChange(idx, 'conversion_factor', Number(e.target.value))}
                        className={`w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs ${
                          u.is_base_unit
                            ? 'bg-slate-100 dark:bg-slate-900 text-slate-400 cursor-not-allowed'
                            : 'bg-white dark:bg-slate-800'
                        }`}
                      />
                    </div>

                    {canViewBuyPrice && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          Harga Beli (Modal):
                        </label>
                        <NumericInput
                          size="sm"
                          value={u.buy_price}
                          onChange={(val) => handleUnitChange(idx, 'buy_price', val)}
                          prefixText="Rp"
                          placeholder="0"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                        Harga Jual Eceran <span className="text-rose-500">*</span>:
                      </label>
                      <NumericInput
                        size="sm"
                        value={u.sell_price}
                        onChange={(val) => handleUnitChange(idx, 'sell_price', val)}
                        prefixText="Rp"
                        placeholder="0"
                        inputClassName="font-bold text-amber-600 dark:text-amber-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shadow-md shadow-amber-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Tambah Varian'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
