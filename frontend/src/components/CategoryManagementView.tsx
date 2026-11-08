import React, { useState } from 'react';
import { Category } from '../types';
import { FolderTree, Plus, ChevronRight, Folder, Tag, Trash2, Edit2, CheckCircle2, X } from 'lucide-react';

interface CategoryManagementViewProps {
  categories: Category[];
  categoriesTree: Category[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CategoryManagementView: React.FC<CategoryManagementViewProps> = ({
  categories,
  categoriesTree,
  onRefresh,
  showToast,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!name.trim()) {
      showToast('Nama kategori tidak boleh kosong', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories';
      const method = editingCategory ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          parent_id: parentId || null,
          description: description.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan kategori');
      }

      showToast(
        editingCategory ? 'Kategori berhasil diperbarui!' : 'Kategori baru berhasil dibuat!',
        'success'
      );
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus kategori "${cat.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus kategori');
      }

      showToast('Kategori berhasil dihapus', 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Recursive tree renderer
  const renderCategoryNode = (cat: Category, depth = 0) => {
    const hasChildren = cat.children && cat.children.length > 0;

    return (
      <div key={cat.id} className="space-y-1">
        <div
          className={`group flex items-center justify-between p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-colors ${
            depth === 0
              ? 'bg-white dark:bg-slate-900 shadow-sm font-semibold'
              : depth === 1
              ? 'bg-slate-50/70 dark:bg-slate-800/40 ml-6 text-sm'
              : 'bg-amber-500/5 dark:bg-amber-500/5 ml-12 text-xs'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-1.5 rounded-lg ${
                depth === 0
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}
            >
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-900 dark:text-white font-bold">{cat.name}</span>
                {depth > 0 && (
                  <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                    Sub-level {depth}
                  </span>
                )}
              </div>
              {cat.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {cat.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
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
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Edit Kategori"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(cat)}
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              title="Hapus Kategori"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
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
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-amber-500" />
            <span>Struktur Kategori Bertingkat</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hierarki tak terbatas: Induk Kategori → Sub-Kategori → Sub-Sub-Kategori untuk pengelompokan material
          </p>
        </div>

        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Kategori Utama</span>
        </button>
      </div>

      {/* Tree Visualization */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
        {categoriesTree.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada kategori yang dibuat.
          </div>
        ) : (
          <div className="space-y-3">
            {categoriesTree.map((cat) => renderCategoryNode(cat))}
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
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
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
