import React, { useState, useEffect, useCallback } from 'react';
import {
  PriceOverviewAnalytics,
  PriceHistoryEntry,
  MarginAlertItem,
  VariantUnit,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  SlidersHorizontal,
  DollarSign,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Settings,
  Sparkles,
  Activity,
} from 'lucide-react';
import { formatIdNumber } from './common/NumericInput';
import { Pagination } from './common/Pagination';
import { BulkPriceUpdateModal } from './BulkPriceUpdateModal';
import { EditUnitModal } from './EditUnitModal';

export const PriceAnalyticsView: React.FC = () => {
  const { can, user } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');
  const canConfigureThreshold = can('pricing:threshold');
  const canWritePricing = can('pricing:write');

  // Sub-tab selection: 'overview' | 'history' | 'bulk'
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'bulk'>('overview');

  // Overview data state
  const [overview, setOverview] = useState<PriceOverviewAnalytics | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [marginAlertSearch, setMarginAlertSearch] = useState<string>('');
  const [marginAlertFilter, setMarginAlertFilter] = useState<'all' | 'loss' | 'critical'>('all');

  // Threshold edit state
  const [isEditingThreshold, setIsEditingThreshold] = useState<boolean>(false);
  const [thresholdInput, setThresholdInput] = useState<number>(10);
  const [isSavingThreshold, setIsSavingThreshold] = useState<boolean>(false);

  // History list state
  const [historyEntries, setHistoryEntries] = useState<PriceHistoryEntry[]>([]);
  const [totalHistory, setTotalHistory] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(20);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // History filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modals state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [editingUnit, setEditingUnit] = useState<VariantUnit | null>(null);
  const [editingVariantName, setEditingVariantName] = useState<string>('');
  const [isEditUnitOpen, setIsEditUnitOpen] = useState<boolean>(false);

  // Toast feedback
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(
    null
  );

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch Overview Data
  const loadOverview = useCallback(async () => {
    try {
      setLoadingOverview(true);
      const data = await api.getPriceOverviewAnalytics();
      setOverview(data);
      setThresholdInput(data.margin_threshold);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat analitik harga', 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  // Fetch History Data
  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getPriceHistory({
        search: searchQuery.trim() || undefined,
        direction: directionFilter || undefined,
        source: sourceFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: historyPageSize,
        offset: (historyPage - 1) * historyPageSize,
      });
      setHistoryEntries(res.entries);
      setTotalHistory(res.total);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat riwayat harga', 'error');
    } finally {
      setLoadingHistory(false);
    }
  }, [
    searchQuery,
    directionFilter,
    sourceFilter,
    startDate,
    endDate,
    historyPage,
    historyPageSize,
    showToast,
  ]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const handleSaveThreshold = async () => {
    if (thresholdInput < 0 || thresholdInput > 100) {
      showToast('Ambang batas harus di antara 0% dan 100%', 'error');
      return;
    }

    try {
      setIsSavingThreshold(true);
      await api.updateMarginThreshold(thresholdInput);
      showToast(`Ambang batas margin berhasil diubah menjadi ${thresholdInput}%`, 'success');
      setIsEditingThreshold(false);
      loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan ambang batas margin', 'error');
    } finally {
      setIsSavingThreshold(false);
    }
  };

  const openEditPriceFromAlert = (alert: MarginAlertItem) => {
    // Construct dummy unit for EditUnitModal
    const unitObj: VariantUnit = {
      id: '',
      unit_name: alert.unit_name,
      conversion_factor: 1,
      is_base_unit: true,
      buy_price: alert.buy_price,
      sell_price: alert.sell_price,
      wholesale_price: null,
    };
    setEditingUnit(unitObj);
    setEditingVariantName(`${alert.product_name} - ${alert.variant_name}`);
    setIsEditUnitOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-800 text-white border-slate-700'
          }`}
        >
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header View */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Analitik & Histori Perubahan Harga
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pantau fluktuasi harga modal, harga jual, margin keuntungan toko, dan audit perubahan harga lengkap.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'overview') loadOverview();
              else if (activeTab === 'history') loadHistory();
            }}
            disabled={loadingOverview || loadingHistory}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingOverview || loadingHistory ? 'animate-spin text-emerald-500' : ''}`} />
          </button>

          {canWritePricing && (
            <button
              type="button"
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:scale-95 transition-all shadow-md shadow-amber-600/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Update Harga Massal</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Alert Margin & Tren Pasar</span>
          {overview && overview.summary.critical_margin_count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white">
              {overview.summary.critical_margin_count}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Perubahan Global (Audit)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'bulk'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Panduan Update Massal</span>
        </button>
      </div>

      {/* SUB-TAB 1: Overview, Margin Alerts & Inflation */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loadingOverview ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
              <span>Memuat data analitik harga dan margin...</span>
            </div>
          ) : overview ? (
            <>
              {/* Margin Threshold Configuration Banner */}
              <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent border border-amber-300/60 dark:border-amber-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Ambang Batas Peringatan Gross Margin:</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 font-extrabold">
                        {overview.margin_threshold}%
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Produk dengan Gross Margin di bawah {overview.margin_threshold}% ditandai sebagai margin tipis (kritis).
                      Margin di bawah 0% adalah penjualan rugi.
                    </p>
                  </div>
                </div>

                {canConfigureThreshold && (
                  <div>
                    {isEditingThreshold ? (
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={thresholdInput}
                          onChange={(e) => setThresholdInput(Number(e.target.value))}
                          className="w-16 px-2 py-1 text-xs font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <span className="text-xs font-bold text-slate-400">%</span>
                        <button
                          type="button"
                          onClick={handleSaveThreshold}
                          disabled={isSavingThreshold}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isSavingThreshold ? '...' : 'Simpan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingThreshold(false);
                            setThresholdInput(overview.margin_threshold);
                          }}
                          className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingThreshold(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Ubah Ambang Batas</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Perubahan Harga (30 Hari)
                    </span>
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                    {overview.summary.total_price_changes_30d} <span className="text-xs font-semibold text-slate-400">Kali</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] mt-2 text-slate-500">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
                      <TrendingUp className="w-3 h-3 mr-0.5" />
                      {overview.summary.price_increases_30d} Naik
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-md">
                      <TrendingDown className="w-3 h-3 mr-0.5" />
                      {overview.summary.price_decreases_30d} Turun
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Margin Kritis (&lt; {overview.margin_threshold}%)
                    </span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
                    {overview.summary.critical_margin_count} <span className="text-xs font-semibold text-slate-400">Varian</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-2 block">
                    Memerlukan evaluasi harga jual
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Jual Rugi (Margin ≤ 0%)
                    </span>
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
                    {overview.summary.loss_making_count} <span className="text-xs font-semibold text-slate-400">Varian</span>
                  </div>
                  <span className="text-[11px] text-rose-500 mt-2 block font-semibold">
                    Harga jual di bawah modal!
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Total Alert Margin
                    </span>
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <Layers className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                    {overview.margin_alerts.length} <span className="text-xs font-semibold text-slate-400">Kasus</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-2 block">
                    Perlu perhatian segera
                  </span>
                </div>
              </div>

              {/* Section: Margin Alerts Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Daftar Peringatan Margin Rendah / Rugi
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {overview.margin_alerts.length} produk terdeteksi di bawah ambang batas {overview.margin_threshold}%
                      </p>
                    </div>
                  </div>

                  {overview.margin_alerts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search Alert */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={marginAlertSearch}
                          onChange={(e) => setMarginAlertSearch(e.target.value)}
                          placeholder="Cari produk, SKU, supplier..."
                          className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-52"
                        />
                      </div>

                      {/* Filter Pills */}
                      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        {[
                          { key: 'all', label: 'Semua' },
                          { key: 'loss', label: 'Jual Rugi' },
                          { key: 'critical', label: 'Kritis' },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setMarginAlertFilter(tab.key as any)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                              marginAlertFilter === tab.key
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {overview.margin_alerts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Seluruh produk memiliki Gross Margin di atas ambang batas aman ({overview.margin_threshold}%).
                    </p>
                  </div>
                ) : (() => {
                  const q = marginAlertSearch.trim().toLowerCase();
                  const filteredAlerts = overview.margin_alerts.filter((item) => {
                    const m = item.gross_margin ?? item.gross_margin_pct;
                    const isLoss =
                      item.status === 'LOSS' ||
                      item.alert_level === 'CRITICAL' ||
                      (typeof m === 'number' && m <= 0);
                    if (marginAlertFilter === 'loss' && !isLoss) return false;
                    if (marginAlertFilter === 'critical' && isLoss) return false;
                    if (!q) return true;
                    return (
                      item.product_name.toLowerCase().includes(q) ||
                      item.variant_name.toLowerCase().includes(q) ||
                      item.sku.toLowerCase().includes(q) ||
                      (item.category_name || '').toLowerCase().includes(q) ||
                      (item.supplier_name || '').toLowerCase().includes(q)
                    );
                  });

                  if (filteredAlerts.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        Tidak ada data peringatan margin yang cocok dengan filter pencarian.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto max-h-[420px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/90 text-[11px] text-slate-600 dark:text-slate-300 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-3">Produk & Varian</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3">Satuan</th>
                            {canViewBuyPrice && <th className="p-3">Modal</th>}
                            <th className="p-3">Jual</th>
                            <th className="p-3">Gross Margin</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Kategori / Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredAlerts.map((item, idx) => {
                            const m = item.gross_margin ?? item.gross_margin_pct;
                            const isLoss =
                              item.status === 'LOSS' ||
                              item.alert_level === 'CRITICAL' ||
                              (typeof m === 'number' && m <= 0);
                            const barPct = typeof m === 'number' ? Math.max(0, Math.min(100, m)) : 0;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-3">
                                  <span className="font-bold text-slate-900 dark:text-white block">
                                    {item.product_name}
                                  </span>
                                  <span className="text-[10px] text-slate-400">{item.variant_name}</span>
                                </td>
                                <td className="p-3 font-mono text-[11px] text-slate-500">{item.sku}</td>
                                <td className="p-3 font-semibold">{item.unit_name}</td>
                                {canViewBuyPrice && (
                                  <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                                    Rp {formatIdNumber(item.buy_price, false)}
                                  </td>
                                )}
                                <td className="p-3 font-bold font-mono text-slate-900 dark:text-white">
                                  Rp {formatIdNumber(item.sell_price, false)}
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-col gap-1 min-w-[84px]">
                                    <span
                                      className={`font-black text-xs ${
                                        isLoss
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {typeof m === 'number' ? `${m.toFixed(1).replace('.', ',')}%` : '-'}
                                    </span>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${isLoss ? 'bg-rose-500' : 'bg-amber-500'}`}
                                        style={{ width: `${isLoss ? 100 : barPct}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3">
                                  {isLoss ? (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                      Jual Rugi
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                                      Kritis (&lt;{overview.margin_threshold}%)
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-[11px] text-slate-500">
                                  <div className="font-medium text-slate-700 dark:text-slate-300">{item.category_name || '-'}</div>
                                  <div className="text-[10px] text-slate-400">{item.supplier_name || '-'}</div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Section: Top Price Increases & Inflation Trends */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Increases */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      10 Kenaikan Harga Jual Terbesar (30 Hari)
                    </h3>
                  </div>

                  {overview.top_increases.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">Belum ada kenaikan harga tercatat.</p>
                  ) : (
                    <div className="space-y-2">
                      {overview.top_increases.map((inc, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {inc.product_name} - {inc.variant_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Satuan: {inc.unit_name} •{' '}
                              {new Date(inc.created_at).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                              +{(() => {
                                const p = inc.sell_price_percent_change ?? inc.sell_price_change_pct ?? 0;
                                return typeof p === 'number' ? p.toFixed(1).replace('.', ',') : p;
                              })()}%
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Rp {formatIdNumber(inc.old_sell_price, false)} →{' '}
                              {formatIdNumber(inc.new_sell_price, false)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inflation By Supplier & Category */}
                <div className="space-y-6">
                  {/* Supplier Inflation */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <DollarSign className="w-4 h-4 text-amber-500" />
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        Tren Kenaikan Harga Modal per Supplier
                      </h3>
                    </div>

                    {overview.supplier_inflation.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">Belum ada data kenaikan supplier.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {overview.supplier_inflation.map((s, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {s.supplier_name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-400">{s.change_count}x penyesuaian</span>
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                Rata-rata +{(() => {
                                  const p = s.avg_buy_percent_change ?? s.avg_increase_pct ?? 0;
                                  return typeof p === 'number' ? p.toFixed(1).replace('.', ',') : p;
                                })()}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category Inflation */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        Tren Fluktuasi Harga per Kategori
                      </h3>
                    </div>

                    {overview.category_inflation.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">Belum ada data fluktuasi kategori.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {overview.category_inflation.map((c, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {c.category_name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-400">{c.change_count}x perubahan</span>
                              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                Rata-rata +{(() => {
                                  const p = c.avg_sell_percent_change ?? c.avg_sell_increase_pct ?? 0;
                                  return typeof p === 'number' ? p.toFixed(1).replace('.', ',') : p;
                                })()}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* SUB-TAB 2: Global Price History Table (Audit Log) */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari produk / varian / SKU..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Direction */}
              <div>
                <select
                  value={directionFilter}
                  onChange={(e) => {
                    setDirectionFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">-- Arah: Semua --</option>
                  <option value="UP">Naik (+)</option>
                  <option value="DOWN">Turun (-)</option>
                  <option value="UNCHANGED">Tetap</option>
                </select>
              </div>

              {/* Source */}
              <div>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">-- Sumber: Semua --</option>
                  <option value="MANUAL_EDIT">Edit Manual Satuan</option>
                  <option value="PURCHASE_RESTOCK">Restock / Pembelian</option>
                  <option value="BULK_UPDATE">Update Massal</option>
                  <option value="EXCEL_IMPORT">Import File Excel</option>
                  <option value="INITIAL_PRICE">Harga Awal</option>
                </select>
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-900 dark:text-white"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-1/2 px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Log Histori Perubahan Harga ({totalHistory} entri)
              </h3>
            </div>

            {loadingHistory ? (
              <div className="p-12 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                <span>Memuat riwayat perubahan harga...</span>
              </div>
            ) : historyEntries.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Tidak ditemukan riwayat harga yang cocok dengan filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="p-3">Waktu</th>
                      <th className="p-3">Produk & Varian</th>
                      <th className="p-3">Satuan</th>
                      <th className="p-3">Harga Jual</th>
                      {canViewBuyPrice && <th className="p-3">Harga Modal</th>}
                      {canViewBuyPrice && <th className="p-3">Gross Margin</th>}
                      <th className="p-3">Alasan / Referensi</th>
                      <th className="p-3">Sumber & Pengubah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historyEntries.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 whitespace-nowrap text-[11px] text-slate-500">
                          <div>
                            {new Date(row.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        <td className="p-3">
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {row.product_name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {row.variant_name} {row.sku ? `• ${row.sku}` : ''}
                          </span>
                        </td>

                        <td className="p-3 font-semibold">{row.unit_name}</td>

                        <td className="p-3 font-mono">
                          <div className="flex items-center gap-1">
                            {row.old_sell_price ? (
                              <span className="line-through text-slate-400 text-[11px]">
                                {formatIdNumber(row.old_sell_price, false)}
                              </span>
                            ) : null}
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatIdNumber(row.new_sell_price, false)}
                            </span>
                          </div>
                          {row.sell_price_diff !== 0 && (
                            <div className="text-[10px]">
                              {(() => {
                                const p = row.sell_price_percent_change ?? (row as any).sell_price_change_pct ?? 0;
                                const pStr = typeof p === 'number' ? p.toFixed(1).replace('.', ',') : p;
                                return row.sell_price_diff > 0 ? (
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    +{formatIdNumber(row.sell_price_diff, false)} (+{pStr}%)
                                  </span>
                                ) : (
                                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                                    -{formatIdNumber(Math.abs(row.sell_price_diff), false)} ({pStr}%)
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </td>

                        {canViewBuyPrice && (
                          <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                            {row.new_buy_price !== null ? (
                              <div>
                                <div className="flex items-center gap-1">
                                  {row.old_buy_price !== null && (
                                    <span className="line-through text-slate-400 text-[11px]">
                                      {formatIdNumber(row.old_buy_price, false)}
                                    </span>
                                  )}
                                  <span className="font-semibold">
                                    {formatIdNumber(row.new_buy_price, false)}
                                  </span>
                                </div>
                                {row.buy_price_diff !== null && row.buy_price_diff !== 0 && (
                                  <div className="text-[10px]">
                                    {row.buy_price_diff > 0 ? (
                                      <span className="text-rose-600 dark:text-rose-400">
                                        +{formatIdNumber(row.buy_price_diff, false)}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        -{formatIdNumber(Math.abs(row.buy_price_diff), false)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        )}

                        {canViewBuyPrice && (
                          <td className="p-3">
                            {typeof row.gross_margin_after === 'number' ? (
                              <div className="flex items-center gap-1">
                                {typeof row.gross_margin_before === 'number' && (
                                  <span className="text-slate-400 text-[10px]">
                                    {row.gross_margin_before.toFixed(1).replace('.', ',')}% →
                                  </span>
                                )}
                                <span
                                  className={`font-black ${
                                    row.gross_margin_after <= 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {row.gross_margin_after.toFixed(1).replace('.', ',')}%
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        )}

                        <td className="p-3">
                          <div className="text-slate-800 dark:text-slate-200">
                            {row.reason || '-'}
                          </div>
                          {row.reference_no && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono block">
                              Ref: {row.reference_no}
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 inline-block mb-0.5">
                            {row.change_source}
                          </span>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Oleh: <span className="font-semibold text-slate-700 dark:text-slate-200">{row.created_by || row.created_by_fullname || row.created_by_username || 'Sistem'}</span>
                          </div>
                          {row.created_by_role && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-mono inline-block">
                              {row.created_by_role}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalHistory > historyPageSize && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                <Pagination
                  currentPage={historyPage}
                  totalItems={totalHistory}
                  pageSize={historyPageSize}
                  onPageChange={setHistoryPage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Bulk Price Update Guide & Shortcut */}
      {activeTab === 'bulk' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-amber-500 text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Panduan & Fitur Update Harga Massal (Bulk Pricing)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fitur ini dirancang khusus untuk mempercepat penyesuaian harga seluruh katalog toko saat terjadi inflasi,
                kenaikan harga dari pabrik semen/besi/cat, atau program diskon musiman.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 font-bold flex items-center justify-center">
                1
              </div>
              <strong className="text-slate-900 dark:text-white block font-bold">
                Tentukan Ruang Lingkup
              </strong>
              <p className="text-slate-500">
                Pilih apakah penyesuaian berlaku untuk 1 Kategori tertentu (misal: Semen), 1 Merek/Brand, 1 Supplier, atau seluruh katalog.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center">
                2
              </div>
              <strong className="text-slate-900 dark:text-white block font-bold">
                Simulasi Dampak & Margin
              </strong>
              <p className="text-slate-500">
                Sistem akan menghitung dampak kenaikan terhadap rata-rata margin kotor dan mendeteksi apakah ada produk yang berpotensi jual rugi.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 font-bold flex items-center justify-center">
                3
              </div>
              <strong className="text-slate-900 dark:text-white block font-bold">
                Audit Trail Terjamin
              </strong>
              <p className="text-slate-500">
                Setiap satuan yang berubah harga akan tercatat di log audit lengkap dengan alasan, user yang mengubah, dan tautan batch.
              </p>
            </div>
          </div>

          {canWritePricing ? (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-600/20 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Buka Formulir Update Harga Massal</span>
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
              * Anda memerlukan hak akses <code>pricing:write</code> untuk menjalankan update harga massal.
            </div>
          )}
        </div>
      )}

      {/* Bulk Price Update Modal */}
      <BulkPriceUpdateModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          loadOverview();
          if (activeTab === 'history') loadHistory();
        }}
        showToast={showToast}
      />

      {/* Edit Unit Modal (Quick Edit from Alert) */}
      <EditUnitModal
        isOpen={isEditUnitOpen}
        onClose={() => {
          setIsEditUnitOpen(false);
          setEditingUnit(null);
        }}
        unit={editingUnit}
        variantName={editingVariantName}
        onSuccess={() => {
          loadOverview();
          if (activeTab === 'history') loadHistory();
        }}
        showToast={showToast}
      />
    </div>
  );
};
