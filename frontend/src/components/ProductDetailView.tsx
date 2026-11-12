import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { formatRupiah, formatStock } from '../utils/format';
import { Pagination } from './common/Pagination';
import { 
  ArrowLeft, 
  Package, 
  Layers, 
  Tag, 
  SlidersHorizontal, 
  AlertTriangle, 
  ShieldCheck, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Barcode, 
  Building2, 
  Folder,
  Edit2,
  Truck,
  Power
} from 'lucide-react';

interface ProductDetailViewProps {
  product: Product;
  onBackToCatalog: () => void;
  onSelectVariant: (variant: ProductVariant) => void;
  onOpenAdjust: (variantId: string) => void;
  onAddVariant: (productId: string) => void;
  onDeleteProduct: (id: string, name: string) => void;
  onEditProduct?: (product: Product) => void;
  onEditVariant?: (variant: ProductVariant) => void;
  onToggleProductStatus?: (product: Product) => void;
  onToggleVariantStatus?: (variantId: string) => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  onBackToCatalog,
  onSelectVariant,
  onOpenAdjust,
  onAddVariant,
  onDeleteProduct,
  onEditProduct,
  onEditVariant,
  onToggleProductStatus,
  onToggleVariantStatus,
}) => {
  // Pagination for variants list (in case product has many variants)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const variants = product.variants || [];
  const totalVariants = variants.length;
  const paginatedVariants = variants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <button
          onClick={onBackToCatalog}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors"
        >
          Katalog Produk
        </button>
        <span>/</span>
        <span className="font-bold text-slate-900 dark:text-white max-w-[300px] truncate">
          {product.name}
        </span>
      </nav>

      {/* Product Master Info Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onBackToCatalog}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Kembali ke Daftar Produk"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {product.is_active === false ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Status Produk: Sudah Tidak Dijual
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-900/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Status Produk: Masih Dijual
                  </span>
                )}
                {product.category_name && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Folder className="w-3 h-3 text-amber-500" />
                    {product.category_name}
                  </span>
                )}
                {product.brand && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Building2 className="w-3 h-3" />
                    {product.brand}
                  </span>
                )}
                {product.supplier_name && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Truck className="w-3 h-3" />
                    {product.supplier_name}
                  </span>
                )}
                <span className="text-[11px] font-medium text-slate-400">
                  {product.has_variants ? 'Multi-Varian' : 'Varian Standar'}
                </span>
              </div>

              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {product.name}
              </h1>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                  SKU Master: {product.sku}
                </span>
                {product.barcode && (
                  <span className="flex items-center gap-1 font-mono">
                    <Barcode className="w-3.5 h-3.5" /> {product.barcode}
                  </span>
                )}
                <span>• ID: <code className="font-mono">{product.id.slice(0, 10)}...</code></span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 self-start lg:self-center flex-wrap">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-right min-w-[130px]">
              <span className="text-[11px] text-slate-400 block font-medium">Total Stok Seluruh Varian</span>
              <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                {formatStock(product.total_stock)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Batas Min Alert: {formatStock(product.min_stock_alert)}
              </span>
            </div>

            {onToggleProductStatus && (
              <button
                type="button"
                onClick={() => onToggleProductStatus(product)}
                className={`flex items-center gap-1.5 px-3.5 py-3 rounded-xl font-bold text-xs transition-all shrink-0 border ${
                  product.is_active !== false
                    ? 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}
                title={
                  product.is_active !== false
                    ? 'Hentikan penjualan produk ini'
                    : 'Aktifkan kembali penjualan produk ini'
                }
              >
                <Power className="w-4 h-4" />
                <span>{product.is_active !== false ? 'Hentikan Penjualan' : 'Jual Kembali'}</span>
              </button>
            )}

            {onEditProduct && (
              <button
                onClick={() => onEditProduct(product)}
                className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all shrink-0 border border-slate-200 dark:border-slate-700"
                title="Edit Master Produk"
              >
                <Edit2 className="w-4 h-4 text-blue-500" />
                <span>Edit Produk</span>
              </button>
            )}

            <button
              onClick={() => onAddVariant(product.id)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Varian</span>
            </button>
          </div>
        </div>

        {/* Discontinued Status Banner */}
        {product.is_active === false && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Produk ini berstatus Sudah Tidak Dijual (Nonaktif).</strong>
              <p className="mt-0.5 text-rose-700 dark:text-rose-400">
                Produk dan seluruh variannya tidak akan muncul pada menu kasir dan transaksi penjualan baru.
                Klik tombol "Jual Kembali" di atas jika ingin mengaktifkan penjualan kembali sewaktu-waktu.
              </p>
            </div>
          </div>
        )}

        {/* Product Description */}
        {product.description && (
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <strong className="text-slate-700 dark:text-slate-300 block mb-1">Deskripsi & Spesifikasi Produk:</strong>
            <p className="leading-relaxed">{product.description}</p>
          </div>
        )}
      </div>

      {/* Section: List of Variants (DENGAN PAGINATION & DRILL-DOWN) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              <span>Daftar Varian Produk ({totalVariants})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik pada salah satu varian di bawah untuk melihat rincian satuan harga dan audit log mutasi stoknya
            </p>
          </div>
        </div>

        {totalVariants === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada varian pada produk ini.
          </div>
        ) : (
          <div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedVariants.map((v) => {
                const isLow = Number(v.current_stock) <= Number(v.min_stock);
                const isOut = Number(v.current_stock) <= 0;
                const baseUnit = v.units?.find((u) => u.is_base_unit) || v.units?.[0];

                return (
                  <div
                    key={v.id}
                    className={`p-5 hover:bg-amber-500/[0.03] dark:hover:bg-slate-800/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group ${
                      v.is_active === false ? 'bg-rose-500/[0.02] dark:bg-rose-950/[0.05]' : ''
                    }`}
                    onClick={() => onSelectVariant(v)}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {v.variant_name}
                        </span>
                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                          SKU: {v.sku}
                        </span>

                        {/* Variant Sale Status Pill */}
                        {v.is_active === false ? (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-200 dark:border-rose-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Varian: Tidak Dijual
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Varian: Masih Dijual
                          </span>
                        )}

                        {isOut ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                            Habis (0)
                          </span>
                        ) : isLow ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Kritis
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Aman
                          </span>
                        )}
                      </div>

                      {/* Units Pills */}
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                        <span>Pilihan Satuan:</span>
                        {v.units?.map((u) => (
                          <span
                            key={u.id}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              u.is_base_unit
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {u.unit_name}: {formatRupiah(u.sell_price)}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stock & Navigation Link */}
                    <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Stok Varian</span>
                        <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                          {formatStock(v.current_stock)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Min: {formatStock(v.min_stock)}
                        </span>
                      </div>

                      {/* Toggle Variant Status */}
                      {onToggleVariantStatus && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleVariantStatus(v.id);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            v.is_active !== false
                              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                          }`}
                          title={
                            v.is_active !== false
                              ? 'Status: Masih Dijual (Klik untuk hentikan penjualan varian ini)'
                              : 'Status: Tidak Dijual (Klik untuk aktifkan kembali varian ini)'
                          }
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      )}

                      {onEditVariant && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditVariant(v);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                          title="Edit Varian"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAdjust(v.id);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                        title="Penyesuaian Stok Cepat"
                      >
                        Adjust
                      </button>

                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination for Variants */}
            {totalVariants > 5 && (
              <Pagination
                currentPage={currentPage}
                totalItems={totalVariants}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[5, 10, 20]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
