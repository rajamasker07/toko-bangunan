import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { formatRupiah, formatStock } from '../utils/format';
import { useAuth } from '../context/AuthContext';
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
  Power,
  ArrowRightLeft,
  GitMerge,
  FolderInput,
  CheckSquare,
  Square
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
  onMergeProduct?: (product: Product) => void;
  onAbsorbProducts?: (targetProduct: Product) => void;
  onMoveVariants?: (variants: ProductVariant[]) => void;
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
  onMergeProduct,
  onAbsorbProducts,
  onMoveVariants,
}) => {
  const { can } = useAuth();
  const canCreate = can('products:create');
  const canUpdate = can('products:update');
  const canDelete = can('products:delete');
  const canAdjust = can('stock:adjust');

  // Multi-selection for variants
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);

  // Pagination for variants list (in case product has many variants)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const variants = product.variants || [];
  const totalVariants = variants.length;
  const paginatedVariants = variants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSelectVariant = (id: string) => {
    setSelectedVariantIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedVariantIds.length === variants.length) {
      setSelectedVariantIds([]);
    } else {
      setSelectedVariantIds(variants.map((v) => v.id));
    }
  };

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
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-right min-w-[150px] shrink-0 self-start lg:self-center shadow-sm">
            <span className="text-[11px] text-slate-400 block font-medium">Total Stok Seluruh Varian</span>
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {formatStock(product.total_stock)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Batas Min Alert: {formatStock(product.min_stock_alert)}
            </span>
          </div>
        </div>

        {/* Dedicated Action Toolbar */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Status & Restructure Utilities */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {canUpdate && onToggleProductStatus && (
              <button
                type="button"
                onClick={() => onToggleProductStatus(product)}
                className={`group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  product.is_active !== false
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                    : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300'
                }`}
                title={
                  product.is_active !== false
                    ? 'Status: Masih Dijual. Klik untuk menghentikan penjualan produk ini.'
                    : 'Status: Tidak Dijual. Klik untuk mulai menjual produk ini kembali.'
                }
              >
                <Power className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                <span>
                  {product.is_active !== false ? (
                    <>
                      <span className="group-hover:hidden">Status: Masih Dijual</span>
                      <span className="hidden group-hover:inline font-bold">Hentikan Penjualan</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:hidden">Status: Tidak Dijual</span>
                      <span className="hidden group-hover:inline font-bold">Jual Kembali</span>
                    </>
                  )}
                </span>
              </button>
            )}

            {canUpdate && onMergeProduct && (
              <button
                type="button"
                onClick={() => onMergeProduct(product)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors"
                title="Pindahkan seluruh varian produk ini dan gabungkan ke produk lain"
              >
                <GitMerge className="w-3.5 h-3.5 text-indigo-500" />
                <span>Gabung ke Produk Lain</span>
              </button>
            )}

            {canUpdate && onAbsorbProducts && (
              <button
                type="button"
                onClick={() => onAbsorbProducts(product)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-purple-200 dark:border-purple-900/60 bg-purple-50/70 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-colors"
                title="Serap produk-produk lain ke dalam produk ini sebagai varian baru"
              >
                <FolderInput className="w-3.5 h-3.5 text-purple-500" />
                <span>Serap Produk Lain</span>
              </button>
            )}
          </div>

          {/* Right: Core CTAs & Deletion */}
          <div className="flex items-center gap-2.5 flex-wrap sm:justify-end">
            {canUpdate && onEditProduct && (
              <button
                type="button"
                onClick={() => onEditProduct(product)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
                title="Edit Informasi Master Produk"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Edit Produk</span>
              </button>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={() => onAddVariant(product.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-600/20 transition-all"
                title="Tambah Varian Baru untuk Produk ini"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Varian</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDeleteProduct(product.id, product.name)}
                className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                title="Hapus Produk"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              <span>Daftar Varian Produk ({totalVariants})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik pada salah satu varian di bawah untuk melihat rincian satuan harga dan audit log mutasi stoknya
            </p>
          </div>

          {canUpdate && onMoveVariants && totalVariants > 0 && (
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              {selectedVariantIds.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    {selectedVariantIds.length} Varian Dipilih
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onMoveVariants(variants.filter((v) => selectedVariantIds.includes(v.id)))
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Pindahkan ({selectedVariantIds.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVariantIds([])}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  Pilih Semua Varian
                </button>
              )}
            </div>
          )}
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
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {canUpdate && onMoveVariants && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectVariant(v.id);
                          }}
                          className="mt-0.5 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                          title={selectedVariantIds.includes(v.id) ? 'Batalkan pilihan' : 'Pilih varian ini'}
                        >
                          {selectedVariantIds.includes(v.id) ? (
                            <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      )}

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
                    </div>

                    {/* Stock & Navigation Link */}
                    <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                      <div className="text-right mr-1">
                        <span className="text-[10px] text-slate-400 block font-medium">Stok Varian</span>
                        <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                          {formatStock(v.current_stock)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Min: {formatStock(v.min_stock)}
                        </span>
                      </div>

                      {/* Variant Action Toolbar */}
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                        {/* Toggle Variant Status */}
                        {canUpdate && onToggleVariantStatus && (
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
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canUpdate && onEditVariant && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditVariant(v);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                            title="Edit Varian"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canUpdate && onMoveVariants && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveVariants([v]);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                            title="Pindahkan Varian ke Produk Lain"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {canAdjust && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAdjust(v.id);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                          title="Penyesuaian Stok Cepat"
                        >
                          Adjust
                        </button>
                      )}

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
