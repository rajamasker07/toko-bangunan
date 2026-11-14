import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  FolderTree, 
  Plus, 
  Folder, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  X,
  Search,
  GitFork,
  RefreshCw,
  Eye
} from 'lucide-react';

interface CategoryManagementViewProps {
  categories?: Category[];
  categoriesTree?: Category[];
  loading?: boolean;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CategoryManagementView: React.FC<CategoryManagementViewProps> = ({
  categories = [],
  categoriesTree = [],
  loading = false,
  onRefresh,
  showToast,
}) => {
  const { can } = useAuth();
  const canWrite = can('master:write');
  const canDelete = can('master:delete');

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metrics
  const totalCategories = categories.length;
  const rootCategories = categories.filter((c) => !c.parent_id).length;
  const subCategories = totalCategories - rootCategories;

  const openCreateModal = (parentCatId?: string) => {
    setEditingCategory(null);
    setName('');
    setParentId(parentCatId || '');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setParentId(cat.parent_id || '');
    setDescription(cat.description || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      showToast('Anda tidak memiliki izin mengelola kategori.', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Nama kategori tidak boleh kosong', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: name.trim(),
        parent_id: parentId || null,
        description: description.trim() || undefined,
      };

      if (editingCategory) {
        await api.updateCategory(editingCategory.id, payload);
      } else {
        await api.createCategory(payload);
      }

      showToast(
        editingCategory ? 'Kategori berhasil diperbarui!' : 'Kategori baru berhasil dibuat!',
        'success'
      );
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan kategori', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!canDelete) {
      showToast('Anda tidak memiliki izin menghapus kategori.', 'error');
      return;
    }
    if (!confirm(`Apakah Anda yakin ingin menghapus kategori "${cat.name}"?`)) {
      return;
    }

    try {
      await api.deleteCategory(cat.id);
      showToast('Kategori berhasil dihapus', 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus kategori', 'error');
    }
  };

  // Filter tree matching search
  const filterTree = (nodes: Category[], query: string): Category[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();

    const matches = (node: Category): boolean => {
      const selfMatch = node.name.toLowerCase().includes(q) || (node.description && node.description.toLowerCase().includes(q));
      const childMatch = node.children ? node.children.some(matches) : false;
      return Boolean(selfMatch || childMatch);
    };

    return nodes.filter(matches).map((node) => {
      return {
        ...node,
        children: node.children ? filterTree(node.children, query) : [],
      };
    });
  };

  const displayTree = useMemo(() => filterTree(categoriesTree, search), [categoriesTree, search]);

  // Recursive tree renderer
  const renderCategoryNode = (cat: Category, depth = 0) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const isMatched = search && cat.name.toLowerCase().includes(search.toLowerCase());

    return (
      <div key={cat.id} className="space-y-1">
        <div
          className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all ${
            isMatched
              ? 'ring-2 ring-amber-500 border-amber-500/50 bg-amber-500/10'
              : 'border-slate-200/70 dark:border-slate-800'
          } ${
            depth === 0
              ? 'bg-white dark:bg-slate-900 shadow-sm font-semibold'
              : depth === 1
              ? 'bg-slate-50/80 dark:bg-slate-800/40 ml-6 text-sm'
              : 'bg-amber-500/5 dark:bg-amber-500/5 ml-12 text-xs'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                depth === 0
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-900 dark:text-white font-bold">{cat.name}</span>
                {depth > 0 && (
                  <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                    Sub-level {depth}
                  </span>
                )}
                {hasChildren && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    ({cat.children!.length} sub)
                  </span>
                )}
              </div>
              {cat.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                  {cat.description}
                </p>
              )}
            </div>
          </div>

          {(canWrite || canDelete) && (
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
              {canWrite && (
                <>
                  <button
                    onClick={() => openCreateModal(cat.id)}
                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold flex items-center gap-1"
                    title="Tambah Sub-Kategori di bawah kategori ini"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sub-kategori</span>
                  </button>
                  <button
                    onClick={() => openEditModal(cat)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit Kategori"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {canDelete && (
                <button
                  onClick={() => handleDelete(cat)}
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="Hapus Kategori"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {hasChildren && (
          <div className="space-y-1">
            {cat.children!.map((child) => renderCategoryNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-amber-500" />
            <span>Kategori Bertingkat</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hierarki tak terbatas: Induk Kategori → Sub-Kategori → Sub-Sub-Kategori untuk pengelompokan material
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!canWrite && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Eye className="w-3.5 h-3.5" />
              Mode Lihat Saja
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
              title="Segarkan Kategori"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => openCreateModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori Utama</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Seluruh Kategori</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalCategories} Kategori</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Kategori Utama (Induk)</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{rootCategories} Induk</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Sub-Kategori Turunan</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{subCategories} Sub-Level</span>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kategori atau sub-kategori material..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Hapus Pencarian
          </button>
        )}
      </div>

      {/* Tree Visualization */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
        {loading && categories.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-7 h-7 mx-auto text-amber-500 animate-spin" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">
              Memuat struktur kategori...
            </p>
          </div>
        ) : displayTree.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs space-y-1">
            <FolderTree className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">
              {search ? 'Tidak ada kategori yang cocok dengan pencarian' : 'Belum ada kategori yang dibuat.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayTree.map((cat) => renderCategoryNode(cat))}
          </div>
        )}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori / Sub-Kategori'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Kategori <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Misal: Semen & Mortar, Pipa PVC AW..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori Induk (Parent Category):
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">-- Kategori Utama (Tanpa Induk) --</option>
                  {categories
                    .filter((c) => !editingCategory || c.id !== editingCategory.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi Singkat:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Keterangan jenis material yang termasuk..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
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
                  <span>Simpan Kategori</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
