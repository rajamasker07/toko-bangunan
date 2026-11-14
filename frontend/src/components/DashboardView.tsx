import React from 'react';
import { DashboardSummary, ProductVariant } from '../types';
import { formatStock, formatDate } from '../utils/format';
import { 
  Package, 
  Layers, 
  AlertTriangle, 
  FolderTree, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  SlidersHorizontal,
  PlusCircle,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  loading: boolean;
  reservationAlerts?: {
    total_active?: number;
    overdue_count?: number;
    due_soon_count?: number;
    total_items_held?: number;
  } | null;
  onOpenCreateProduct: () => void;
  onOpenStockAdjust: (variantId?: string) => void;
  onNavigateToProducts: (filterStatus?: string) => void;
  onNavigateToMovements: () => void;
  onNavigateToReservations?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  loading,
  reservationAlerts,
  onOpenCreateProduct,
  onOpenStockAdjust,
  onNavigateToProducts,
  onNavigateToMovements,
  onNavigateToReservations,
}) => {
  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Memuat data ringkasan inventaris...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Produk Master',
      value: summary.total_products,
      desc: 'Produk terdaftar di toko',
      icon: Package,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      action: () => onNavigateToProducts('all'),
    },
    {
      title: 'Total Varian Barang',
      value: summary.total_variants,
      desc: 'Ukuran, warna, spesifikasi',
      icon: Layers,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      action: () => onNavigateToProducts('all'),
    },
    {
      title: 'Kategori & Sub-Kategori',
      value: summary.total_categories,
      desc: 'Struktur katalog bertingkat',
      icon: FolderTree,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      title: 'Peringatan Stok Kritis',
      value: summary.low_stock_count,
      desc: 'Stok di bawah batas minimal',
      icon: AlertTriangle,
      color: summary.low_stock_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600',
      bg: summary.low_stock_count > 0 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-slate-500/10 border-slate-500/20',
      action: () => onNavigateToProducts('low'),
      alert: summary.low_stock_count > 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-lg shadow-orange-500/15">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Ringkasan Operasional Toko</h2>
          <p className="text-amber-100 text-sm">
            Pantau stok bahan bangunan, mutasi barang gudang, dan varian multi-satuan secara instan.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onOpenStockAdjust()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20 transition-all shadow-sm"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Stock Opname</span>
          </button>
          <button
            onClick={onOpenCreateProduct}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white text-slate-900 hover:bg-amber-50 transition-all shadow-md"
          >
            <PlusCircle className="w-4 h-4 text-amber-600" />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Prominent Warning Widget for Overdue or Due Soon Reservations */}
      {Boolean(
        reservationAlerts &&
          ((reservationAlerts.overdue_count && reservationAlerts.overdue_count > 0) ||
            (reservationAlerts.due_soon_count && reservationAlerts.due_soon_count > 0))
      ) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-500/15 via-amber-500/10 to-orange-500/15 border-2 border-rose-500/30 dark:border-rose-500/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/30 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                  Peringatan Reservasi Barang
                </h3>
                {(reservationAlerts?.overdue_count || 0) > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-sm">
                    {reservationAlerts!.overdue_count} Lewat Batas Waktu
                  </span>
                )}
                {(reservationAlerts?.due_soon_count || 0) > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold">
                    {reservationAlerts!.due_soon_count} Jatuh Tempo (H-2)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Barang pesanan pelanggan masih tertahan di gudang dan memakan alokasi stok. Segera ingatkan pelanggan via WhatsApp atau proses pengambilan barang.
              </p>
            </div>
          </div>
          {onNavigateToReservations && (
            <button
              type="button"
              onClick={onNavigateToReservations}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/25 transition-all shrink-0 whitespace-nowrap"
            >
              <span>Kelola Reservasi</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.action}
              className={`p-5 rounded-2xl border ${card.bg} bg-white dark:bg-slate-900 transition-all duration-200 ${
                card.action ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.title}
                </span>
                <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {card.value}
                </div>
                {card.alert && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 animate-pulse">
                    Perhatian
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {card.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Grid: Low Stock Alert & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Low Stock Items */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Stok Menipis / Kritis
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Segera restock sebelum kehabisan
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigateToProducts('low')}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              Lihat Semua
            </button>
          </div>

          {summary.low_stock_items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500 mb-2 opacity-80" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Semua Stok Dalam Batas Aman
              </p>
              <p className="text-xs text-slate-400">Tidak ada varian dengan stok di bawah batas minimal.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.low_stock_items.map((item) => (
                <div
                  key={item.variant_id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.product_name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.variant_name} • SKU: {item.sku}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        Sisa: {formatStock(item.current_stock)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Min: {formatStock(item.min_stock)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenStockAdjust(item.variant_id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
                  >
                    Adjust
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Recent Stock Movements Activity */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Log Mutasi Stok Terkini
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Audit jejak perubahan kuantitas inventaris
                </p>
              </div>
            </div>
            <button
              onClick={onNavigateToMovements}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Semua Log Mutasi
            </button>
          </div>

          {summary.recent_movements.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              Belum ada riwayat mutasi stok tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                    <th className="pb-2 font-medium">Waktu</th>
                    <th className="pb-2 font-medium">Barang & Varian</th>
                    <th className="pb-2 font-medium">Perubahan</th>
                    <th className="pb-2 font-medium">Stok Akhir</th>
                    <th className="pb-2 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.recent_movements.map((m) => {
                    const change = Number(m.quantity_change);
                    const isPositive = change > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 text-slate-500 whitespace-nowrap">
                          {formatDate(m.created_at)}
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {m.product_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {m.variant_name}
                          </div>
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full ${
                              isPositive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownLeft className="w-3 h-3" />
                            )}
                            {isPositive ? `+${formatStock(change)}` : formatStock(change)}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-slate-700 dark:text-slate-300">
                          {formatStock(m.current_stock)}
                        </td>
                        <td className="py-2.5 text-slate-500 max-w-[180px] truncate" title={m.notes || ''}>
                          {m.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
