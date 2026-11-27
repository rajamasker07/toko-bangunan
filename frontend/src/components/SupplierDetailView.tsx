import React, { useState, useEffect, useMemo } from 'react';
import {
  Supplier,
  SupplierSales,
  SupplierInvoice,
  SupplierInvoiceSummary,
  Product,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatDate } from '../utils/format';
import {
  ArrowLeft,
  Truck,
  Phone,
  Mail,
  MapPin,
  FileText,
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  DollarSign,
  Users,
  UserCheck,
  UserX,
  Smartphone,
  Star,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Building2,
  Check,
  X,
  Layers,
} from 'lucide-react';

interface SupplierDetailViewProps {
  supplierId: string;
  onBack: () => void;
  onEditSupplier: (supplier: Supplier) => void;
  onSupplierUpdated?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  refreshKey?: number;
}

type TabType = 'overview' | 'invoices' | 'sales' | 'products';

export const SupplierDetailView: React.FC<SupplierDetailViewProps> = ({
  supplierId,
  onBack,
  onEditSupplier,
  onSupplierUpdated,
  showToast,
  refreshKey = 0,
}) => {
  const { can } = useAuth();
  const canWrite = can('master:write');
  const canDelete = can('master:delete');
  const canViewFinancial = can('products:view_buy_price');
  const canManageInvoices = canWrite && canViewFinancial;
  const canDeleteInvoices = canDelete && canViewFinancial;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Products from this supplier
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Invoices State
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<SupplierInvoiceSummary | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>('all');

  // Invoice Modal State (Create / Edit)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [invNumber, setInvNumber] = useState('');
  const [invPoNo, setInvPoNo] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invDueDate, setInvDueDate] = useState('');
  const [invTotalAmount, setInvTotalAmount] = useState('');
  const [invPaidAmount, setInvPaidAmount] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  // Quick Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  // Sales Modal State
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [editingSales, setEditingSales] = useState<SupplierSales | null>(null);
  const [salesName, setSalesName] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [salesIsActive, setSalesIsActive] = useState(true);
  const [salesNotes, setSalesNotes] = useState('');
  const [salesPhones, setSalesPhones] = useState<Array<{ number: string; label: string; is_primary: boolean }>>([
    { number: '', label: 'WhatsApp', is_primary: true },
  ]);
  const [isSalesSubmitting, setIsSalesSubmitting] = useState(false);

  // Load supplier details
  const loadSupplier = async () => {
    try {
      setLoading(true);
      const data = await api.getSupplierById(supplierId);
      setSupplier(data);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat data supplier', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load products supplied by this supplier
  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      const all = await api.getProducts();
      const matched = all.filter((p) => p.supplier_id === supplierId);
      setProducts(matched);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Load invoices & summary
  const loadInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const [invList, sum] = await Promise.all([
        api.getSupplierInvoices(supplierId),
        api.getSupplierInvoiceSummary(supplierId),
      ]);
      setInvoices(invList);
      setInvoiceSummary(sum);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadSupplier();
    loadProducts();
    loadInvoices();
  }, [supplierId, refreshKey]);

  // Format WA link
  const getWhatsAppLink = (phoneNum: string) => {
    const clean = phoneNum.replace(/[^0-9]/g, '');
    let formatted = clean;
    if (formatted.startsWith('0')) {
      formatted = '62' + formatted.slice(1);
    }
    return `https://wa.me/${formatted}`;
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = productSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q));

      let matchStatus = true;
      if (productStatusFilter === 'active') matchStatus = p.is_active === true;
      if (productStatusFilter === 'inactive') matchStatus = p.is_active === false;

      return matchSearch && matchStatus;
    });
  }, [products, productSearch, productStatusFilter]);

  // Product Counts
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.is_active).length;
  const inactiveProducts = products.filter((p) => !p.is_active).length;

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const q = invoiceSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.purchase_order_no && inv.purchase_order_no.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q));

      let matchStatus = true;
      if (invoiceStatusFilter !== 'all') {
        if (invoiceStatusFilter === 'overdue') matchStatus = Boolean(inv.is_overdue);
        else if (invoiceStatusFilter === 'due_soon') matchStatus = Boolean(inv.is_due_soon);
        else matchStatus = inv.status.toLowerCase() === invoiceStatusFilter.toLowerCase();
      }

      return matchSearch && matchStatus;
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

  // Handle Sales Modal Open
  const openCreateSalesModal = () => {
    setEditingSales(null);
    setSalesName('');
    setSalesEmail('');
    setSalesIsActive(true);
    setSalesNotes('');
    setSalesPhones([{ number: '', label: 'WhatsApp', is_primary: true }]);
    setIsSalesModalOpen(true);
  };

  const openEditSalesModal = (sales: SupplierSales) => {
    setEditingSales(sales);
    setSalesName(sales.name);
    setSalesEmail(sales.email || '');
    setSalesIsActive(sales.is_active);
    setSalesNotes(sales.notes || '');
    if (sales.phones && sales.phones.length > 0) {
      setSalesPhones(
        sales.phones.map((p) => ({
          number: p.number,
          label: p.label || 'Utama',
          is_primary: Boolean(p.is_primary),
        }))
      );
    } else {
      setSalesPhones([{ number: '', label: 'WhatsApp', is_primary: true }]);
    }
    setIsSalesModalOpen(true);
  };

  // Submit Sales
  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName.trim()) {
      showToast('Nama sales wajib diisi', 'error');
      return;
    }

    const validPhones = salesPhones.filter((p) => p.number.trim() !== '');

    setIsSalesSubmitting(true);
    try {
      if (editingSales) {
        await api.updateSupplierSales(editingSales.id, {
          name: salesName.trim(),
          email: salesEmail.trim() || null,
          is_active: salesIsActive,
          notes: salesNotes.trim() || null,
          phones: validPhones,
        });
        showToast('Data sales berhasil diperbarui', 'success');
      } else {
        await api.createSupplierSales(supplierId, {
          name: salesName.trim(),
          email: salesEmail.trim() || null,
          is_active: salesIsActive,
          notes: salesNotes.trim() || null,
          phones: validPhones,
        });
        showToast('Sales baru berhasil ditambahkan', 'success');
      }
      setIsSalesModalOpen(false);
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan data sales', 'error');
    } finally {
      setIsSalesSubmitting(false);
    }
  };

  const handleToggleSalesStatus = async (sales: SupplierSales) => {
    try {
      const updated = await api.toggleSupplierSalesStatus(sales.id);
      const text = updated.is_active ? 'diaktifkan' : 'dinonaktifkan';
      showToast(`Status sales "${sales.name}" berhasil ${text}`, 'success');
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status sales', 'error');
    }
  };

  const handleDeleteSales = async (sales: SupplierSales) => {
    if (!confirm(`Hapus sales "${sales.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      await api.deleteSupplierSales(sales.id);
      showToast(`Sales "${sales.name}" berhasil dihapus`, 'success');
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus sales', 'error');
    }
  };

  // Handle Invoice Modal Open
  const openCreateInvoiceModal = () => {
    setEditingInvoice(null);
    setInvNumber('');
    setInvPoNo('');
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setInvDate(today);
    setInvDueDate(in30Days);
    setInvTotalAmount('');
    setInvPaidAmount('0');
    setInvNotes('');
    setIsInvoiceModalOpen(true);
  };

  const openEditInvoiceModal = (inv: SupplierInvoice) => {
    setEditingInvoice(inv);
    setInvNumber(inv.invoice_number);
    setInvPoNo(inv.purchase_order_no || '');
    setInvDate(inv.invoice_date.slice(0, 10));
    setInvDueDate(inv.due_date.slice(0, 10));
    setInvTotalAmount(inv.total_amount !== null ? String(inv.total_amount) : '');
    setInvPaidAmount(inv.paid_amount !== null ? String(inv.paid_amount) : '0');
    setInvNotes(inv.notes || '');
    setIsInvoiceModalOpen(true);
  };

  // Submit Invoice
  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invNumber.trim()) {
      showToast('Nomor nota / invoice wajib diisi', 'error');
      return;
    }
    if (!invDate || !invDueDate) {
      showToast('Tanggal nota dan jatuh tempo wajib diisi', 'error');
      return;
    }
    const total = Number(invTotalAmount);
    if (!total || total <= 0) {
      showToast('Total nominal nota harus lebih dari 0', 'error');
      return;
    }
    const paid = Number(invPaidAmount) || 0;
    if (paid > total) {
      showToast('Nominal dibayar tidak boleh melebihi total nota', 'error');
      return;
    }

    setIsSubmittingInvoice(true);
    try {
      if (editingInvoice) {
        await api.updateSupplierInvoice(editingInvoice.id, {
          invoice_number: invNumber.trim(),
          purchase_order_no: invPoNo.trim() || null,
          invoice_date: invDate,
          due_date: invDueDate,
          total_amount: total,
          paid_amount: paid,
          notes: invNotes.trim() || null,
        });
        showToast(`Nota ${invNumber} berhasil diperbarui`, 'success');
      } else {
        await api.createSupplierInvoice(supplierId, {
          invoice_number: invNumber.trim(),
          purchase_order_no: invPoNo.trim() || null,
          invoice_date: invDate,
          due_date: invDueDate,
          total_amount: total,
          paid_amount: paid,
          notes: invNotes.trim() || null,
        });
        showToast(`Nota ${invNumber} berhasil dicatat`, 'success');
      }
      setIsInvoiceModalOpen(false);
      loadInvoices();
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan nota', 'error');
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  // Delete Invoice
  const handleDeleteInvoice = async (inv: SupplierInvoice) => {
    if (!confirm(`Hapus nota "${inv.invoice_number}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      await api.deleteSupplierInvoice(inv.id);
      showToast(`Nota ${inv.invoice_number} berhasil dihapus`, 'success');
      loadInvoices();
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus nota', 'error');
    }
  };

  // Quick Payment Modal Open
  const openPayModal = (inv: SupplierInvoice) => {
    setPayingInvoice(inv);
    setPayAmount(inv.remaining_amount !== null ? String(inv.remaining_amount) : '');
    setIsPayModalOpen(true);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;

    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      showToast('Nominal pembayaran harus lebih besar dari 0', 'error');
      return;
    }
    const maxRemaining = payingInvoice.remaining_amount ?? 0;
    if (amt > maxRemaining) {
      showToast(`Nominal melebihi sisa tagihan (${formatRupiah(maxRemaining)})`, 'error');
      return;
    }

    setIsSubmittingPay(true);
    try {
      await api.recordSupplierInvoicePayment(payingInvoice.id, amt);
      showToast(`Pembayaran sebesar ${formatRupiah(amt)} berhasil dicatat`, 'success');
      setIsPayModalOpen(false);
      loadInvoices();
      loadSupplier();
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err: any) {
      showToast(err.message || 'Gagal mencatat pembayaran', 'error');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  if (loading && !supplier) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-14 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
        <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
          Memuat rincian data supplier...
        </p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
        <h3 className="font-bold text-slate-800 dark:text-slate-200">Supplier Tidak Ditemukan</h3>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Supplier
        </button>
      </div>
    );
  }

  const salesList = supplier.sales || [];
  const salesCount = salesList.length;
  const activeSales = salesList.filter((x) => x.is_active).length;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shadow-xs"
            title="Kembali ke Daftar Supplier"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {supplier.name}
              </h2>
              {supplier.code && (
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-semibold border border-slate-200 dark:border-slate-700">
                  {supplier.code}
                </span>
              )}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  supplier.is_active
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}
              >
                {supplier.is_active ? 'Supplier Aktif' : 'Non-Aktif'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>Distributor Material</span>
              {supplier.city && (
                <>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-500" /> {supplier.city}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canWrite && (
            <button
              onClick={() => onEditSupplier(supplier)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Summary Cards (Statistik Produk & Jatuh Tempo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Produk Aktif / Dijual */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Produk Aktif / Dijual
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {activeProducts}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                / {totalProducts} Total
              </span>
            </div>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              {totalProducts > 0
                ? `${Math.round((activeProducts / totalProducts) * 100)}% aktif di katalog`
                : 'Belum ada produk'}
            </p>
          </div>
        </div>

        {/* Card 2: Total Hutang Nota / Status Nota */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              {canViewFinancial ? 'Sisa Tagihan / Beban' : 'Status Nota Pembelian'}
            </span>
            {canViewFinancial && invoiceSummary?.total_debt_amount !== null ? (
              <>
                <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums block">
                  {formatRupiah(invoiceSummary?.total_debt_amount || 0)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Dari total {formatRupiah(invoiceSummary?.total_invoice_amount || 0)}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-black text-slate-700 dark:text-slate-200 block">
                  Nominal Disembunyikan
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {(invoiceSummary?.unpaid_count || 0) + (invoiceSummary?.partial_count || 0) + (invoiceSummary?.overdue_count || 0)} aktif dari {invoiceSummary?.total_invoices || 0} nota
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 3: Nota Jatuh Tempo / Lewat Waktu */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div
            className={`p-3 rounded-xl shrink-0 ${
              (invoiceSummary?.overdue_count || 0) > 0
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Nota Lewat Tempo
            </span>
            <span
              className={`text-2xl font-black tabular-nums block ${
                (invoiceSummary?.overdue_count || 0) > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {invoiceSummary?.overdue_count || 0} Nota
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {invoiceSummary?.due_soon_count || 0} nota jatuh tempo minggu ini
            </span>
          </div>
        </div>

        {/* Card 4: Tim Sales Representative */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Tim Sales Supplier
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums block">
              {salesCount} Sales
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
              {activeSales} sales kontak aktif
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
            activeTab === 'overview'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Profil Supplier</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
            activeTab === 'invoices'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Nota & Jatuh Tempo</span>
          {(invoiceSummary?.overdue_count || 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
              {invoiceSummary?.overdue_count}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
            activeTab === 'products'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Katalog Produk ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
            activeTab === 'sales'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tim Sales ({salesCount})</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW & COMPANY INFO                           */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-500" />
                Informasi Kontak & Legalitas
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 block font-medium">Penanggung Jawab (PIC Kantor)</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    {supplier.contact_person || '-'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 block font-medium">Telepon / WhatsApp Kantor</span>
                  {supplier.phone ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {supplier.phone}
                      </span>
                      <a
                        href={getWhatsAppLink(supplier.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px] font-bold"
                      >
                        WA
                      </a>
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1 sm:col-span-2">
                  <span className="text-[11px] text-slate-400 block font-medium">Email Korespondensi</span>
                  {supplier.email ? (
                    <a
                      href={`mailto:${supplier.email}`}
                      className="font-bold text-amber-600 dark:text-amber-400 hover:underline text-sm"
                    >
                      {supplier.email}
                    </a>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1 sm:col-span-2">
                  <span className="text-[11px] text-slate-400 block font-medium">Alamat Gudang / Kantor</span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {supplier.address || '-'}
                  </p>
                </div>

                {supplier.notes && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1 sm:col-span-2">
                    <span className="text-[11px] text-slate-400 block font-medium">Catatan / Lingkup Material</span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic">
                      {supplier.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side Info Cards */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3.5">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                Ringkasan Kemitraan
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">ID Supplier</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {supplier.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Status Toko</span>
                  <span
                    className={`font-bold ${
                      supplier.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                    }`}
                  >
                    {supplier.is_active ? 'Aktif' : 'Non-Aktif'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Terdaftar Sejak</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatDate(supplier.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Total Macam Produk</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {totalProducts} SKU Produk
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setActiveTab('invoices')}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-4 h-4" /> Kelola Nota & Jatuh Tempo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: INVOICES & JATUH TEMPO                            */}
      {/* ========================================================= */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Action Header & Filters */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Cari nomor nota, no PO, catatan tagihan..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setInvoiceStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    invoiceStatusFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setInvoiceStatusFilter('overdue')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    invoiceStatusFilter === 'overdue'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  Lewat Tempo ({invoiceSummary?.overdue_count || 0})
                </button>
                <button
                  onClick={() => setInvoiceStatusFilter('due_soon')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    invoiceStatusFilter === 'due_soon'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                  }`}
                >
                  Jatuh Tempo H-7
                </button>
                <button
                  onClick={() => setInvoiceStatusFilter('unpaid')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    invoiceStatusFilter === 'unpaid'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Belum Lunas
                </button>
                <button
                  onClick={() => setInvoiceStatusFilter('paid')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    invoiceStatusFilter === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  Lunas
                </button>
              </div>

              {canManageInvoices && (
                <button
                  onClick={openCreateInvoiceModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat Nota Baru</span>
                </button>
              )}
            </div>
          </div>

          {/* Invoices List Table / Cards */}
          {loadingInvoices && invoices.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2">
              <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Memuat riwayat nota pembelian...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                Belum ada nota tagihan yang tercatat
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Catat nota tagihan pembelian dari supplier ini agar sistem dapat memantau tanggal jatuh tempo secara akurat.
              </p>
              {canManageInvoices && (
                <button
                  onClick={openCreateInvoiceModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
                >
                  <Plus className="w-4 h-4" /> Catat Nota Sekarang
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInvoices.map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isOverdue = inv.is_overdue;
                const isDueSoon = inv.is_due_soon;

                return (
                  <div
                    key={inv.id}
                    className={`p-4 rounded-2xl border transition-all text-xs space-y-3 ${
                      isOverdue
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/60 shadow-xs'
                        : isDueSoon
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Header: Nota & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">
                            {inv.invoice_number}
                          </span>
                          {inv.purchase_order_no && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                              PO: {inv.purchase_order_no}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Tgl Nota: {formatDate(inv.invoice_date)}
                        </span>
                      </div>

                      {/* Status Pill */}
                      <div>
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Lunas
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> Lewat {inv.days_overdue} Hari!
                          </span>
                        ) : isDueSoon ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" /> Tempo H-{inv.days_until_due}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            Belum Lunas
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Due Date & Financial Numbers */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-amber-500" /> Jatuh Tempo:
                        </span>
                        <span
                          className={`font-bold ${
                            isOverdue
                              ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {formatDate(inv.due_date)}
                        </span>
                      </div>

                      {canViewFinancial && inv.total_amount !== null ? (
                        <>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="text-slate-500">Total Nilai Nota:</span>
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              {formatRupiah(inv.total_amount)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Telah Dibayar:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatRupiah(inv.paid_amount)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              Sisa Tagihan / Beban:
                            </span>
                            <span
                              className={`font-black text-sm tabular-nums ${
                                (inv.remaining_amount ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
                              }`}
                            >
                              {formatRupiah(inv.remaining_amount)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400 italic">
                          Nominal tagihan disembunyikan sesuai hak akses peran (memerlukan izin HPP).
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {inv.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        Catatan: {inv.notes}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        {canManageInvoices && !isPaid && (
                          <button
                            onClick={() => openPayModal(inv)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Bayar Nota</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {canManageInvoices && (
                          <button
                            onClick={() => openEditInvoiceModal(inv)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                            title="Edit Nota"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteInvoices && (
                          <button
                            onClick={() => handleDeleteInvoice(inv)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Hapus Nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: PRODUCTS SUPPLIED BY THIS SUPPLIER                */}
      {/* ========================================================= */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Cari nama produk, SKU, atau merk..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setProductStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  productStatusFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Semua ({totalProducts})
              </button>
              <button
                onClick={() => setProductStatusFilter('active')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  productStatusFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                Masih Dijual ({activeProducts})
              </button>
              <button
                onClick={() => setProductStatusFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  productStatusFilter === 'inactive'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                Non-Aktif ({inactiveProducts})
              </button>
            </div>
          </div>

          {loadingProducts ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2">
              <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Memuat katalog produk supplier...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                Belum ada produk yang disuplai oleh supplier ini
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Anda dapat menghubungkan produk ke supplier ini melalui menu Katalog Produk saat menambah atau mengubah produk.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="py-3 px-4">Nama Produk & SKU</th>
                      <th className="py-3 px-4">Kategori & Brand</th>
                      <th className="py-3 px-4 text-center">Status Jual</th>
                      <th className="py-3 px-4 text-right">Total Stok Fisik</th>
                      <th className="py-3 px-4 text-right">Harga Dasar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredProducts.map((p) => {
                      const baseUnit =
                        p.variants?.[0]?.units?.find((u) => u.is_base_unit) ||
                        p.variants?.[0]?.units?.[0];

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {p.name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              SKU: {p.sku}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-slate-800 dark:text-slate-200 font-medium block">
                              {p.category_name || '-'}
                            </span>
                            {p.brand && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                {p.brand}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                p.is_active
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {p.is_active ? 'Aktif Dijual' : 'Non-Aktif'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {p.total_stock} {baseUnit?.unit_name || 'Satuan'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400">
                            {baseUnit ? formatRupiah(Number(baseUnit.sell_price)) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: SALES REPRESENTATIVES                             */}
      {/* ========================================================= */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kelola nomor kontak sales resmi yang bertanggung jawab terhadap pemesanan dan pengiriman barang dari distributor ini.
            </p>
            {canWrite && (
              <button
                onClick={openCreateSalesModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Sales Baru</span>
              </button>
            )}
          </div>

          {salesList.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                Belum ada kontak sales yang tercatat
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tambahkan kontak sales person agar toko Anda mudah menghubungi saat hendak order barang atau konfirmasi retur.
              </p>
              {canWrite && (
                <button
                  onClick={openCreateSalesModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" /> Tambah Sales Sekarang
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {salesList.map((sales) => {
                const phones = sales.phones || [];
                return (
                  <div
                    key={sales.id}
                    className={`p-4 rounded-2xl border transition-all text-xs space-y-3 ${
                      sales.is_active
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
                        : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-2 rounded-xl ${
                            sales.is_active
                              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                              : 'bg-slate-500/10 text-slate-400'
                          }`}
                        >
                          {sales.is_active ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </div>
                        <div>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                            {sales.name}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                              sales.is_active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {sales.is_active ? 'Sales Aktif' : 'Non-Aktif'}
                          </span>
                        </div>
                      </div>

                      {(canWrite || canDelete) && (
                        <div className="flex items-center gap-1">
                          {canWrite && (
                            <button
                              onClick={() => handleToggleSalesStatus(sales)}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                sales.is_active
                                  ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              }`}
                            >
                              {sales.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          )}
                          {canWrite && (
                            <button
                              onClick={() => openEditSalesModal(sales)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                              title="Edit Sales"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteSales(sales)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Hapus Sales"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Phones List */}
                    <div className="space-y-1.5">
                      {phones.map((p, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {p.number}
                            </span>
                            {p.label && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-medium">
                                {p.label}
                              </span>
                            )}
                            {p.is_primary && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                                <Star className="w-2.5 h-2.5 fill-current" /> Utama
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <a
                              href={`tel:${p.number}`}
                              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold hover:text-amber-600"
                            >
                              Panggil
                            </a>
                            <a
                              href={getWhatsAppLink(p.number)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20"
                            >
                              WhatsApp
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>

                    {sales.email && (
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 pt-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <a href={`mailto:${sales.email}`} className="hover:underline">
                          {sales.email}
                        </a>
                      </div>
                    )}

                    {sales.notes && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        {sales.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT INVOICE (CATAT NOTA SUPPLIER)           */}
      {/* ========================================================= */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingInvoice ? 'Edit Nota Pembelian' : 'Catat Nota Pembelian & Jatuh Tempo'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Beban tagihan dari {supplier.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvoiceSubmit} className="p-6 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Nota / Faktur Supplier <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    value={invNumber}
                    onChange={(e) => setInvNumber(e.target.value)}
                    placeholder="Contoh: INV-2026-0819"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Purchase Order (PO):
                  </label>
                  <input
                    type="text"
                    value={invPoNo}
                    onChange={(e) => setInvPoNo(e.target.value)}
                    placeholder="Contoh: PO-0012"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Nota <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Jatuh Tempo <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold text-rose-600 dark:text-rose-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Total Nilai Nota (Rp) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={invTotalAmount}
                    onChange={(e) => setInvTotalAmount(e.target.value)}
                    placeholder="Contoh: 15000000"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Telah Dibayar (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={invPaidAmount}
                    onChange={(e) => setInvPaidAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Tagihan:
                </label>
                <textarea
                  rows={2}
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  placeholder="Catatan termin pembayaran, nomor rekening transfer, dll..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  disabled={isSubmittingInvoice}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvoice}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmittingInvoice ? 'Menyimpan...' : 'Simpan Nota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RECORD PAYMENT (BAYAR NOTA)                       */}
      {/* ========================================================= */}
      {isPayModalOpen && payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Catat Pembayaran Nota
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Nota {payingInvoice.invoice_number}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Total Nota:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatRupiah(payingInvoice.total_amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sudah Dibayar:</span>
                  <span className="font-bold text-emerald-600">
                    {formatRupiah(payingInvoice.paid_amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Sisa yang Harus Dibayar:
                  </span>
                  <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                    {formatRupiah(payingInvoice.remaining_amount)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nominal Pembayaran Sekarang (Rp) <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="number"
                  min="1"
                  max={payingInvoice.remaining_amount ?? undefined}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Masukkan nominal pembayaran..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  disabled={isSubmittingPay}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmittingPay ? 'Memproses...' : 'Konfirmasi Bayar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT SALES                                  */}
      {/* ========================================================= */}
      {isSalesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingSales ? 'Edit Data Sales Representative' : 'Tambah Sales Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Untuk supplier: <strong className="text-slate-700 dark:text-slate-300">{supplier.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSalesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalesSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Sales Representative <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                  placeholder="Contoh: Bpk. Budi Santoso"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Sales:
                </label>
                <input
                  type="email"
                  value={salesEmail}
                  onChange={(e) => setSalesEmail(e.target.value)}
                  placeholder="budi.sales@supplier.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Multiple Phones Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Nomor Telepon / WhatsApp Sales:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSalesPhones((prev) => [
                        ...prev,
                        { number: '', label: 'WhatsApp', is_primary: false },
                      ])
                    }
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    + Tambah Nomor
                  </button>
                </div>

                {salesPhones.map((ph, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ph.number}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSalesPhones((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, number: val } : item))
                        );
                      }}
                      placeholder="08123456789"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <select
                      value={ph.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSalesPhones((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: val } : item))
                        );
                      }}
                      className="px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]"
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="HP Utama">HP Utama</option>
                      <option value="Telepon Kantor">Telepon Kantor</option>
                      <option value="HP Pribadi">HP Pribadi</option>
                    </select>
                    {salesPhones.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSalesPhones((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Sales:
                </label>
                <textarea
                  rows={2}
                  value={salesNotes}
                  onChange={(e) => setSalesNotes(e.target.value)}
                  placeholder="Hari kunjungan rutin, promo khusus, kontak backup..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="salesIsActiveDetail"
                  checked={salesIsActive}
                  onChange={(e) => setSalesIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="salesIsActiveDetail" className="font-semibold text-slate-700 dark:text-slate-300">
                  Sales Representative ini masih aktif bertugas
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSalesModalOpen(false)}
                  disabled={isSalesSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSalesSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSalesSubmitting ? 'Menyimpan...' : 'Simpan Sales'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
