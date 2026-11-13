import React, { useState, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import {
  StockReservation,
  ReservationAlertSummary,
  Product,
} from '../types';
import { api } from '../services/api';
import { formatStock, formatDate } from '../utils/format';
import { CreateReservationModal } from './CreateReservationModal';
import { PickupReservationModal } from './PickupReservationModal';
import {
  PackageCheck,
  Clock,
  AlertTriangle,
  AlertCircle,
  Search,
  Plus,
  RefreshCw,
  MessageCircle,
  Truck,
  CalendarPlus,
  Ban,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  Layers,
  FileText,
  User,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  ExternalLink,
  History,
  ShieldAlert,
} from 'lucide-react';

interface StockReservationViewProps {
  products?: Product[];
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshGlobal?: () => void;
}

type FilterOption = 'ALL' | 'ATTENTION' | 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

export const StockReservationView: React.FC<StockReservationViewProps> = ({
  products,
  showToast,
  onRefreshGlobal,
}) => {
  // Data states
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [alerts, setAlerts] = useState<ReservationAlertSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('ALL');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isPickupOpen, setIsPickupOpen] = useState<boolean>(false);
  const [selectedForPickup, setSelectedForPickup] = useState<StockReservation | null>(null);

  // Extend Deadline Dialog State
  const [isExtendOpen, setIsExtendOpen] = useState<boolean>(false);
  const [selectedForExtend, setSelectedForExtend] = useState<StockReservation | null>(null);
  const [extendPreset, setExtendPreset] = useState<'3' | '7' | '14' | 'custom'>('7');
  const [customExtendDate, setCustomExtendDate] = useState<string>('');
  const [extendNotes, setExtendNotes] = useState<string>('');
  const [savingExtend, setSavingExtend] = useState<boolean>(false);

  // Cancel Reservation Dialog State
  const [isCancelOpen, setIsCancelOpen] = useState<boolean>(false);
  const [selectedForCancel, setSelectedForCancel] = useState<StockReservation | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [savingCancel, setSavingCancel] = useState<boolean>(false);

  // Expanded items in row accordion
  const [expandedIds, setExpandedIds] = useState<{ [id: string]: boolean }>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Load reservations and alert metrics
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resList, resAlerts] = await Promise.all([
        api.getReservations({ limit: 100 }),
        api.getReservationAlerts().catch(() => null),
      ]);
      setReservations(resList.items || []);
      if (resAlerts) {
        setAlerts(resAlerts);
      }
    } catch (err: any) {
      console.error('Failed to load reservations:', err);
      showToast(err.message || 'Gagal memuat data reservasi stok.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle successful mutation
  const handleMutationSuccess = () => {
    loadData();
    if (onRefreshGlobal) {
      onRefreshGlobal();
    }
  };

  // Calculate local alert metrics if alerts API returns empty
  const computedMetrics = useMemo(() => {
    if (alerts) {
      return {
        totalActive: alerts.total_active,
        totalHeld: alerts.total_items_held,
        dueSoon: alerts.due_soon_count,
        overdue: alerts.overdue_count,
      };
    }

    const now = Date.now();
    let totalActive = 0;
    let totalHeld = 0;
    let dueSoon = 0;
    let overdue = 0;

    for (const r of reservations) {
      const isActive = r.status === 'PENDING' || r.status === 'PARTIAL';
      if (isActive) {
        totalActive += 1;
        const dTime = new Date(r.pickup_deadline).getTime();
        const diffHours = (dTime - now) / (1000 * 60 * 60);

        if (diffHours < 0) {
          overdue += 1;
        } else if (diffHours <= 48) {
          dueSoon += 1;
        }

        if (r.items) {
          for (const it of r.items) {
            const rem = Number(it.qty_remaining_base ?? (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0)));
            totalHeld += rem;
          }
        }
      }
    }

    return { totalActive, totalHeld, dueSoon, overdue };
  }, [alerts, reservations]);

  // Filter & Search
  const filteredReservations = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();

    return reservations.filter((r) => {
      // 1. Status Filter
      if (activeFilter === 'ATTENTION') {
        const isActive = r.status === 'PENDING' || r.status === 'PARTIAL';
        if (!isActive) return false;
        const isOverdue = r.is_overdue || new Date(r.pickup_deadline).getTime() < Date.now();
        const diffDays = Math.ceil((new Date(r.pickup_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const isDueSoon = r.is_due_soon || (diffDays >= 0 && diffDays <= 2);
        if (!isOverdue && !isDueSoon) return false;
      } else if (activeFilter !== 'ALL') {
        if (r.status !== activeFilter) return false;
      }

      // 2. Search Query (Code, Customer Name, Phone, Invoice, or Item Name)
      if (q) {
        const matchCode = r.reservation_code.toLowerCase().includes(q);
        const matchName = r.customer_name.toLowerCase().includes(q);
        const matchPhone = (r.customer_phone || '').toLowerCase().includes(q);
        const matchInvoice = (r.invoice_no || '').toLowerCase().includes(q);
        const matchItems = r.items?.some(
          (it) =>
            it.product_name.toLowerCase().includes(q) ||
            it.variant_name.toLowerCase().includes(q) ||
            it.sku.toLowerCase().includes(q)
        );

        if (!matchCode && !matchName && !matchPhone && !matchInvoice && !matchItems) {
          return false;
        }
      }

      return true;
    });
  }, [reservations, activeFilter, deferredSearch]);

  // Format WhatsApp reminder and open link
  const handleOpenWhatsApp = (r: StockReservation) => {
    if (!r.customer_phone || !r.customer_phone.trim()) {
      showToast('Nomor telepon pelanggan belum dicatat untuk pesanan ini.', 'error');
      return;
    }

    const clean = r.customer_phone.replace(/[^0-9+]/g, '');
    let waNumber = clean;
    if (waNumber.startsWith('+')) waNumber = waNumber.slice(1);
    if (waNumber.startsWith('0')) waNumber = '62' + waNumber.slice(1);

    const itemsSummary = r.items
      .map((it) => {
        const remaining = Number(it.qty_remaining_base ?? (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0)));
        return `• ${it.product_name} (${it.variant_name}): sisa ${formatStock(remaining)} ${it.base_unit_name || it.unit_name}`;
      })
      .join('\n');

    const msg =
      `Halo Bpk/Ibu *${r.customer_name}*,\n\n` +
      `Kami dari Toko Bangunan ingin menginformasikan barang pesanan Anda yang saat ini tersimpan aman di gudang kami:\n` +
      `📋 *Kode Titipan:* ${r.reservation_code}\n` +
      `${r.invoice_no ? `🧾 *No. Nota:* ${r.invoice_no}\n` : ''}` +
      `⏳ *Tenggat Pengambilan:* ${formatDate(r.pickup_deadline)}\n\n` +
      `*Daftar Barang Dititipkan:*\n${itemsSummary}\n\n` +
      `Mohon konfirmasi waktu kesiapan Anda untuk pengambilan barang. Terima kasih! 🙏`;

    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Open Extend Modal
  const handleOpenExtend = (r: StockReservation) => {
    setSelectedForExtend(r);
    setExtendPreset('7');
    const d = new Date(r.pickup_deadline);
    d.setDate(d.getDate() + 7);
    setCustomExtendDate(d.toISOString().slice(0, 16));
    setExtendNotes('');
    setIsExtendOpen(true);
  };

  // Submit Extend
  const handleSubmitExtend = async () => {
    if (!selectedForExtend) return;
    setSavingExtend(true);
    try {
      let newDateIso = '';
      if (extendPreset === 'custom') {
        newDateIso = new Date(customExtendDate).toISOString();
      } else {
        const days = parseInt(extendPreset, 10) || 7;
        const d = new Date(selectedForExtend.pickup_deadline);
        d.setDate(d.getDate() + days);
        newDateIso = d.toISOString();
      }

      await api.extendReservationDeadline(selectedForExtend.id, {
        new_deadline: newDateIso,
        notes: extendNotes.trim() || undefined,
      });

      showToast(`Batas waktu pengambilan ${selectedForExtend.reservation_code} berhasil diperpanjang!`, 'success');
      setIsExtendOpen(false);
      handleMutationSuccess();
    } catch (err: any) {
      console.error('Failed to extend deadline:', err);
      showToast(err.message || 'Gagal memperpanjang batas waktu.', 'error');
    } finally {
      setSavingExtend(false);
    }
  };

  // Open Cancel Modal
  const handleOpenCancel = (r: StockReservation) => {
    setSelectedForCancel(r);
    setCancelReason('');
    setIsCancelOpen(true);
  };

  // Submit Cancel
  const handleSubmitCancel = async () => {
    if (!selectedForCancel) return;
    if (!cancelReason.trim()) {
      showToast('Alasan pembatalan titipan wajib diisi.', 'error');
      return;
    }

    setSavingCancel(true);
    try {
      await api.cancelReservation(selectedForCancel.id, {
        reason: cancelReason.trim(),
      });

      showToast(`Titip simpan ${selectedForCancel.reservation_code} dibatalkan dan stok dikembalikan!`, 'success');
      setIsCancelOpen(false);
      handleMutationSuccess();
    } catch (err: any) {
      console.error('Failed to cancel reservation:', err);
      showToast(err.message || 'Gagal membatalkan reservasi.', 'error');
    } finally {
      setSavingCancel(false);
    }
  };

  // Deadline calculation helpers
  const getDeadlineBadge = (r: StockReservation) => {
    if (r.status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Selesai Diambil
        </span>
      );
    }

    if (r.status === 'CANCELLED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">
          <Ban className="w-3.5 h-3.5" />
          Dibatalkan
        </span>
      );
    }

    const dTime = new Date(r.pickup_deadline).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((dTime - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800 animate-pulse">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          Lewat {overdueDays} hari!
        </span>
      );
    }

    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800">
          <Clock className="w-3.5 h-3.5" />
          Jatuh Tempo Hari Ini!
        </span>
      );
    }

    if (diffDays === 1) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Jatuh Tempo Besok
        </span>
      );
    }

    if (diffDays <= 2) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Sisa {diffDays} hari (H-2)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
        <Calendar className="w-3.5 h-3.5" />
        Sisa {diffDays} hari
      </span>
    );
  };

  const getStatusBadge = (status: StockReservation['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Belum Diambil
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            Diambil Sebagian
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            Selesai
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            Dibatalkan
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <PackageCheck className="w-7 h-7 text-amber-500" />
            Titip Simpan Stok & Penyerahan Barang
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola barang pelanggan yang dibeli lunas namun disimpan sementara di gudang toko
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all shadow-2xs"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Titip Ambil Baru</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Titipan Aktif */}
        <div
          onClick={() => setActiveFilter('ALL')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'ALL'
              ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 ring-2 ring-blue-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total Titipan Aktif
            </span>
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {computedMetrics.totalActive}
            </span>
            <span className="text-xs text-slate-400">Pesanan</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Pending & diambil sebagian</p>
        </div>

        {/* Card 2: Total Barang Diamankan */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Barang Diamankan
            </span>
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {formatStock(computedMetrics.totalHeld)}
            </span>
            <span className="text-xs text-slate-400">Satuan dasar</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Terlindungi dari penjualan lain</p>
        </div>

        {/* Card 3: Segera Jatuh Tempo (H-2) */}
        <div
          onClick={() => setActiveFilter('ATTENTION')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'ATTENTION'
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Segera Jatuh Tempo (H-2)
            </span>
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {computedMetrics.dueSoon}
            </span>
            <span className="text-xs text-slate-400">Pesanan</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Perlu konfirmasi ke pelanggan</p>
        </div>

        {/* Card 4: Overdue (Lewat Batas) */}
        <div
          onClick={() => setActiveFilter('ATTENTION')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            computedMetrics.overdue > 0
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Lewat Batas Waktu
            </span>
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {computedMetrics.overdue}
            </span>
            <span className="text-xs text-slate-400">Overdue</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Harus segera ditindaklanjuti</p>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar with useDeferredValue */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pelanggan, no telepon, no nota, atau kode..."
              className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Semua ({reservations.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('ATTENTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                activeFilter === 'ATTENTION'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Perlu Tindak Lanjut ({computedMetrics.dueSoon + computedMetrics.overdue})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Belum Diambil (PENDING)
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('PARTIAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'PARTIAL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Diambil Sebagian (PARTIAL)
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Selesai
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('CANCELLED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'CANCELLED'
                  ? 'bg-slate-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Dibatalkan
            </button>
          </div>
        </div>
      </div>

      {/* Main Table / List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        {loading && reservations.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <span>Memuat data titip simpan barang...</span>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="p-12 text-center">
            <PackageCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Tidak Ada Titip Simpan Ditemukan
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {deferredSearch
                ? `Tidak ada titipan yang cocok dengan pencarian "${deferredSearch}".`
                : 'Belum ada data titip simpan dengan filter yang dipilih saat ini.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredReservations.map((r) => {
              const isExpanded = !!expandedIds[r.id];
              const totalItems = r.items?.length || 0;
              const isActive = r.status === 'PENDING' || r.status === 'PARTIAL';

              return (
                <div
                  key={r.id}
                  className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-3"
                >
                  {/* Row Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        {r.reservation_code}
                      </span>
                      {getStatusBadge(r.status)}
                      {getDeadlineBadge(r)}
                      {r.invoice_no && (
                        <span className="text-xs text-slate-500 font-mono">
                          Nota: <strong>{r.invoice_no}</strong>
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Dibuat: {formatDate(r.created_at)}</span>
                      <span>•</span>
                      <span>Oleh: {r.created_by || 'Admin'}</span>
                    </div>
                  </div>

                  {/* Customer Info & Deadline Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    {/* Customer */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Pelanggan
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {r.customer_name}
                      </p>
                      {r.customer_phone ? (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {r.customer_phone}
                        </p>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No. HP tidak dicatat</span>
                      )}
                    </div>

                    {/* Deadline */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Batas Pengambilan
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(r.pickup_deadline)}
                      </p>
                      {r.customer_address && (
                        <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5" title={r.customer_address}>
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {r.customer_address}
                        </p>
                      )}
                    </div>

                    {/* Items Summary & Toggle Accordion */}
                    <div className="flex sm:flex-col justify-between sm:justify-center items-start sm:items-end">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Kuantitas Barang
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{totalItems} Macam Barang</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Notes / Reason if present */}
                  {r.notes && (
                    <p className="text-xs text-slate-500 italic bg-amber-50/40 dark:bg-amber-950/20 px-3 py-1.5 rounded-lg border border-amber-200/50 dark:border-amber-900/30">
                      💬 Catatan: {r.notes}
                    </p>
                  )}

                  {r.status === 'CANCELLED' && r.cancel_reason && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/40 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      Alasan Pembatalan: {r.cancel_reason} (Dibatalkan pada {formatDate(r.cancelled_at)})
                    </p>
                  )}

                  {/* Expanded Items Table */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-100/70 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3 animate-in fade-in duration-150">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-500" />
                        Rincian Barang Dititipkan
                      </h4>

                      <table className="w-full text-left text-xs bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2 px-3">Nama Produk & Varian</th>
                            <th className="py-2 px-3">Satuan Transaksi</th>
                            <th className="py-2 px-3 text-right">Qty Dititip</th>
                            <th className="py-2 px-3 text-right">Sudah Diambil</th>
                            <th className="py-2 px-3 text-right">Sisa di Toko</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {r.items?.map((item) => {
                            const remaining = Number(
                              item.qty_remaining_base ?? (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0))
                            );

                            return (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {item.product_name}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block">
                                    {item.variant_name} • SKU: {item.sku}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                                  {item.unit_name}
                                  {item.conversion_factor !== 1 && (
                                    <span className="text-[10px] text-slate-400 block">
                                      x{item.conversion_factor} {item.base_unit_name}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                                  {formatStock(item.qty_ordered_unit)} {item.unit_name}
                                  <span className="text-[10px] text-slate-400 block">
                                    ({formatStock(item.qty_reserved_base)} {item.base_unit_name || item.unit_name})
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500">
                                  {formatStock(item.qty_picked_up_base)} {item.base_unit_name || item.unit_name}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                                  {remaining <= 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                      ✓ Lunas
                                    </span>
                                  ) : (
                                    `${formatStock(remaining)} ${item.base_unit_name || item.unit_name}`
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pickup Logs if available */}
                      {r.pickups && r.pickups.length > 0 && (
                        <div className="pt-2">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                            <History className="w-3.5 h-3.5" />
                            Riwayat Penyerahan ({r.pickups.length} Kali)
                          </span>
                          <div className="space-y-1.5">
                            {r.pickups.map((p, idx) => (
                              <div
                                key={p.id || idx}
                                className="p-2 text-xs bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                              >
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-white">
                                    Penerima: {p.receiver_name} {p.vehicle_plate ? `(${p.vehicle_plate})` : ''}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block">
                                    Petugas: {p.handed_by} {p.notes ? `• ${p.notes}` : ''}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400">{formatDate(p.picked_up_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                    {/* WhatsApp Action */}
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(r)}
                      disabled={!r.customer_phone}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800/70 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={r.customer_phone ? 'Kirim pesan pengingat WA' : 'No telepon belum dicatat'}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Hubungi via WhatsApp</span>
                    </button>

                    {/* Status Dependent Actions */}
                    {isActive && (
                      <div className="flex items-center gap-2">
                        {/* Extend Deadline */}
                        <button
                          type="button"
                          onClick={() => handleOpenExtend(r)}
                          className="px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-300 dark:border-amber-800/70 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <CalendarPlus className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Perpanjang Batas Waktu</span>
                        </button>

                        {/* Cancel Reservation */}
                        <button
                          type="button"
                          onClick={() => handleOpenCancel(r)}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-300 dark:border-rose-800/70 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Batalkan & Kembalikan Stok</span>
                        </button>

                        {/* Pickup Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedForPickup(r);
                            setIsPickupOpen(true);
                          }}
                          className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Serahkan Barang</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Buat Titip Ambil Baru */}
      <CreateReservationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={handleMutationSuccess}
        showToast={showToast}
        products={products}
      />

      {/* Modal: Serahkan Barang (Pickup) */}
      <PickupReservationModal
        isOpen={isPickupOpen}
        onClose={() => {
          setIsPickupOpen(false);
          setSelectedForPickup(null);
        }}
        reservation={selectedForPickup}
        onSuccess={handleMutationSuccess}
        showToast={showToast}
      />

      {/* Dialog: Perpanjang Batas Waktu (Extend Deadline) */}
      {isExtendOpen && selectedForExtend && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingExtend) {
              setIsExtendOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-amber-500" />
                Perpanjang Batas Waktu
              </h3>
              <button
                type="button"
                onClick={() => setIsExtendOpen(false)}
                disabled={savingExtend}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <p>
                Kode: <strong>{selectedForExtend.reservation_code}</strong> ({selectedForExtend.customer_name})
              </p>
              <p>
                Batas Waktu Saat Ini:{' '}
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatDate(selectedForExtend.pickup_deadline)}
                </strong>
              </p>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Durasi Tambahan
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setExtendPreset('3')}
                  className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                    extendPreset === '3'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  +3 Hari
                </button>
                <button
                  type="button"
                  onClick={() => setExtendPreset('7')}
                  className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                    extendPreset === '7'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  +7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => setExtendPreset('14')}
                  className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                    extendPreset === '14'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  +14 Hari
                </button>
              </div>

              {extendPreset === 'custom' && (
                <div className="pt-2">
                  <input
                    type="datetime-local"
                    value={customExtendDate}
                    onChange={(e) => setCustomExtendDate(e.target.value)}
                    className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                  />
                </div>
              )}
            </div>

            {/* Reason / Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Catatan Alasan Perpanjangan
              </label>
              <input
                type="text"
                value={extendNotes}
                onChange={(e) => setExtendNotes(e.target.value)}
                placeholder="Misal: Pelanggan konfirmasi tukang baru masuk Senin depan"
                className="w-full text-xs py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsExtendOpen(false)}
                disabled={savingExtend}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitExtend}
                disabled={savingExtend}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs disabled:opacity-50"
              >
                {savingExtend ? 'Menyimpan...' : 'Perpanjang Batas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Batalkan & Kembalikan Stok */}
      {isCancelOpen && selectedForCancel && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingCancel) {
              setIsCancelOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Batalkan Titip Simpan Stok?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedForCancel.reservation_code}
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                Perhatian: Stok akan dikembalikan!
              </p>
              <p>
                Semua sisa barang yang sedang diamankan untuk pelanggan ini ({selectedForCancel.items?.length || 0} macam barang) akan otomatis dikembalikan ke stok siap jual toko.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Alasan Pembatalan <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Contoh: Proyek pelanggan dibatalkan, sudah dilakukan retur/refund kasir..."
                rows={3}
                className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 dark:text-white"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCancelOpen(false)}
                disabled={savingCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleSubmitCancel}
                disabled={savingCancel || !cancelReason.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {savingCancel ? 'Membatalkan...' : 'Konfirmasi Batalkan & Lepas Stok'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
