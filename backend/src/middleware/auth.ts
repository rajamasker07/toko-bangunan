import type { NextFunction, Request, Response } from 'express';
import { query } from '../config/db.js';
import { getPermissionsForRole, hasPermission } from '../config/rbac.js';
import type { Permission, UserRole } from '../types/auth.js';
import { TokenVerificationError, verifyAccessToken } from '../utils/jwt.js';

interface AuthSessionLookupRow {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  token_version: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  session_id: string | null;
  session_revoked_at: string | null;
  session_expires_at: string | null;
}

/**
 * Authenticate every protected request via Bearer JWT + database session/token_version verification.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        code: 'TOKEN_MISSING',
        message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({
        success: false,
        code: 'TOKEN_MISSING',
        message: 'Token autentikasi tidak ditemukan.',
      });
      return;
    }

    const payload = verifyAccessToken(token);

    const result = await query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.full_name,
         u.role,
         u.is_active,
         u.must_change_password,
         u.token_version,
         u.last_login_at,
         u.created_at,
         u.updated_at,
         s.id AS session_id,
         s.revoked_at AS session_revoked_at,
         s.expires_at AS session_expires_at
       FROM users u
       LEFT JOIN user_sessions s ON s.id = $2 AND s.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub, payload.sid]
    );

    const row = result.rows[0] as AuthSessionLookupRow | undefined;
    if (!row) {
      res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Akun tidak ditemukan. Silakan login kembali.',
      });
      return;
    }

    if (!row.is_active) {
      res.status(401).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Sesi dihentikan karena akun telah dinonaktifkan.',
      });
      return;
    }

    if (
      !row.session_id ||
      row.session_revoked_at !== null ||
      !row.session_expires_at ||
      new Date(row.session_expires_at).getTime() <= Date.now()
    ) {
      res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'Sesi Anda telah berakhir atau dicabut. Silakan login kembali.',
      });
      return;
    }

    if (Number(row.token_version) !== Number(payload.tv)) {
      res.status(401).json({
        success: false,
        code: 'SESSION_INVALIDATED',
        message: 'Sesi tidak lagi berlaku karena perubahan keamanan akun. Silakan login kembali.',
      });
      return;
    }

    req.user = {
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
      session_id: row.session_id,
      token_version: Number(row.token_version),
      permissions: getPermissionsForRole(row.role),
    };

    next();
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      res.status(401).json({
        success: false,
        code: err.code,
        message: err.message,
      });
      return;
    }
    next(err);
  }
}

function checkPermissions(
  req: Request,
  res: Response,
  next: NextFunction,
  mode: 'all' | 'any',
  permissions: Permission[]
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      code: 'TOKEN_MISSING',
      message: 'Autentikasi diperlukan.',
    });
    return;
  }

  const allowed =
    mode === 'all'
      ? permissions.every((perm) => hasPermission(req.user!.role, perm))
      : permissions.some((perm) => hasPermission(req.user!.role, perm));

  if (!allowed) {
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Anda tidak memiliki izin untuk melakukan aksi ini.',
    });
    return;
  }

  next();
}

/**
 * Require the authenticated user's role to possess ALL specified permissions.
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    checkPermissions(req, res, next, 'all', permissions);
  };
}

/**
 * Require the authenticated user's role to possess AT LEAST ONE specified permission.
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    checkPermissions(req, res, next, 'any', permissions);
  };
}
