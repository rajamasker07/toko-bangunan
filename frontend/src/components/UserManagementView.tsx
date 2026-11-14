import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { AuthUser, UserRole, UsersSummaryMetrics } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Pagination } from './common/Pagination';
import { ROLE_META, ROLE_ORDER, canManageTargetRole, getRoleMeta } from '../utils/rbac';
import { formatDate } from '../utils/format';
import { UserFormModal, UserFormModalMode } from './UserFormModal';
import { RoleManagementPanel } from './RoleManagementPanel';

interface UserManagementViewProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EMPTY_SUMMARY: UsersSummaryMetrics = {
  total: 0,
  active: 0,
  inactive: 0,
  by_role: { owner: 0, admin: 0, gudang: 0, kasir: 0 },
};

export const UserManagementView: React.FC<UserManagementViewProps> = ({ showToast }) => {
  const { user: currentUser, can, roles, refreshRoles } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'users' | 'roles'>('users');
  const canViewRoles = can('roles:manage') || can('users:read');

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [summary, setSummary] = useState<UsersSummaryMetrics>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const activeRoles = useMemo(() => {
    if (roles && roles.length > 0) {
      return roles;
    }
    return ROLE_ORDER.map((code) => ({
      code,
      name: ROLE_META[code]?.label || code,
      short_name: ROLE_META[code]?.shortLabel || code,
      hierarchy_level: 0,
      badge_color: 'slate',
      is_system: true,
      permissions: [],
      id: code,
    }));
  }, [roles]);

  // Filters & pagination
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<UserFormModalMode>('create');
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUsers({
        search: debouncedSearch || undefined,
        role: roleFilter,
        isActive: statusFilter,
        page,
        limit: pageSize,
      });
      setUsers(res.items);
      setTotal(res.total);
      setSummary(res.summary || EMPTY_SUMMARY);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar pengguna.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter, page, pageSize, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openModal = (mode: UserFormModalMode, target: AuthUser | null = null) => {
    setModalMode(mode);
    setSelectedUser(target);
    setModalOpen(true);
  };

  const handleToggleStatus = async (target: AuthUser) => {
    if (
      target.is_active &&
      !confirm(
        `Nonaktifkan akun "${target.full_name}" (@${target.username})? Pengguna akan segera dikeluarkan dari sesi aktif.`
      )
    ) {
      return;
    }

    setBusyUserId(target.id);
    try {
      const updated = await api.toggleUserStatus(target.id);
      showToast(
        `Akun "${updated.full_name}" kini ${updated.is_active ? 'Aktif' : 'Non-Aktif'}.`,
        'success'
      );
      await loadUsers();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengubah status pengguna.',
        'error'
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (target: AuthUser) => {
    if (
      !confirm(
        `Hapus permanen pengguna "${target.full_name}" (@${target.username})?\n\nCatatan: Nama petugas pada riwayat mutasi stok sebelumnya tetap tersimpan.`
      )
    ) {
      return;
    }

    setBusyUserId(target.id);
    try {
      await api.deleteUser(target.id);
      showToast(`Pengguna "${target.full_name}" berhasil dihapus.`, 'success');
      if (users.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await loadUsers();
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus pengguna.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const canManage = can('users:manage');
  const canDelete = can('users:delete');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {activeSubTab === 'roles' ? 'Posisi & Hak Akses (Role)' : 'Manajemen Pengguna & Akses'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {activeSubTab === 'roles'
              ? 'Kelola struktur hierarki jabatan staf toko bangunan dan matriks hak akses per modul.'
              : 'Kelola akun staf toko bangunan, pembagian peran RBAC, dan status keaktifan sesi.'}
          </p>
        </div>

        {activeSubTab === 'users' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => openModal('create', null)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                Tambah Pengguna
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sub-tab Navigation */}
      {canViewRoles && (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
              activeSubTab === 'users'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Daftar Akun Pengguna</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('roles')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
              activeSubTab === 'roles'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Posisi & Hak Akses (Role)</span>
          </button>
        </div>
      )}

      {activeSubTab === 'roles' ? (
        <RoleManagementPanel
          showToast={showToast}
          onRolesChanged={() => {
            loadUsers();
            refreshRoles();
          }}
        />
      ) : (
        <>
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Pengguna</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {summary.total}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Akun Aktif</p>
                <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  {summary.active}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Akun Non-Aktif</p>
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                  {summary.inactive}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                <UserX className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Distribusi Peran</p>
                <Shield className="w-4 h-4 text-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] max-h-24 overflow-y-auto pr-0.5">
                {activeRoles.map((r) => {
                  const meta = getRoleMeta(r.code, roles);
                  return (
                    <div
                      key={r.code}
                      className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70"
                    >
                      <span className="font-semibold text-slate-600 dark:text-slate-300 truncate pr-1">
                        {meta.shortLabel}
                      </span>
                      <span className="font-extrabold text-slate-900 dark:text-white tabular-nums shrink-0">
                        {summary.by_role?.[r.code] ?? 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filters & Table Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Cari nama, username, atau email..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="all">Semua Peran</option>
                  {activeRoles.map((r) => {
                    const meta = getRoleMeta(r.code, roles);
                    return (
                      <option key={r.code} value={r.code}>
                        {meta.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Status Segmented Pills */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/70 self-start lg:self-auto">
                {(
                  [
                    { key: 'all', label: 'Semua' },
                    { key: 'true', label: 'Aktif' },
                    { key: 'false', label: 'Non-Aktif' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.key);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFilter === opt.key
                        ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5">Pengguna</th>
                <th className="px-4 py-3.5">Peran</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Login Terakhir</th>
                <th className="px-4 py-3.5">Dibuat</th>
                {canManage && <th className="px-5 py-3.5 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
              {loading && users.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    Memuat daftar pengguna...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-6 py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    Tidak ada pengguna yang cocok dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const roleMeta = getRoleMeta(u.role, roles);
                  const canManageTarget =
                    canManage && canManageTargetRole(currentUser?.role, u.role, roles);
                  const isBusy = busyUserId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {u.full_name.trim().slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white truncate">
                                {u.full_name}
                              </span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-extrabold">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              @{u.username}
                              {u.email ? ` • ${u.email}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${roleMeta.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${roleMeta.dotClass}`} />
                            {roleMeta.shortLabel}
                          </span>
                          {u.must_change_password && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60">
                              Wajib Ganti Sandi
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            u.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.is_active ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {u.is_active ? 'Aktif' : 'Non-Aktif'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {u.last_login_at ? formatDate(u.last_login_at) : 'Belum pernah login'}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(u.created_at)}
                      </td>

                      {canManage && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Quick Status Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSelf || !canManageTarget || isBusy}
                              title={
                                isSelf
                                  ? 'Tidak dapat menonaktifkan akun sendiri'
                                  : !canManageTarget
                                    ? 'Hanya Owner yang dapat mengelola akun ini'
                                    : u.is_active
                                      ? 'Nonaktifkan Akun'
                                      : 'Aktifkan Akun'
                              }
                              className={`p-2 rounded-lg border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                                u.is_active
                                  ? 'border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Power className="w-4 h-4" />
                            </button>

                            {/* Edit User */}
                            <button
                              type="button"
                              onClick={() => openModal('edit', u)}
                              disabled={!canManageTarget || isBusy}
                              title={
                                !canManageTarget
                                  ? 'Hanya Owner yang dapat mengedit akun ini'
                                  : 'Edit Profil & Peran'
                              }
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() => openModal('reset-password', u)}
                              disabled={isSelf || !canManageTarget || isBusy}
                              title={
                                isSelf
                                  ? 'Gunakan menu Profil Saya di pojok kanan atas untuk mengganti sandi sendiri'
                                  : !canManageTarget
                                    ? 'Hanya Owner yang dapat mereset sandi akun ini'
                                    : 'Reset Kata Sandi'
                              }
                              className="p-2 rounded-lg border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            {/* Owner-only Hard Delete */}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                disabled={isSelf || isBusy}
                                title={
                                  isSelf
                                    ? 'Tidak dapat menghapus akun sendiri'
                                    : 'Hapus Pengguna'
                                }
                                className="p-2 rounded-lg border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
      </div>
      </>
      )}

      {/* Add / Edit / Reset Password Modal */}
      <UserFormModal
        isOpen={modalOpen}
        mode={modalMode}
        targetUser={selectedUser}
        onClose={() => setModalOpen(false)}
        onSuccess={loadUsers}
        showToast={showToast}
      />
    </div>
  );
};
