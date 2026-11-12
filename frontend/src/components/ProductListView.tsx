import React, { useState, useEffect, useMemo } from 'react';
import { Product, Category, Brand } from '../types';
import { formatRupiah, formatStock } from '../utils/format';
import { Pagination } from './common/Pagination';
import { 
  Search, 
  Filter, 
  Plus, 
  Layers, 
  SlidersHorizontal, 
  Eye, 
  AlertTriangle, 
  ShieldCheck, 
  Download,
  Trash2,
  Package,
  ChevronRight,
  Edit2,
  Power
} from 'lucide-react';

interface ProductListViewProps {
  products: Product[];
  categories: Category[];
  brands?: Brand[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenDetail: (product: Product) => void;
  onOpenAdjust: (variantId: string) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct: (id: string, name: string) => void;
  onToggleProductStatus?: (product: Product) => void;
  initialStockFilter?: string;
}

export const ProductListView: React.FC<ProductListViewProps> = ({
  products,
  categories,
  brands = [],
  loading,
  onRefresh,
  onOpenCreate,
  onOpenDetail,
  onOpenAdjust,
  onEditProduct,
  onDeleteProduct,
  onToggleProductStatus,
  initialStockFilter = 'all',
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [stockFilter, setStockFilter] = useState(initialStockFilter);
  const [saleFilter, setSaleFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Extract unique brands list
  const brandList = useMemo(() => {
    const list: string[] = [];
    if (brands && brands.length > 0) {
      brands.forEach((b) => {
        if (b.name && !list.includes(b.name)) list.push(b.name);
      });
    }
    products.forEach((p) => {
      if (p.brand && !list.includes(p.brand)) list.push(p.brand);
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [brands, products]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, selectedBrand, stockFilter, saleFilter]);

  // Filter products client-side for ultra-responsive instant UX
  const filteredProducts = products.filter((p) => {
    const query = search.toLowerCase();
    const matchSearch =
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      (p.brand && p.brand.toLowerCase().includes(query)) ||
      (p.category_name && p.category_name.toLowerCase().includes(query)) ||
      p.variants?.some(
        (v) =>
          v.variant_name.toLowerCase().includes(query) ||
          v.sku.toLowerCase().includes(query)
      );

    const matchCategory =
      !selectedCategory || p.category_id === selectedCategory;

    const matchBrand =
      !selectedBrand || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());

    let matchStock = true;
    if (stockFilter === 'low') {
      matchStock = Boolean(p.has_low_stock && Number(p.total_stock) > 0);
    } else if (stockFilter === 'out') {
      matchStock = Number(p.total_stock) <= 0;
    } else if (stockFilter === 'normal') {
      matchStock = !p.has_low_stock && Number(p.total_stock) > 0;
    }

    let matchSale = true;
    if (saleFilter === 'active') {
      matchSale = p.is_active !== false;
    } else if (saleFilter === 'inactive') {
      matchSale = p.is_active === false;
    }

    return matchSearch && matchCategory && matchBrand && matchStock && matchSale;
  });

  // Paginated slice
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const exportCSV = () => {
    const headers = ['ID (UUIDv7)', 'Nama Produk', 'SKU', 'Merk', 'Kategori', 'Total Stok', 'Batas Min', 'Varian', 'Harga Dasar'];
    const rows = filteredProducts.map((p) => {
      const baseUnit = p.variants?.[0]?.units?.find((u) => u.is_base_unit) || p.variants?.[0]?.units?.[0];
      return [
        `"${p.id}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku}"`,
        `"${p.brand || ''}"`,
        `"${p.category_name || ''}"`,
        p.total_stock,
        p.min_stock_alert,
        p.variant_count || 1,
        baseUnit ? Number(baseUnit.sell_price) : 0,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `produk_toko_bangunan_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Katalog Data Produk & Varian
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola barang bahan bangunan, varian ukuran/warna, dan multi-satuan harga
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama semen, pipa, cat, merk, atau SKU..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div className="sm:col-span-4">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter (Merek) */}
          <div className="sm:col-span-3">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
            >
              <option value="">Semua Merek ({brandList.length})</option>
              {brandList.map((brandName) => (
                <option key={brandName} value={brandName}>
                  {brandName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick status pills for Sale Status & Stock */}
        <div className="space-y-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Sale Status (Tingkat Produk) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-semibold text-[11px] mr-1">Status Penjualan:</span>
              <button
                type="button"
                onClick={() => setSaleFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  saleFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Semua Status ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setSaleFilter('active')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  saleFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                <span>Masih Dijual ({products.filter((p) => p.is_active !== false).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSaleFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  saleFilter === 'inactive'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                <span>Sudah Tidak Dijual ({products.filter((p) => p.is_active === false).length})</span>
              </button>
            </div>

            {(search || selectedCategory || selectedBrand || stockFilter !== 'all' || saleFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedBrand('');
                  setStockFilter('all');
                  setSaleFilter('all');
                }}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-semibold"
              >
                Reset Semua Filter
              </button>
            )}
          </div>

          {/* Stock Condition */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800/60">
            <span className="text-slate-400 font-semibold text-[11px] mr-1">Kondisi Stok:</span>
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                stockFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Semua ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('low')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'low'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Stok Kritis ({products.filter((p) => p.has_low_stock && Number(p.total_stock) > 0).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('out')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'out'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
              <span>Stok Habis ({products.filter((p) => Number(p.total_stock) <= 0).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('normal')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'normal'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Stok Aman ({products.filter((p) => !p.has_low_stock && Number(p.total_stock) > 0).length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Products Table / Cards */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Memuat daftar produk...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            Tidak ada produk yang cocok
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian, kategori, merek, atau filter stok.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {(search || selectedCategory || selectedBrand || stockFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedBrand('');
                  setStockFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Reset Filter
              </button>
            )}
            <button
              onClick={onOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" /> Tambah Produk Baru
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Nama Produk & SKU</th>
                  <th className="py-3 px-4">Kategori & Brand</th>
                  <th className="py-3 px-4">Varian & Satuan</th>
                  <th className="py-3 px-4">Total Stok</th>
                  <th className="py-3 px-4">Harga Acuan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedProducts.map((product) => {
                  const firstVariant = product.variants?.[0];
                  const primaryUnit = firstVariant?.units?.find((u) => u.is_base_unit) || firstVariant?.units?.[0];
                  const isLow = product.has_low_stock && Number(product.total_stock) > 0;
                  const isOut = Number(product.total_stock) <= 0;

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        product.is_active === false ? 'bg-rose-500/[0.02] dark:bg-rose-950/[0.05]' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(product)}
                            className="font-bold text-slate-900 dark:text-white text-sm hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left flex items-center gap-1.5 group/name"
                            title="Klik untuk melihat detail & varian produk ini"
                          >
                            <span>{product.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/name:opacity-100 transition-opacity text-amber-500 shrink-0" />
                          </button>

                          {product.is_active === false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-500/10 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Sudah Tidak Dijual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Masih Dijual
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {product.sku}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            UUID: {product.id.slice(0, 8)}...
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {product.category_name || 'Umum'}
                        </span>
                        {product.brand && (
                          <span className="block text-[11px] text-slate-400 mt-1">
                            Merk: {product.brand}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {product.variant_count || 1} Varian
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {primaryUnit?.unit_name ? `Satuan: ${primaryUnit.unit_name}` : ''}
                        </div>
                        {(() => {
                          const inactiveVars = product.variants?.filter((v) => v.is_active === false).length || 0;
                          if (inactiveVars > 0) {
                            return (
                              <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
                                {inactiveVars} varian tidak dijual
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                            {formatStock(product.total_stock)}
                          </span>

                          {isOut ? (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              Habis
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
                        <span className="text-[10px] text-slate-400">
                          Min alert: {formatStock(product.min_stock_alert)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {primaryUnit ? (
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatRupiah(primaryUnit.sell_price)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              /{primaryUnit.unit_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onToggleProductStatus && (
                            <button
                              type="button"
                              onClick={() => onToggleProductStatus(product)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                product.is_active !== false
                                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  : 'text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                              }`}
                              title={
                                product.is_active !== false
                                  ? 'Status: Masih Dijual (Klik untuk hentikan penjualan)'
                                  : 'Status: Sudah Tidak Dijual (Klik untuk aktifkan kembali)'
                              }
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenDetail(product)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Lihat Detail Produk & Varian"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {onEditProduct && (
                            <button
                              onClick={() => onEditProduct(product)}
                              className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              title="Edit Produk"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenAdjust(firstVariant?.id || '')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                            title="Penyesuaian Stok Cepat"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Adjust</span>
                          </button>

                          <button
                            onClick={() => onDeleteProduct(product.id, product.name)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Hapus Produk"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination for Products List */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10, 20, 50]}
          />
        </div>
      )}
    </div>
  );
};
