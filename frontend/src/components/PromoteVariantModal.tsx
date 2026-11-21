import React, { useState, useEffect } from 'react';
import { Product, ProductVariant, Category, Brand, Supplier } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { NumericInput } from './common/NumericInput';
import { formatStock } from '../utils/format';
import {
  X,
  ExternalLink,
  Layers,
  Package,
  AlertTriangle,
  Folder,
  Building2,
  Truck,
  Trash2,
  PowerOff,
  FolderSync,
} from 'lucide-react';

interface PromoteVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceProduct: Product;
  variant: ProductVariant;
  categories: Category[];
  onSuccess: (newProductId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const PromoteVariantModal: React.FC<PromoteVariantModalProps> = ({
  isOpen,
  onClose,
  sourceProduct,
  variant,
  categories,
  onSuccess,
  showToast,
}) => {
  const { can } = useAuth();
  const canDeleteProduct = can('products:delete');

  const [newProductName, setNewProductName] = useState<string>('');
  const [newProductSku, setNewProductSku] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [newVariantName, setNewVariantName] = useState<string>('Standar');
  const [sourceEmptyAction, setSourceEmptyAction] = useState<'delete' | 'deactivate' | 'keep'>('deactivate');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const isLastVariant = (sourceProduct.variants?.length || 0) <= 1;

  useEffect(() => {
    if (isOpen) {
      // Default new product name
      const defaultName =
        variant.variant_name.trim().toLowerCase() === 'standar'
          ? sourceProduct.name
          : `${sourceProduct.name} - ${variant.variant_name}`;

      setNewProductName(defaultName);
      setNewProductSku(variant.sku || `PRD-${Date.now().toString().slice(-6)}`);
      setCategoryId(sourceProduct.category_id || '');
      setBrand(sourceProduct.brand || '');
      setBrandId('');
      setSupplierId(sourceProduct.supplier_id || '');
      setDescription(sourceProduct.description || '');
      setMinStockAlert(Number(variant.min_stock) || Number(sourceProduct.min_stock_alert) || 5);
      setNewVariantName(variant.variant_name.trim().toLowerCase() === 'standar' ? 'Standar' : variant.variant_name);
      setSourceEmptyAction('deactivate');
      setNotes('');

      // Load brands and suppliers
      api.getBrands().then((data) => {
        setBrands(data);
        if (sourceProduct.brand) {
          const matched = data.find((b) => b.name.toLowerCase() === sourceProduct.brand?.toLowerCase());
          if (matched) setBrandId(matched.id);
        }
      }).catch(console.error);
      api.getSuppliers().then(setSuppliers).catch(console.error);
    }
  }, [isOpen, sourceProduct, variant]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      showToast('Nama produk baru wajib diisi', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.promoteVariant(variant.id, {
        new_product_name: newProductName.trim(),
        new_product_sku: newProductSku.trim() || undefined,
        category_id: categoryId || null,
        brand_id: brandId || null,
        brand: brand.trim() || undefined,
        supplier_id: supplierId || null,
        description: description.trim() || undefined,
        min_stock_alert: minStockAlert,
        new_variant_name: newVariantName.trim() || 'Standar',
        source_empty_action: isLastVariant ? sourceEmptyAction : undefined,
        notes: notes.trim() || undefined,
      });

      showToast(res.message || 'Varian berhasil dipromosikan menjadi produk mandiri!', 'success');
      onSuccess(res.new_product_id || '');
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memisahkan varian menjadi produk mandiri', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCategoryOptions = (cats: Category[] = categories, prefix = ''): React.ReactNode => {
    return cats.map((cat) => (
      <React.Fragment key={cat.id}>
        <option value={cat.id}>
          {prefix}
          {cat.name}
        </option>
        {cat.children &&
          cat.children.length > 0 &&
          renderCategoryOptions(cat.children, `${prefix}— `)}
      </React.Fragment>
    ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pisahkan Menjadi Produk Mandiri
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Promosikan varian ini menjadi produk independen baru
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Variant Info Badge */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                Varian yang Dipromosikan:
              </span>
              <span className="font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                SKU: {variant.sku}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  {variant.variant_name}
                </span>
                <span className="text-xs text-slate-500">
                  Dari Produk: <strong>{sourceProduct.name}</strong>
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Stok Fisik:</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                  {formatStock(variant.current_stock)}
                </span>
              </div>
            </div>
          </div>

          {/* New Product Name */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Nama Produk Baru <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="Contoh: Semen Gresik 50kg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* New Product SKU */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                SKU Produk Baru
              </label>
              <input
                type="text"
                value={newProductSku}
                onChange={(e) => setNewProductSku(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="SKU Produk (opsional)"
              />
            </div>

            {/* Variant Name in New Product */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nama Varian di Produk Baru
              </label>
              <input
                type="text"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="Contoh: Standar"
              />
            </div>
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                Kategori Produk
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">-- Pilih Kategori --</option>
                {renderCategoryOptions()}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-amber-500" />
                Merk / Brand
              </label>
              <select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  const selected = brands.find((b) => b.id === e.target.value);
                  if (selected) setBrand(selected.name);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">-- Pilih Merk (Opsional) --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Supplier & Min Stock Alert */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-blue-500" />
                Supplier Utama
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">-- Pilih Supplier (Opsional) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Batas Minimum Stok Alert
              </label>
              <NumericInput
                value={minStockAlert}
                onChange={(val) => setMinStockAlert(Number(val) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="5"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Deskripsi Produk Baru (Opsional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
              placeholder="Deskripsi atau spesifikasi produk..."
            />
          </div>

          {/* Action on Source Product if this was the last/only variant */}
          {isLastVariant && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-900/60 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-amber-900 dark:text-amber-200">
                    Ini adalah satu-satunya varian di produk asal ({sourceProduct.name}).
                  </strong>
                  <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                    Setelah varian ini dipisahkan menjadi produk baru, produk asal akan kosong tanpa varian. Pilih tindakan:
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-amber-500/5 transition-colors">
                  <input
                    type="radio"
                    name="promote_source_empty_action"
                    value="deactivate"
                    checked={sourceEmptyAction === 'deactivate'}
                    onChange={() => setSourceEmptyAction('deactivate')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <PowerOff className="w-4 h-4 text-slate-500" />
                    <span>
                      <strong>Nonaktifkan Produk Asal (Direkomendasikan)</strong>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Produk disembunyikan dari penjualan kasir namun data historis tetap utuh.
                      </span>
                    </span>
                  </div>
                </label>

                {canDeleteProduct && (
                  <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-rose-500/5 transition-colors">
                    <input
                      type="radio"
                      name="promote_source_empty_action"
                      value="delete"
                      checked={sourceEmptyAction === 'delete'}
                      onChange={() => setSourceEmptyAction('delete')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      <span>
                        <strong className="text-rose-600 dark:text-rose-400">Hapus Produk Asal Sepenuhnya</strong>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          Hapus master produk asal karena variannya telah dipindahkan ke produk baru ini.
                        </span>
                      </span>
                    </div>
                  </label>
                )}

                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-amber-500/5 transition-colors">
                  <input
                    type="radio"
                    name="promote_source_empty_action"
                    value="keep"
                    checked={sourceEmptyAction === 'keep'}
                    onChange={() => setSourceEmptyAction('keep')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <FolderSync className="w-4 h-4 text-slate-500" />
                    <span>
                      <strong>Biarkan Tetap Aktif Tanpa Varian</strong>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Produk tetap ada dan Anda dapat menambahkan varian baru nantinya.
                      </span>
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Notes Input */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Catatan Alasan Pemisahan (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pemisahan varian menjadi produk mandiri karena perluasan kategori"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !newProductName.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>Jadikan Produk Mandiri</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
