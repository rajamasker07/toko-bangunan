import React, { useState } from 'react';
import { api } from '../services/api';
import { NumericInput } from './common/NumericInput';
import { X, Plus, Trash2, CheckCircle2, Layers, Boxes, AlertTriangle, ArrowLeftRight, Banknote, Coins } from 'lucide-react';

interface AddVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AddVariantModal: React.FC<AddVariantModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  onSuccess,
  showToast,
}) => {
  const [variantName, setVariantName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (!isOpen) return null;

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

    try {
      setIsSubmitting(true);
      await api.addVariant(productId, {
        variant_name: variantName.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        initial_stock: Number(initialStock) || 0,
        min_stock: Number(minStock) || 5,
        units: units.map((u) => ({
          unit_name: u.unit_name.trim(),
          conversion_factor: Number(u.conversion_factor) || 1,
          is_base_unit: Boolean(u.is_base_unit),
          buy_price: Number(u.buy_price) || 0,
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
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Satuan & Harga Varian:
              </span>
              <button
                type="button"
                onClick={handleAddUnit}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Satuan
              </button>
            </div>

            <div className="space-y-2">
              {units.map((u, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                  <input
                    type="text"
                    value={u.unit_name}
                    onChange={(e) => handleUnitChange(idx, 'unit_name', e.target.value)}
                    placeholder="Satuan (Pcs/Dus)"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                  />
                  <NumericInput
                    size="sm"
                    value={u.conversion_factor}
                    onChange={(val) => handleUnitChange(idx, 'conversion_factor', val)}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={ArrowLeftRight}
                    disabled={u.is_base_unit}
                    placeholder="Konversi"
                  />
                  <NumericInput
                    size="sm"
                    value={u.sell_price}
                    onChange={(val) => handleUnitChange(idx, 'sell_price', val)}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={Banknote}
                    prefixText="Rp"
                    placeholder="Harga Jual"
                    inputClassName="font-bold"
                  />
                  <NumericInput
                    size="sm"
                    value={u.buy_price}
                    onChange={(val) => handleUnitChange(idx, 'buy_price', val)}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={Coins}
                    prefixText="Rp"
                    placeholder="Harga Beli"
                  />
                  <div>
                    {u.is_base_unit ? (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded">
                        Dasar
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveUnit(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Varian'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
