import React, { useState, useEffect, useMemo } from 'react';
import { Product, ProductVariant } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { formatStock } from '../utils/format';
import {
  X,
  ArrowRightLeft,
  AlertTriangle,
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Trash2,
  PowerOff,
  FolderSync,
} from 'lucide-react';

interface MoveVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceProduct: Product;
  variantsToMove: ProductVariant[];
  allProducts: Product[];
  onSuccess: (targetProductId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MoveVariantModal: React.FC<MoveVariantModalProps> = ({
  isOpen,
  onClose,
  sourceProduct,
  variantsToMove,
  allProducts,
  onSuccess,
  showToast,
}) => {
  const { can } = useAuth();
  const canDeleteProduct = can('products:delete');

  const [targetProductId, setTargetProductId] = useState<string>('');
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [skuMap, setSkuMap] = useState<Record<string, string>>({});
  const [sourceEmptyAction, setSourceEmptyAction] = useState<'delete' | 'deactivate' | 'keep'>('deactivate');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize state when modal opens or variants change
  useEffect(() => {
    if (isOpen) {
      setTargetProductId('');
      setRenameMap({});
      setSkuMap({});
      setSourceEmptyAction('deactivate');
      setNotes('');
    }
  }, [isOpen, sourceProduct.id]);

  // Options for target product (exclude source product)
  const productOptions: SearchableOption[] = useMemo(() => {
    return allProducts
      .filter((p) => p.id !== sourceProduct.id)
      .map((p) => ({
        value: p.id,
        label: p.name,
        subtitle: `SKU: ${p.sku} | ${p.variants?.length || 0} varian | Total Stok: ${formatStock(p.total_stock)}`,
      }));
  }, [allProducts, sourceProduct.id]);

  const targetProduct = useMemo(() => {
    return allProducts.find((p) => p.id === targetProductId) || null;
  }, [allProducts, targetProductId]);

  // Check whether moving all variants of source product
  const totalSourceVariants = sourceProduct.variants?.length || 0;
  const isMovingAllVariants = variantsToMove.length >= totalSourceVariants;

  // Collision detection for variant names in target product
  const collisionWarnings = useMemo(() => {
    if (!targetProduct) return {};
    const existingNames = new Set(
      (targetProduct.variants || []).map((v) => v.variant_name.trim().toLowerCase())
    );

    const warnings: Record<string, string> = {};
    for (const v of variantsToMove) {
      const plannedName = (renameMap[v.id] ?? v.variant_name).trim().toLowerCase();
      if (existingNames.has(plannedName)) {
        warnings[v.id] = `Produk tujuan "${targetProduct.name}" sudah memiliki varian "${renameMap[v.id] ?? v.variant_name}". Silakan ubah nama agar tidak bentrok.`;
      }
    }
    return warnings;
  }, [targetProduct, variantsToMove, renameMap]);

  const hasNameCollisions = Object.keys(collisionWarnings).length > 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProductId) {
      showToast('Pilih produk tujuan terlebih dahulu', 'error');
      return;
    }

    if (hasNameCollisions) {
      showToast('Terdapat bentrokan nama varian dengan produk tujuan. Mohon ganti nama varian.', 'error');
      return;
    }

    // Filter out renameMap and skuMap entries that match original values
    const cleanRenameMap: Record<string, string> = {};
    const cleanSkuMap: Record<string, string> = {};

    for (const v of variantsToMove) {
      if (renameMap[v.id] && renameMap[v.id].trim() !== v.variant_name.trim()) {
        cleanRenameMap[v.id] = renameMap[v.id].trim();
      }
      if (skuMap[v.id] && skuMap[v.id].trim() !== v.sku.trim()) {
        cleanSkuMap[v.id] = skuMap[v.id].trim();
      }
    }

    try {
      setIsSubmitting(true);
      const res = await api.moveVariants(sourceProduct.id, {
        variant_ids: variantsToMove.map((v) => v.id),
        target_product_id: targetProductId,
        rename_map: Object.keys(cleanRenameMap).length > 0 ? cleanRenameMap : undefined,
        sku_map: Object.keys(cleanSkuMap).length > 0 ? cleanSkuMap : undefined,
        source_empty_action: isMovingAllVariants ? sourceEmptyAction : undefined,
        notes: notes.trim() || undefined,
      });

      showToast(res.message || 'Varian berhasil dipindahkan!', 'success');
      onSuccess(targetProductId);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memindahkan varian', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pindahkan Varian Produk
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pindahkan varian ke produk lain tanpa kehilangan stok dan data historis
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Source Product & Variant Summary */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Produk Asal (Sumber):
              </span>
              <span className="text-xs font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                SKU: {sourceProduct.sku}
              </span>
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              {sourceProduct.name}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-2">
                Varian yang akan dipindahkan ({variantsToMove.length} varian):
              </span>
              <div className="space-y-2">
                {variantsToMove.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {v.variant_name}
                      </span>
                      <span className="text-slate-400 font-mono">({v.sku})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-slate-600 dark:text-slate-300">
                        Stok: <strong>{formatStock(v.current_stock)}</strong>
                      </span>
                      <span className="text-slate-400">
                        {v.units?.length || 1} Satuan
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Target Product Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Pilih Produk Tujuan <span className="text-rose-500">*</span>
            </label>
            <SearchableSelect
              value={targetProductId}
              onChange={(val) => setTargetProductId(val)}
              options={productOptions}
              placeholder="Cari nama produk tujuan atau SKU..."
              searchPlaceholder="Ketik untuk mencari produk..."
              icon={Package}
              iconColor="text-blue-500"
            />
            {targetProduct && (
              <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-200 dark:border-blue-900/50 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-300">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Target: {targetProduct.name}</strong>
                  <p className="mt-0.5 text-blue-700 dark:text-blue-400">
                    Saat ini memiliki {targetProduct.variants?.length || 0} varian. Varian yang dipindahkan akan ditambahkan ke produk ini.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Variant Renaming / Collision Resolution (When Target Selected) */}
          {targetProduct && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Penyesuaian Nama & SKU Varian di Produk Tujuan
                </label>
                <span className="text-[11px] text-slate-400">
                  (Ubah jika bentrok atau butuh nama berbeda)
                </span>
              </div>

              <div className="space-y-3">
                {variantsToMove.map((v) => {
                  const hasCollision = Boolean(collisionWarnings[v.id]);
                  return (
                    <div
                      key={v.id}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        hasCollision
                          ? 'border-rose-300 bg-rose-50/50 dark:border-rose-800/80 dark:bg-rose-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                          Varian Asal: <strong>{v.variant_name}</strong>
                        </span>
                        <span className="font-mono text-slate-400">SKU Asal: {v.sku}</span>
                      </div>

                      {hasCollision && (
                        <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{collisionWarnings[v.id]}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Nama Varian Baru
                          </label>
                          <input
                            type="text"
                            value={renameMap[v.id] ?? v.variant_name}
                            onChange={(e) =>
                              setRenameMap((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                              hasCollision
                                ? 'border-rose-400 focus:ring-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-amber-500'
                            }`}
                            placeholder="Nama varian di produk target"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            SKU Varian (Opsional / Tetap)
                          </label>
                          <input
                            type="text"
                            value={skuMap[v.id] ?? v.sku}
                            onChange={(e) =>
                              setSkuMap((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                            placeholder="SKU unik varian"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action on Source Product if all variants are moved */}
          {isMovingAllVariants && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-900/60 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-amber-900 dark:text-amber-200">
                    Seluruh varian produk asal akan dipindahkan.
                  </strong>
                  <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                    Produk sumber ({sourceProduct.name}) akan kosong tanpa varian. Tentukan tindakan untuk produk sumber:
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-amber-500/5 transition-colors">
                  <input
                    type="radio"
                    name="source_empty_action"
                    value="deactivate"
                    checked={sourceEmptyAction === 'deactivate'}
                    onChange={() => setSourceEmptyAction('deactivate')}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <div className="flex items-center gap-2">
                    <PowerOff className="w-4 h-4 text-slate-500" />
                    <span>
                      <strong>Nonaktifkan Produk Sumber (Direkomendasikan)</strong>
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
                      name="source_empty_action"
                      value="delete"
                      checked={sourceEmptyAction === 'delete'}
                      onChange={() => setSourceEmptyAction('delete')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      <span>
                        <strong className="text-rose-600 dark:text-rose-400">Hapus Produk Sumber Sepenuhnya</strong>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          Master produk dihapus karena seluruh data varian sudah dipindahkan ke produk target.
                        </span>
                      </span>
                    </div>
                  </label>
                )}

                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-amber-500/5 transition-colors">
                  <input
                    type="radio"
                    name="source_empty_action"
                    value="keep"
                    checked={sourceEmptyAction === 'keep'}
                    onChange={() => setSourceEmptyAction('keep')}
                    className="text-amber-600 focus:ring-amber-500"
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
              Catatan Alasan Pemindahan (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Koreksi human error saat input varian produk"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-400">
              Catatan ini akan tersimpan otomatis pada riwayat kartu stok dengan tipe "Pindah Produk".
            </p>
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
            disabled={isSubmitting || !targetProductId || hasNameCollisions}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memindahkan...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Pindahkan {variantsToMove.length} Varian</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
