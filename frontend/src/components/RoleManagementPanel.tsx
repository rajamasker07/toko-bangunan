import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCheck,
  CheckSquare,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Permission, RoleDefinition } from '../types';
import { BADGE_COLOR_STYLES, BadgeColor, getRoleMeta } from '../utils/rbac';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface RoleManagementPanelProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onRolesChanged?: () => void;
}

interface PermissionItem {
  code: Permission;
  label: string;
  description: string;
}

interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: PermissionItem[];
}

const PERMISSION_MODULES: ModuleDefinition[] = [
  {
    id: 'dashboard',
    name: 'Dashboard & Ringkasan',
    description: 'Akses statistik penjualan, mutasi, dan performa toko',
    permissions: [
      {
        code: 'dashboard:read',
        label: 'Lihat Dashboard',
        description: 'Melihat ringkasan metrik produk, stok kritis, dan aktivitas terkini',
      },
    ],
  },
  {
    id: 'products',
    name: 'Katalog & Produk',
    description: 'Manajemen master produk, varian, satuan konversi, dan harga',
    permissions: [
      {
        code: 'products:read',
        label: 'Lihat Daftar Produk',
        description: 'Melihat katalog produk, daftar varian, dan harga jual umum',
      },
      {
        code: 'products:create',
        label: 'Tambah Produk Baru',
        description: 'Membuat produk baru, varian bertingkat, dan barcode',
      },
      {
        code: 'products:update',
        label: 'Ubah Data Produk',
        description: 'Memperbarui nama, deskripsi, kategori, brand, dan varian',
      },
      {
        code: 'products:delete',
        label: 'Hapus Produk',
        description: 'Menghapus permanen atau menonaktifkan produk beserta variannya',
      },
      {
        code: 'products:view_buy_price',
        label: 'Lihat Harga Beli (Modal)',
        description: 'Melihat rincian harga beli/pokok per varian produk',
      },
      {
        code: 'pricing:write',
        label: 'Kelola Harga Jual & Grosir',
        description: 'Mengubah harga jual eceran dan tier diskon grosir per satuan',
      },
    ],
  },
  {
    id: 'stock',
    name: 'Manajemen Stok & Opname',
    description: 'Pencatatan mutasi fisik, kartu stok, dan penyesuaian opname',
    permissions: [
      {
        code: 'stock:read',
        label: 'Lihat Stok & Mutasi',
        description: 'Melihat saldo stok fisik, stok tersedia, dan kartu mutasi per barang',
      },
      {
        code: 'stock:adjust',
        label: 'Penyesuaian & Opname Stok',
        description: 'Melakukan penyesuaian masuk/keluar serta opname koreksi stok',
      },
    ],
  },
  {
    id: 'reservations',
    name: 'Titip Simpan Stok (Reservasi)',
    description: 'Pemesanan bayar lunas dengan titip simpan barang untuk diambil bertahap',
    permissions: [
      {
        code: 'reservations:read',
        label: 'Lihat Nota Titip Simpan',
        description: 'Melihat seluruh daftar reservasi titipan, tenggat waktu, dan status pengambilan',
      },
      {
        code: 'reservations:create',
        label: 'Buat Titip Simpan Baru',
        description: 'Membuat nota titipan baru dan menahan alokasi stok variant',
      },
      {
        code: 'reservations:pickup',
        label: 'Serah Terima & Perpanjang Tenggat',
        description: 'Mencatat penyerahan barang titipan ke pelanggan dan perpanjang tenggat waktu',
      },
      {
        code: 'reservations:cancel',
        label: 'Selesai Sebagian & Batalkan Titip',
        description: 'Menutup nota dengan penyelesaian refund/tukar dan membatalkan pesanan',
      },
    ],
  },
  {
    id: 'master',
    name: 'Master Data & Supplier',
    description: 'Pengelolaan kategori barang, satuan ukuran, dan data pemasok toko',
    permissions: [
      {
        code: 'master:read',
        label: 'Lihat Kategori & Satuan',
        description: 'Melihat daftar kategori pohon (hirarkis) dan master satuan unit',
      },
      {
        code: 'suppliers:read',
        label: 'Lihat Supplier & Kontak Sales',
        description: 'Melihat profil pemasok dan daftar kontak sales per supplier',
      },
      {
        code: 'master:write',
        label: 'Tambah/Ubah Master & Supplier',
        description: 'Menambah atau memperbarui kategori, satuan, dan data supplier/sales',
      },
      {
        code: 'master:delete',
        label: 'Hapus Master Data & Supplier',
        description: 'Menghapus kategori kosong, satuan non-aktif, atau data supplier',
      },
    ],
  },
  {
    id: 'users',
    name: 'Pengguna & Posisi (RBAC)',
    description: 'Manajemen akun login staf, pembagian wewenang, dan matriks hak akses',
    permissions: [
      {
        code: 'users:read',
        label: 'Lihat Daftar Pengguna',
        description: 'Melihat daftar akun staf toko, peran, dan riwayat login',
      },
      {
        code: 'users:manage',
        label: 'Kelola Akun Pengguna',
        description: 'Membuat akun staf baru, mengubah profil, status aktif, dan reset sandi',
      },
      {
        code: 'users:delete',
        label: 'Hapus Akun Pengguna',
        description: 'Menghapus akun staf secara permanen dari basis data',
      },
      {
        code: 'roles:manage',
        label: 'Kelola Posisi & Hak Akses',
        description: 'Membuat posisi kustom, mengubah izin role, dan mengonfigurasi RBAC',
      },
    ],
  },
];

const AVAILABLE_COLORS: { key: BadgeColor; label: string; previewClass: string }[] = [
  { key: 'purple', label: 'Ungu', previewClass: 'bg-purple-500' },
  { key: 'blue', label: 'Biru', previewClass: 'bg-blue-500' },
  { key: 'amber', label: 'Amber', previewClass: 'bg-amber-500' },
  { key: 'emerald', label: 'Hijau Zamrud', previewClass: 'bg-emerald-500' },
  { key: 'rose', label: 'Merah Mawar', previewClass: 'bg-rose-500' },
  { key: 'indigo', label: 'Indigo', previewClass: 'bg-indigo-500' },
  { key: 'cyan', label: 'Cyan', previewClass: 'bg-cyan-500' },
  { key: 'slate', label: 'Abu-Abu', previewClass: 'bg-slate-500' },
];

export const RoleManagementPanel: React.FC<RoleManagementPanelProps> = ({
  showToast,
  onRolesChanged,
}) => {
  const { can, refreshRoles } = useAuth();
  const canManageRoles = can('roles:manage');

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>('owner');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Editable permission state for selected role
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>([]);
  const [savingPermissions, setSavingPermissions] = useState<boolean>(false);
  const [deletingRole, setDeletingRole] = useState<boolean>(false);

  // Modal Create Role state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [newRoleCode, setNewRoleCode] = useState<string>('');
  const [newRoleShortName, setNewRoleShortName] = useState<string>('');
  const [newRoleDescription, setNewRoleDescription] = useState<string>('');
  const [newRoleColor, setNewRoleColor] = useState<BadgeColor>('indigo');
  const [newRoleHierarchy, setNewRoleHierarchy] = useState<number>(40);
  const [newRolePermissions, setNewRolePermissions] = useState<Permission[]>([]);
  const [creatingRole, setCreatingRole] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch roles list
  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRoles();
      setRoles(data || []);
      if (data && data.length > 0) {
        setSelectedRoleCode((prev) => {
          const exists = data.some((r) => r.code === prev);
          return exists ? prev : data[0].code;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar role posisi.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Selected role object
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.code === selectedRoleCode) || null;
  }, [roles, selectedRoleCode]);

  // Sync permissions when selected role changes
  useEffect(() => {
    if (selectedRole) {
      setEditingPermissions([...(selectedRole.permissions || [])]);
    }
  }, [selectedRole]);

  // Check if permissions have unsaved changes
  const hasChanges = useMemo(() => {
    if (!selectedRole) return false;
    const currentSet = new Set(selectedRole.permissions || []);
    const editSet = new Set(editingPermissions);
    if (currentSet.size !== editSet.size) return true;
    for (const p of editSet) {
      if (!currentSet.has(p)) return true;
    }
    return false;
  }, [selectedRole, editingPermissions]);

  // Auto-generate code from name for create modal
  const handleNameChange = (name: string) => {
    setNewRoleName(name);
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    setNewRoleCode(slug);
    if (!newRoleShortName || newRoleShortName.length <= 4) {
      const words = name.trim().split(/\s+/);
      const acronym = words.map((w) => w[0]?.toUpperCase()).join('').slice(0, 5);
      setNewRoleShortName(acronym || name.slice(0, 5).toUpperCase());
    }
  };

  // Toggle single permission for current selected role
  const handleTogglePermission = (permCode: Permission) => {
    if (!canManageRoles || selectedRole?.code === 'owner') return;

    setEditingPermissions((prev) => {
      if (prev.includes(permCode)) {
        return prev.filter((p) => p !== permCode);
      } else {
        return [...prev, permCode];
      }
    });
  };

  // Select all permissions in a module
  const handleSelectAllModule = (moduleDef: ModuleDefinition) => {
    if (!canManageRoles || selectedRole?.code === 'owner') return;

    const modulePermCodes = moduleDef.permissions.map((p) => p.code);
    setEditingPermissions((prev) => {
      const combined = new Set([...prev, ...modulePermCodes]);
      return Array.from(combined);
    });
  };

  // Deselect all permissions in a module
  const handleDeselectAllModule = (moduleDef: ModuleDefinition) => {
    if (!canManageRoles || selectedRole?.code === 'owner') return;

    const modulePermCodes = new Set(moduleDef.permissions.map((p) => p.code));
    setEditingPermissions((prev) => prev.filter((p) => !modulePermCodes.has(p)));
  };

  // Save updated permissions for selected role
  const handleSavePermissions = async () => {
    if (!selectedRole || !canManageRoles || selectedRole.code === 'owner') return;

    setSavingPermissions(true);
    try {
      const updated = await api.updateRole(selectedRole.code, {
        permissions: editingPermissions,
      });
      showToast(`Hak akses untuk posisi "${updated.name}" berhasil diperbarui.`, 'success');

      // Update local state
      setRoles((prev) =>
        prev.map((r) => (r.code === updated.code ? { ...r, permissions: updated.permissions } : r))
      );
      await refreshRoles();
      if (onRolesChanged) onRolesChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan perubahan hak akses.';
      showToast(msg, 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Delete custom role
  const handleDeleteRole = async () => {
    if (!selectedRole || !canManageRoles) return;
    if (selectedRole.is_system) {
      showToast('Posisi sistem tidak dapat dihapus.', 'error');
      return;
    }
    if ((selectedRole.user_count ?? 0) > 0) {
      showToast(
        `Tidak dapat menghapus posisi "${selectedRole.name}" karena masih digunakan oleh ${selectedRole.user_count} pengguna.`,
        'error'
      );
      return;
    }

    if (
      !confirm(
        `Hapus permanen posisi "${selectedRole.name}" (${selectedRole.code})?\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return;
    }

    setDeletingRole(true);
    try {
      await api.deleteRole(selectedRole.code);
      showToast(`Posisi "${selectedRole.name}" berhasil dihapus.`, 'success');
      const updatedRoles = roles.filter((r) => r.code !== selectedRole.code);
      setRoles(updatedRoles);
      if (updatedRoles.length > 0) {
        setSelectedRoleCode(updatedRoles[0].code);
      }
      await refreshRoles();
      if (onRolesChanged) onRolesChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus posisi.';
      showToast(msg, 'error');
    } finally {
      setDeletingRole(false);
    }
  };

  // Handle create role modal submit
  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const code = newRoleCode.trim().toLowerCase();
    const name = newRoleName.trim();
    if (!name) {
      setCreateError('Nama posisi wajib diisi.');
      return;
    }
    if (!code) {
      setCreateError('Kode posisi wajib diisi.');
      return;
    }
    if (!/^[a-z0-9_]{2,30}$/.test(code)) {
      setCreateError('Kode posisi hanya boleh berisi huruf kecil, angka, dan garis bawah (2-30 karakter).');
      return;
    }
    if (roles.some((r) => r.code === code)) {
      setCreateError(`Kode posisi "${code}" sudah digunakan. Silakan gunakan kode lain.`);
      return;
    }

    setCreatingRole(true);
    try {
      const created = await api.createRole({
        code,
        name,
        short_name: newRoleShortName.trim() || name.slice(0, 5).toUpperCase(),
        description: newRoleDescription.trim() || undefined,
        badge_color: newRoleColor,
        hierarchy_level: Number(newRoleHierarchy) || 40,
        permissions: newRolePermissions,
      });

      showToast(`Posisi "${created.name}" berhasil ditambahkan.`, 'success');
      setIsCreateModalOpen(false);
      resetCreateForm();
      await loadRoles();
      setSelectedRoleCode(created.code);
      await refreshRoles();
      if (onRolesChanged) onRolesChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menambahkan posisi baru.';
      setCreateError(msg);
      showToast(msg, 'error');
    } finally {
      setCreatingRole(false);
    }
  };

  const resetCreateForm = () => {
    setNewRoleName('');
    setNewRoleCode('');
    setNewRoleShortName('');
    setNewRoleDescription('');
    setNewRoleColor('indigo');
    setNewRoleHierarchy(40);
    setNewRolePermissions([]);
    setCreateError(null);
  };

  // Filtered roles list for left panel
  const filteredRoles = useMemo(() => {
    if (!searchFilter.trim()) return roles;
    const q = searchFilter.toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.short_name && r.short_name.toLowerCase().includes(q))
    );
  }, [roles, searchFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner if Read-Only */}
      {!canManageRoles && (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-bold">Mode Tampilan Baca Saja (Read-Only)</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              Anda hanya memiliki izin melihat konfigurasi hak akses posisi. Diperlukan izin{' '}
              <code className="px-1 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60 font-mono text-[11px]">
                roles:manage
              </code>{' '}
              untuk menambah, mengubah, atau menghapus posisi.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Left (Role List) & Right (Role Detail & Permission Matrix) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Roles Card List (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                Daftar Posisi & Peran
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {roles.length} posisi terdaftar
              </p>
            </div>

            {canManageRoles && (
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all"
                title="Tambah Posisi Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Posisi</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Cari posisi atau kode..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
          </div>

          {/* Role Cards List */}
          <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
            {loading && roles.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                <span>Memuat daftar posisi...</span>
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada posisi yang cocok.
              </div>
            ) : (
              filteredRoles.map((r) => {
                const isSelected = r.code === selectedRoleCode;
                const meta = getRoleMeta(r.code, roles);
                const colorStyle = BADGE_COLOR_STYLES[r.badge_color] || BADGE_COLOR_STYLES.slate;

                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setSelectedRoleCode(r.code)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative ${
                      isSelected
                        ? 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 ring-2 ring-amber-500/20 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorStyle.dotClass}`}
                        />
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {r.name}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${meta.badgeClass}`}
                      >
                        {r.short_name || r.code.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.is_system
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                              : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                          }`}
                        >
                          {r.is_system ? 'Sistem' : 'Kustom'}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 font-medium">Level {r.hierarchy_level}</span>
                      </div>

                      <div className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span className="tabular-nums font-bold text-slate-900 dark:text-white">{r.user_count ?? 0}</span> staf
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Role Detail & Permission Matrix (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          {selectedRole ? (
            <>
              {/* Detail Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {selectedRole.name}
                      </h3>
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-lg border ${
                          (BADGE_COLOR_STYLES[selectedRole.badge_color] || BADGE_COLOR_STYLES.slate)
                            .badgeClass
                        }`}
                      >
                        {selectedRole.short_name || selectedRole.code.toUpperCase()}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          selectedRole.is_system
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                            : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                        }`}
                      >
                        {selectedRole.is_system ? 'Peran Sistem' : 'Peran Kustom'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedRole.description || 'Tidak ada deskripsi khusus.'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 pt-1 font-mono">
                      <span>
                        Kode:{' '}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {selectedRole.code}
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Tingkat Hirarki:{' '}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          Level {selectedRole.hierarchy_level}
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Jumlah Staf:{' '}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {selectedRole.user_count ?? 0}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Actions (Delete button) */}
                  {canManageRoles && !selectedRole.is_system && (
                    <button
                      type="button"
                      onClick={handleDeleteRole}
                      disabled={deletingRole || (selectedRole.user_count ?? 0) > 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-300 dark:border-rose-800/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-start"
                      title={
                        (selectedRole.user_count ?? 0) > 0
                          ? 'Tidak dapat dihapus karena masih ada pengguna terdaftar'
                          : 'Hapus posisi kustom ini'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>{deletingRole ? 'Menghapus...' : 'Hapus Posisi'}</span>
                    </button>
                  )}
                </div>

                {/* Notice for Owner role */}
                {selectedRole.code === 'owner' && (
                  <div className="mt-4 flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/80 text-purple-950 dark:text-purple-200 text-xs">
                    <Lock className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span>
                      Posisi <strong className="font-bold text-purple-900 dark:text-purple-100">Owner</strong> memiliki seluruh hak akses operasional toko
                      secara permanen dan tidak dapat dibatasi.
                    </span>
                  </div>
                )}
              </div>

              {/* Matriks Centang Hak Akses per Modul */}
              <div className="p-5 space-y-6 max-h-[640px] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    Matriks Hak Akses Modul ({editingPermissions.length} izin aktif)
                  </h4>
                </div>

                <div className="space-y-5">
                  {PERMISSION_MODULES.map((moduleDef) => {
                    const modulePermCodes = moduleDef.permissions.map((p) => p.code);
                    const grantedCount = modulePermCodes.filter((code) =>
                      editingPermissions.includes(code)
                    ).length;
                    const isAllSelected = grantedCount === modulePermCodes.length;
                    const isNoneSelected = grantedCount === 0;
                    const isOwner = selectedRole.code === 'owner';
                    const canEditModule = canManageRoles && !isOwner;

                    return (
                      <div
                        key={moduleDef.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
                      >
                        {/* Module Header */}
                        <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                {moduleDef.name}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                ({grantedCount}/{modulePermCodes.length})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                              {moduleDef.description}
                            </p>
                          </div>

                          {/* Select All / Deselect All buttons per module */}
                          {canEditModule && (
                            <div className="flex items-center gap-1.5 self-start sm:self-auto">
                              <button
                                type="button"
                                onClick={() => handleSelectAllModule(moduleDef)}
                                disabled={isAllSelected}
                                className="px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-lg border border-amber-200 dark:border-amber-700/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Pilih Semua
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeselectAllModule(moduleDef)}
                                disabled={isNoneSelected}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Hapus Semua
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Permission Checkbox Grid */}
                        <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-white dark:bg-slate-900">
                          {moduleDef.permissions.map((perm) => {
                            const isChecked = editingPermissions.includes(perm.code);
                            const disabled = !canManageRoles || isOwner;

                            return (
                              <label
                                key={perm.code}
                                onClick={(e) => {
                                  if (disabled) e.preventDefault();
                                }}
                                className={`flex items-start gap-3 p-3 rounded-xl border transition-all select-none ${
                                  disabled ? 'cursor-default' : 'cursor-pointer'
                                } ${
                                  isChecked
                                    ? 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 text-slate-900 dark:text-white shadow-xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={disabled}
                                    onChange={() => handleTogglePermission(perm.code)}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                                      isChecked
                                        ? 'bg-amber-600 border-amber-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </div>

                                <div className="min-w-0">
                                  <div className="text-xs font-bold leading-tight flex items-center gap-1.5 text-slate-900 dark:text-white">
                                    <span>{perm.label}</span>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                      ({perm.code})
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                                    {perm.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {hasChanges ? (
                    <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Terdapat perubahan hak akses yang belum disimpan.
                    </span>
                  ) : (
                    <span>Konfigurasi hak akses sudah tersimpan.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {canManageRoles && (
                    <button
                      type="button"
                      onClick={handleSavePermissions}
                      disabled={savingPermissions || selectedRole.code === 'owner' || !hasChanges}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingPermissions ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Pilih posisi di sebelah kiri untuk melihat rincian hak akses.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Tambah Posisi Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Tambah Posisi & Peran Baru
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Konfigurasikan nama posisi, level hirarki wewenang, dan izin awal
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateRoleSubmit} className="p-6 overflow-y-auto space-y-4">
              {createError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nama Posisi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Contoh: Koordinator Gudang"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Kode Posisi (Otomatis) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value.toLowerCase())}
                    placeholder="koordinator_gudang"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Label Singkat (Badge) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRoleShortName}
                    onChange={(e) => setNewRoleShortName(e.target.value.toUpperCase())}
                    placeholder="Contoh: KORD"
                    maxLength={8}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tingkat Hirarki (1 - 99) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={newRoleHierarchy}
                    onChange={(e) => setNewRoleHierarchy(Number(e.target.value))}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Owner: 100 &bull; Admin: 80 &bull; Gudang: 50 &bull; Kasir: 30
                  </p>
                </div>
              </div>

              {/* Badge Color Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Warna Identitas Badge
                </label>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {AVAILABLE_COLORS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setNewRoleColor(col.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        newRoleColor === col.key
                          ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-50 dark:bg-amber-950/40 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${col.previewClass}`} />
                      <span>{col.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Deskripsi Tanggung Jawab Posisi
                </label>
                <textarea
                  rows={2}
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  placeholder="Penjelasan wewenang posisi ini di toko bangunan..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Initial Permissions Selector */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-900 dark:text-white">
                    Hak Akses Awal ({newRolePermissions.length} dipilih)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const all = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.code));
                      setNewRolePermissions((prev) =>
                        prev.length === all.length ? [] : all
                      );
                    }}
                    className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {newRolePermissions.length ===
                    PERMISSION_MODULES.flatMap((m) => m.permissions).length
                      ? 'Kosongkan Semua'
                      : 'Pilih Seluruh Izin'}
                  </button>
                </div>

                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {PERMISSION_MODULES.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800"
                    >
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        {m.name}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {m.permissions.map((p) => {
                          const checked = newRolePermissions.includes(p.code);
                          return (
                            <label
                              key={p.code}
                              className="flex items-center gap-2 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setNewRolePermissions((prev) =>
                                    prev.includes(p.code)
                                      ? prev.filter((x) => x !== p.code)
                                      : [...prev, p.code]
                                  );
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span className="text-[11px] truncate text-slate-700 dark:text-slate-200">
                                {p.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creatingRole}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingRole}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
                >
                  {creatingRole ? 'Menyimpan Posisi...' : 'Simpan Posisi Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
