import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Product } from '../types';
import { StockAdjustmentForm } from './StockAdjustmentForm';
import { StockMovementsView } from './StockMovementsView';
import { 
  SlidersHorizontal, 
  History, 
  Package, 
  AlertTriangle, 
  Layers
} from 'lucide-react';

interface StockAdjustmentViewProps {
  products: Product[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialVariantId?: string;
  initialTab?: 'form' | 'history';
}

export const StockAdjustmentView: React.FC<StockAdjustmentViewProps> = ({
  products,
  onRefresh,
  showToast,
  initialVariantId,
  initialTab = 'form',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'form' | 'history'>(initialTab);
  const [refreshMovementsTrigger, setRefreshMovementsTrigger] = useState<number>(0);

  // Sync activeSubTab if initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Compute quick summary stats in a single pass with useMemo (prevents GC thrashing and lag)
  const { totalVariants, lowStockCount, outOfStockCount } = useMemo(() => {
    let variantsCount = 0;
    let lowCount = 0;
    let outCount = 0;
    for (const p of products) {
      variantsCount += p.variants?.length || 1;
      const stock = Number(p.total_stock) || 0;
      if (stock <= 0) {
        outCount++;
      } else if (p.has_low_stock) {
        lowCount++;
      }
    }
    return {
      totalVariants: variantsCount,
      lowStockCount: lowCount,
      outOfStockCount: outCount,
    };
  }, [products]);

  const handleAdjustmentSuccess = useCallback(() => {
    onRefresh();
    setRefreshMovementsTrigger((prev) => prev + 1);
  }, [onRefresh]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-amber-500" />
            <span>Pusat Penyesuaian & Opname Stok</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Penyesuaian kuantitas fisik berkala, barang masuk tambahan, atau pencatatan barang rusak dengan alur bertahap (stepper)
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start md:self-auto border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveSubTab('form')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'form'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
            <span>Formulir Penyesuaian</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 text-blue-500" />
            <span>Riwayat Mutasi</span>
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-semibold block uppercase tracking-wider">
              Total Varian Terdaftar
            </span>
            <span className="font-mono text-xl font-extrabold text-slate-900 dark:text-white">
              {totalVariants}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-semibold block uppercase tracking-wider">
              Varian Stok Kritis
            </span>
            <span className="font-mono text-xl font-extrabold text-amber-600">
              {lowStockCount}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-semibold block uppercase tracking-wider">
              Varian Stok Habis
            </span>
            <span className="font-mono text-xl font-extrabold text-rose-600">
              {outOfStockCount}
            </span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      {activeSubTab === 'form' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Formulir Penyesuaian Stok (Alur Bertahap)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono hidden sm:flex">
              <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                Shift+Enter: Lanjut
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                Ctrl+Enter: Simpan
              </span>
            </div>
          </div>

          <StockAdjustmentForm
            products={products}
            initialVariantId={initialVariantId}
            onSuccess={handleAdjustmentSuccess}
            showToast={showToast}
            isModal={false}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <StockMovementsView key={refreshMovementsTrigger} />
        </div>
      )}
    </div>
  );
};
