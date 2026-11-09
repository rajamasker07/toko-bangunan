import React, { useState, useEffect } from 'react';
import { Product, Category } from '../types';
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
  ChevronRight
} from 'lucide-react';

interface ProductListViewProps {
  products: Product[];
  categories: Category[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenDetail: (product: Product) => void;
  onOpenAdjust: (variantId: string) => void;
  onDeleteProduct: (id: string, name: string) => void;
  initialStockFilter?: string;
}

export const ProductListView: React.FC<ProductListViewProps> = ({
  products,
  categories,
  loading,
  onRefresh,
  onOpenCreate,
  onOpenDetail,
  onOpenAdjust,
  onDeleteProduct,
  initialStockFilter = 'all',
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState(initialStockFilter);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, stockFilter]);

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

    let matchStock = true;
    if (stockFilter === 'low') {
      matchStock = Boolean(p.has_low_stock && Number(p.total_stock) > 0);
    } else if (stockFilter === 'out') {
      matchStock = Number(p.total_stock) <= 0;
    } else if (stockFilter === 'normal') {
      matchStock = !p.has_low_stock && Number(p.total_stock) > 0;
    }

    return matchSearch && matchCategory && matchStock;
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
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama semen, pipa, cat, merk, atau SKU..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div className="md:col-span-4">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div className="md:col-span-3">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
            >
              <option value="all">Semua Status Stok</option>
              <option value="low">⚠️ Stok Kritis (Menipis)</option>
              <option value="out">🛑 Stok Habis (0)</option>
              <option value="normal">✅ Stok Aman</option>
            </select>
          </div>
        </div>

        {/* Quick status pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400">Filter Cepat:</span>
          <button
            onClick={() => setStockFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              stockFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            Semua ({products.length})
          </button>
          <button
            onClick={() => setStockFilter('low')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              stockFilter === 'low'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            Stok Kritis ({products.filter((p) => p.has_low_stock && Number(p.total_stock) > 0).length})
          </button>
          <button
            onClick={() => setStockFilter('out')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              stockFilter === 'out'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            Stok Habis ({products.filter((p) => Number(p.total_stock) <= 0).length})
          </button>
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
            Coba ubah kata kunci pencarian atau filter status stok.
          </p>
          <button
            onClick={onOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
          >
            <Plus className="w-4 h-4" /> Tambah Produk Baru
          </button>
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
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(product)}
                          className="font-bold text-slate-900 dark:text-white text-sm hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left flex items-center gap-1.5 group/name"
                          title="Klik untuk melihat detail & varian produk ini"
                        >
                          <span>{product.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/name:opacity-100 transition-opacity text-amber-500 shrink-0" />
                        </button>
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
                          <button
                            onClick={() => onOpenDetail(product)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Lihat Detail Produk & Varian"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

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
