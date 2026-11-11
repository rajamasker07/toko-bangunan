import React, { useState, useMemo } from 'react';
import { Supplier, SupplierSales, SalesPhone } from '../types';
import { api } from '../services/api';
import { MasterDataNav, MasterDataTab } from './MasterDataNav';
import { 
  Truck, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Package, 
  CheckCircle2, 
  X, 
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
  Smartphone,
  Star,
  Building2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface SupplierManagementViewProps {
  suppliers: Supplier[];
  categoryCount?: number;
  brandCount?: number;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateTab: (tab: MasterDataTab) => void;
}

const PHONE_LABEL_PRESETS = [
  'WhatsApp',
  'HP Utama',
  'Telepon Kantor',
  'HP Pribadi',
  'Nomor Darurat',
  'Alternatif',
];

export const SupplierManagementView: React.FC<SupplierManagementViewProps> = ({
  suppliers,
  categoryCount = 0,
  brandCount = 0,
  onRefresh,
  showToast,
  onNavigateTab,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [salesFilter, setSalesFilter] = useState<'all' | 'has_sales' | 'no_sales'>('all');

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

  // Sales Modal State
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [editingSales, setEditingSales] = useState<SupplierSales | null>(null);
  const [targetSupplierForSales, setTargetSupplierForSales] = useState<Supplier | null>(null);

  // Sales Form State
  const [salesName, setSalesName] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [salesIsActive, setSalesIsActive] = useState(true);
  const [salesNotes, setSalesNotes] = useState('');
  const [salesPhones, setSalesPhones] = useState<Array<{ number: string; label: string; is_primary: boolean }>>([
    { number: '', label: 'WhatsApp', is_primary: true }
  ]);
  const [isSalesSubmitting, setIsSalesSubmitting] = useState(false);

  // Collapsed sales state per supplier card (key = supplier id)
  const [collapsedSales, setCollapsedSales] = useState<Record<string, boolean>>({});

  const toggleSalesCollapse = (supplierId: string) => {
    setCollapsedSales(prev => ({
      ...prev,
      [supplierId]: !prev[supplierId]
    }));
  };

  // Metrics
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.is_active).length;
  const totalSuppliedProducts = suppliers.reduce((acc, s) => acc + (s.product_count || 0), 0);
  const totalSalesCount = suppliers.reduce((acc, s) => acc + (s.sales?.length || 0), 0);
  const activeSalesCount = suppliers.reduce((acc, s) => acc + (s.sales?.filter(x => x.is_active).length || 0), 0);

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

  // Sales modal handlers
  const openCreateSalesModal = (supplier: Supplier) => {
    setTargetSupplierForSales(supplier);
    setEditingSales(null);
    setSalesName('');
    setSalesEmail('');
    setSalesIsActive(true);
    setSalesNotes('');
    setSalesPhones([
      { number: '', label: 'WhatsApp', is_primary: true }
    ]);
    setIsSalesModalOpen(true);
  };

  const openEditSalesModal = (supplier: Supplier, sales: SupplierSales) => {
    setTargetSupplierForSales(supplier);
    setEditingSales(sales);
    setSalesName(sales.name);
    setSalesEmail(sales.email || '');
    setSalesIsActive(sales.is_active);
    setSalesNotes(sales.notes || '');

    const phones = (sales.phones && sales.phones.length > 0)
      ? sales.phones.map((p, idx) => ({
          number: p.number || '',
          label: p.label || (idx === 0 ? 'WhatsApp' : 'Telepon Kantor'),
          is_primary: Boolean(p.is_primary ?? idx === 0)
        }))
      : [{ number: '', label: 'WhatsApp', is_primary: true }];

    setSalesPhones(phones);
    setIsSalesModalOpen(true);
  };

  const handleAddPhoneRow = () => {
    setSalesPhones(prev => [
      ...prev,
      {
        number: '',
        label: prev.length === 1 ? 'Telepon Kantor' : prev.length === 2 ? 'HP Pribadi' : 'Alternatif',
        is_primary: false
      }
    ]);
  };

  const handleRemovePhoneRow = (index: number) => {
    if (salesPhones.length <= 1) {
      showToast('Setiap sales minimal memiliki 1 nomor telepon', 'info');
      return;
    }
    const filtered = salesPhones.filter((_, i) => i !== index);
    // If we removed the primary phone, make the first one primary
    if (salesPhones[index]?.is_primary && filtered.length > 0) {
      filtered[0].is_primary = true;
    }
    setSalesPhones(filtered);
  };

  const handlePhoneChange = (index: number, field: 'number' | 'label' | 'is_primary', value: any) => {
    setSalesPhones(prev => {
      return prev.map((item, i) => {
        if (field === 'is_primary') {
          // Hanya satu nomor utama
          return {
            ...item,
            is_primary: i === index ? Boolean(value) : false
          };
        }
        if (i === index) {
          return {
            ...item,
            [field]: value
          };
        }
        return item;
      });
    });
  };

  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName.trim()) {
      showToast('Nama sales wajib diisi', 'error');
      return;
    }

    if (!targetSupplierForSales) {
      showToast('Target supplier tidak ditemukan', 'error');
      return;
    }

    // Filter valid phones
    const validPhones: SalesPhone[] = salesPhones
      .map(p => ({
        number: p.number.trim(),
        label: p.label.trim() || 'Utama',
        is_primary: Boolean(p.is_primary)
      }))
      .filter(p => p.number.length > 0);

    if (validPhones.length === 0) {
      showToast('Masukkan minimal satu nomor telepon valid untuk sales', 'error');
      return;
    }

    // Ensure at least one is primary
    if (!validPhones.some(p => p.is_primary)) {
      validPhones[0].is_primary = true;
    }

    try {
      setIsSalesSubmitting(true);
      const payload = {
        name: salesName.trim(),
        email: salesEmail.trim() || null,
        is_active: salesIsActive,
        notes: salesNotes.trim() || null,
        phones: validPhones
      };

      if (editingSales) {
        await api.updateSupplierSales(editingSales.id, payload);
        showToast(`Data sales "${payload.name}" berhasil diperbarui`, 'success');
      } else {
        await api.createSupplierSales(targetSupplierForSales.id, payload);
        showToast(`Sales "${payload.name}" berhasil ditambahkan ke ${targetSupplierForSales.name}`, 'success');
      }

      setIsSalesModalOpen(false);
      onRefresh();
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
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status sales', 'error');
    }
  };

  const handleDeleteSales = async (sales: SupplierSales) => {
    if (!confirm(`Hapus sales "${sales.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      await api.deleteSupplierSales(sales.id);
      showToast(`Sales "${sales.name}" berhasil dihapus`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus sales', 'error');
    }
  };

  /** Format WA link jika nomor valid */
  const getWhatsAppLink = (phoneNum: string) => {
    const clean = phoneNum.replace(/[^0-9]/g, '');
    let formatted = clean;
    if (formatted.startsWith('0')) {
      formatted = '62' + formatted.slice(1);
    }
    return `https://wa.me/${formatted}`;
  };

  return (
    <div className="space-y-6">
      {/* Master Data Sub-Nav Header */}
      <MasterDataNav
        activeTab="suppliers"
        onSelectTab={onNavigateTab}
        categoryCount={categoryCount}
        brandCount={brandCount}
        supplierCount={totalSuppliers}
      />

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-500" />
            <span>Pengelolaan Master Supplier & Tim Sales</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daftar distributor resmi material bangunan lengkap beserta tim sales, nomor kontak berganda & status aktifnya
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Supplier Baru</span>
        </button>
      </div>

      {/* Metrics Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Supplier</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalSuppliers} Supplier</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Supplier Aktif</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{activeSuppliers} Supplier</span>
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
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Produk Disuplai</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalSuppliedProducts} Produk</span>
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
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            Tidak ada supplier yang cocok
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian atau tambahkan supplier baru.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
          >
            <Plus className="w-4 h-4" /> Tambah Supplier Baru
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredSuppliers.map((s) => {
            const isCollapsed = Boolean(collapsedSales[s.id]);
            const salesList = s.sales || [];
            const salesCount = salesList.length;
            const activeSales = salesList.filter(x => x.is_active).length;

            return (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 hover:border-amber-500/40 transition-colors flex flex-col justify-between"
              >
                {/* Top Section */}
                <div className="space-y-3.5">
                  {/* Header Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-slate-900 dark:text-white">
                            {s.name}
                          </h3>
                          {s.code && (
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-semibold">
                              {s.code}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              s.is_active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {s.is_active ? 'Supplier Aktif' : 'Non-Aktif'}
                          </span>
                        </div>

                        {s.city && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                            {s.city}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        title="Edit Data Supplier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplier(s)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Hapus Supplier"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Company Details Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    {s.contact_person && (
                      <div className="flex items-center gap-2 truncate">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">Kantor/PIC: <strong>{s.contact_person}</strong></span>
                      </div>
                    )}

                    {s.phone && (
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <a
                          href={`tel:${s.phone}`}
                          className="hover:text-amber-600 dark:hover:text-amber-400 underline font-mono truncate"
                        >
                          {s.phone}
                        </a>
                        <a
                          href={getWhatsAppLink(s.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px] font-bold shrink-0"
                          title="Chat via WhatsApp Kantor"
                        >
                          WA
                        </a>
                      </div>
                    )}

                    {s.email && (
                      <div className="flex items-center gap-2 truncate col-span-1 sm:col-span-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a
                          href={`mailto:${s.email}`}
                          className="hover:text-amber-600 dark:hover:text-amber-400 underline truncate"
                        >
                          {s.email}
                        </a>
                      </div>
                    )}

                    {s.address && (
                      <div className="flex items-start gap-2 col-span-1 sm:col-span-2 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {s.address}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Notes / Material Scope */}
                  {s.notes && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 px-1">
                      <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="line-clamp-2">{s.notes}</p>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* SALES REPRESENTATIVES SECTION (SETIAP SUPPLIER PUNYA SALES) */}
                  {/* ========================================================= */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Tim Sales Representative
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
                          {salesCount} Sales {salesCount > 0 && `(${activeSales} Aktif)`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openCreateSalesModal(s)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
                          title="Tambah Sales untuk supplier ini"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tambah Sales</span>
                        </button>

                        {salesCount > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleSalesCollapse(s.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={isCollapsed ? 'Tampilkan Daftar Sales' : 'Sembunyikan Daftar Sales'}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sales List Container */}
                    {!isCollapsed && (
                      <div className="space-y-2">
                        {salesList.length === 0 ? (
                          <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-center">
                            <p className="text-[11px] text-slate-400">
                              Belum ada kontak sales perwakilan untuk supplier ini.
                            </p>
                            <button
                              type="button"
                              onClick={() => openCreateSalesModal(s)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              <Plus className="w-3 h-3" /> Tambah kontak sales sekarang
                            </button>
                          </div>
                        ) : (
                          salesList.map((sales) => {
                            const phones = sales.phones || [];
                            return (
                              <div
                                key={sales.id}
                                className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                                  sales.is_active
                                    ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 shadow-xs'
                                    : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
                                }`}
                              >
                                {/* Sales Name & Status Row */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`p-1.5 rounded-lg ${
                                      sales.is_active 
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                                        : 'bg-slate-500/10 text-slate-400'
                                    }`}>
                                      {sales.is_active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                                    </div>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      {sales.name}
                                    </span>

                                    {/* Status Badge */}
                                    <span
                                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                        sales.is_active
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                      }`}
                                    >
                                      {sales.is_active ? 'Sales Aktif' : 'Non-Aktif'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Toggle Active Status Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSalesStatus(sales)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                        sales.is_active
                                          ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                          : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                      }`}
                                      title={sales.is_active ? 'Nonaktifkan sales ini' : 'Aktifkan sales ini'}
                                    >
                                      {sales.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openEditSalesModal(s, sales)}
                                      className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                      title="Edit Sales"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSales(sales)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                      title="Hapus Sales"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Multiple Phone Numbers List */}
                                <div className="space-y-1.5 pt-1">
                                  {phones.length === 0 ? (
                                    <span className="text-[11px] text-slate-400 italic">Belum ada nomor HP tersimpan</span>
                                  ) : (
                                    phones.map((p, pIdx) => {
                                      const isPrimary = p.is_primary;
                                      return (
                                        <div
                                          key={pIdx}
                                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-[11px]"
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                              {p.number}
                                            </span>
                                            {p.label && (
                                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-medium">
                                                {p.label}
                                              </span>
                                            )}
                                            {isPrimary && (
                                              <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                                                <Star className="w-2.5 h-2.5 fill-current" /> Utama
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <a
                                              href={`tel:${p.number}`}
                                              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-600 text-[10px] font-semibold"
                                              title="Telepon Nomor Ini"
                                            >
                                              Panggil
                                            </a>
                                            <a
                                              href={getWhatsAppLink(p.number)}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-bold"
                                              title="Chat WhatsApp"
                                            >
                                              WhatsApp
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>

                                {/* Additional details: Email & Notes */}
                                {(sales.email || sales.notes) && (
                                  <div className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                                    {sales.email && (
                                      <div className="flex items-center gap-1.5 truncate">
                                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                        <a href={`mailto:${sales.email}`} className="hover:underline truncate">
                                          {sales.email}
                                        </a>
                                      </div>
                                    )}
                                    {sales.notes && (
                                      <div className="flex items-start gap-1.5">
                                        <FileText className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                                        <span className="italic">{sales.notes}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Info */}
                <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <Package className="w-3.5 h-3.5 text-amber-500" />
                    {s.product_count || 0} Produk Disuplai
                  </span>
                  <span className="font-mono text-[10px]">
                    ID: {s.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            );
          })}
        </div>
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

      {/* ========================================================= */}
      {/* MODAL 2: ADD / EDIT SALES REPRESENTATIVE                  */}
      {/* ========================================================= */}
      {isSalesModalOpen && targetSupplierForSales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-950/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingSales ? 'Edit Kontak Sales' : 'Tambah Sales Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Untuk Supplier: <strong className="text-slate-700 dark:text-slate-200">{targetSupplierForSales.name}</strong>
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
              {/* Nama Sales */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Sales Representative <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                  placeholder="Misal: Agus Pratama, Rian Hidayat..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                />
              </div>

              {/* Status Sales (Aktif / Nonaktif) */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Status Sales Saat Ini <span className="text-rose-500">*</span>:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSalesIsActive(true)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                      salesIsActive
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${salesIsActive ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold block text-xs">Masih Aktif</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Dapat dihubungi untuk pemesanan</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSalesIsActive(false)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                      !salesIsActive
                        ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-300 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${!salesIsActive ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <UserX className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold block text-xs">Sudah Non-Aktif</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Resign, cuti, atau mutasi cabang</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Dynamic Multiple Phone Numbers */}
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300">
                      Nomor Handphone / Telepon <span className="text-rose-500">*</span>
                    </label>
                    <p className="text-[10px] text-slate-400">
                      Sales dapat memiliki beberapa nomor (WhatsApp, HP Pribadi, Kantor, dll)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPhoneRow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800"
                  >
                    <Plus className="w-3 h-3" /> Tambah No HP Lagi
                  </button>
                </div>

                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {salesPhones.map((phoneRow, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-500 flex items-center gap-1">
                          <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                          Nomor HP #{idx + 1}
                        </span>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-slate-600 dark:text-slate-400">
                            <input
                              type="radio"
                              name="primaryPhoneSelector"
                              checked={phoneRow.is_primary}
                              onChange={() => handlePhoneChange(idx, 'is_primary', true)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Jadikan Nomor Utama</span>
                          </label>

                          {salesPhones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePhoneRow(idx)}
                              className="text-slate-400 hover:text-rose-600 p-0.5"
                              title="Hapus baris nomor ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            value={phoneRow.number}
                            onChange={(e) => handlePhoneChange(idx, 'number', e.target.value)}
                            placeholder="Misal: 0812-3456-7890"
                            required
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs"
                          />
                        </div>

                        <div>
                          <input
                            type="text"
                            list={`preset-labels-${idx}`}
                            value={phoneRow.label}
                            onChange={(e) => handlePhoneChange(idx, 'label', e.target.value)}
                            placeholder="Label (WA / Kantor)"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                          />
                          <datalist id={`preset-labels-${idx}`}>
                            {PHONE_LABEL_PRESETS.map((lbl) => (
                              <option key={lbl} value={lbl} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email & Catatan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Email Sales (Opsional):
                  </label>
                  <input
                    type="email"
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    placeholder="sales.nama@distributor.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Catatan / Wilayah Tugas & Peran:
                  </label>
                  <textarea
                    value={salesNotes}
                    onChange={(e) => setSalesNotes(e.target.value)}
                    rows={2}
                    placeholder="Misal: Penanggung jawab order semen curah & sak area Surabaya Barat..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSalesModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSalesSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSalesSubmitting ? 'Menyimpan...' : 'Simpan Data Sales'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
