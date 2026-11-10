import React, { useState, useEffect } from 'react';
import { VariantUnit } from '../types';
import { api } from '../services/api';
import { X, CheckCircle2, Tag } from 'lucide-react';

interface EditUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: VariantUnit | null;
  variantName: string;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EditUnitModal: React.FC<EditUnitModalProps> = ({
  isOpen,
  onClose,
  unit,
  variantName,
  onSuccess,
  showToast,
}) => {
  const [unitName, setUnitName] = useState('');
  const [conversionFactor, setConversionFactor] = useState<number>(1);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && unit) {
      setUnitName(unit.unit_name || '');
      setConversionFactor(Number(unit.conversion_factor) || 1);
      setSellPrice(Number(unit.sell_price) || 0);
      setBuyPrice(Number(unit.buy_price) || 0);
      setWholesalePrice(unit.wholesale_price ? String(unit.wholesale_price) : '');
    }
  }, [isOpen, unit]);

  if (!isOpen || !unit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim()) {
      showToast('Nama satuan wajib diisi', 'error');
      return;
    }
    if (sellPrice <= 0) {
      showToast('Harga jual harus lebih dari 0', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.updateUnit(unit.id, {
        unit_name: unitName.trim(),
        conversion_factor: unit.is_base_unit ? 1 : Number(conversionFactor) || 1,
        sell_price: Number(sellPrice),
        buy_price: Number(buyPrice) || 0,
        wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
      });

      showToast(`Satuan "${unitName}" berhasil diperbarui`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui satuan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Satuan Harga
              </h2>
              <p className="text-xs text-slate-500">
                Varian: <strong className="text-slate-800 dark:text-slate-200">{variantName}</strong>
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
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Satuan:
            </label>
            <input
              type="text"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Faktor Konversi:
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={conversionFactor}
              onChange={(e) => setConversionFactor(Number(e.target.value))}
              disabled={unit.is_base_unit}
              className={`w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs ${
                unit.is_base_unit
                  ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
              }`}
            />
            {unit.is_base_unit && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                * Satuan dasar utama selalu bernilai konversi 1.
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Harga Jual (Rp):
              </label>
              <input
                type="number"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(Number(e.target.value))}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Harga Modal (Rp):
              </label>
              <input
                type="number"
                min="0"
                value={buyPrice}
                onChange={(e) => setBuyPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Harga Grosir / Tukang (Opsional):
            </label>
            <input
              type="number"
              min="0"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(e.target.value)}
              placeholder="Kosongkan jika tidak ada"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
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
