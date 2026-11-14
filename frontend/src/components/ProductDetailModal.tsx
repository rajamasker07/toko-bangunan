import React from 'react';
import { Product, ProductVariant, VariantUnit } from '../types';
import { formatRupiah, formatStock } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { X, Package, Layers, Tag, SlidersHorizontal, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAdjustStock: (variantId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAdjustStock,
}) => {
  const { can } = useAuth();
  const canAdjust = can('stock:adjust');
  const canViewBuyPrice = can('products:view_buy_price');

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {product.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                SKU: <span className="font-mono font-semibold">{product.sku}</span> • {product.brand || 'No Brand'} • {product.category_name || 'Tanpa Kategori'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Product Meta Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-xs">
            <div>
              <span className="text-slate-400">Total Stok Keseluruhan:</span>
              <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {formatStock(product.total_stock)}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Batas Minimal (Alert):</span>
              <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {formatStock(product.min_stock_alert)}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Jumlah Varian:</span>
              <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {product.variants?.length || 1} Varian
              </p>
            </div>
            <div>
              <span className="text-slate-400">Tipe Produk:</span>
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">
                {product.has_variants ? 'Multi-Variant' : 'Varian Tunggal (Standar)'}
              </p>
            </div>
          </div>

          {product.description && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-200/40 dark:border-slate-800">
              <span className="font-semibold block mb-1 text-slate-500 dark:text-slate-400">Deskripsi:</span>
              <p className="leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Variants and Unit Pricing Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Daftar Varian & Multi-Satuan Harga</span>
              </h3>
            </div>

            <div className="space-y-4">
              {product.variants?.map((variant) => {
                const isLow = Number(variant.current_stock) <= Number(variant.min_stock);
                return (
                  <div
                    key={variant.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {variant.variant_name}
                          </span>
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {variant.sku}
                          </span>
                          {isLow ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Stok Kritis
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3" /> Aman
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Stok Saat Ini: <strong className="text-slate-800 dark:text-slate-200">{formatStock(variant.current_stock)}</strong> (Minimal: {formatStock(variant.min_stock)})
                        </p>
                      </div>

                      {canAdjust && (
                        <button
                          onClick={() => onAdjustStock(variant.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm self-start sm:self-auto"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Adjust Stok</span>
                        </button>
                      )}
                    </div>

                    {/* Unit Prices List */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                        Pilihan Satuan Harga:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {variant.units?.map((u) => (
                          <div
                            key={u.id}
                            className={`p-2.5 rounded-lg border text-xs ${
                              u.is_base_unit
                                ? 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-500/10'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                <Tag className="w-3 h-3 text-amber-500" />
                                {u.unit_name}
                              </span>
                              {u.is_base_unit ? (
                                <span className="text-[9px] font-extrabold uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded">
                                  Satuan Dasar
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  1 = {formatStock(u.conversion_factor)} unit dasar
                                </span>
                              )}
                            </div>
                            <div className="space-y-0.5 mt-2">
                              <div className="flex justify-between text-slate-500">
                                <span>Harga Jual:</span>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {formatRupiah(u.sell_price)}
                                </span>
                              </div>
                              {canViewBuyPrice && u.buy_price != null && Number(u.buy_price) > 0 && (
                                <div className="flex justify-between text-slate-400 text-[11px]">
                                  <span>Harga Beli:</span>
                                  <span>{formatRupiah(u.buy_price)}</span>
                                </div>
                              )}
                              {u.wholesale_price && Number(u.wholesale_price) > 0 && (
                                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                                  <span>Harga Grosir:</span>
                                  <span>{formatRupiah(u.wholesale_price)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
