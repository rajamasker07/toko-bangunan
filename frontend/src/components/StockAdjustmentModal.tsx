import React, { useEffect } from 'react';
import { Product } from '../types';
import { StockAdjustmentForm } from './StockAdjustmentForm';
import { X, SlidersHorizontal } from 'lucide-react';

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
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Penyesuaian Stok (Stock Adjustment)
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white dark:bg-slate-700 px-1 py-0.2 rounded shadow-2xs font-bold text-slate-700 dark:text-slate-200">Shift+Enter</kbd>
                    <span>lanjut</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white dark:bg-slate-700 px-1 py-0.2 rounded shadow-2xs font-bold text-slate-700 dark:text-slate-200">Ctrl+Enter</kbd>
                    <span>simpan</span>
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pembaruan kuantitas barang bertahap dengan riwayat log transaksi otomatis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Stepper Form Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <StockAdjustmentForm
            products={products}
            initialVariantId={initialVariantId}
            onSuccess={() => {
              onSuccess();
              onClose();
            }}
            onCancel={onClose}
            showToast={showToast}
            isModal={true}
          />
        </div>
      </div>
    </div>
  );
};
