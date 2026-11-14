import type { Permission, RoleDefinition, UserRole } from '../types/auth.js';
import { ALL_PERMISSIONS, DEFAULT_USER_ROLES } from '../types/auth.js';
import { pool } from './db.js';

export const ROLE_RANK: Record<string, number> = {
  owner: 100,
  admin: 80,
  gudang: 50,
  kasir: 30,
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== 'users:delete'),
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
    'reservations:cancel',
  ],
};

export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

// In-memory cache for roles
const rolesCache = new Map<string, RoleDefinition>();

/**
 * Synchronize in-memory roles cache with an array of RoleDefinitions
 */
export function syncRolesCache(roles: RoleDefinition[]): void {
  rolesCache.clear();
  for (const r of roles) {
    const code = String(r.code).toLowerCase();
    rolesCache.set(code, {
      ...r,
      code,
      permissions: Array.isArray(r.permissions) ? (r.permissions as Permission[]) : [],
    });
  }
}

/**
 * Fetch all roles from database and populate in-memory roles cache.
 * Accepts optional PoolClient or defaults to pool.
 */
export async function syncRolesCacheFromDb(
  client?: { query: typeof pool.query }
): Promise<RoleDefinition[]> {
  const runner = client ?? pool;
  const res = await runner.query(`
    SELECT
      id,
      code,
      name,
      short_name,
      description,
      badge_color,
      hierarchy_level,
      is_system,
      permissions,
      created_at,
      updated_at
    FROM roles
    ORDER BY hierarchy_level DESC, created_at ASC
  `);

  const roles: RoleDefinition[] = res.rows.map((row: any) => ({
    id: row.id,
    code: String(row.code).toLowerCase(),
    name: row.name,
    short_name: row.short_name,
    description: row.description ?? null,
    badge_color: row.badge_color || 'slate',
    hierarchy_level: Number(row.hierarchy_level) || 10,
    is_system: Boolean(row.is_system),
    permissions: Array.isArray(row.permissions)
      ? row.permissions
      : typeof row.permissions === 'string'
        ? JSON.parse(row.permissions)
        : [],
    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  }));

  syncRolesCache(roles);
  return roles;
}

/**
 * Retrieve a cached role definition by code.
 */
export function getCachedRole(roleCode: string): RoleDefinition | undefined {
  return rolesCache.get(String(roleCode).trim().toLowerCase());
}

/**
 * Retrieve all roles stored in memory sorted by hierarchy_level DESC.
 */
export function getAllCachedRoles(): RoleDefinition[] {
  return Array.from(rolesCache.values()).sort((a, b) => b.hierarchy_level - a.hierarchy_level);
}

/**
 * Determine hierarchy level for a given role.
 */
export function getRoleLevel(role: string): number {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') return 100;
  const cached = rolesCache.get(normalized);
  if (cached && typeof cached.hierarchy_level === 'number') {
    return cached.hierarchy_level;
  }
  if (ROLE_RANK[normalized] !== undefined) {
    return ROLE_RANK[normalized];
  }
  return 10;
}

/**
 * Check whether a role string is a valid known role (in cache or default).
 */
export function isValidRole(role: string): boolean {
  if (!role || typeof role !== 'string') return false;
  const normalized = role.trim().toLowerCase();
  if ((DEFAULT_USER_ROLES as readonly string[]).includes(normalized as any)) return true;
  return rolesCache.has(normalized);
}

/**
 * Return a mutable array of canonical permissions granted to a role.
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') {
    return [...ALL_PERMISSIONS];
  }
  const cached = rolesCache.get(normalized);
  if (cached) {
    return [...cached.permissions];
  }
  const def = DEFAULT_ROLE_PERMISSIONS[normalized];
  if (def) {
    return [...def];
  }
  return [];
}

/**
 * Check whether a role includes a single permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') return true;
  const list = getPermissionsForRole(normalized);
  return list.includes(permission);
}

/**
 * Enforce user management hierarchy:
 * - owner can manage all roles
 * - other roles can only manage roles strictly lower than their hierarchy level
 */
export function canManageTargetRole(actorRole: UserRole, targetRole: UserRole): boolean {
  const actorNorm = String(actorRole || '').trim().toLowerCase();
  const targetNorm = String(targetRole || '').trim().toLowerCase();

  if (actorNorm === 'owner') return true;

  const actorLevel = getRoleLevel(actorNorm);
  const targetLevel = getRoleLevel(targetNorm);

  return actorLevel > targetLevel;
}
