import React, { useState, useEffect } from 'react';
import { StockMovement } from '../types';
import { api } from '../services/api';
import { useToast } from './Toast';
import { formatStock, formatDate } from '../utils/format';
import { Pagination } from './common/Pagination';
import { 
  History, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  User
} from 'lucide-react';

export const StockMovementsView: React.FC = () => {
  const { showToast } = useToast();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [totalMovements, setTotalMovements] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const data = await api.getStockMovements({
        type: selectedType,
        search: search.trim() || undefined,
        limit: pageSize,
        offset,
      });
      setMovements(data.items || []);
      setTotalMovements(data.total || 0);
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Gagal memuat riwayat mutasi stok', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [selectedType, currentPage, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchMovements();
  };

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
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-amber-500" />
            <span>Audit Jejak & Log Mutasi Stok</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Setiap perubahan kuantitas dicatat secara permanen dengan UUIDv7, nilai sebelum/sesudah, dan alasan
          </p>
        </div>

        <button
          onClick={fetchMovements}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan nama barang, varian, no dokumen atau alasan..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
            >
              <option value="ALL">Semua Tipe Transaksi</option>
              <option value="STOCK_OPNAME">Opname Fisik</option>
              <option value="PURCHASE_RESTOCK">Barang Masuk / Restock</option>
              <option value="DAMAGED_EXPIRED">Barang Rusak / Pecah</option>
              <option value="SALE_DEDUCT">Penjualan Manual</option>
              <option value="INITIAL_STOCK">Stok Awal</option>
            </select>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Memuat riwayat transaksi...
          </div>
        ) : movements.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Belum ada log mutasi yang sesuai filter.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Barang & Varian</th>
                    <th className="py-3 px-4">Tipe Transaksi</th>
                    <th className="py-3 px-4 text-center">Stok Awal</th>
                    <th className="py-3 px-4 text-center">Perubahan</th>
                    <th className="py-3 px-4 text-center">Stok Akhir</th>
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
                            {m.id.slice(0, 13)}...
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {m.product_name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {m.variant_name} • <span className="font-mono text-[10px]">{m.variant_sku}</span>
                          </div>
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
                          <span
                            className="flex items-center gap-1 text-[11px]"
                            title={
                              m.created_by_username
                                ? `@${m.created_by_username}`
                                : undefined
                            }
                          >
                            <User className="w-3 h-3 text-slate-400" />
                            {m.created_by || 'Sistem'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination for Stock Movements */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalMovements}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 15, 25, 50]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
