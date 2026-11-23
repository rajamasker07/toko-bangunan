import React, { useState, useEffect, useMemo } from 'react';
import { VariantUnit } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  X,
  CheckCircle2,
  Tag,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  FileText,
} from 'lucide-react';
import { formatIdNumber } from './common/NumericInput';

interface EditUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: VariantUnit | null;
  variantName: string;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const PRESET_REASONS = [
  'Kenaikan harga supplier',
  'Penyesuaian margin laba',
  'Promo / penyesuaian pasar',
  'Koreksi salah input',
];

export const EditUnitModal: React.FC<EditUnitModalProps> = ({
  isOpen,
  onClose,
  unit,
  variantName,
  onSuccess,
  showToast,
}) => {
  const { can } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');

  const [unitName, setUnitName] = useState('');
  const [conversionFactor, setConversionFactor] = useState<number>(1);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && unit) {
      setUnitName(unit.unit_name || '');
      setConversionFactor(Number(unit.conversion_factor) || 1);
      setSellPrice(Number(unit.sell_price) || 0);
      setBuyPrice(Number(unit.buy_price) || 0);
      setWholesalePrice(unit.wholesale_price ? String(unit.wholesale_price) : '');
      setReason('');
      setReferenceNo('');
    }
  }, [isOpen, unit]);

  // Live impact calculation
  const impact = useMemo(() => {
    if (!unit) return null;

    const oldSell = Number(unit.sell_price) || 0;
    const oldBuy = Number(unit.buy_price) || 0;
    const oldWholesale = unit.wholesale_price ? Number(unit.wholesale_price) : null;

    const newSell = Number(sellPrice) || 0;
    const newBuy = canViewBuyPrice ? Number(buyPrice) || 0 : oldBuy;
    const newWholesale = wholesalePrice ? Number(wholesalePrice) : null;

    const sellDiff = newSell - oldSell;
    const sellPercent = oldSell > 0 ? (sellDiff / oldSell) * 100 : 0;

    const buyDiff = newBuy - oldBuy;
    const buyPercent = oldBuy > 0 ? (buyDiff / oldBuy) * 100 : 0;

    const oldMargin = oldSell > 0 ? ((oldSell - oldBuy) / oldSell) * 100 : null;
    const newMargin = newSell > 0 ? ((newSell - newBuy) / newSell) * 100 : null;
    const marginDiff =
      newMargin !== null && oldMargin !== null ? newMargin - oldMargin : null;

    const isLoss = newSell > 0 && newBuy > 0 && newSell <= newBuy;
    const isWholesaleLoss =
      newWholesale !== null && newBuy > 0 && newWholesale <= newBuy;

    const isChanged =
      sellDiff !== 0 ||
      (canViewBuyPrice && buyDiff !== 0) ||
      (newWholesale ?? 0) !== (oldWholesale ?? 0);

    return {
      oldSell,
      newSell,
      sellDiff,
      sellPercent,
      oldBuy,
      newBuy,
      buyDiff,
      buyPercent,
      oldMargin,
      newMargin,
      marginDiff,
      isLoss,
      isWholesaleLoss,
      isChanged,
    };
  }, [unit, sellPrice, buyPrice, wholesalePrice, canViewBuyPrice]);

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
        ...(canViewBuyPrice ? { buy_price: Number(buyPrice) || 0 } : {}),
        wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
        reason: reason.trim() || undefined,
        reference_no: referenceNo.trim() || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Satuan & Harga
              </h2>
              <p className="text-xs text-slate-500">
                Varian: <strong className="text-slate-800 dark:text-slate-200">{variantName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Satuan:
              </label>
              <input
                type="text"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                  * Satuan dasar bernilai 1.
                </span>
              )}
            </div>
          </div>

          {/* Price inputs */}
          <div className={canViewBuyPrice ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Harga Jual (Rp): <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={sellPrice || ''}
                onChange={(e) => setSellPrice(Number(e.target.value))}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {canViewBuyPrice && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Harga Modal (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  value={buyPrice || ''}
                  onChange={(e) => setBuyPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            )}
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
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Live Impact Simulator */}
          {impact && impact.isChanged && (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Simulasi Dampak Perubahan Harga
                </span>
                <span className="text-[10px] text-slate-400">Tersimpan ke Histori</span>
              </div>

              {/* Price Changes Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">
                    Harga Jual
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="line-through text-slate-400 text-[11px]">
                      {formatIdNumber(impact.oldSell, false)}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      → {formatIdNumber(impact.newSell, false)}
                    </span>
                  </div>
                  <div className="mt-1">
                    {impact.sellDiff > 0 ? (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
                        <TrendingUp className="w-3 h-3 mr-0.5" />+
                        {formatIdNumber(impact.sellDiff, false)} (+
                        {impact.sellPercent.toFixed(1).replace('.', ',')}%)
                      </span>
                    ) : impact.sellDiff < 0 ? (
                      <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 flex items-center">
                        <TrendingDown className="w-3 h-3 mr-0.5" />-
                        {formatIdNumber(Math.abs(impact.sellDiff), false)} (
                        {impact.sellPercent.toFixed(1).replace('.', ',')}%)
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Tidak Berubah</span>
                    )}
                  </div>
                </div>

                {canViewBuyPrice && (
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">
                      Gross Margin
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="line-through text-slate-400 text-[11px]">
                        {impact.oldMargin !== null
                          ? `${impact.oldMargin.toFixed(1).replace('.', ',')}%`
                          : '-'}
                      </span>
                      <span
                        className={`font-black ${
                          impact.newMargin !== null && impact.newMargin <= 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        →{' '}
                        {impact.newMargin !== null
                          ? `${impact.newMargin.toFixed(1).replace('.', ',')}%`
                          : '-'}
                      </span>
                    </div>
                    <div className="mt-1">
                      {impact.marginDiff !== null ? (
                        impact.marginDiff > 0 ? (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            +{impact.marginDiff.toFixed(1).replace('.', ',')}% poin margin
                          </span>
                        ) : impact.marginDiff < 0 ? (
                          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            {impact.marginDiff.toFixed(1).replace('.', ',')}% poin margin
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Margin tetap</span>
                        )
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Loss Warning Banner */}
              {impact.isLoss && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Peringatan: Jual di Bawah Modal!</strong>
                    <span>
                      Harga jual (Rp {formatIdNumber(impact.newSell, false)}) lebih rendah/sama
                      dengan harga modal (Rp {formatIdNumber(impact.newBuy, false)}). Toko akan
                      mengalami kerugian!
                    </span>
                  </div>
                </div>
              )}

              {impact.isWholesaleLoss && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Peringatan Harga Grosir</strong>
                    <span>
                      Harga grosir yang ditentukan berada di bawah harga modal produk.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reason & Reference inputs */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Alasan Perubahan (Dicatat di Histori):
                </label>
              </div>

              {/* Quick Preset Reason Pills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_REASONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setReason(p)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      reason === p
                        ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
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
                placeholder="Misal: Penyesuaian harga distributor semen per sak"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No. Referensi / Faktur (Opsional):
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Misal: INV-2026/04/102"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-50 transition-all shadow-md shadow-amber-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Catat Histori'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
