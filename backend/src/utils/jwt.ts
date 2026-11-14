import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { isValidRole } from '../config/rbac.js';
import type { JwtAccessPayload, UserRole } from '../types/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TokenVerificationError extends Error {
  constructor(
    public readonly code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID',
    message: string
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecodeToString(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signHmacSha256(signingInput: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
}

/**
 * Compare two strings safely in constant time via equal-length buffers.
 */
export function safeTimingEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Sign an RFC 7519 HS256 JWT access token with zero external dependencies.
 */
export function signAccessToken(input: {
  sub: string;
  sid: string;
  tv: number;
  role: UserRole;
}): { token: string; expiresIn: number } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresIn = env.jwtAccessTtlSeconds;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtAccessPayload = {
    sub: input.sub,
    sid: input.sid,
    tv: input.tv,
    role: input.role,
    iat: nowSeconds,
    exp: nowSeconds + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signHmacSha256(signingInput, env.jwtAccessSecret);

  return {
    token: `${signingInput}.${signature}`,
    expiresIn,
  };
}

/**
 * Verify and decode an HS256 JWT access token.
 */
export function verifyAccessToken(token: string): JwtAccessPayload {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new TokenVerificationError('TOKEN_INVALID', 'Format token tidak valid.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signHmacSha256(signingInput, env.jwtAccessSecret);

  if (!safeTimingEqualString(encodedSignature, expectedSignature)) {
    throw new TokenVerificationError('TOKEN_INVALID', 'Tanda tangan token tidak valid.');
  }

  let header: { alg?: string; typ?: string };
  let payload: Partial<JwtAccessPayload>;
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader));
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    throw new TokenVerificationError('TOKEN_INVALID', 'Payload token rusak.');
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new TokenVerificationError('TOKEN_INVALID', 'Algoritma token tidak didukung.');
  }

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.tv !== 'number' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.role !== 'string' ||
    !isValidRole(payload.role)
  ) {
    throw new TokenVerificationError('TOKEN_INVALID', 'Klaim token tidak lengkap.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new TokenVerificationError('TOKEN_EXPIRED', 'Sesi akses telah kedaluwarsa.');
  }

  return payload as JwtAccessPayload;
}

/**
 * Hash a refresh secret using SHA-256 hex for safe database storage.
 */
export function hashRefreshSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Generate a new opaque refresh token bound to a user_sessions row (`<sessionId>.<secretHex>`).
 */
export function generateRefreshToken(sessionId: string): {
  rawToken: string;
  tokenHash: string;
} {
  const secret = crypto.randomBytes(32).toString('hex');
  return {
    rawToken: `${sessionId}.${secret}`,
    tokenHash: hashRefreshSecret(secret),
  };
}

/**
 * Parse and hash an incoming `<sessionId>.<secretHex>` refresh token.
 */
export function parseRefreshToken(rawToken: string): {
  sessionId: string;
  secretHash: string;
} | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const parts = rawToken.trim().split('.');
  if (parts.length !== 2) return null;

  const [sessionId, secret] = parts;
  if (!UUID_REGEX.test(sessionId) || !/^[0-9a-f]{64}$/i.test(secret)) {
    return null;
  }

  return {
    sessionId,
    secretHash: hashRefreshSecret(secret),
  };
}

/**
 * Compare two SHA-256 hex strings safely in constant time.
 */
export function safeCompareSha256Hex(aHex: string, bHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(aHex) || !/^[0-9a-f]{64}$/i.test(bHex)) {
    return false;
  }
  const bufA = Buffer.from(aHex, 'hex');
  const bufB = Buffer.from(bHex, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}
