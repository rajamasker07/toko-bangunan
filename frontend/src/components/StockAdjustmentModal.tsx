import React, { useState, useEffect } from 'react';
import { Product, ProductVariant } from '../types';
import { formatStock } from '../utils/format';
import { X, SlidersHorizontal, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialVariantId?: string;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  products,
  initialVariantId,
  onSuccess,
  showToast,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [mode, setMode] = useState<'SET' | 'ADD' | 'SUBTRACT'>('SET');
  const [amount, setAmount] = useState<string>('');
  const [movementType, setMovementType] = useState<string>('STOCK_OPNAME');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Flatten all variants from products
  const allVariants = products.flatMap((p) =>
    (p.variants || []).map((v) => ({
      ...v,
      productName: p.name,
      productSku: p.sku,
    }))
  );

  useEffect(() => {
    if (initialVariantId) {
      setSelectedVariantId(initialVariantId);
    } else if (allVariants.length > 0 && !selectedVariantId) {
      setSelectedVariantId(allVariants[0].id);
    }
  }, [initialVariantId, allVariants]);

  if (!isOpen) return null;

  const currentVariant = allVariants.find((v) => v.id === selectedVariantId);
  const currentStock = Number(currentVariant?.current_stock || 0);

  // Compute preview
  let targetStock = currentStock;
  let diff = 0;
  const numAmount = parseFloat(amount) || 0;

  if (mode === 'SET') {
    targetStock = numAmount;
    diff = targetStock - currentStock;
  } else if (mode === 'ADD') {
    diff = numAmount;
    targetStock = currentStock + numAmount;
  } else if (mode === 'SUBTRACT') {
    diff = -numAmount;
    targetStock = currentStock - numAmount;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId) {
      showToast('Pilih varian produk terlebih dahulu', 'error');
      return;
    }
    if (amount === '' || isNaN(Number(amount)) || Number(amount) < 0) {
      showToast('Masukkan jumlah yang valid (minimal 0)', 'error');
      return;
    }
    if (targetStock < 0) {
      showToast('Stok akhir tidak boleh kurang dari 0!', 'error');
      return;
    }
    if (!notes.trim()) {
      showToast('Harap isi catatan / alasan penyesuaian stok', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: selectedVariantId,
          adjustment_mode: mode,
          amount: Number(amount),
          movement_type: movementType,
          reference_no: referenceNo || `ADJ-${Date.now().toString().slice(-6)}`,
          notes: notes.trim(),
          created_by: 'Admin Gudang',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan penyesuaian');
      }

      showToast('Penyesuaian stok berhasil disimpan dan dicatat ke log!', 'success');
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
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Penyesuaian Stok (Stock Adjustment)
              </h2>
              <p className="text-xs text-slate-500">
                Pembaruan kuantitas barang dengan riwayat log transaksi otomatis
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Select Product & Variant */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Pilih Barang & Varian:
            </label>
            <select
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {allVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.productName} — {v.variant_name} (Stok: {formatStock(v.current_stock)})
                </option>
              ))}
            </select>
          </div>

          {/* Current Stock Banner */}
          {currentVariant && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Stok saat ini di sistem:</span>
                <p className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                  {formatStock(currentStock)} <span className="text-xs font-normal text-slate-400">unit dasar</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-slate-500">Batas Minimal:</span>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatStock(currentVariant.min_stock)}
                </p>
              </div>
            </div>
          )}

          {/* Adjustment Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Metode Penyesuaian:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('SET');
                  setMovementType('STOCK_OPNAME');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  mode === 'SET'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                Opname Fisik (=)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('ADD');
                  setMovementType('PURCHASE_RESTOCK');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  mode === 'ADD'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                Tambah (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('SUBTRACT');
                  setMovementType('DAMAGED_EXPIRED');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  mode === 'SUBTRACT'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                Kurang (-)
              </button>
            </div>
          </div>

          {/* Amount and Movement Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {mode === 'SET' ? 'Jumlah Stok Fisik Riil:' : 'Jumlah Penambahan / Pengurangan:'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={mode === 'SET' ? 'Misal: 50' : 'Misal: 10'}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tipe Log Mutasi:
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="STOCK_OPNAME">Penyesuaian Fisik Opname</option>
                <option value="PURCHASE_RESTOCK">Barang Masuk / Pembelian</option>
                <option value="DAMAGED_EXPIRED">Barang Rusak / Pecah / Cacat</option>
                <option value="SALE_DEDUCT">Penjualan Manual</option>
                <option value="RETURN_IN">Retur Masuk dari Pelanggan</option>
                <option value="RETURN_OUT">Retur Keluar ke Pabrik/Supplier</option>
                <option value="MANUAL_ADJUSTMENT">Koreksi Manual Lainnya</option>
              </select>
            </div>
          </div>

          {/* Reference & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                No. Referensi / Dokumen:
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Misal: OPN-2026-11, DO-9988"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Alasan / Catatan Wajib:
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alasan selisih/tujuan penyesuaian..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Stock Simulation Preview */}
          {amount !== '' && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-slate-500">Stok Awal:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{formatStock(currentStock)}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
                <div>
                  <span className="text-slate-500">Perubahan:</span>
                  <p className={`font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {diff > 0 ? `+${formatStock(diff)}` : formatStock(diff)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
                <div>
                  <span className="text-slate-500">Stok Akhir:</span>
                  <p className="font-extrabold text-base text-slate-900 dark:text-white">
                    {formatStock(targetStock)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
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
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Penyesuaian</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
