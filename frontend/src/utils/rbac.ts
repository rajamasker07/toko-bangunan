import { Permission, RoleDefinition, UserRole } from '../types';

export type AppTab =
  | 'dashboard'
  | 'products'
  | 'adjust'
  | 'reservations'
  | 'categories'
  | 'brands'
  | 'suppliers'
  | 'users'
  | 'docs';

export const ALL_PERMISSIONS: readonly Permission[] = [
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
  'reservations:read',
  'reservations:create',
  'reservations:pickup',
  'reservations:cancel',
  'roles:manage',
];

export const ROLE_ORDER: readonly UserRole[] = ['owner', 'admin', 'gudang', 'kasir'];

export const ROLE_RANK: Record<string, number> = {
  owner: 100,
  admin: 80,
  gudang: 50,
  kasir: 30,
};

export interface RoleMetadata {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  dotClass: string;
}

export type BadgeColor =
  | 'purple'
  | 'blue'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'indigo'
  | 'cyan'
  | 'slate';

export const BADGE_COLOR_STYLES: Record<string, { badgeClass: string; dotClass: string }> = {
  purple: {
    badgeClass:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60',
    dotClass: 'bg-purple-500',
  },
  blue: {
    badgeClass:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60',
    dotClass: 'bg-blue-500',
  },
  amber: {
    badgeClass:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60',
    dotClass: 'bg-amber-500',
  },
  emerald: {
    badgeClass:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
    dotClass: 'bg-emerald-500',
  },
  rose: {
    badgeClass:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
    dotClass: 'bg-rose-500',
  },
  indigo: {
    badgeClass:
      'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60',
    dotClass: 'bg-indigo-500',
  },
  cyan: {
    badgeClass:
      'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/60',
    dotClass: 'bg-cyan-500',
  },
  slate: {
    badgeClass:
      'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    dotClass: 'bg-slate-500',
  },
};

export const ROLE_META: Record<string, RoleMetadata> = {
  owner: {
    label: 'Owner (Pemilik Toko)',
    shortLabel: 'Owner',
    description: 'Akses penuh ke seluruh stok, harga modal, master data, dan manajemen semua akun.',
    badgeClass: BADGE_COLOR_STYLES.purple.badgeClass,
    dotClass: BADGE_COLOR_STYLES.purple.dotClass,
  },
  admin: {
    label: 'Admin / Kepala Toko',
    shortLabel: 'Admin',
    description: 'Mengelola inventaris, harga, master data, serta akun Staf Gudang & Kasir.',
    badgeClass: BADGE_COLOR_STYLES.blue.badgeClass,
    dotClass: BADGE_COLOR_STYLES.blue.dotClass,
  },
  gudang: {
    label: 'Staf Gudang',
    shortLabel: 'Gudang',
    description: 'Menyesuaikan stok, membuat/ubah produk & varian, melihat supplier (tanpa harga modal & hapus).',
    badgeClass: BADGE_COLOR_STYLES.amber.badgeClass,
    dotClass: BADGE_COLOR_STYLES.amber.dotClass,
  },
  kasir: {
    label: 'Kasir / Penjualan',
    shortLabel: 'Kasir',
    description: 'Melihat dashboard, katalog produk, harga jual, dan riwayat mutasi stok (hanya baca).',
    badgeClass: BADGE_COLOR_STYLES.emerald.badgeClass,
    dotClass: BADGE_COLOR_STYLES.emerald.dotClass,
  },
};

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
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
    'reservations:read',
    'reservations:create',
    'reservations:pickup',
    'reservations:cancel',
    'roles:manage',
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
    'reservations:read',
    'reservations:create',
    'reservations:pickup',
    'reservations:cancel',
    'roles:manage',
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
    'reservations:read',
    'reservations:pickup',
  ],
  kasir: [
    'dashboard:read',
    'products:read',
    'master:read',
    'stock:read',
    'reservations:read',
    'reservations:create',
    'reservations:pickup',
  ],
};

/** Helper to get role presentation metadata with dynamic colors and fallback. */
export function getRoleMeta(
  roleCode?: string | null,
  rolesList?: RoleDefinition[]
): RoleMetadata {
  if (!roleCode) {
    return {
      label: 'Tanpa Posisi',
      shortLabel: 'N/A',
      description: 'Pengguna belum memiliki posisi/role yang ditentukan.',
      badgeClass: BADGE_COLOR_STYLES.slate.badgeClass,
      dotClass: BADGE_COLOR_STYLES.slate.dotClass,
    };
  }

  // 1. Check rolesList from server if provided
  if (rolesList && rolesList.length > 0) {
    const found = rolesList.find((r) => r.code === roleCode);
    if (found) {
      const colorStyle = BADGE_COLOR_STYLES[found.badge_color] || BADGE_COLOR_STYLES.slate;
      return {
        label: found.name,
        shortLabel: found.short_name || found.name,
        description: found.description || '',
        badgeClass: colorStyle.badgeClass,
        dotClass: colorStyle.dotClass,
      };
    }
  }

  // 2. Check predefined ROLE_META
  if (roleCode in ROLE_META) {
    return ROLE_META[roleCode];
  }

  // 3. Fallback for custom role without loaded rolesList
  const formattedName = roleCode.charAt(0).toUpperCase() + roleCode.slice(1);
  return {
    label: formattedName,
    shortLabel: formattedName,
    description: `Posisi (${roleCode})`,
    badgeClass: BADGE_COLOR_STYLES.slate.badgeClass,
    dotClass: BADGE_COLOR_STYLES.slate.dotClass,
  };
}

/** Resolve effective permission list from server permissions with role fallback. */
export function resolvePermissions(
  permissions: readonly Permission[] | null | undefined,
  role?: UserRole | null
): readonly Permission[] {
  if (permissions && permissions.length > 0) {
    return permissions;
  }
  return role && role in ROLE_PERMISSIONS ? ROLE_PERMISSIONS[role] : [];
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
  targetRole: UserRole,
  rolesList?: RoleDefinition[]
): boolean {
  if (!actorRole) return false;
  if (actorRole === 'owner') return true;

  if (rolesList && rolesList.length > 0) {
    const actorDef = rolesList.find((r) => r.code === actorRole);
    const targetDef = rolesList.find((r) => r.code === targetRole);
    if (actorDef && targetDef) {
      return actorDef.hierarchy_level > targetDef.hierarchy_level;
    }
  }

  const actorRank = ROLE_RANK[actorRole] ?? 0;
  const targetRank = ROLE_RANK[targetRole] ?? 0;
  if (actorRole === 'admin') {
    return targetRole === 'gudang' || targetRole === 'kasir' || actorRank > targetRank;
  }
  return actorRank > targetRank;
}

/** List roles assignable in UserFormModal by the current actor. */
export function getAssignableRoles(
  actorRole: UserRole | null | undefined,
  rolesList?: RoleDefinition[]
): UserRole[] {
  if (!actorRole) return [];

  if (rolesList && rolesList.length > 0) {
    if (actorRole === 'owner') {
      return [...rolesList]
        .sort((a, b) => b.hierarchy_level - a.hierarchy_level)
        .map((r) => r.code);
    }

    const actorDef = rolesList.find((r) => r.code === actorRole);
    const actorLevel = actorDef?.hierarchy_level ?? (ROLE_RANK[actorRole] ?? 0);

    return [...rolesList]
      .filter((r) => r.hierarchy_level < actorLevel)
      .sort((a, b) => b.hierarchy_level - a.hierarchy_level)
      .map((r) => r.code);
  }

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
    case 'reservations':
      return hasPermission(permissions, role, 'reservations:read');
    case 'categories':
    case 'brands':
      return hasAnyPermission(permissions, role, ['master:write', 'products:create']);
    case 'suppliers':
      return hasPermission(permissions, role, 'suppliers:read');
    case 'users':
      return hasAnyPermission(permissions, role, ['users:read', 'users:manage', 'roles:manage']);
    case 'docs':
      return true;
    default:
      return false;
  }
}
