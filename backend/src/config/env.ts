import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse duration string like "15m", "8h", "7d", "900s", or numeric seconds into seconds.
 */
function parseDurationToSeconds(raw: string | undefined, fallbackSeconds: number): number {
  if (!raw) return fallbackSeconds;
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    const val = Number(trimmed);
    return val > 0 ? val : fallbackSeconds;
  }

  const match = trimmed.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return fallbackSeconds;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return amount > 0 ? amount * multipliers[unit] : fallbackSeconds;
}

function resolveJwtAccessSecret(): string {
  const configured = process.env.JWT_ACCESS_SECRET?.trim() || '';
  const isProd = process.env.NODE_ENV === 'production';

  if (configured.length >= 32) {
    return configured;
  }

  if (isProd) {
    throw new Error(
      'JWT_ACCESS_SECRET wajib diisi minimal 32 karakter saat NODE_ENV=production.'
    );
  }

  console.warn(
    '⚠️  JWT_ACCESS_SECRET belum diisi (minimal 32 karakter); memakai secret ephemeral dev sementara (token akan reset saat server restart).'
  );
  return crypto.randomBytes(32).toString('hex');
}

function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return ['http://localhost:3000', 'http://localhost:5173'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const refreshDaysRaw = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  jwtAccessSecret: resolveJwtAccessSecret(),
  jwtAccessTtlSeconds: parseDurationToSeconds(process.env.JWT_ACCESS_EXPIRES_IN, 15 * 60),
  jwtRefreshTtlDays: Number.isFinite(refreshDaysRaw) && refreshDaysRaw > 0 ? refreshDaysRaw : 7,
  corsOrigins: resolveCorsOrigins(),
  bootstrapOwner: {
    username: (process.env.BOOTSTRAP_OWNER_USERNAME || 'owner').trim().toLowerCase(),
    fullName: (process.env.BOOTSTRAP_OWNER_NAME || 'Pemilik Toko').trim(),
    email: process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase() || null,
    password: process.env.BOOTSTRAP_OWNER_PASSWORD?.trim() || null,
    forcePasswordChange: process.env.BOOTSTRAP_FORCE_PASSWORD_CHANGE !== 'false',
  },
} as const;
