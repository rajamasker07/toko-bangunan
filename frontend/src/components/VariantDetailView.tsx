import React, { useState, useEffect, useCallback } from 'react';
import { Product, ProductVariant, StockMovement, VariantUnit } from '../types';
import { api } from '../services/api';
import { formatRupiah, formatStock, formatDate } from '../utils/format';
import { Pagination } from './common/Pagination';
import { 
  ArrowLeft, 
  Layers, 
  Tag, 
  SlidersHorizontal, 
  History, 
  AlertTriangle, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw,
  Plus,
  Trash2,
  Calendar,
  User,
  Barcode
} from 'lucide-react';

interface VariantDetailViewProps {
  product: Product;
  variant: ProductVariant;
  onBackToProduct: () => void;
  onBackToCatalog: () => void;
  onOpenAdjust: (variantId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const VariantDetailView: React.FC<VariantDetailViewProps> = ({
  product,
  variant,
  onBackToProduct,
  onBackToCatalog,
  onOpenAdjust,
  showToast,
}) => {
  // Movements log state with paging
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [totalMovements, setTotalMovements] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [movementType, setMovementType] = useState<string>('ALL');
  const [loadingMovements, setLoadingMovements] = useState<boolean>(true);

  // Add Unit modal state
  const [isAddUnitOpen, setIsAddUnitOpen] = useState<boolean>(false);
  const [newUnitName, setNewUnitName] = useState<string>('Dus');
  const [newConversion, setNewConversion] = useState<number>(10);
  const [newSellPrice, setNewSellPrice] = useState<number>(0);
  const [newBuyPrice, setNewBuyPrice] = useState<number>(0);
  const [newWholesalePrice, setNewWholesalePrice] = useState<string>('');
  const [isSubmittingUnit, setIsSubmittingUnit] = useState<boolean>(false);

  // Fetch variant-specific movements with pagination
  const fetchVariantMovements = useCallback(async () => {
    try {
      setLoadingMovements(true);
      const offset = (currentPage - 1) * pageSize;
      const res = await api.getStockMovements({
        variantId: variant.id,
        type: movementType,
        limit: pageSize,
        offset: offset,
      });
      setMovements(res.items);
      setTotalMovements(res.total);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memuat log mutasi varian', 'error');
    } finally {
      setLoadingMovements(false);
    }
  }, [variant.id, currentPage, pageSize, movementType, showToast]);

  useEffect(() => {
    fetchVariantMovements();
  }, [fetchVariantMovements]);

  // Handle Add Unit Price
  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) {
      showToast('Nama satuan wajib diisi', 'error');
      return;
    }
    if (newSellPrice <= 0) {
      showToast('Harga jual harus lebih dari 0', 'error');
      return;
    }

    try {
      setIsSubmittingUnit(true);
      await api.addUnit(variant.id, {
        unit_name: newUnitName.trim(),
        conversion_factor: Number(newConversion) || 1,
        is_base_unit: false,
        buy_price: Number(newBuyPrice) || 0,
        sell_price: Number(newSellPrice),
        wholesale_price: newWholesalePrice ? Number(newWholesalePrice) : null,
      });

      showToast(`Satuan "${newUnitName}" berhasil ditambahkan ke varian`, 'success');
      setIsAddUnitOpen(false);
      setNewUnitName('');
      setNewConversion(1);
      setNewSellPrice(0);
      setNewBuyPrice(0);
      setNewWholesalePrice('');

      // Refresh product data
      onBackToProduct();
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan satuan harga', 'error');
    } finally {
      setIsSubmittingUnit(false);
    }
  };

  const isLow = Number(variant.current_stock) <= Number(variant.min_stock);
  const isOut = Number(variant.current_stock) <= 0;

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'INITIAL_STOCK':
        return <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">Stok Awal</span>;
      case 'STOCK_OPNAME':
        return <span className="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold">Opname Fisik</span>;
      case 'PURCHASE_RESTOCK':
        return <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold">Barang Masuk</span>;
      case 'DAMAGED_EXPIRED':
        return <span className="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold">Rusak / Pecah</span>;
      case 'SALE_DEDUCT':
        return <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">Penjualan</span>;
      case 'RETURN_IN':
        return <span className="bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 px-2 py-0.5 rounded text-[10px] font-bold">Retur Masuk</span>;
      case 'RETURN_OUT':
        return <span className="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400 px-2 py-0.5 rounded text-[10px] font-bold">Retur Keluar</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">{type}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Breadcrumb Navigation Flow */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
        <button
          onClick={onBackToCatalog}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors"
        >
          Katalog Produk
        </button>
        <span>/</span>
        <button
          onClick={onBackToProduct}
          className="hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors max-w-[200px] truncate"
          title={product.name}
        >
          {product.name}
        </button>
        <span>/</span>
        <span className="font-bold text-slate-900 dark:text-white max-w-[250px] truncate">
          Varian: {variant.variant_name}
        </span>
      </nav>

      {/* Header Card for Variant */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onBackToProduct}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Kembali ke Detail Produk"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {product.name}
                </span>
                {isOut ? (
                  <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    Stok Habis (0)
                  </span>
                ) : isLow ? (
                  <span className="text-xs font-bold text-amber-600 bg-amber-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Stok Menipis
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Stok Aman
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Layers className="w-6 h-6 text-amber-500 shrink-0" />
                <span>{variant.variant_name}</span>
              </h1>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                  SKU: {variant.sku}
                </span>
                {variant.barcode && (
                  <span className="flex items-center gap-1 font-mono">
                    <Barcode className="w-3.5 h-3.5" /> {variant.barcode}
                  </span>
                )}
                <span>• ID Varian: <code className="font-mono">{variant.id.slice(0, 10)}...</code></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 self-start lg:self-center">
            {/* Stock Metric Badge */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-right min-w-[140px]">
              <span className="text-[11px] text-slate-400 block font-medium">Stok Fisik Saat Ini</span>
              <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                {formatStock(variant.current_stock)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Batas Min: {formatStock(variant.min_stock)}
              </span>
            </div>

            {/* Quick Adjust Button */}
            <button
              onClick={() => onOpenAdjust(variant.id)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all shrink-0"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Penyesuaian Stok</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section: Multi-Satuan Harga (Satuan Bertingkat) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-500" />
              <span>Pilihan Satuan Harga (Multi-Satuan)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Harga eceran, grosir/kontraktor, dan faktor konversi satuan terhadap stok dasar
            </p>
          </div>

          <button
            onClick={() => setIsAddUnitOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Satuan Baru</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {variant.units?.map((u) => (
            <div
              key={u.id}
              className={`p-4 rounded-xl border text-xs transition-all ${
                u.is_base_unit
                  ? 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-500/10'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  {u.unit_name}
                </span>
                {u.is_base_unit ? (
                  <span className="text-[10px] font-extrabold uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                    Satuan Dasar Stok
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-slate-400">
                    1 {u.unit_name} = {formatStock(u.conversion_factor)} unit dasar
                  </span>
                )}
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Harga Jual:</span>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {formatRupiah(u.sell_price)}
                  </span>
                </div>
                {Number(u.buy_price) > 0 && (
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Harga Modal:</span>
                    <span>{formatRupiah(u.buy_price)}</span>
                  </div>
                )}
                {u.wholesale_price && Number(u.wholesale_price) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                    <span>Harga Grosir:</span>
                    <span>{formatRupiah(u.wholesale_price)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Riwayat Log Mutasi Stok Varian (DENGAN PAGINATION) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-500" />
              <span>Log Riwayat Mutasi Stok Varian</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit lengkap transaksi masuk, keluar, dan penyesuaian fisik opname khusus varian ini
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Filter Type */}
            <select
              value={movementType}
              onChange={(e) => {
                setMovementType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">Semua Tipe Mutasi</option>
              <option value="STOCK_OPNAME">Opname Fisik</option>
              <option value="PURCHASE_RESTOCK">Barang Masuk / Pembelian</option>
              <option value="DAMAGED_EXPIRED">Barang Rusak / Pecah</option>
              <option value="SALE_DEDUCT">Penjualan</option>
              <option value="INITIAL_STOCK">Stok Awal</option>
            </select>

            <button
              onClick={fetchVariantMovements}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Muat Ulang Log"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMovements ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table of Movements */}
        {loadingMovements ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <div className="w-7 h-7 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Memuat riwayat log mutasi varian...
          </div>
        ) : movements.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada riwayat mutasi stok untuk varian ini pada filter yang dipilih.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Tipe Mutasi</th>
                    <th className="py-3 px-4 text-center">Stok Sebelum</th>
                    <th className="py-3 px-4 text-center">Perubahan (+/-)</th>
                    <th className="py-3 px-4 text-center">Stok Sesudah</th>
                    <th className="py-3 px-4">Referensi & Alasan</th>
                    <th className="py-3 px-4">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.map((m) => {
                    const change = Number(m.quantity_change);
                    const isPositive = change > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {formatDate(m.created_at)}
                          </div>
                          <span className="font-mono text-[9px] text-slate-400">
                            ID: {m.id.slice(0, 10)}...
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {getMovementBadge(m.movement_type)}
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-500">
                          {formatStock(m.previous_stock)}
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full ${
                              isPositive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                            {isPositive ? `+${formatStock(change)}` : formatStock(change)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-extrabold text-slate-900 dark:text-white">
                          {formatStock(m.current_stock)}
                        </td>

                        <td className="py-3 px-4 max-w-[200px]">
                          {m.reference_no && (
                            <span className="block font-mono text-[10px] text-slate-400 mb-0.5">
                              Ref: {m.reference_no}
                            </span>
                          )}
                          <p className="text-slate-700 dark:text-slate-300 text-xs truncate" title={m.notes || ''}>
                            {m.notes || '-'}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-[11px]">
                            <User className="w-3 h-3 text-slate-400" />
                            {m.created_by || 'Admin'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination for Variant Movements */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalMovements}
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

      {/* Add Unit Modal */}
      {isAddUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tambah Satuan Harga untuk Varian
            </h3>
            <p className="text-xs text-slate-500">
              Tambahkan satuan eceran atau grosir untuk varian <strong className="text-slate-800 dark:text-slate-200">{variant.variant_name}</strong>
            </p>

            <form onSubmit={handleAddUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Satuan:
                </label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="Misal: Dus, Truk, Ikat, Kg..."
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Faktor Konversi (Berisi berapa unit dasar):
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={newConversion}
                  onChange={(e) => setNewConversion(Number(e.target.value))}
                  placeholder="Misal: 1 Truk = 200 Sak, isi 200"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Jual Standar:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Modal / Beli:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Harga Grosir / Tukang (Opsional):
                </label>
                <input
                  type="number"
                  min="0"
                  value={newWholesalePrice}
                  onChange={(e) => setNewWholesalePrice(e.target.value)}
                  placeholder="Kosongkan jika tidak ada"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddUnitOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUnit}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
                >
                  {isSubmittingUnit ? 'Menyimpan...' : 'Simpan Satuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
