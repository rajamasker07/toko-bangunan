import { Permission, UserRole } from '../types';

export type AppTab =
  | 'dashboard'
  | 'products'
  | 'adjust'
  | 'categories'
  | 'brands'
  | 'suppliers'
  | 'users'
  | 'docs';

export const ROLE_ORDER: readonly UserRole[] = ['owner', 'admin', 'gudang', 'kasir'];

export const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  gudang: 2,
  kasir: 1,
};

export interface RoleMetadata {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  dotClass: string;
}

export const ROLE_META: Record<UserRole, RoleMetadata> = {
  owner: {
    label: 'Owner (Pemilik Toko)',
    shortLabel: 'Owner',
    description: 'Akses penuh ke seluruh stok, harga modal, master data, dan manajemen semua akun.',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60',
    dotClass: 'bg-purple-500',
  },
  admin: {
    label: 'Admin / Kepala Toko',
    shortLabel: 'Admin',
    description: 'Mengelola inventaris, harga, master data, serta akun Staf Gudang & Kasir.',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60',
    dotClass: 'bg-blue-500',
  },
  gudang: {
    label: 'Staf Gudang',
    shortLabel: 'Gudang',
    description: 'Menyesuaikan stok, membuat/ubah produk & varian, melihat supplier (tanpa harga modal & hapus).',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60',
    dotClass: 'bg-amber-500',
  },
  kasir: {
    label: 'Kasir / Penjualan',
    shortLabel: 'Kasir',
    description: 'Melihat dashboard, katalog produk, harga jual, dan riwayat mutasi stok (hanya baca).',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
    dotClass: 'bg-emerald-500',
  },
};

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  owner: [
    'dashboard:read',
    'products:read',
    'products:create',
    'products:update',
    'products:delete',
    'products:view_buy_price',
    'pricing:write',
    'master:read',
    'suppliers:read',
    'master:write',
    'master:delete',
    'stock:read',
    'stock:adjust',
    'users:read',
    'users:manage',
    'users:delete',
  ],
  admin: [
    'dashboard:read',
    'products:read',
    'products:create',
    'products:update',
    'products:delete',
    'products:view_buy_price',
    'pricing:write',
    'master:read',
    'suppliers:read',
    'master:write',
    'master:delete',
    'stock:read',
    'stock:adjust',
    'users:read',
    'users:manage',
  ],
  gudang: [
    'dashboard:read',
    'products:read',
    'products:create',
    'products:update',
    'master:read',
    'suppliers:read',
    'stock:read',
    'stock:adjust',
  ],
  kasir: [
    'dashboard:read',
    'products:read',
    'master:read',
    'stock:read',
  ],
};

/** Resolve effective permission list from server permissions with role fallback. */
export function resolvePermissions(
  permissions: readonly Permission[] | null | undefined,
  role?: UserRole | null
): readonly Permission[] {
  if (permissions && permissions.length > 0) {
    return permissions;
  }
  return role ? ROLE_PERMISSIONS[role] : [];
}

/** Check whether the current session holds a specific permission. */
export function hasPermission(
  permissions: readonly Permission[] | null | undefined,
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  return resolvePermissions(permissions, role).includes(permission);
}

/** Check whether the current session holds at least one of the listed permissions. */
export function hasAnyPermission(
  permissions: readonly Permission[] | null | undefined,
  role: UserRole | null | undefined,
  required: readonly Permission[]
): boolean {
  const effective = resolvePermissions(permissions, role);
  return required.some((perm) => effective.includes(perm));
}

/** Determine whether actorRole is permitted to manage an account with targetRole. */
export function canManageTargetRole(
  actorRole: UserRole | null | undefined,
  targetRole: UserRole
): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return targetRole === 'gudang' || targetRole === 'kasir';
  }
  return false;
}

/** List roles assignable in UserFormModal by the current actor. */
export function getAssignableRoles(actorRole: UserRole | null | undefined): UserRole[] {
  if (actorRole === 'owner') return [...ROLE_ORDER];
  if (actorRole === 'admin') return ['gudang', 'kasir'];
  return [];
}

/** Route/tab guard matching Sidebar navigation visibility. */
export function canAccessTab(
  permissions: readonly Permission[] | null | undefined,
  role: UserRole | null | undefined,
  tab: AppTab
): boolean {
  if (!role) return false;
  switch (tab) {
    case 'dashboard':
      return hasPermission(permissions, role, 'dashboard:read');
    case 'products':
      return hasPermission(permissions, role, 'products:read');
    case 'adjust':
      return hasAnyPermission(permissions, role, ['stock:adjust', 'stock:read']);
    case 'categories':
    case 'brands':
      return hasAnyPermission(permissions, role, ['master:write', 'products:create']);
    case 'suppliers':
      return hasPermission(permissions, role, 'suppliers:read');
    case 'users':
      return hasAnyPermission(permissions, role, ['users:read', 'users:manage']);
    case 'docs':
      return true;
    default:
      return false;
  }
}
