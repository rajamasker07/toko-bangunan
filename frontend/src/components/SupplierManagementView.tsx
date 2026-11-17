import React, { useState, useMemo, useEffect } from 'react';
import { Supplier } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Pagination } from './common/Pagination';
import { SupplierDetailView } from './SupplierDetailView';
import { formatRupiah } from '../utils/format';
import { 
  Truck, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  MapPin, 
  Package, 
  CheckCircle2, 
  X, 
  Users,
  ShieldCheck,
  RefreshCw,
  Eye,
  ArrowRight,
  Clock,
  AlertTriangle,
  DollarSign,
  Upload,
  Download,
} from 'lucide-react';

interface SupplierManagementViewProps {
  suppliers?: Supplier[];
  loading?: boolean;
  onRefresh: () => void;
  onOpenImport?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SupplierManagementView: React.FC<SupplierManagementViewProps> = ({
  suppliers = [],
  loading = false,
  onRefresh,
  onOpenImport,
  showToast,
}) => {
  const { can } = useAuth();
  const canWrite = can('master:write');
  const canImport = can('data:import') && canWrite;
  const canExport = can('data:export');
  const canDelete = can('master:delete');

  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [salesFilter, setSalesFilter] = useState<'all' | 'has_sales' | 'no_sales'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Selected Supplier for Detail Drill-down
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supplierRefreshKey, setSupplierRefreshKey] = useState<number>(0);

  // Supplier Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Supplier Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metrics
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.is_active).length;
  const totalSuppliedProducts = suppliers.reduce((acc, s) => acc + (s.product_count || 0), 0);
  const totalActiveProducts = suppliers.reduce((acc, s) => acc + (s.active_product_count || 0), 0);
  const totalSalesCount = suppliers.reduce((acc, s) => acc + (s.sales?.length || 0), 0);
  const activeSalesCount = suppliers.reduce((acc, s) => acc + (s.sales?.filter(x => x.is_active).length || 0), 0);
  const totalDebt = suppliers.reduce((acc, s) => acc + (s.invoice_summary?.total_debt_amount || 0), 0);
  const totalOverdueInvoices = suppliers.reduce((acc, s) => acc + (s.invoice_summary?.overdue_count || 0), 0);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const q = search.toLowerCase().trim();

      // Search matches supplier fields OR any sales name/phone/email
      const matchSupplier =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q));

      const matchSales =
        Boolean(q) &&
        Boolean(
          s.sales?.some((sl) => {
            const matchSlName = sl.name.toLowerCase().includes(q);
            const matchSlEmail = sl.email && sl.email.toLowerCase().includes(q);
            const matchSlPhone = sl.phones?.some((p) => p.number.includes(q) || (p.label && p.label.toLowerCase().includes(q)));
            const matchSlNotes = sl.notes && sl.notes.toLowerCase().includes(q);
            return matchSlName || matchSlEmail || matchSlPhone || matchSlNotes;
          })
        );

      if (!matchSupplier && !matchSales) return false;

      // Supplier status filter
      if (statusFilter === 'active' && !s.is_active) return false;
      if (statusFilter === 'inactive' && s.is_active) return false;

      // Sales filter
      const sCount = s.sales?.length || 0;
      if (salesFilter === 'has_sales' && sCount === 0) return false;
      if (salesFilter === 'no_sales' && sCount > 0) return false;

      return true;
    });
  }, [suppliers, search, statusFilter, salesFilter]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, salesFilter]);

  // Paginated suppliers for lightweight rendering
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  // Supplier modal handlers
  const openCreateModal = () => {
    setEditingSupplier(null);
    setName('');
    setCode('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setNotes('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setCode(s.code || '');
    setContactPerson(s.contact_person || '');
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setAddress(s.address || '');
    setCity(s.city || '');
    setNotes(s.notes || '');
    setIsActive(s.is_active);
    setIsModalOpen(true);
  };

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama supplier wajib diisi', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: name.trim(),
        code: code.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        notes: notes.trim() || undefined,
        is_active: isActive,
      };

      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, payload);
        showToast(`Supplier "${payload.name}" berhasil diperbarui`, 'success');
      } else {
        const res = await api.createSupplier(payload);
        showToast(`Supplier "${res.name}" berhasil ditambahkan!`, 'success');
      }

      setIsModalOpen(false);
      onRefresh();
      setSupplierRefreshKey((k) => k + 1);
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan data supplier', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (s: Supplier) => {
    const warning = (s.product_count || 0) > 0
      ? `Supplier "${s.name}" terhubung ke ${s.product_count} produk. Jika dihapus, produk terkait akan tetap ada namun suppliernya menjadi kosong. Lanjutkan?`
      : `Hapus supplier "${s.name}"? Tindakan ini tidak dapat dibatalkan.`;

    if (!confirm(warning)) return;

    try {
      await api.deleteSupplier(s.id);
      showToast(`Supplier "${s.name}" berhasil dihapus`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus supplier', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {selectedSupplierId ? (
        <SupplierDetailView
          supplierId={selectedSupplierId}
          onBack={() => {
            setSelectedSupplierId(null);
            onRefresh();
          }}
          onEditSupplier={(sup) => openEditModal(sup)}
          onSupplierUpdated={() => {
            onRefresh();
            setSupplierRefreshKey((k) => k + 1);
          }}
          showToast={showToast}
          refreshKey={supplierRefreshKey}
        />
      ) : (
        <>
          {/* View Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-500" />
                <span>Master Supplier & Tim Sales</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daftar distributor resmi material bangunan lengkap beserta tim sales, nomor kontak berganda & status aktifnya
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {!canWrite && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
                  <Eye className="w-3.5 h-3.5" />
                  Mode Lihat Saja
                </span>
              )}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={loading}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
                  title="Segarkan Data Supplier"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={async () => {
                    setIsExporting(true);
                    try {
                      await api.downloadEntityExport('suppliers', 'xlsx');
                      showToast('Data supplier berhasil diekspor ke Excel', 'success');
                    } catch (e: any) {
                      showToast(e.message || 'Gagal mengekspor supplier', 'error');
                    } finally {
                      setIsExporting(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors disabled:opacity-50"
                  title="Unduh master supplier & sales dalam format Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isExporting ? 'Mengekspor...' : 'Export'}</span>
                </button>
              )}
              {canImport && onOpenImport && (
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors"
                  title="Import Master Supplier & Kontak Sales dari Excel/CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Import</span>
                </button>
              )}
              {canWrite && (
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Supplier Baru</span>
                </button>
              )}
            </div>
          </div>

          {/* Metrics Row (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Total Supplier</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900 dark:text-white">{totalSuppliers}</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">({activeSuppliers} Aktif)</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Produk Aktif / Dijual</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900 dark:text-white">{totalActiveProducts}</span>
                  <span className="text-xs font-semibold text-slate-500">/ {totalSuppliedProducts} Total</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Total Tim Sales</span>
                <span className="text-xl font-black text-slate-900 dark:text-white">
                  {totalSalesCount} <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">({activeSalesCount} Aktif)</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className={`p-3 rounded-xl ${totalOverdueInvoices > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Sisa Beban Tagihan</span>
                <span className="text-lg font-black text-slate-900 dark:text-white truncate block">{formatRupiah(totalDebt)}</span>
                {totalOverdueInvoices > 0 ? (
                  <span className="text-[10px] font-bold text-rose-500 block">
                    {totalOverdueInvoices} Nota Lewat Tempo!
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 block">
                    Semua nota aman
                  </span>
                )}
              </div>
            </div>
          </div>

      {/* Search and Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama supplier, kode, PIC, kota, nama sales, atau no HP sales..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <span className="text-slate-400 text-[10px] px-2 font-medium">Supplier:</span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              Aktif ({activeSuppliers})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              Non-Aktif
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <span className="text-slate-400 text-[10px] px-2 font-medium">Sales:</span>
            <button
              onClick={() => setSalesFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                salesFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setSalesFilter('has_sales')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                salesFilter === 'has_sales'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10'
              }`}
            >
              Ada Sales
            </button>
            <button
              onClick={() => setSalesFilter('no_sales')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                salesFilter === 'no_sales'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Tanpa Sales
            </button>
          </div>
        </div>
      </div>

      {/* Suppliers Grid Cards */}
      {loading && suppliers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-14 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
            Memuat data supplier & tim sales...
          </p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            Tidak ada supplier yang cocok
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian atau tambahkan supplier baru.
          </p>
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" /> Tambah Supplier Baru
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {paginatedSuppliers.map((s) => {
              const salesList = s.sales || [];
              const salesCount = salesList.length;
              const activeSales = salesList.filter((x) => x.is_active).length;
              const addressDisplay = s.address
                ? `${s.address}${s.city ? `, ${s.city}` : ''}`
                : s.city || 'Alamat belum diatur';

              return (
                <div
                  key={s.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-amber-500/50 hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Kolom 1: Info Utama (Nama Supplier & Alamat) */}
                  <div className="flex items-start gap-3.5 min-w-0 lg:max-w-md xl:max-w-lg">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedSupplierId(s.id)}
                          className="text-left font-bold text-base text-slate-900 dark:text-white hover:text-amber-600 dark:hover:text-amber-400 transition-colors inline-flex items-center gap-1.5 group cursor-pointer truncate"
                          title="Klik untuk membuka Detail Supplier & Tagihan"
                        >
                          <span className="truncate">{s.name}</span>
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-amber-500 shrink-0" />
                        </button>
                        {s.code && (
                          <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-semibold shrink-0">
                            {s.code}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            s.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {s.is_active ? 'Aktif' : 'Non-Aktif'}
                        </span>
                      </div>

                      {/* Alamat */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate" title={addressDisplay}>
                          {addressDisplay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Kolom 2: 3 Informasi Ringkas (Jumlah Barang, Jumlah Sales, Jumlah Tagihan) */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-6 py-3 lg:py-0 border-y lg:border-y-0 border-slate-100 dark:border-slate-800/80 shrink-0">
                    {/* Jumlah Barang */}
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                          Jumlah Barang
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="font-black text-sm text-slate-900 dark:text-white tabular-nums">
                            {s.product_count || 0}
                          </span>
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            ({s.active_product_count ?? 0} aktif)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Jumlah Sales */}
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                          Jumlah Sales
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="font-black text-sm text-slate-900 dark:text-white tabular-nums">
                            {salesCount}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            ({activeSales} aktif)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Jumlah Tagihan */}
                    <div className="flex items-center gap-2.5 min-w-[130px]">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          (s.invoice_summary?.overdue_count || 0) > 0
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse'
                            : (s.invoice_summary?.total_debt_amount || 0) > 0
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {(s.invoice_summary?.overdue_count || 0) > 0 ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <DollarSign className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                          Jumlah Tagihan
                        </span>
                        {(s.invoice_summary?.total_debt_amount || 0) > 0 ? (
                          <div>
                            <span className="font-black text-sm text-slate-900 dark:text-white tabular-nums block">
                              {formatRupiah(s.invoice_summary?.total_debt_amount)}
                            </span>
                            {(s.invoice_summary?.overdue_count || 0) > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <AlertTriangle className="w-2.5 h-2.5" /> {s.invoice_summary?.overdue_count} Lewat Tempo
                              </span>
                            ) : (s.invoice_summary?.due_soon_count || 0) > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock className="w-2.5 h-2.5" /> Tempo Dekat
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Kolom 3: Tombol Aksi Cepat Sebelah Kanan */}
                  <div className="flex items-center gap-2 justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSupplierId(s.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer shadow-2xs"
                      title="Buka Halaman Detail Supplier"
                    >
                      <span>Lihat Detail</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-800 transition-colors"
                        title="Edit Data Supplier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplier(s)}
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 transition-colors"
                        title="Hapus Supplier"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredSuppliers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[6, 10, 20, 50]}
            className="rounded-2xl border border-slate-200 dark:border-slate-800"
          />
        </div>
      )}
    </>
  )}

      {/* ========================================================= */}
      {/* MODAL 1: ADD / EDIT SUPPLIER                              */}
      {/* ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingSupplier ? 'Edit Data Supplier' : 'Tambah Supplier Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Informasi distributor / pabrik material bahan bangunan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Perusahaan / Supplier <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Misal: PT Indocement Tunggal Prakarsa, CV Baja Sakti..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kode Supplier:
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Kosongkan jika auto (SUP-...)"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Kontak Kantor / PIC:
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Misal: Customer Service / Admin"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nomor Telepon Kantor:
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx / 021-xxxx"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Email Resmi:
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@perusahaan.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alamat Lengkap / Gudang:
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Jl. Raya Industri Pergudangan..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kota / Wilayah:
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Jakarta / Sidoarjo"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan / Bahan Material yang Dipasok:
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Misal: Pemasok semen curah & sak, pengiriman minimal 200 sak, tempo 14 hari..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="supplierIsActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                />
                <label htmlFor="supplierIsActive" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Supplier Aktif (Bisa dipilih untuk pemesanan & restok barang)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Supplier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
