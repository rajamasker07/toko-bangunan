import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
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
  ChevronRight,
  ArrowLeft,
  X,
  Package,
  Layers,
  FileText,
  User,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  CheckCheck,
  ExternalLink,
  History,
  ShieldAlert,
  Users,
  ChevronDown,
} from 'lucide-react';

interface StockReservationViewProps {
  products?: Product[];
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshGlobal?: () => void;
}

type CustomerFilterTab = 'ALL' | 'ATTENTION' | 'PENDING' | 'PARTIAL' | 'COMPLETED';
type CustomerOrderFilterTab = 'ALL' | 'ACTIVE' | 'CLOSED';

export interface CustomerGroup {
  id: string; // key: trimmed and lowercased customer name
  name: string; // display name
  phone: string | null;
  address: string | null;
  reservations: StockReservation[];
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  totalOrders: number;
  totalItemsHeld: number;
  isOverdue: boolean;
  maxOverdueDays: number;
  isDueSoon: boolean;
  minDueSoonDays: number;
  minDaysRemaining: number | null;
  earliestDeadline: string | null;
  urgencyStatus: 'OVERDUE' | 'DUE_SOON' | 'SAFE' | 'COMPLETED' | 'CANCELLED';
  urgencyLabel: string;
}

const PAGE_SIZE = 100;
const CHUNK_SIZE = 12;

export const StockReservationView: React.FC<StockReservationViewProps> = ({
  products,
  showToast,
  onRefreshGlobal,
}) => {
  // Master data states
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [alerts, setAlerts] = useState<ReservationAlertSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [totalServerCount, setTotalServerCount] = useState<number>(0);

  // Progressive DOM rendering chunk limit (Lazy load windowing)
  const [displayLimit, setDisplayLimit] = useState<number>(CHUNK_SIZE);

  // Level 1 states (Pilih Pelanggan)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);
  // Default filter: Belum diambil (PENDING)
  const [customerFilter, setCustomerFilter] = useState<CustomerFilterTab>('PENDING');

  // Level 2 states (Detail Reservasi Pelanggan)
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [customerOrderFilter, setCustomerOrderFilter] = useState<CustomerOrderFilterTab>('ACTIVE');

  // Lifecycle & Cancellation refs (Anti-memory-leak)
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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

  // Selesaikan Sebagian (Close Partial) Dialog State
  const [isClosePartialOpen, setIsClosePartialOpen] = useState<boolean>(false);
  const [selectedForClosePartial, setSelectedForClosePartial] = useState<StockReservation | null>(null);
  const [settlementType, setSettlementType] = useState<'REFUND' | 'EXCHANGE' | 'DEPOSIT' | 'OTHER'>('REFUND');
  const [settlementReason, setSettlementReason] = useState<string>('');
  const [savingClosePartial, setSavingClosePartial] = useState<boolean>(false);

  // Load reservations and alert metrics with AbortController to prevent memory leaks
  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const [resList, resAlerts] = await Promise.all([
        api.getReservations({ limit: PAGE_SIZE, offset: 0 }, { signal: controller.signal }),
        api.getReservationAlerts({ signal: controller.signal }).catch(() => null),
      ]);

      if (!isMountedRef.current || controller.signal.aborted) return;

      setReservations(resList.items || []);
      setTotalServerCount(resList.total || (resList.items?.length || 0));
      if (resAlerts) {
        setAlerts(resAlerts);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return; // aborted intentionally, prevent memory leak and toast spam
      }
      console.error('Failed to load reservations:', err);
      if (isMountedRef.current) {
        showToast(err.message || 'Gagal memuat data reservasi stok.', 'error');
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [showToast]);

  // Lazy load next page from server if database has more records
  const loadMoreServer = useCallback(async () => {
    if (loadingMore || loading || reservations.length >= totalServerCount) return;

    setLoadingMore(true);
    try {
      const resList = await api.getReservations({
        limit: PAGE_SIZE,
        offset: reservations.length,
      });

      if (!isMountedRef.current) return;

      if (resList.items && resList.items.length > 0) {
        setReservations((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newItems = resList.items.filter((r) => !existingIds.has(r.id));
          return [...prev, ...newItems];
        });
        setTotalServerCount(resList.total);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && isMountedRef.current) {
        console.error('Failed to load more reservations:', err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [loadingMore, loading, reservations.length, totalServerCount]);

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
            const rem = Number(
              it.qty_remaining_base ??
                (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
            );
            totalHeld += Math.max(0, rem);
          }
        }
      }
    }

    return { totalActive, totalHeld, dueSoon, overdue };
  }, [alerts, reservations]);

  // Group reservations by customer
  const customerGroups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string | null;
        address: string | null;
        reservations: StockReservation[];
      }
    >();

    for (const r of reservations) {
      const rawName = (r.customer_name || 'Pelanggan Umum').trim();
      const key = rawName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: rawName,
          phone: r.customer_phone?.trim() || null,
          address: r.customer_address?.trim() || null,
          reservations: [],
        });
      }

      const group = map.get(key)!;
      // Enrich phone or address if previously missing
      if (!group.phone && r.customer_phone?.trim()) {
        group.phone = r.customer_phone.trim();
      }
      if (!group.address && r.customer_address?.trim()) {
        group.address = r.customer_address.trim();
      }
      group.reservations.push(r);
    }

    const now = Date.now();
    const groups: CustomerGroup[] = [];

    for (const item of map.values()) {
      // Sort reservations: active first, then earlier deadline, then created_at desc
      item.reservations.sort((a, b) => {
        const aActive = a.status === 'PENDING' || a.status === 'PARTIAL';
        const bActive = b.status === 'PENDING' || b.status === 'PARTIAL';
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return new Date(a.pickup_deadline).getTime() - new Date(b.pickup_deadline).getTime();
      });

      let activeCount = 0;
      let completedCount = 0;
      let cancelledCount = 0;
      let totalItemsHeld = 0;
      let isOverdue = false;
      let maxOverdueDays = 0;
      let isDueSoon = false;
      let minDueSoonDays = 999;
      let minDaysRemaining: number | null = null;
      let earliestDeadline: string | null = null;

      for (const r of item.reservations) {
        if (r.status === 'COMPLETED' || r.status === 'CLOSED_PARTIAL') completedCount++;
        else if (r.status === 'CANCELLED') cancelledCount++;
        else if (r.status === 'PENDING' || r.status === 'PARTIAL') {
          activeCount++;

          if (!earliestDeadline) {
            earliestDeadline = r.pickup_deadline;
          }

          if (r.items) {
            for (const it of r.items) {
              const rem = Number(
                it.qty_remaining_base ??
                  (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
              );
              totalItemsHeld += Math.max(0, rem);
            }
          }

          const dTime = new Date(r.pickup_deadline).getTime();
          const diffDays = Math.ceil((dTime - now) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            isOverdue = true;
            const od = Math.abs(diffDays);
            if (od > maxOverdueDays) maxOverdueDays = od;
          } else if (diffDays <= 2) {
            isDueSoon = true;
            if (diffDays < minDueSoonDays) minDueSoonDays = diffDays;
          } else {
            if (minDaysRemaining === null || diffDays < minDaysRemaining) {
              minDaysRemaining = diffDays;
            }
          }
        }
      }

      let urgencyStatus: CustomerGroup['urgencyStatus'] = 'SAFE';
      let urgencyLabel = 'Aman';

      if (isOverdue) {
        urgencyStatus = 'OVERDUE';
        urgencyLabel = `Terlambat ${maxOverdueDays} hari`;
      } else if (isDueSoon) {
        urgencyStatus = 'DUE_SOON';
        if (minDueSoonDays === 0) urgencyLabel = 'Jatuh tempo Hari Ini';
        else if (minDueSoonDays === 1) urgencyLabel = 'Jatuh tempo Besok';
        else urgencyLabel = `Jatuh tempo H-${minDueSoonDays}`;
      } else if (activeCount > 0) {
        urgencyStatus = 'SAFE';
        urgencyLabel = minDaysRemaining !== null ? `Aman (${minDaysRemaining} hari lagi)` : 'Aman';
      } else if (completedCount > 0) {
        urgencyStatus = 'COMPLETED';
        urgencyLabel = 'Selesai';
      } else {
        urgencyStatus = 'CANCELLED';
        urgencyLabel = 'Dibatalkan';
      }

      groups.push({
        ...item,
        activeCount,
        completedCount,
        cancelledCount,
        totalOrders: item.reservations.length,
        totalItemsHeld,
        isOverdue,
        maxOverdueDays,
        isDueSoon,
        minDueSoonDays,
        minDaysRemaining,
        earliestDeadline,
        urgencyStatus,
        urgencyLabel,
      });
    }

    // Sort priority: Overdue first -> Due soon -> Active -> Completed/Cancelled
    groups.sort((a, b) => {
      const getPriority = (c: CustomerGroup) => {
        if (c.urgencyStatus === 'OVERDUE') return 1;
        if (c.urgencyStatus === 'DUE_SOON') return 2;
        if (c.activeCount > 0) return 3;
        if (c.completedCount > 0) return 4;
        return 5;
      };

      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pA - pB;

      if (a.urgencyStatus === 'OVERDUE' && b.urgencyStatus === 'OVERDUE') {
        return b.maxOverdueDays - a.maxOverdueDays;
      }
      if (a.urgencyStatus === 'DUE_SOON' && b.urgencyStatus === 'DUE_SOON') {
        return a.minDueSoonDays - b.minDueSoonDays;
      }
      return a.name.localeCompare(b.name);
    });

    return groups;
  }, [reservations]);

  // Current selected customer object for LEVEL 2
  const currentCustomer = useMemo(() => {
    if (!selectedCustomer) return null;
    return customerGroups.find((c) => c.id === selectedCustomer) || null;
  }, [customerGroups, selectedCustomer]);

  // Filtered customer groups for LEVEL 1
  const filteredCustomerGroups = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();

    return customerGroups.filter((c) => {
      // 1. Tab Filter
      if (customerFilter === 'ATTENTION') {
        if (!c.isOverdue && !c.isDueSoon) return false;
      } else if (customerFilter === 'PENDING') {
        const hasPending = c.reservations.some((r) => r.status === 'PENDING');
        if (!hasPending) return false;
      } else if (customerFilter === 'PARTIAL') {
        const hasPartial = c.reservations.some((r) => r.status === 'PARTIAL');
        if (!hasPartial) return false;
      } else if (customerFilter === 'COMPLETED') {
        const hasCompleted = c.reservations.some(
          (r) => r.status === 'COMPLETED' || r.status === 'CLOSED_PARTIAL'
        );
        if (!hasCompleted) return false;
      }

      // 2. Search Query (Customer Name, Phone, Address, Invoice, or Reservation Code)
      if (q) {
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchAddress = (c.address || '').toLowerCase().includes(q);
        const matchInvoice = c.reservations.some((r) => (r.invoice_no || '').toLowerCase().includes(q));
        const matchCode = c.reservations.some((r) => r.reservation_code.toLowerCase().includes(q));
        const matchItems = c.reservations.some((r) =>
          r.items?.some(
            (it) =>
              it.product_name.toLowerCase().includes(q) ||
              it.variant_name.toLowerCase().includes(q) ||
              it.sku.toLowerCase().includes(q)
          )
        );

        if (!matchName && !matchPhone && !matchAddress && !matchInvoice && !matchCode && !matchItems) {
          return false;
        }
      }

      return true;
    });
  }, [customerGroups, customerFilter, deferredSearch]);

  // Reset lazy render slice when search or filter changes
  useEffect(() => {
    setDisplayLimit(CHUNK_SIZE);
  }, [deferredSearch, customerFilter]);

  // Visible sliced customer groups for progressive DOM rendering
  const visibleCustomerGroups = useMemo(() => {
    return filteredCustomerGroups.slice(0, displayLimit);
  }, [filteredCustomerGroups, displayLimit]);

  // Lazy-load chunk observer for DOM virtualization and infinite scrolling
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (displayLimit < filteredCustomerGroups.length) {
            setDisplayLimit((prev) => Math.min(prev + CHUNK_SIZE, filteredCustomerGroups.length));
          } else if (reservations.length < totalServerCount && !loadingMore && !loading) {
            loadMoreServer();
          }
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    displayLimit,
    filteredCustomerGroups.length,
    reservations.length,
    totalServerCount,
    loadingMore,
    loading,
    loadMoreServer,
  ]);

  // Filtered orders for LEVEL 2 (selected customer)
  const currentCustomerOrders = useMemo(() => {
    if (!currentCustomer) return [];

    return currentCustomer.reservations.filter((r) => {
      if (customerOrderFilter === 'ACTIVE') {
        return r.status === 'PENDING' || r.status === 'PARTIAL';
      }
      if (customerOrderFilter === 'CLOSED') {
        return r.status === 'COMPLETED' || r.status === 'CANCELLED' || r.status === 'CLOSED_PARTIAL';
      }
      return true;
    });
  }, [currentCustomer, customerOrderFilter]);

  // Progressive render limit for customer orders in LEVEL 2
  const [orderDisplayLimit, setOrderDisplayLimit] = useState<number>(10);
  useEffect(() => {
    setOrderDisplayLimit(10);
  }, [selectedCustomer, customerOrderFilter]);

  const visibleCustomerOrders = useMemo(() => {
    return currentCustomerOrders.slice(0, orderDisplayLimit);
  }, [currentCustomerOrders, orderDisplayLimit]);

  // If selected customer has reservations missing pickup history, fetch on-demand with abort cleanup
  useEffect(() => {
    if (!currentCustomer) return;

    const controller = new AbortController();
    let isCancelled = false;

    const needsDetailFetch = currentCustomer.reservations.filter(
      (r) =>
        (r.status === 'PARTIAL' || r.status === 'COMPLETED' || r.status === 'CLOSED_PARTIAL') &&
        r.pickups === undefined
    );

    if (needsDetailFetch.length > 0) {
      Promise.all(
        needsDetailFetch.map((r) =>
          api.getReservationById(r.id, { signal: controller.signal }).catch(() => null)
        )
      ).then((results) => {
        if (isCancelled || !isMountedRef.current) return;
        setReservations((prev) =>
          prev.map((res) => {
            const fresh = results.find((d) => d && d.id === res.id);
            return fresh ? fresh : res;
          })
        );
      });
    }

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [currentCustomer]);

  // Helpers for Avatar
  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'PL';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarGradient = (name: string): string => {
    const gradients = [
      'from-amber-500 to-amber-700 text-white',
      'from-blue-600 to-indigo-700 text-white',
      'from-emerald-500 to-teal-700 text-white',
      'from-purple-500 to-indigo-700 text-white',
      'from-rose-500 to-red-700 text-white',
      'from-cyan-600 to-blue-700 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % gradients.length;
    return gradients[idx];
  };

  // WhatsApp Helpers
  const handleCustomerWhatsAppAll = (c: CustomerGroup) => {
    if (!c.phone || !c.phone.trim()) {
      showToast('Nomor WhatsApp pelanggan belum dicatat.', 'error');
      return;
    }

    const clean = c.phone.replace(/[^0-9+]/g, '');
    let waNumber = clean;
    if (waNumber.startsWith('+')) waNumber = waNumber.slice(1);
    if (waNumber.startsWith('0')) waNumber = '62' + waNumber.slice(1);

    const activeOrders = c.reservations.filter(
      (r) => r.status === 'PENDING' || r.status === 'PARTIAL'
    );

    let msg = `Halo Bpk/Ibu *${c.name}*,\n\nKami dari Toko Bangunan ingin menginformasikan rincian barang titip simpan Anda di gudang kami:\n\n`;

    if (activeOrders.length > 0) {
      msg += `📦 *Total Barang Diamankan:* ${formatStock(c.totalItemsHeld)} unit dasar (${activeOrders.length} nota aktif)\n\n`;
      activeOrders.forEach((r, idx) => {
        msg += `*${idx + 1}. Kode:* ${r.reservation_code} ${r.invoice_no ? `(Nota: ${r.invoice_no})` : ''}\n`;
        msg += `   • Status: ${r.status === 'PARTIAL' ? 'Diambil Sebagian' : 'Belum Diambil'}\n`;
        msg += `   • Batas Pengambilan: ${formatDate(r.pickup_deadline)}\n`;
        r.items?.forEach((it) => {
          const remaining = Number(
            it.qty_remaining_base ??
              (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
          );
          msg += `   • ${it.product_name} (${it.variant_name}): Sisa ${formatStock(remaining)} ${
            it.base_unit_name || it.unit_name
          }\n`;
        });
        msg += '\n';
      });
      msg += `Mohon konfirmasi rencana jadwal pengambilan barang agar dapat kami persiapkan sebelumnya. Terima kasih! 🙏`;
    } else {
      msg += `Seluruh barang titipan Anda telah selesai diambil. Terima kasih banyak atas kepercayaan Anda berbelanja di toko kami! 🙏`;
    }

    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleReservationWhatsApp = (r: StockReservation) => {
    if (!r.customer_phone || !r.customer_phone.trim()) {
      showToast('Nomor WhatsApp pelanggan belum dicatat untuk pesanan ini.', 'error');
      return;
    }

    const clean = r.customer_phone.replace(/[^0-9+]/g, '');
    let waNumber = clean;
    if (waNumber.startsWith('+')) waNumber = waNumber.slice(1);
    if (waNumber.startsWith('0')) waNumber = '62' + waNumber.slice(1);

    const itemsSummary =
      r.items
        ?.map((it) => {
          const remaining = Number(
            it.qty_remaining_base ??
              (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
          );
          return `• ${it.product_name} (${it.variant_name}): sisa ${formatStock(remaining)} ${
            it.base_unit_name || it.unit_name
          }`;
        })
        .join('\n') || '-';

    const msg =
      `Halo Bpk/Ibu *${r.customer_name}*,\n\n` +
      `Kami dari Toko Bangunan ingin menginformasikan barang pesanan Anda yang tersimpan aman di gudang kami:\n\n` +
      `📋 *Kode Titipan:* ${r.reservation_code}\n` +
      `${r.invoice_no ? `🧾 *No. Nota:* ${r.invoice_no}\n` : ''}` +
      `⏳ *Tenggat Pengambilan:* ${formatDate(r.pickup_deadline)}\n\n` +
      `*Daftar Barang Dititipkan:*\n${itemsSummary}\n\n` +
      `Mohon konfirmasi rencana jadwal penjemputan barang Bapak/Ibu. Terima kasih! 🙏`;

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

      showToast(
        `Batas waktu pengambilan ${selectedForExtend.reservation_code} berhasil diperpanjang!`,
        'success'
      );
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

      showToast(
        `Titip simpan ${selectedForCancel.reservation_code} dibatalkan dan stok dikembalikan!`,
        'success'
      );
      setIsCancelOpen(false);
      handleMutationSuccess();
    } catch (err: any) {
      console.error('Failed to cancel reservation:', err);
      showToast(err.message || 'Gagal membatalkan reservasi.', 'error');
    } finally {
      setSavingCancel(false);
    }
  };

  // Selesaikan Sebagian (Close Partial) Handler
  const handleOpenClosePartial = (r: StockReservation) => {
    setSelectedForClosePartial(r);
    setSettlementType('REFUND');
    setSettlementReason('');
    setIsClosePartialOpen(true);
  };

  const handleSubmitClosePartial = async () => {
    if (!selectedForClosePartial) return;
    if (!settlementReason.trim()) {
      showToast('Alasan / rincian penyelesaian sisa stok wajib diisi.', 'error');
      return;
    }

    setSavingClosePartial(true);
    try {
      await api.closePartialReservation(selectedForClosePartial.id, {
        settlement_type: settlementType,
        reason: settlementReason.trim(),
      });

      showToast(
        `Nota ${selectedForClosePartial.reservation_code} berhasil diselesaikan sebagian dan sisa stok telah dilepaskan!`,
        'success'
      );
      setIsClosePartialOpen(false);
      setSelectedForClosePartial(null);
      handleMutationSuccess();
    } catch (err: any) {
      console.error('Failed to close partial reservation:', err);
      showToast(err.message || 'Gagal menyelesaikan sebagian reservasi.', 'error');
    } finally {
      setSavingClosePartial(false);
    }
  };

  const formatSettlementLabel = (type?: string | null) => {
    switch (type) {
      case 'REFUND':
        return 'Refund Uang';
      case 'EXCHANGE':
        return 'Tukar Barang';
      case 'DEPOSIT':
        return 'Deposit Saldo';
      case 'OTHER':
        return 'Lainnya / Kesepakatan';
      default:
        return type || '-';
    }
  };

  // Badges calculation
  const getDeadlineBadge = (r: StockReservation) => {
    if (r.status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Selesai Diambil
        </span>
      );
    }

    if (r.status === 'CLOSED_PARTIAL') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-300 dark:border-indigo-800">
          <CheckCheck className="w-3.5 h-3.5" />
          Selesai Sebagian (Sisa Dilepas)
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

  const getStatusBadge = (status: StockReservation['status'], reservation?: StockReservation) => {
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
      case 'CLOSED_PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
            <CheckCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Selesai Sebagian</span>
            {reservation?.settlement_type && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded bg-indigo-200/80 dark:bg-indigo-900/80 text-indigo-900 dark:text-indigo-200 text-[9px] font-bold normal-case">
                {reservation.settlement_type === 'REFUND'
                  ? 'Refund'
                  : reservation.settlement_type === 'EXCHANGE'
                  ? 'Tukar Barang'
                  : reservation.settlement_type === 'DEPOSIT'
                  ? 'Deposit'
                  : 'Lainnya'}
              </span>
            )}
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

  const renderCustomerUrgencyBadge = (c: CustomerGroup) => {
    if (c.urgencyStatus === 'OVERDUE') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80 px-2.5 py-1 rounded-full border border-rose-300 dark:border-rose-800 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          Terlambat {c.maxOverdueDays} hari
        </span>
      );
    }
    if (c.urgencyStatus === 'DUE_SOON') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" />
          {c.urgencyLabel}
        </span>
      );
    }
    if (c.urgencyStatus === 'SAFE') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Aman
        </span>
      );
    }
    if (c.urgencyStatus === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Selesai
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700">
        <Ban className="w-3.5 h-3.5" />
        Dibatalkan
      </span>
    );
  };

  // =========================================================================
  // LEVEL 2: DETAIL RESERVASI PELANGGAN VIEW
  // =========================================================================
  if (selectedCustomer && currentCustomer) {
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* Top Back Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 shadow-2xs transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-amber-600" />
              <span>Kembali ke Pilih Pelanggan</span>
            </button>

            <span className="text-xs text-slate-400 font-medium hidden md:inline">
              / Detail Reservasi & Riwayat Pengambilan
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-2xs"
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
              <span>Buat Reservasi</span>
            </button>
          </div>
        </div>

        {/* Customer Profile Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-amber-500/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: Avatar & Identity */}
            <div className="flex items-start sm:items-center gap-4">
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${getAvatarGradient(
                  currentCustomer.name
                )} flex items-center justify-center font-black text-xl sm:text-2xl shadow-lg shrink-0`}
              >
                {getInitials(currentCustomer.name)}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {currentCustomer.name}
                  </h1>
                  {renderCustomerUrgencyBadge(currentCustomer)}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  {currentCustomer.phone ? (
                    <button
                      type="button"
                      onClick={() => handleCustomerWhatsAppAll(currentCustomer)}
                      className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold hover:underline"
                      title="Klik untuk kirim pesan ringkasan WA"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{currentCustomer.phone} (WhatsApp)</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 italic">No. Telepon tidak dicatat</span>
                  )}

                  {currentCustomer.address && (
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{currentCustomer.address}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Quick Stats Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white/10 dark:bg-slate-800/80 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-center sm:text-left">
                <span className="text-[11px] font-semibold text-slate-300 block">
                  Barang Diamankan
                </span>
                <span className="text-lg sm:text-xl font-black text-amber-400 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
                  <Package className="w-4 h-4 shrink-0" />
                  {formatStock(currentCustomer.totalItemsHeld)}
                </span>
                <span className="text-[10px] text-slate-400">Satuan dasar toko</span>
              </div>

              <div className="bg-white/10 dark:bg-slate-800/80 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-center sm:text-left">
                <span className="text-[11px] font-semibold text-slate-300 block">
                  Nota Aktif
                </span>
                <span className="text-lg sm:text-xl font-black text-blue-400 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
                  <Clock className="w-4 h-4 shrink-0" />
                  {currentCustomer.activeCount}
                </span>
                <span className="text-[10px] text-slate-400">
                  Dari {currentCustomer.totalOrders} total pesanan
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-white/10 dark:bg-slate-800/80 backdrop-blur-xs p-3 rounded-xl border border-white/10 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => handleCustomerWhatsAppAll(currentCustomer)}
                  disabled={!currentCustomer.phone}
                  className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim Ringkasan WA</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Order Filter Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCustomerOrderFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                customerOrderFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Semua Nota ({currentCustomer.reservations.length})
            </button>

            <button
              type="button"
              onClick={() => setCustomerOrderFilter('ACTIVE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                customerOrderFilter === 'ACTIVE'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-50'
              }`}
            >
              Nota Aktif ({currentCustomer.activeCount})
            </button>

            <button
              type="button"
              onClick={() => setCustomerOrderFilter('CLOSED')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                customerOrderFilter === 'CLOSED'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Nota Selesai / Batal ({currentCustomer.completedCount + currentCustomer.cancelledCount})
            </button>
          </div>

          <span className="text-xs text-slate-400 hidden sm:inline">
            Menampilkan {currentCustomerOrders.length} nota
          </span>
        </div>

        {/* List of Reservation Orders for Selected Customer */}
        {currentCustomerOrders.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Tidak Ada Nota Pada Kategori Ini
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Ganti pilihan tab filter di atas untuk melihat nota lainnya.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {visibleCustomerOrders.map((r) => {
              const isActive = r.status === 'PENDING' || r.status === 'PARTIAL';

              return (
                <div
                  key={r.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  {/* Order Top Bar & Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        {r.reservation_code}
                      </span>
                      {getStatusBadge(r.status, r)}
                      {getDeadlineBadge(r)}
                      {r.invoice_no && (
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
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

                  {/* Deadline & Notes Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Tenggat Batas Pengambilan (Deadline)
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        {formatDate(r.pickup_deadline)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Keterangan / Alamat Proyek
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 truncate">
                        {r.customer_address ? `📍 ${r.customer_address}` : 'Tidak ada catatan alamat proyek'}
                      </p>
                    </div>
                  </div>

                  {/* Order Notes / Reason if present */}
                  {r.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 rounded-lg border border-amber-200/60 dark:border-amber-900/30">
                      💬 Catatan Nota: {r.notes}
                    </p>
                  )}

                  {r.status === 'CANCELLED' && r.cancel_reason && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/20 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/40 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      Alasan Pembatalan: {r.cancel_reason} (Dibatalkan pada {formatDate(r.cancelled_at)})
                    </p>
                  )}

                  {r.status === 'CLOSED_PARTIAL' && (
                    <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium bg-indigo-50 dark:bg-indigo-950/20 px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/40 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <CheckCheck className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                        Diselesaikan Sebagian ({formatSettlementLabel(r.settlement_type)})
                        {r.closed_at && (
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            • Ditutup pada {formatDate(r.closed_at)}
                          </span>
                        )}
                      </div>
                      {r.settlement_notes && (
                        <p className="text-slate-600 dark:text-slate-300 pl-5.5">
                          Rincian Penyelesaian: <strong>{r.settlement_notes}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Items Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-500" />
                        Rincian Barang Dititipkan ({r.items?.length || 0} Macam)
                      </h4>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs bg-white dark:bg-slate-900">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">Nama Produk & Varian</th>
                            <th className="py-2.5 px-3">Satuan Transaksi</th>
                            <th className="py-2.5 px-3 text-right">Qty Dititip</th>
                            <th className="py-2.5 px-3 text-right">Sudah Diambil</th>
                            <th className="py-2.5 px-3 text-right">Sisa Belum Diambil</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {r.items?.map((item) => {
                            const remaining = Number(
                              item.qty_remaining_base ??
                                (Number(item.qty_reserved_base) - Number(item.qty_picked_up_base || 0))
                            );

                            return (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="py-2.5 px-3">
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {item.product_name}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block">
                                    {item.variant_name} • SKU: {item.sku}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                  {item.unit_name}
                                  {item.conversion_factor !== 1 && (
                                    <span className="text-[10px] text-slate-400 block">
                                      x{item.conversion_factor} {item.base_unit_name}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                                  {formatStock(item.qty_ordered_unit)} {item.unit_name}
                                  <span className="text-[10px] text-slate-400 block">
                                    ({formatStock(item.qty_reserved_base)} {item.base_unit_name || item.unit_name})
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-500">
                                  {formatStock(item.qty_picked_up_base)} {item.base_unit_name || item.unit_name}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                                  {remaining <= 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-end gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Lunas
                                    </span>
                                  ) : r.status === 'CLOSED_PARTIAL' ? (
                                    <span className="text-indigo-600 dark:text-indigo-400 font-medium flex flex-col items-end">
                                      <span className="line-through text-slate-400 text-[10px]">
                                        {formatStock(remaining)} {item.base_unit_name || item.unit_name}
                                      </span>
                                      <span className="text-[11px] font-semibold">Dilepas ke Toko</span>
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
                    </div>
                  </div>

                  {/* Riwayat Pengambilan (Pickup History Log) */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <History className="w-4 h-4 text-blue-500" />
                      Riwayat Pengambilan Barang{' '}
                      {r.pickups && r.pickups.length > 0 ? `(${r.pickups.length} Kali Penyerahan)` : ''}
                    </span>

                    {r.pickups && r.pickups.length > 0 ? (
                      <div className="space-y-2">
                        {r.pickups.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            className="p-3 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-1.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-blue-500" />
                                Penerima / Sopir: {p.receiver_name}{' '}
                                {p.vehicle_plate && (
                                  <span className="font-mono text-[11px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                    {p.vehicle_plate}
                                  </span>
                                )}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {formatDate(p.picked_up_at)}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                              <span>Petugas Toko: <strong>{p.handed_by || 'Admin'}</strong></span>
                              {p.notes && <span>• Catatan: {p.notes}</span>}
                            </div>

                            {p.items && Array.isArray(p.items) && p.items.length > 0 && (
                              <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
                                <span className="font-semibold text-slate-500 block mb-0.5">Barang yang diserahkan:</span>
                                <div className="flex flex-wrap gap-2">
                                  {p.items.map((it: any, iIdx: number) => (
                                    <span
                                      key={iIdx}
                                      className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-md font-medium"
                                    >
                                      {it.product_name || it.item_id}: {formatStock(it.qty_picked_up_base ?? it.qty_picked_up)} {it.unit_name || 'unit'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        Belum ada riwayat pengambilan barang untuk nota ini.
                      </p>
                    )}
                  </div>

                  {/* Actions Bar for This Reservation */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleReservationWhatsApp(r)}
                      disabled={!r.customer_phone}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800/70 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={r.customer_phone ? 'Kirim pesan WA untuk nota ini' : 'No. HP belum dicatat'}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Kirim WA</span>
                    </button>

                    {isActive && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenExtend(r)}
                          className="px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-300 dark:border-amber-800/70 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <CalendarPlus className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Perpanjang Batas Waktu</span>
                        </button>

                        {(r.status === 'PARTIAL' ||
                          (r.items &&
                            r.items.some((it) => {
                              const rem = Number(
                                it.qty_remaining_base ??
                                  (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
                              );
                              return rem > 0;
                            }))) && (
                          <button
                            type="button"
                            onClick={() => handleOpenClosePartial(r)}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-800/70 rounded-xl flex items-center gap-1.5 transition-colors"
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Selesaikan & Lepas Sisa</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenCancel(r)}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-300 dark:border-rose-800/70 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Batalkan Nota</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedForPickup(r);
                            setIsPickupOpen(true);
                          }}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
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

            {orderDisplayLimit < currentCustomerOrders.length && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setOrderDisplayLimit((prev) => prev + 10)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs inline-flex items-center gap-2 transition-all"
                >
                  <ChevronDown className="w-4 h-4 text-amber-600" />
                  <span>
                    Muat Nota Lainnya ({visibleCustomerOrders.length} dari {currentCustomerOrders.length} Nota)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Modals and Dialogs */}
        <CreateReservationModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={handleMutationSuccess}
          showToast={showToast}
          products={products}
          initialCustomerName={currentCustomer.name}
          initialCustomerPhone={currentCustomer.phone || undefined}
          initialCustomerAddress={currentCustomer.address || undefined}
        />

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

        {/* Extend Modal */}
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

        {/* Cancel Modal */}
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
                  Perhatian: Stok akan dilepaskan!
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
                  placeholder="Contoh: Proyek dibatalkan, sudah dilakukan retur / refund kasir..."
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

        {/* Selesaikan Sebagian (Close Partial) Modal */}
        {isClosePartialOpen && selectedForClosePartial && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingClosePartial) {
                setIsClosePartialOpen(false);
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          >
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-900/60 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
                  <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
                    <CheckCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Selesaikan Nota & Lepas Sisa Titipan
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      {selectedForClosePartial.reservation_code} • {selectedForClosePartial.customer_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsClosePartialOpen(false)}
                  disabled={savingClosePartial}
                  className="p-1 rounded text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                  <PackageCheck className="w-4 h-4 shrink-0" />
                  Pelepasan Sisa Stok ke Toko
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Sisa barang titipan yang belum diambil akan <strong>otomatis dilepas dan kembali ke stok toko siap jual</strong>. Status nota akan diselesaikan sebagian dan tidak lagi membebani batas waktu titip.
                </p>
              </div>

              {/* Ringkasan Barang: Sudah Diambil vs Sisa Dilepas */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Ringkasan Barang Titipan</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {selectedForClosePartial.items?.length || 0} Macam Produk
                  </span>
                </span>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs bg-white dark:bg-slate-900">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2 px-3">Produk & Varian</th>
                        <th className="py-2 px-3 text-right">Dititip</th>
                        <th className="py-2 px-3 text-right">Sudah Diambil</th>
                        <th className="py-2 px-3 text-right text-indigo-600 dark:text-indigo-400">Sisa Dilepas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedForClosePartial.items?.map((it) => {
                        const remaining = Number(
                          it.qty_remaining_base ??
                            (Number(it.qty_reserved_base) - Number(it.qty_picked_up_base || 0))
                        );
                        return (
                          <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-3">
                              <span className="font-medium text-slate-900 dark:text-white block">
                                {it.product_name}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {it.variant_name} ({it.unit_name})
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                              {formatStock(it.qty_reserved_base)} {it.base_unit_name || it.unit_name}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                              {formatStock(it.qty_picked_up_base)} {it.base_unit_name || it.unit_name}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                              {remaining > 0 ? (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                                  {formatStock(remaining)} {it.base_unit_name || it.unit_name}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">0 (Nihil)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Opsi Penyelesaian Keuangan */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Penyelesaian Keuangan / Administrasi Sisa Barang <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'REFUND',
                      title: 'Refund Uang',
                      desc: 'Tunai / transfer pengembalian uang sisa ke pelanggan',
                    },
                    {
                      id: 'EXCHANGE',
                      title: 'Tukar Barang Bangunan Lain',
                      desc: 'Ditukar dengan material bangunan / produk lain',
                    },
                    {
                      id: 'DEPOSIT',
                      title: 'Simpan Saldo / Deposit',
                      desc: 'Dicatat sebagai saldo simpanan belanja pelanggan',
                    },
                    {
                      id: 'OTHER',
                      title: 'Lainnya / Kesepakatan Khusus',
                      desc: 'Kesepakatan khusus / penyelesaian kasir terpisah',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        settlementType === opt.id
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settlement_type"
                        value={opt.id}
                        checked={settlementType === opt.id}
                        onChange={() => setSettlementType(opt.id as any)}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">{opt.title}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                          {opt.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Catatan / Rincian Penyelesaian */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan / Rincian Penyelesaian <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={settlementReason}
                  onChange={(e) => setSettlementReason(e.target.value)}
                  placeholder="Misal: Refund tunai Rp 450.000 diserahkan kasir ke Pak Budi, atau sisa bata merah diganti semen 5 sak..."
                  rows={2}
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white placeholder:text-slate-400"
                />
              </div>

              {/* Tombol Aksi */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsClosePartialOpen(false)}
                  disabled={savingClosePartial}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitClosePartial}
                  disabled={savingClosePartial || !settlementReason.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>{savingClosePartial ? 'Menyimpan...' : 'Lepas Sisa Stok & Selesaikan Nota'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // LEVEL 1: PILIH PELANGGAN (DIRECTORY VIEW)
  // =========================================================================
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
            Pilih pelanggan untuk melihat rincian barang titipan, penyerahan stok, dan riwayat pengambilan
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-2xs"
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
            <span>Buat Reservasi</span>
          </button>
        </div>
      </div>

      {/* 4 Top Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Titipan Aktif */}
        <div
          onClick={() => setCustomerFilter('PENDING')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            customerFilter === 'PENDING'
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20'
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
              Total Barang Diamankan
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

        {/* Card 3: Segera Jatuh Tempo H-2 */}
        <div
          onClick={() => setCustomerFilter('ATTENTION')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            customerFilter === 'ATTENTION'
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

        {/* Card 4: Overdue (Melewati Batas Waktu) */}
        <div
          onClick={() => setCustomerFilter('ATTENTION')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            computedMetrics.overdue > 0
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Melewati Batas Waktu
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

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar with useDeferredValue */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pelanggan, no. telepon, alamat, no. nota, kode titipan..."
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

          {/* Filter Tabs - Default: Belum Diambil (PENDING) */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCustomerFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                customerFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Belum Diambil (PENDING) (
              {customerGroups.filter((c) => c.reservations.some((r) => r.status === 'PENDING')).length})
            </button>

            <button
              type="button"
              onClick={() => setCustomerFilter('ATTENTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                customerFilter === 'ATTENTION'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Perlu Tindak Lanjut (
              {customerGroups.filter((c) => c.isOverdue || c.isDueSoon).length})
            </button>

            <button
              type="button"
              onClick={() => setCustomerFilter('PARTIAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                customerFilter === 'PARTIAL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Sedang Diambil (PARTIAL) (
              {customerGroups.filter((c) => c.reservations.some((r) => r.status === 'PARTIAL')).length})
            </button>

            <button
              type="button"
              onClick={() => setCustomerFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                customerFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Selesai (
              {customerGroups.filter((c) => c.reservations.some((r) => r.status === 'COMPLETED' || r.status === 'CLOSED_PARTIAL')).length})
            </button>

            <button
              type="button"
              onClick={() => setCustomerFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                customerFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              Semua Pelanggan ({customerGroups.length})
            </button>
          </div>
        </div>
      </div>

      {/* Directory Grid of Customer Cards */}
      {loading && customerGroups.length === 0 ? (
        <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
          <span className="font-semibold text-sm">Memuat data reservasi pelanggan...</span>
        </div>
      ) : filteredCustomerGroups.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Tidak Ada Pelanggan Ditemukan
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {deferredSearch
              ? `Tidak ada pelanggan atau nota yang cocok dengan pencarian "${deferredSearch}".`
              : customerFilter === 'PENDING'
              ? 'Tidak ada pesanan reservasi dengan status belum diambil (PENDING) saat ini.'
              : 'Belum ada data reservasi pada filter yang dipilih saat ini.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCustomerGroups.map((c) => {
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomer(c.id)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between space-y-4"
                >
                  {/* Top Section: Avatar, Customer Name & Urgency Badge */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${getAvatarGradient(
                            c.name
                          )} flex items-center justify-center font-black text-base shadow-xs shrink-0`}
                        >
                          {getInitials(c.name)}
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-bold text-base text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                            {c.name}
                          </h3>
                          {c.phone ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {c.phone}
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCustomerWhatsAppAll(c);
                                }}
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded hover:bg-emerald-100 transition-colors"
                                title="Kirim pesan WhatsApp"
                              >
                                <MessageCircle className="w-2.5 h-2.5" />
                                WA
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No. HP tidak dicatat</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">{renderCustomerUrgencyBadge(c)}</div>
                    </div>

                    {/* Customer Address / Project location */}
                    {c.address ? (
                      <p
                        className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800"
                        title={c.address}
                      >
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{c.address}</span>
                      </p>
                    ) : (
                      <div className="h-2" />
                    )}

                    {/* Stat Metrics Row */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Pesanan Aktif
                        </span>
                        <p className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>{c.activeCount} Nota Aktif</span>
                        </p>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Barang Diamankan
                        </span>
                        <p className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5" />
                          <span>{formatStock(c.totalItemsHeld)} Unit</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action Bar */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Total {c.totalOrders} Nota Reservasi
                    </span>

                    <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Pilih Pelanggan & Lihat Detail</span>
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lazy-Loading Progressive Sentinel & Load More Trigger */}
          <div className="pt-2 flex flex-col items-center justify-center gap-2">
            <div ref={sentinelRef} className="h-4 w-full pointer-events-none" />

            {loadingMore && (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-3.5 py-1.5 rounded-full border border-amber-200 dark:border-amber-800">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memuat data reservasi berikutnya dari server...</span>
              </div>
            )}

            {displayLimit < filteredCustomerGroups.length && (
              <button
                type="button"
                onClick={() => setDisplayLimit((prev) => Math.min(prev + CHUNK_SIZE, filteredCustomerGroups.length))}
                className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs flex items-center gap-2 transition-all"
              >
                <ChevronDown className="w-4 h-4 text-amber-600" />
                <span>
                  Tampilkan Lebih Banyak ({visibleCustomerGroups.length} dari {filteredCustomerGroups.length} Pelanggan)
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal: Buat Reservasi */}
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
    </div>
  );
};
