import type { PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { getPermissionsForRole } from '../config/rbac.js';
import type { AuthTokensResponse, UserPublic, UserRole } from '../types/auth.js';
import { AppHttpError } from '../utils/errors.js';
import {
  generateRefreshToken,
  parseRefreshToken,
  safeCompareSha256Hex,
  signAccessToken,
} from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export const USER_PUBLIC_COLUMNS = `
  id, username, email, full_name, role, is_active,
  must_change_password, last_login_at, created_at, updated_at
`;

interface UserRow extends UserPublic {
  password_hash: string;
  token_version: number;
}

// Constant-time timing mitigation hash when user is not found
const DUMMY_SCRYPT_HASH =
  'scrypt$16384$8$1$00112233445566778899aabbccddeeff$' + '00'.repeat(64);

function toUserPublic(row: UserRow | UserPublic): UserPublic {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function refreshExpiresAt(): Date {
  return new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
}

function buildAuthResponse(
  userRow: UserRow,
  sessionId: string,
  refreshTokenRaw: string
): AuthTokensResponse {
  const { token, expiresIn } = signAccessToken({
    sub: userRow.id,
    sid: sessionId,
    tv: Number(userRow.token_version),
    role: userRow.role as UserRole,
  });

  return {
    access_token: token,
    refresh_token: refreshTokenRaw,
    token_type: 'Bearer',
    expires_in: expiresIn,
    user: toUserPublic(userRow),
    permissions: getPermissionsForRole(userRow.role as UserRole),
  };
}

export function mapUserUniqueViolation(error: unknown): never {
  const pgErr = error as { code?: string; constraint?: string };
  if (pgErr?.code === '23505') {
    if (pgErr.constraint?.includes('email')) {
      throw new AppHttpError(409, 'Email sudah terdaftar pada pengguna lain.');
    }
    throw new AppHttpError(409, 'Username sudah digunakan oleh pengguna lain.');
  }
  throw error;
}

export class AuthService {
  static async login(
    identifier: string,
    password: string,
    meta: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokensResponse> {
    const normalized = identifier.trim().toLowerCase();
    const userRes = await query(
      `SELECT ${USER_PUBLIC_COLUMNS}, password_hash, token_version
       FROM users
       WHERE LOWER(username) = $1 OR (email IS NOT NULL AND LOWER(email) = $1)
       LIMIT 1`,
      [normalized]
    );

    const userRow = userRes.rows[0] as UserRow | undefined;
    if (!userRow) {
      await verifyPassword(password, DUMMY_SCRYPT_HASH);
      throw new AppHttpError(401, 'Username/email atau password salah.', 'INVALID_CREDENTIALS');
    }

    const passwordValid = await verifyPassword(password, userRow.password_hash);
    if (!passwordValid) {
      throw new AppHttpError(401, 'Username/email atau password salah.', 'INVALID_CREDENTIALS');
    }

    if (!userRow.is_active) {
      throw new AppHttpError(
        403,
        'Akun Anda sedang dinonaktifkan. Hubungi Owner atau Admin.',
        'ACCOUNT_INACTIVE'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updatedUserRes = await client.query(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${USER_PUBLIC_COLUMNS}, password_hash, token_version`,
        [userRow.id]
      );
      const updatedUser = updatedUserRes.rows[0] as UserRow;

      // Keep session table tidy by removing old expired/revoked rows for this user
      await client.query(
        `DELETE FROM user_sessions
         WHERE user_id = $1
           AND (expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
                OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '7 days'))`,
        [userRow.id]
      );

      const sessionId = generateUUIDv7();
      const refresh = generateRefreshToken(sessionId);
      const expiresAt = refreshExpiresAt();

      await client.query(
        `INSERT INTO user_sessions (
           id, user_id, refresh_token_hash, user_agent, ip_address, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sessionId,
          userRow.id,
          refresh.tokenHash,
          meta.userAgent ? meta.userAgent.slice(0, 255) : null,
          meta.ipAddress ? meta.ipAddress.slice(0, 64) : null,
          expiresAt,
        ]
      );

      await client.query('COMMIT');
      return buildAuthResponse(updatedUser, sessionId, refresh.rawToken);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async refresh(rawRefreshToken: string): Promise<AuthTokensResponse> {
    const parsed = parseRefreshToken(rawRefreshToken);
    if (!parsed) {
      throw new AppHttpError(401, 'Refresh token tidak valid.', 'INVALID_REFRESH_TOKEN');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sessionRes = await client.query(
        `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
         FROM user_sessions
         WHERE id = $1
         FOR UPDATE`,
        [parsed.sessionId]
      );

      const session = sessionRes.rows[0] as
        | {
            id: string;
            user_id: string;
            refresh_token_hash: string;
            expires_at: string;
            revoked_at: string | null;
          }
        | undefined;

      if (!session) {
        await client.query('COMMIT');
        throw new AppHttpError(401, 'Sesi tidak ditemukan. Silakan login kembali.', 'SESSION_REVOKED');
      }

      if (
        session.revoked_at !== null ||
        !safeCompareSha256Hex(session.refresh_token_hash, parsed.secretHash)
      ) {
        // Replay of a revoked or rotated refresh token (or tampered secret): revoke all user sessions & bump token_version
        await AuthService.revokeAllUserSessions(client, session.user_id);
        await client.query('COMMIT');
        throw new AppHttpError(
          401,
          'Refresh token telah digunakan atau tidak valid. Silakan login kembali.',
          'TOKEN_REPLAY_DETECTED'
        );
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [session.id]
        );
        await client.query('COMMIT');
        throw new AppHttpError(401, 'Sesi login telah kedaluwarsa. Silakan login kembali.', 'TOKEN_EXPIRED');
      }

      const userRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS}, password_hash, token_version
         FROM users WHERE id = $1`,
        [session.user_id]
      );
      const userRow = userRes.rows[0] as UserRow | undefined;

      if (!userRow || !userRow.is_active) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [session.id]
        );
        await client.query('COMMIT');
        throw new AppHttpError(
          401,
          'Sesi dihentikan karena akun tidak aktif.',
          'ACCOUNT_INACTIVE'
        );
      }

      const rotated = generateRefreshToken(session.id);
      const nextExpiresAt = refreshExpiresAt();

      await client.query(
        `UPDATE user_sessions
         SET refresh_token_hash = $1, expires_at = $2
         WHERE id = $3`,
        [rotated.tokenHash, nextExpiresAt, session.id]
      );

      await client.query('COMMIT');
      return buildAuthResponse(userRow, session.id, rotated.rawToken);
    } catch (err) {
      if (!(err instanceof AppHttpError)) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  static async logout(sessionId: string): Promise<void> {
    await query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId]
    );
  }

  static async logoutAll(userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await AuthService.revokeAllUserSessions(client, userId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Shared helper: increment token_version and revoke all active sessions for a user inside a tx.
   */
  static async revokeAllUserSessions(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      `UPDATE users
       SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );
    await client.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  static async getMe(userId: string): Promise<{ user: UserPublic; permissions: ReturnType<typeof getPermissionsForRole> }> {
    const res = await query(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [userId]
    );
    const user = res.rows[0] as UserPublic | undefined;
    if (!user) {
      throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
    }
    return {
      user,
      permissions: getPermissionsForRole(user.role),
    };
  }

  static async updateProfile(
    userId: string,
    input: { full_name?: string; email?: string | null }
  ): Promise<UserPublic> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.full_name !== undefined) {
      values.push(input.full_name.trim());
      fields.push(`full_name = $${values.length}`);
    }

    if (input.email !== undefined) {
      if (input.email) {
        const dup = await query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
          [input.email, userId]
        );
        if (dup.rows.length > 0) {
          throw new AppHttpError(409, 'Email sudah terdaftar pada pengguna lain.');
        }
      }
      values.push(input.email || null);
      fields.push(`email = $${values.length}`);
    }

    if (fields.length === 0) {
      const me = await this.getMe(userId);
      return me.user;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    try {
      const res = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${USER_PUBLIC_COLUMNS}`,
        values
      );
      if (!res.rows[0]) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }
      return res.rows[0] as UserPublic;
    } catch (err) {
      mapUserUniqueViolation(err);
    }
  }

  static async changePassword(
    userId: string,
    sessionId: string,
    input: { current_password: string; new_password: string },
    meta: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokensResponse> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `SELECT ${USER_PUBLIC_COLUMNS}, password_hash, token_version
         FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      const userRow = userRes.rows[0] as UserRow | undefined;
      if (!userRow) {
        throw new AppHttpError(404, 'Pengguna tidak ditemukan.');
      }

      const validCurrent = await verifyPassword(input.current_password, userRow.password_hash);
      if (!validCurrent) {
        throw new AppHttpError(400, 'Password saat ini tidak sesuai.', 'INVALID_CURRENT_PASSWORD');
      }

      const nextHash = await hashPassword(input.new_password);
      const updatedRes = await client.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = FALSE,
             token_version = token_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${USER_PUBLIC_COLUMNS}, password_hash, token_version`,
        [nextHash, userId]
      );
      const updatedUser = updatedRes.rows[0] as UserRow;

      // Revoke all other sessions immediately
      await client.query(
        `UPDATE user_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
        [userId, sessionId]
      );

      // Rotate refresh token on current active session so this client stays logged in
      const rotated = generateRefreshToken(sessionId);
      const nextExpiresAt = refreshExpiresAt();
      const updatedSession = await client.query(
        `UPDATE user_sessions
         SET refresh_token_hash = $1, expires_at = $2
         WHERE id = $3 AND user_id = $4 AND revoked_at IS NULL
         RETURNING id`,
        [rotated.tokenHash, nextExpiresAt, sessionId, userId]
      );

      let activeSessionId = sessionId;
      let activeRefreshRaw = rotated.rawToken;
      if (updatedSession.rows.length === 0) {
        activeSessionId = generateUUIDv7();
        const fresh = generateRefreshToken(activeSessionId);
        activeRefreshRaw = fresh.rawToken;
        await client.query(
          `INSERT INTO user_sessions (
             id, user_id, refresh_token_hash, user_agent, ip_address, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            activeSessionId,
            userId,
            fresh.tokenHash,
            meta.userAgent ? meta.userAgent.slice(0, 255) : null,
            meta.ipAddress ? meta.ipAddress.slice(0, 64) : null,
            nextExpiresAt,
          ]
        );
      }

      await client.query('COMMIT');
      return buildAuthResponse(updatedUser, activeSessionId, activeRefreshRaw);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
