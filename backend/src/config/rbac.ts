import type { Permission, UserRole } from '../types/auth.js';

export const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  gudang: 2,
  kasir: 1,
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

/**
 * Return a mutable array of canonical permissions granted to a role.
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/**
 * Check whether a role includes a single permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const list = ROLE_PERMISSIONS[role];
  return Boolean(list && list.includes(permission));
}

/**
 * Enforce user management hierarchy:
 * - owner can manage all roles (owner, admin, gudang, kasir)
 * - admin can manage lower operational roles only (gudang, kasir)
 * - gudang & kasir cannot manage any role
 */
export function canManageTargetRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return targetRole === 'gudang' || targetRole === 'kasir';
  return false;
}
