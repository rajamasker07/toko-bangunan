import type { PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { canManageTargetRole } from '../config/rbac.js';
import type {
  AuthenticatedUser,
  UserListResult,
  UserPublic,
  UserRole,
  UsersSummaryMetrics,
} from '../types/auth.js';
import { AppHttpError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import {
  AuthService,
  mapUserUniqueViolation,
  USER_PUBLIC_COLUMNS,
} from './authService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
  }
}

async function assertNotLastActiveOwner(
  client: PoolClient,
  target: UserPublic,
  willLoseActiveOwner: boolean
): Promise<void> {
  if (!willLoseActiveOwner || target.role !== 'owner' || !target.is_active) {
    return;
  }

  const activeOwners = await client.query(
    `SELECT id FROM users WHERE role = 'owner' AND is_active = TRUE FOR UPDATE`
  );
  if (activeOwners.rows.length <= 1) {
    throw new AppHttpError(
      409,
      'Tidak dapat menonaktifkan, menurunkan peran, atau menghapus Owner aktif terakhir.',
      'LAST_ACTIVE_OWNER'
    );
  }
}

export class UserService {
  static async listUsers(filters: {
    search?: string;
    role?: string;
    isActive?: string;
    page?: number;
    limit?: number;
    offset?: number;
  }): Promise<UserListResult> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(
        LOWER(username) LIKE $${idx} OR
        LOWER(full_name) LIKE $${idx} OR
        LOWER(COALESCE(email, '')) LIKE $${idx}
      )`);
    }

    if (filters.role && filters.role !== 'all') {
      params.push(filters.role.trim().toLowerCase());
      conditions.push(`role = $${params.length}`);
    }

    if (filters.isActive === 'true') {
      conditions.push('is_active = TRUE');
    } else if (filters.isActive === 'false') {
      conditions.push('is_active = FALSE');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 100);
    const page =
      filters.page !== undefined
        ? Math.max(Number(filters.page) || 1, 1)
        : Math.floor(Math.max(Number(filters.offset) || 0, 0) / limit) + 1;
    const offset =
      filters.page !== undefined
        ? (page - 1) * limit
        : Math.max(Number(filters.offset) || 0, 0);

    const listParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const listSql = `
      SELECT ${USER_PUBLIC_COLUMNS}
      FROM users
      ${whereClause}
      ORDER BY
        CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'gudang' THEN 3 ELSE 4 END ASC,
        created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;

    const summarySql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN is_active THEN 1 END)::int AS active,
        COUNT(CASE WHEN NOT is_active THEN 1 END)::int AS inactive,
        COUNT(CASE WHEN role = 'owner' THEN 1 END)::int AS role_owner,
        COUNT(CASE WHEN role = 'admin' THEN 1 END)::int AS role_admin,
        COUNT(CASE WHEN role = 'gudang' THEN 1 END)::int AS role_gudang,
        COUNT(CASE WHEN role = 'kasir' THEN 1 END)::int AS role_kasir
      FROM users
    `;

    const [rowsRes, countRes, summaryRes] = await Promise.all([
      query(listSql, listParams),
      query(countSql, params),
      query(summarySql),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const sumRow = summaryRes.rows[0] || {};
    const summary: UsersSummaryMetrics = {
      total: Number(sumRow.total || 0),
      active: Number(sumRow.active || 0),
      inactive: Number(sumRow.inactive || 0),
      by_role: {
        owner: Number(sumRow.role_owner || 0),
        admin: Number(sumRow.role_admin || 0),
        gudang: Number(sumRow.role_gudang || 0),
        kasir: Number(sumRow.role_kasir || 0),
      },
    };

    return {
      items: rowsRes.rows as UserPublic[],
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      summary,
    };
  }

  static async getById(id: string): Promise<UserPublic> {
    assertValidUuid(id);
    const res = await query(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
    if (!res.rows[0]) {
      throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
    }
    return res.rows[0] as UserPublic;
  }

  static async createUser(
    actor: AuthenticatedUser,
    input: {
      username: string;
      email: string | null;
      full_name: string;
      password: string;
      role: UserRole;
      is_active: boolean;
      must_change_password: boolean;
    }
  ): Promise<UserPublic> {
    if (!canManageTargetRole(actor.role, input.role)) {
      throw new AppHttpError(
        403,
        `Peran ${actor.role} tidak diizinkan membuat akun dengan peran ${input.role}.`,
        'FORBIDDEN'
      );
    }

    const existingUsername = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [input.username]
    );
    if (existingUsername.rows.length > 0) {
      throw new AppHttpError(409, `Username "${input.username}" sudah digunakan.`);
    }

    if (input.email) {
      const existingEmail = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [input.email]
      );
      if (existingEmail.rows.length > 0) {
        throw new AppHttpError(409, `Email "${input.email}" sudah terdaftar.`);
      }
    }

    const passwordHash = await hashPassword(input.password);
    const id = generateUUIDv7();

    try {
      const res = await query(
        `INSERT INTO users (
           id, username, email, full_name, password_hash, role,
           is_active, must_change_password, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${USER_PUBLIC_COLUMNS}`,
        [
          id,
          input.username,
          input.email,
          input.full_name,
          passwordHash,
          input.role,
          input.is_active,
          input.must_change_password,
          actor.id,
        ]
      );
      return res.rows[0] as UserPublic;
    } catch (err) {
      mapUserUniqueViolation(err);
    }
  }

  static async updateUser(
    actor: AuthenticatedUser,
    targetId: string,
    input: {
      username?: string;
      email?: string | null;
      full_name?: string;
      role?: UserRole;
      is_active?: boolean;
    }
  ): Promise<UserPublic> {
    assertValidUuid(targetId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const targetRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      const target = targetRes.rows[0] as UserPublic | undefined;
      if (!target) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }

      const isSelf = target.id === actor.id;
      if (isSelf && input.role !== undefined && input.role !== target.role) {
        throw new AppHttpError(400, 'Anda tidak dapat mengubah peran akun Anda sendiri.');
      }
      if (isSelf && input.is_active === false) {
        throw new AppHttpError(400, 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
      }

      if (!isSelf && !canManageTargetRole(actor.role, target.role)) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin untuk mengubah akun dengan peran ${target.role}.`,
          'FORBIDDEN'
        );
      }

      if (input.role !== undefined && input.role !== target.role && !canManageTargetRole(actor.role, input.role)) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin untuk menetapkan peran ${input.role}.`,
          'FORBIDDEN'
        );
      }

      const willDemote = input.role !== undefined && input.role !== 'owner';
      const willDeactivate = input.is_active === false;
      await assertNotLastActiveOwner(client, target, willDemote || willDeactivate);

      if (input.username !== undefined && input.username !== target.username) {
        const dupUser = await client.query(
          'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2',
          [input.username, targetId]
        );
        if (dupUser.rows.length > 0) {
          throw new AppHttpError(409, `Username "${input.username}" sudah digunakan.`);
        }
      }

      if (input.email !== undefined && input.email && input.email !== target.email) {
        const dupEmail = await client.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2',
          [input.email, targetId]
        );
        if (dupEmail.rows.length > 0) {
          throw new AppHttpError(409, `Email "${input.email}" sudah terdaftar.`);
        }
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.username !== undefined) {
        values.push(input.username);
        fields.push(`username = $${values.length}`);
      }
      if (input.email !== undefined) {
        values.push(input.email);
        fields.push(`email = $${values.length}`);
      }
      if (input.full_name !== undefined) {
        values.push(input.full_name);
        fields.push(`full_name = $${values.length}`);
      }
      if (input.role !== undefined) {
        values.push(input.role);
        fields.push(`role = $${values.length}`);
      }
      if (input.is_active !== undefined) {
        values.push(input.is_active);
        fields.push(`is_active = $${values.length}`);
      }

      const roleChanged = input.role !== undefined && input.role !== target.role;
      const deactivated = target.is_active && input.is_active === false;
      if (roleChanged || deactivated) {
        fields.push('token_version = token_version + 1');
      }
      fields.push('updated_at = CURRENT_TIMESTAMP');

      values.push(targetId);
      const updatedRes = await client.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${USER_PUBLIC_COLUMNS}`,
        values
      );

      if (deactivated) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`,
          [targetId]
        );
      }

      await client.query('COMMIT');
      return updatedRes.rows[0] as UserPublic;
    } catch (err) {
      await client.query('ROLLBACK');
      mapUserUniqueViolation(err);
    } finally {
      client.release();
    }
  }

  static async toggleStatus(actor: AuthenticatedUser, targetId: string): Promise<UserPublic> {
    assertValidUuid(targetId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const targetRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      const target = targetRes.rows[0] as UserPublic | undefined;
      if (!target) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }

      if (target.id === actor.id) {
        throw new AppHttpError(400, 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
      }

      if (!canManageTargetRole(actor.role, target.role)) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin untuk mengubah status akun dengan peran ${target.role}.`,
          'FORBIDDEN'
        );
      }

      const nextActive = !target.is_active;
      await assertNotLastActiveOwner(client, target, !nextActive);

      const updatedRes = await client.query(
        `UPDATE users
         SET is_active = $1,
             token_version = CASE WHEN $1 = FALSE THEN token_version + 1 ELSE token_version END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${USER_PUBLIC_COLUMNS}`,
        [nextActive, targetId]
      );

      if (!nextActive) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`,
          [targetId]
        );
      }

      await client.query('COMMIT');
      return updatedRes.rows[0] as UserPublic;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async resetPassword(
    actor: AuthenticatedUser,
    targetId: string,
    input: { new_password: string; force_change_on_login: boolean }
  ): Promise<UserPublic> {
    assertValidUuid(targetId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const targetRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      const target = targetRes.rows[0] as UserPublic | undefined;
      if (!target) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }

      if (target.id !== actor.id && !canManageTargetRole(actor.role, target.role)) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin untuk mereset password akun dengan peran ${target.role}.`,
          'FORBIDDEN'
        );
      }

      const passwordHash = await hashPassword(input.new_password);
      const updatedRes = await client.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = $2,
             token_version = token_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING ${USER_PUBLIC_COLUMNS}`,
        [passwordHash, input.force_change_on_login, targetId]
      );

      await AuthService.revokeAllUserSessions(client, targetId);

      await client.query('COMMIT');
      return updatedRes.rows[0] as UserPublic;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async deleteUser(actor: AuthenticatedUser, targetId: string): Promise<UserPublic> {
    assertValidUuid(targetId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const targetRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      const target = targetRes.rows[0] as UserPublic | undefined;
      if (!target) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }

      if (target.id === actor.id) {
        throw new AppHttpError(400, 'Anda tidak dapat menghapus akun Anda sendiri.');
      }

      if (!canManageTargetRole(actor.role, target.role)) {
        throw new AppHttpError(
          403,
          `Anda tidak memiliki izin untuk menghapus akun dengan peran ${target.role}.`,
          'FORBIDDEN'
        );
      }

      await assertNotLastActiveOwner(client, target, true);

      const deletedRes = await client.query(
        `DELETE FROM users WHERE id = $1 RETURNING ${USER_PUBLIC_COLUMNS}`,
        [targetId]
      );

      await client.query('COMMIT');
      return deletedRes.rows[0] as UserPublic;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
