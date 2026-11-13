import React, { useState, useEffect, useMemo } from 'react';
import { StockReservation, ReservationItem } from '../types';
import { api } from '../services/api';
import { formatStock, formatDate } from '../utils/format';
import {
  X,
  Truck,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  History,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PickupReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: StockReservation | null;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const PickupReservationModal: React.FC<PickupReservationModalProps> = ({
  isOpen,
  onClose,
  reservation,
  onSuccess,
  showToast,
}) => {
  const [mode, setMode] = useState<'all' | 'partial'>('all');
  const [receiverName, setReceiverName] = useState<string>('');
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [handedBy, setHandedBy] = useState<string>('Kasir / Gudang');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Map of item_id -> quantity to pickup (in base units)
  const [pickupQuantities, setPickupQuantities] = useState<{ [itemId: string]: number }>({});

  // Reset or initialize state when reservation opens
  useEffect(() => {
    if (reservation && isOpen) {
      setMode('all');
      setReceiverName(reservation.customer_name || '');
      setVehiclePlate('');
      setNotes('');
      setHandedBy('Petugas Gudang');
      setShowHistory(false);
      setSubmitting(false);

      // Pre-fill full remaining quantities
      const initialQtys: { [itemId: string]: number } = {};
      for (const item of reservation.items) {
        const remaining = Number(item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0)));
        initialQtys[item.id] = Math.max(0, remaining);
      }
      setPickupQuantities(initialQtys);
    }
  }, [reservation, isOpen]);

  // When switching to 'all', reset all quantities to full remaining
  const handleModeChange = (newMode: 'all' | 'partial') => {
    setMode(newMode);
    if (!reservation) return;

    if (newMode === 'all') {
      const allQtys: { [itemId: string]: number } = {};
      for (const item of reservation.items) {
        const remaining = Number(item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0)));
        allQtys[item.id] = Math.max(0, remaining);
      }
      setPickupQuantities(allQtys);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle single item qty change in partial mode
  const handleItemQtyChange = (item: ReservationItem, val: string) => {
    const num = parseFloat(val);
    const maxRemaining = Number(item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0)));

    if (isNaN(num) || num < 0) {
      setPickupQuantities((prev) => ({ ...prev, [item.id]: 0 }));
    } else if (num > maxRemaining) {
      setPickupQuantities((prev) => ({ ...prev, [item.id]: maxRemaining }));
    } else {
      setPickupQuantities((prev) => ({ ...prev, [item.id]: num }));
    }
  };

  // Calculate totals
  const { totalItemsToPickup, willCompleteOrder, hasValidPickup } = useMemo(() => {
    if (!reservation) {
      return { totalItemsToPickup: 0, willCompleteOrder: false, hasValidPickup: false };
    }

    let totalToPickup = 0;
    let allCompleted = true;

    for (const item of reservation.items) {
      const remaining = Number(item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0)));
      const taking = pickupQuantities[item.id] || 0;
      totalToPickup += taking;

      if (taking < remaining) {
        allCompleted = false;
      }
    }

    return {
      totalItemsToPickup: totalToPickup,
      willCompleteOrder: allCompleted && totalToPickup > 0,
      hasValidPickup: totalToPickup > 0,
    };
  }, [reservation, pickupQuantities]);

  const handleSubmit = async () => {
    if (!reservation) return;

    if (!receiverName.trim()) {
      showToast('Nama penerima / sopir wajib diisi!', 'error');
      return;
    }

    if (!hasValidPickup) {
      showToast('Tentukan kuantitas barang yang diambil minimal 1 item!', 'error');
      return;
    }

    const itemsPayload = Object.entries(pickupQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => ({
        item_id: itemId,
        qty_picked_up: Number(qty),
      }));

    setSubmitting(true);
    try {
      await api.pickupReservation(reservation.id, {
        receiver_name: receiverName.trim(),
        vehicle_plate: vehiclePlate.trim() || undefined,
        notes: notes.trim() || undefined,
        handed_by: handedBy.trim() || 'Admin',
        items: itemsPayload,
      });

      showToast(
        willCompleteOrder
          ? 'Seluruh barang titipan telah diserahkan! Status reservasi: Selesai.'
          : 'Penyerahan sebagian barang titipan berhasil dicatat!',
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to submit pickup:', err);
      showToast(err.message || 'Gagal memproses penyerahan barang.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !reservation) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Serahkan Barang Titipan (Pengambilan)
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300">
                  {reservation.reservation_code}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pelanggan: <strong className="text-slate-700 dark:text-slate-300">{reservation.customer_name}</strong>
                {reservation.invoice_no && ` • No. Nota: ${reservation.invoice_no}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-6">
          {/* Mode Switcher */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('all')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === 'all'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Ambil Semua Sisa Sekaligus
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('partial')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === 'partial'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              Ambil Parsial / Bertahap
            </button>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Daftar Barang & Kuantitas Diambil
              </span>
              <span className="text-[11px] text-slate-500">
                Mode: {mode === 'all' ? 'Ambil Penuh (100% Sisa)' : 'Atur per Barang'}
              </span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 dark:bg-slate-800/40 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3 text-right">Total Titip</th>
                  <th className="py-2.5 px-3 text-right">Sudah Diambil</th>
                  <th className="py-2.5 px-3 text-right">Sisa di Gudang</th>
                  <th className="py-2.5 px-3 text-right w-36">Diambil Saat Ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {reservation.items.map((item) => {
                  const remaining = Number(
                    item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0))
                  );
                  const isDone = remaining <= 0;
                  const taking = pickupQuantities[item.id] ?? 0;

                  return (
                    <tr
                      key={item.id}
                      className={isDone ? 'opacity-40 bg-slate-50 dark:bg-slate-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {item.product_name}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {item.variant_name} • SKU: {item.sku}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                        {formatStock(item.qty_reserved_base)} {item.base_unit_name || item.unit_name}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {formatStock(item.qty_picked_up_base)} {item.base_unit_name || item.unit_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        {formatStock(remaining)} {item.base_unit_name || item.unit_name}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isDone ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            ✓ Lunas
                          </span>
                        ) : mode === 'all' ? (
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {formatStock(taking)} {item.base_unit_name || item.unit_name}
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              step="any"
                              value={taking}
                              onChange={(e) => handleItemQtyChange(item, e.target.value)}
                              className="w-20 py-1 px-2 text-right text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-bold"
                            />
                            <span className="text-[10px] text-slate-400">{item.base_unit_name || item.unit_name}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
              willCompleteOrder
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {willCompleteOrder
                  ? 'Status reservasi akan otomatis ditandai SELESAI (COMPLETED) setelah penyerahan ini.'
                  : 'Sebagian barang masih tersimpan di gudang (Status tetap PARTIAL).'}
              </span>
            </div>
            <span className="font-bold shrink-0">
              Total Diambil: {formatStock(totalItemsToPickup)} Satuan Dasar
            </span>
          </div>

          {/* Receiver & Vehicle Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nama Penerima / Sopir / Mandor <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder="Nama orang yang mengambil barang"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                No. Plat Kendaraan / Truk / Pikap
              </label>
              <div className="relative">
                <Truck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="Contoh: B 9123 XYZ"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Diserahkan Oleh (Petugas Toko)
              </label>
              <input
                type="text"
                value={handedBy}
                onChange={(e) => setHandedBy(e.target.value)}
                placeholder="Nama kasir atau staf gudang"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                No. Surat Jalan / Catatan Penyerahan
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Surat Jalan SJ-0881, diambil pakai carry"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              />
            </div>
          </div>

          {/* Historical Pickups Log Accordion */}
          {reservation.pickups && reservation.pickups.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <History className="w-4 h-4 text-slate-500" />
                  Riwayat Pengambilan Sebelumnya ({reservation.pickups.length} kali penyerahan)
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showHistory && (
                <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 max-h-48 overflow-y-auto">
                  {reservation.pickups.map((p, idx) => (
                    <div key={p.id || idx} className="py-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Penerima: {p.receiver_name} {p.vehicle_plate ? `(${p.vehicle_plate})` : ''}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDate(p.picked_up_at)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Diserahkan oleh: {p.handed_by} {p.notes ? `• Catatan: ${p.notes}` : ''}
                      </div>
                      {p.items && Array.isArray(p.items) && p.items.length > 0 && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-md mt-1">
                          Barang diserahkan:{' '}
                          {p.items
                            .map((it: any) => `${it.product_name || it.item_id}: ${it.qty_picked_up}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasValidPickup || !receiverName.trim()}
            className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md flex items-center gap-2 transition-all"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Menyimpan Penyerahan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Konfirmasi Serahkan Barang</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
