import React, { useState, useMemo } from 'react';
import { Product, SimilarProductGroup } from '../types';
import { detectSimilarProductGroups } from '../utils/catalogGrouping';
import { formatStock } from '../utils/format';
import {
  X,
  Sparkles,
  GitMerge,
  Package,
  Layers,
  Search,
  CheckCircle2,
  Folder,
  Tag,
  ChevronRight,
  Info,
} from 'lucide-react';

interface SimilarProductsDetectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectGroup: (groupProducts: Product[]) => void;
}

export const SimilarProductsDetectorModal: React.FC<SimilarProductsDetectorModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Deteksi grup produk yang berpotensi merupakan varian yang tercecer
  const groups: SimilarProductGroup[] = useMemo(() => {
    if (!isOpen) return [];
    return detectSimilarProductGroups(products);
  }, [isOpen, products]);

  // Filter pencarian di dalam modal
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups.filter((g) => {
      const matchPrefix = g.commonPrefix.toLowerCase().includes(q);
      const matchBrand = g.brandName?.toLowerCase().includes(q);
      const matchCategory = g.categoryName?.toLowerCase().includes(q);
      const matchProduct = g.products.some((p) => p.name.toLowerCase().includes(q));
      return matchPrefix || matchBrand || matchCategory || matchProduct;
    });
  }, [groups, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gradient-to-r from-violet-50/70 via-purple-50/40 to-slate-50/50 dark:from-violet-950/30 dark:via-purple-950/20 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Deteksi Produk Mirip & Kandidat Varian</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-extrabold">
                  {groups.length} Grup Terdeteksi
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pindai otomatis produk terpisah yang memiliki awalan nama, merek, dan kategori serupa agar bisa digabungkan jadi varian
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Info Banner */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 bg-violet-500/10 dark:bg-violet-950/40 border border-violet-200/80 dark:border-violet-900/60 p-3 rounded-xl">
            <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span>
              Asisten ini menganalisis seluruh katalog Anda untuk menemukan produk yang kemungkinan terpisah saat import Excel. Klik <strong>"Tinjau & Gabungkan"</strong> pada salah satu grup untuk meleburnya menjadi varian dalam 1 klik.
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama grup, merek, atau nama produk yang terdeteksi..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Body: List of Groups */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200">
                {groups.length === 0
                  ? 'Katalog Rapi! Tidak Ditemukan Produk Tercecer'
                  : 'Tidak ada grup yang cocok dengan pencarian Anda'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {groups.length === 0
                  ? 'Semua produk yang memiliki kemiripan nama dan merek sudah terkelompok dengan baik.'
                  : 'Coba ubah kata kunci pencarian di atas.'}
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div
                key={group.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-violet-300 dark:hover:border-violet-800/80 transition-all shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-violet-500 shrink-0" />
                        {group.commonPrefix}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                        {group.products.length} Produk
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {group.categoryName && (
                        <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                          <Folder className="w-3 h-3 text-amber-500" />
                          {group.categoryName}
                        </span>
                      )}
                      {group.brandName && (
                        <span className="flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                          <Tag className="w-3 h-3" />
                          {group.brandName}
                        </span>
                      )}
                      <span className="text-[11px]">
                        Total Stok Grup: <strong>{formatStock(group.totalStock)}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectGroup(group.products)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition-all shrink-0 self-start sm:self-center"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>Tinjau & Gabungkan ({group.products.length})</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-80" />
                  </button>
                </div>

                {/* Products Preview within Group */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {group.products.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          SKU: {p.sku}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300 block">
                          {formatStock(p.total_stock)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {p.variants?.length || 1} Varian
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Menampilkan {filteredGroups.length} dari {groups.length} grup produk terdeteksi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
