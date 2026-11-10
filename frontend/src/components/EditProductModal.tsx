import React, { useState, useEffect } from 'react';
import { Product, Category, Brand } from '../types';
import { api } from '../services/api';
import { X, CheckCircle2, Package, FolderPlus, Award } from 'lucide-react';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categories: Category[];
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  onClose,
  product,
  categories,
  onSuccess,
  showToast,
}) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [description, setDescription] = useState('');
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Brands list
  const [brands, setBrands] = useState<Brand[]>([]);

  // Local categories list
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  // Quick category state
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatParentId, setQuickCatParentId] = useState('');
  const [isSubmittingQuickCat, setIsSubmittingQuickCat] = useState(false);

  // Quick brand state
  const [showQuickBrand, setShowQuickBrand] = useState(false);
  const [quickBrandName, setQuickBrandName] = useState('');
  const [isSubmittingQuickBrand, setIsSubmittingQuickBrand] = useState(false);

  useEffect(() => {
    if (isOpen && product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setCategoryId(product.category_id || '');
      setDescription(product.description || '');
      setMinStockAlert(Number(product.min_stock_alert) || 5);
      setLocalCategories(categories);

      // Load brands and match current product's brand
      api.getBrands().then((data) => {
        setBrands(data);
        if (product.brand) {
          const matched = data.find((b) => b.name.toLowerCase() === product.brand?.toLowerCase());
          if (matched) setBrandId(matched.id);
        }
      }).catch(console.error);
    }
  }, [isOpen, product, categories]);

  if (!isOpen || !product) return null;

  // Flatten categories with visual indent
  const renderCategoryOptions = () => {
    const options: React.ReactNode[] = [];
    const traverse = (cats: Category[], level = 0) => {
      for (const cat of cats) {
        const prefix = '\u00A0\u00A0\u00A0\u00A0'.repeat(level) + (level > 0 ? '↳ ' : '');
        options.push(
          <option key={cat.id} value={cat.id}>
            {prefix}{cat.name}
          </option>
        );
        if (cat.children && cat.children.length > 0) {
          traverse(cat.children, level + 1);
        }
      }
    };
    traverse(localCategories);
    return options;
  };

  const handleQuickAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCatName.trim()) {
      showToast('Nama kategori wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickCat(true);
      const newCat = await api.createCategory({
        name: quickCatName.trim(),
        parent_id: quickCatParentId || null,
      });

      const updatedCategories = await api.getCategories(true);
      setLocalCategories(updatedCategories);
      setCategoryId(newCat.id);
      setQuickCatName('');
      setQuickCatParentId('');
      setShowQuickCategory(false);
      showToast(`Kategori "${newCat.name}" berhasil ditambahkan & dipilih`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan kategori', 'error');
    } finally {
      setIsSubmittingQuickCat(false);
    }
  };

  const handleQuickAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickBrandName.trim()) {
      showToast('Nama merek wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickBrand(true);
      const res = await api.createBrand({ name: quickBrandName.trim() });
      const brandData = res.brand;

      const updatedBrands = await api.getBrands();
      setBrands(updatedBrands);
      setBrandId(brandData.id);
      setQuickBrandName('');
      setShowQuickBrand(false);

      if (res.created) {
        showToast(`Merek "${brandData.name}" berhasil ditambahkan`, 'success');
      } else {
        showToast(`Merek "${brandData.name}" sudah terdaftar, otomatis dipilih`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan merek', 'error');
    } finally {
      setIsSubmittingQuickBrand(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama produk wajib diisi', 'error');
      return;
    }
    if (!sku.trim()) {
      showToast('SKU produk wajib diisi', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.updateProduct(product.id, {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim() || null,
        category_id: categoryId || null,
        brand_id: brandId || null,
        description: description.trim() || null,
        min_stock_alert: Number(minStockAlert) || 5,
      });

      showToast(`Produk "${name}" berhasil diperbarui`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui produk', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Informasi Produk
              </h2>
              <p className="text-xs text-slate-500">
                ID: <span className="font-mono">{product.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nama Produk <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                SKU Master <span className="text-rose-500">*</span>:
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Barcode Scan:
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan / ketik barcode..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Category Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Kategori / Sub-Kategori:
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickCategory((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{showQuickCategory ? 'Tutup' : '+ Kategori Baru'}</span>
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="">-- Pilih Kategori --</option>
                {renderCategoryOptions()}
              </select>

              {/* Quick Category Form */}
              {showQuickCategory && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    Tambah Kategori Cepat:
                  </p>
                  <input
                    type="text"
                    value={quickCatName}
                    onChange={(e) => setQuickCatName(e.target.value)}
                    placeholder="Nama kategori..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <select
                    value={quickCatParentId}
                    onChange={(e) => setQuickCatParentId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="">Sebagai Kategori Utama (Tanpa Induk)</option>
                    {renderCategoryOptions()}
                  </select>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowQuickCategory(false)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAddCategory}
                      disabled={isSubmittingQuickCat}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {isSubmittingQuickCat ? 'Menyimpan...' : 'Simpan Kategori'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Brand Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Merk / Brand:
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickBrand((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>{showQuickBrand ? 'Tutup' : '+ Merk Baru'}</span>
                </button>
              </div>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="">-- Pilih Merk (Opsional) --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              {/* Quick Brand Form */}
              {showQuickBrand && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    Tambah Merk Baru:
                  </p>
                  <input
                    type="text"
                    value={quickBrandName}
                    onChange={(e) => setQuickBrandName(e.target.value)}
                    placeholder="Nama merek..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowQuickBrand(false)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAddBrand}
                      disabled={isSubmittingQuickBrand}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {isSubmittingQuickBrand ? 'Menyimpan...' : 'Simpan Merk'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Batas Peringatan Stok Minimal:
            </label>
            <input
              type="number"
              min="1"
              value={minStockAlert}
              onChange={(e) => setMinStockAlert(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Deskripsi & Spesifikasi Produk:
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Keterangan dimensi, daya sebar, sertifikasi SNI, dll..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shadow-md shadow-amber-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
