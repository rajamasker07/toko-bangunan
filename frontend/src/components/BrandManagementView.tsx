import React, { useState, useMemo, useEffect } from 'react';
import { Brand } from '../types';
import { api } from '../services/api';
import { Pagination } from './common/Pagination';
import { 
  Award, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Package, 
  CheckCircle2, 
  X, 
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  RefreshCw
} from 'lucide-react';

interface BrandManagementViewProps {
  brands?: Brand[];
  loading?: boolean;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const BrandManagementView: React.FC<BrandManagementViewProps> = ({
  brands = [],
  loading = false,
  onRefresh,
  showToast,
}) => {
  const [search, setSearch] = useState('');
  const [filterUsage, setFilterUsage] = useState<'all' | 'used' | 'unused'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandName, setBrandName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute metrics
  const totalBrands = brands.length;
  const usedBrandsCount = brands.filter((b) => (b.product_count || 0) > 0).length;
  const totalProductsWithBrand = brands.reduce((acc, b) => acc + (b.product_count || 0), 0);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterUsage]);

  // Filtered brands
  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      const matchSearch =
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.name_key.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (filterUsage === 'used') return (b.product_count || 0) > 0;
      if (filterUsage === 'unused') return (b.product_count || 0) === 0;
      return true;
    });
  }, [brands, search, filterUsage]);

  // Paginated brands for performant rendering
  const paginatedBrands = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBrands.slice(start, start + pageSize);
  }, [filteredBrands, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingBrand(null);
    setBrandName('');
    setIsModalOpen(true);
  };

  const openEditModal = (b: Brand) => {
    setEditingBrand(b);
    setBrandName(b.name);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = brandName.trim();
    if (!cleanName) {
      showToast('Nama merek tidak boleh kosong', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingBrand) {
        await api.updateBrand(editingBrand.id, { name: cleanName });
        showToast(`Merek berhasil diubah menjadi "${cleanName}"`, 'success');
      } else {
        const res = await api.createBrand({ name: cleanName });
        if (res.created) {
          showToast(`Merek "${res.brand.name}" berhasil ditambahkan!`, 'success');
        } else {
          showToast(`Merek "${res.brand.name}" sudah ada dalam daftar.`, 'info');
        }
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan merek', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (b: Brand) => {
    const warning = (b.product_count || 0) > 0
      ? `Merek "${b.name}" terhubung ke ${b.product_count} produk. Jika dihapus, produk terkait akan menjadi tanpa merek. Lanjutkan?`
      : `Hapus merek "${b.name}"? Tindakan ini tidak dapat dibatalkan.`;

    if (!confirm(warning)) return;

    try {
      await api.deleteBrand(b.id);
      showToast(`Merek "${b.name}" berhasil dihapus`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus merek', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Master Merek (Brand)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Standarisasi nama merek dan pencegahan duplikasi data material toko bangunan
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
              title="Segarkan Data Merek"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          )}
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Merek Baru</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Merek Terdaftar</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalBrands}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Merek Aktif Dipakai</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{usedBrandsCount} Merek</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Produk Terhubung</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalProductsWithBrand} Produk</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama merek..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
          <span className="text-slate-400 text-[11px]">Filter:</span>
          <button
            onClick={() => setFilterUsage('all')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              filterUsage === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Semua ({totalBrands})
          </button>
          <button
            onClick={() => setFilterUsage('used')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              filterUsage === 'used'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            Terpakai ({usedBrandsCount})
          </button>
          <button
            onClick={() => setFilterUsage('unused')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              filterUsage === 'unused'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            Belum Digunakan ({totalBrands - usedBrandsCount})
          </button>
        </div>
      </div>

      {/* Brands Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading && brands.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-7 h-7 mx-auto text-amber-500 animate-spin" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">
              Memuat data merek...
            </p>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-xs space-y-2">
            <Award className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Tidak ada merek yang cocok dengan pencarian
            </p>
            <p className="text-[11px] text-slate-400">
              Coba gunakan kata kunci lain atau tambahkan merek baru.
            </p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Nama Merek</th>
                    <th className="py-3 px-4">Kunci Validasi Anti-Duplikat</th>
                    <th className="py-3 px-4 text-center">Jumlah Produk</th>
                    <th className="py-3 px-4">ID Merek (UUIDv7)</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedBrands.map((b) => {
                    const hasProducts = (b.product_count || 0) > 0;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                              <Award className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-sm text-slate-900 dark:text-white block">
                                {b.name}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {hasProducts ? 'Aktif dalam katalog' : 'Belum ditautkan ke produk'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-600 dark:text-slate-300">
                            {b.name_key}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded-full ${
                              hasProducts
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                            }`}
                          >
                            <Package className="w-3 h-3" />
                            <span>{b.product_count || 0} Produk</span>
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[10px] text-slate-400">
                          {b.id}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(b)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              title="Edit Nama Merek"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(b)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Hapus Merek"
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
            <Pagination
              currentPage={currentPage}
              totalItems={filteredBrands.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 15, 25, 50, 100]}
            />
          </div>
        )}
      </div>

      {/* Modal Add / Edit Brand */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingBrand ? 'Edit Nama Merek' : 'Tambah Merek Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Otomatis ternormalisasi anti-duplikasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Merek Material <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Misal: Tiga Roda, Avian, Rucika, Holcim..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Sistem secara cerdas mendeteksi variasi spasi, tanda hubung, dan huruf besar/kecil sehingga tidak akan ada merek duplikat.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Merek'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
