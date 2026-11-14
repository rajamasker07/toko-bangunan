import { query } from '../config/db.js';
import {
  getRoleLevel,
  syncRolesCacheFromDb,
} from '../config/rbac.js';
import {
  PERMISSION_CATALOG,
  getPermissionGroups,
} from '../config/permissionCatalog.js';
import type {
  AuthenticatedUser,
  CreateRoleInput,
  Permission,
  PermissionCatalogItem,
  PermissionGroup,
  RoleDefinition,
  UpdateRoleInput,
} from '../types/auth.js';
import { ALL_PERMISSIONS } from '../types/auth.js';
import { AppHttpError } from '../utils/errors.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export class RoleService {
  static async listRoles(): Promise<RoleDefinition[]> {
    const res = await query(`
      SELECT
        r.id,
        r.code,
        r.name,
        r.short_name,
        r.description,
        r.badge_color,
        r.hierarchy_level,
        r.is_system,
        r.permissions,
        r.created_at,
        r.updated_at,
        COALESCE(u.user_count, 0)::int AS user_count
      FROM roles r
      LEFT JOIN (
        SELECT LOWER(role) AS role_code, COUNT(*)::int AS user_count
        FROM users
        GROUP BY LOWER(role)
      ) u ON u.role_code = LOWER(r.code)
      ORDER BY r.hierarchy_level DESC, r.created_at ASC
    `);

    return res.rows.map((row: any) => ({
      id: row.id,
      code: String(row.code).toLowerCase(),
      name: row.name,
      short_name: row.short_name,
      description: row.description ?? null,
      badge_color: row.badge_color || 'slate',
      hierarchy_level: Number(row.hierarchy_level) || 10,
      is_system: Boolean(row.is_system),
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as Permission[])
        : typeof row.permissions === 'string'
          ? (JSON.parse(row.permissions) as Permission[])
          : [],
      user_count: Number(row.user_count) || 0,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    }));
  }

  static async getRoleByCode(code: string): Promise<RoleDefinition> {
    const normalized = String(code || '').trim().toLowerCase();
    const res = await query(
      `
      SELECT
        r.id,
        r.code,
        r.name,
        r.short_name,
        r.description,
        r.badge_color,
        r.hierarchy_level,
        r.is_system,
        r.permissions,
        r.created_at,
        r.updated_at,
        COALESCE(u.user_count, 0)::int AS user_count
      FROM roles r
      LEFT JOIN (
        SELECT LOWER(role) AS role_code, COUNT(*)::int AS user_count
        FROM users
        WHERE LOWER(role) = $1
        GROUP BY LOWER(role)
      ) u ON u.role_code = LOWER(r.code)
      WHERE LOWER(r.code) = $1
      LIMIT 1
    `,
      [normalized]
    );

    const row = res.rows[0];
    if (!row) {
      throw new AppHttpError(404, `Peran dengan kode "${code}" tidak ditemukan.`);
    }

    return {
      id: row.id,
      code: String(row.code).toLowerCase(),
      name: row.name,
      short_name: row.short_name,
      description: row.description ?? null,
      badge_color: row.badge_color || 'slate',
      hierarchy_level: Number(row.hierarchy_level) || 10,
      is_system: Boolean(row.is_system),
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as Permission[])
        : typeof row.permissions === 'string'
          ? (JSON.parse(row.permissions) as Permission[])
          : [],
      user_count: Number(row.user_count) || 0,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  static getPermissionCatalog(): {
    permissions: readonly Permission[];
    catalog: PermissionCatalogItem[];
    groups: PermissionGroup[];
  } {
    return {
      permissions: ALL_PERMISSIONS,
      catalog: PERMISSION_CATALOG,
      groups: getPermissionGroups(),
    };
  }

  static async createRole(
    actor: AuthenticatedUser,
    input: CreateRoleInput
  ): Promise<RoleDefinition> {
    const code = input.code.trim().toLowerCase();
    const actorRole = actor.role.toLowerCase();
    const actorLevel = getRoleLevel(actorRole);

    // 1. Hierarchy enforcement: non-owners cannot create roles with equal or higher level
    const targetLevel = input.hierarchy_level ?? 10;
    if (actorRole !== 'owner' && targetLevel >= actorLevel) {
      throw new AppHttpError(
        403,
        `Anda tidak memiliki izin membuat peran dengan level hierarki sama atau lebih tinggi dari peran Anda (${actorLevel}).`,
        'FORBIDDEN'
      );
    }

    // 2. Check duplicate code
    const existing = await query('SELECT id FROM roles WHERE LOWER(code) = $1', [code]);
    if (existing.rows.length > 0) {
      throw new AppHttpError(409, `Kode peran "${code}" sudah digunakan.`);
    }

    // 3. Validate permissions
    const rawPerms = Array.isArray(input.permissions) ? input.permissions : [];
    const validPerms = rawPerms.filter((p) => ALL_PERMISSIONS.includes(p as Permission));

    const id = generateUUIDv7();
    const badgeColor = input.badge_color || 'slate';

    const insertRes = await query(
      `
      INSERT INTO roles (
        id, code, name, short_name, description, badge_color,
        hierarchy_level, is_system, permissions, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `,
      [
        id,
        code,
        input.name.trim(),
        input.short_name.trim(),
        input.description ? input.description.trim() : null,
        badgeColor,
        targetLevel,
        JSON.stringify(validPerms),
      ]
    );

    // Sync in-memory cache
    await syncRolesCacheFromDb();

    const row = insertRes.rows[0];
    return {
      id: row.id,
      code: String(row.code).toLowerCase(),
      name: row.name,
      short_name: row.short_name,
      description: row.description ?? null,
      badge_color: row.badge_color,
      hierarchy_level: Number(row.hierarchy_level),
      is_system: false,
      permissions: validPerms as Permission[],
      user_count: 0,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  static async updateRole(
    actor: AuthenticatedUser,
    code: string,
    input: UpdateRoleInput
  ): Promise<RoleDefinition> {
    const existing = await this.getRoleByCode(code);
    const actorRole = actor.role.toLowerCase();
    const actorLevel = getRoleLevel(actorRole);

    // 1. Hierarchy enforcement
    if (actorRole !== 'owner') {
      if (existing.hierarchy_level >= actorLevel) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin mengubah peran "${existing.name}" (level ${existing.hierarchy_level}).`,
          'FORBIDDEN'
        );
      }
      if (input.hierarchy_level !== undefined && input.hierarchy_level >= actorLevel) {
        throw new AppHttpError(
          403,
          `Level hierarki baru tidak boleh sama atau lebih tinggi dari peran Anda (${actorLevel}).`,
          'FORBIDDEN'
        );
      }
    }

    // 2. Owner protection: code, hierarchy_level & permissions cannot be altered for owner role
    const isOwnerRole = existing.code === 'owner';

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      values.push(input.name.trim());
      fields.push(`name = $${values.length}`);
    }

    if (input.short_name !== undefined) {
      values.push(input.short_name.trim());
      fields.push(`short_name = $${values.length}`);
    }

    if (input.description !== undefined) {
      values.push(input.description ? input.description.trim() : null);
      fields.push(`description = $${values.length}`);
    }

    if (input.badge_color !== undefined) {
      values.push(input.badge_color);
      fields.push(`badge_color = $${values.length}`);
    }

    if (input.hierarchy_level !== undefined && !isOwnerRole) {
      values.push(input.hierarchy_level);
      fields.push(`hierarchy_level = $${values.length}`);
    }

    if (input.permissions !== undefined && !isOwnerRole) {
      const validPerms = input.permissions.filter((p) =>
        ALL_PERMISSIONS.includes(p as Permission)
      );
      values.push(JSON.stringify(validPerms));
      fields.push(`permissions = $${values.length}::jsonb`);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    values.push(existing.code);
    const updateRes = await query(
      `
      UPDATE roles
      SET ${fields.join(', ')}
      WHERE LOWER(code) = LOWER($${values.length})
      RETURNING *
    `,
      values
    );

    // Refresh cache
    await syncRolesCacheFromDb();

    const row = updateRes.rows[0];
    return {
      id: row.id,
      code: String(row.code).toLowerCase(),
      name: row.name,
      short_name: row.short_name,
      description: row.description ?? null,
      badge_color: row.badge_color,
      hierarchy_level: Number(row.hierarchy_level),
      is_system: Boolean(row.is_system),
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as Permission[])
        : typeof row.permissions === 'string'
          ? (JSON.parse(row.permissions) as Permission[])
          : [],
      user_count: existing.user_count,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  static async deleteRole(actor: AuthenticatedUser, code: string): Promise<void> {
    const existing = await this.getRoleByCode(code);
    const actorRole = actor.role.toLowerCase();
    const actorLevel = getRoleLevel(actorRole);

    // 1. System roles cannot be deleted
    if (existing.is_system) {
      throw new AppHttpError(
        400,
        `Peran sistem bawaan (${existing.name}) tidak dapat dihapus.`,
        'SYSTEM_ROLE_PROTECTED'
      );
    }

    // 2. Roles in use by users cannot be deleted
    if ((existing.user_count ?? 0) > 0) {
      throw new AppHttpError(
        400,
        `Peran "${existing.name}" tidak dapat dihapus karena masih digunakan oleh ${existing.user_count} pengguna.`,
        'ROLE_IN_USE'
      );
    }

    // 3. Hierarchy check
    if (actorRole !== 'owner' && existing.hierarchy_level >= actorLevel) {
      throw new AppHttpError(
        403,
        `Anda tidak memiliki izin untuk menghapus peran "${existing.name}".`,
        'FORBIDDEN'
      );
    }

    await query('DELETE FROM roles WHERE LOWER(code) = LOWER($1)', [existing.code]);

    // Refresh cache
    await syncRolesCacheFromDb();
  }
}
