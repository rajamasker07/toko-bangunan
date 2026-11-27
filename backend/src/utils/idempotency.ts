import crypto from 'node:crypto';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AppHttpError } from './errors.js';
import { generateUUIDv7 } from './uuid.js';

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function readHeaderCaseInsensitive(req: Request, name: string): string | undefined {
  if (typeof req?.header === 'function') {
    const val = req.header(name);
    return typeof val === 'string' ? val : undefined;
  }
  const rawHeaders = req?.headers as Record<string, unknown> | undefined;
  if (!rawHeaders || typeof rawHeaders !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (k.toLowerCase() === target) {
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
  }
  return undefined;
}

/**
 * Normalisasi & validasi idempotency_key opsional dari body JSON dan/atau HTTP header.
 * Jika keduanya dikirim, nilainya wajib identik.
 */
export function resolveIdempotencyKey(
  req: Request,
  explicitBodyKey?: unknown
): string | undefined {
  const rawBodyKey =
    explicitBodyKey !== undefined ? explicitBodyKey : (req?.body as Record<string, unknown>)?.idempotency_key;

  const headerPrimary = readHeaderCaseInsensitive(req, 'Idempotency-Key');
  const headerAlt = readHeaderCaseInsensitive(req, 'X-Idempotency-Key');
  const rawHeaderKey = headerPrimary !== undefined ? headerPrimary : headerAlt;

  let bodyKey: string | undefined;
  if (rawBodyKey !== undefined && rawBodyKey !== null) {
    if (typeof rawBodyKey !== 'string') {
      throw new AppHttpError(
        400,
        'Field idempotency_key harus berupa teks (8-128 karakter).',
        'INVALID_IDEMPOTENCY_KEY'
      );
    }
    const trimmed = rawBodyKey.trim();
    if (trimmed !== '') {
      if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
        throw new AppHttpError(
          400,
          'Format idempotency_key tidak valid (gunakan 8-128 karakter alfanumerik, titik, garis bawah, titik dua, atau tanda hubung).',
          'INVALID_IDEMPOTENCY_KEY'
        );
      }
      bodyKey = trimmed;
    }
  }

  let headerKey: string | undefined;
  if (rawHeaderKey !== undefined && rawHeaderKey !== null) {
    const trimmed = rawHeaderKey.trim();
    if (trimmed !== '') {
      if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
        throw new AppHttpError(
          400,
          'Format header Idempotency-Key tidak valid (gunakan 8-128 karakter alfanumerik, titik, garis bawah, titik dua, atau tanda hubung).',
          'INVALID_IDEMPOTENCY_KEY'
        );
      }
      headerKey = trimmed;
    }
  }

  if (bodyKey && headerKey && bodyKey !== headerKey) {
    throw new AppHttpError(
      400,
      'Nilai header Idempotency-Key dan body idempotency_key tidak sama.',
      'IDEMPOTENCY_KEY_MISMATCH'
    );
  }

  return bodyKey || headerKey;
}

export function validateOptionalIdempotencyKey(rawKey: unknown): string | undefined {
  if (rawKey === undefined || rawKey === null) return undefined;
  if (typeof rawKey !== 'string') {
    throw new AppHttpError(
      400,
      'Field idempotency_key harus berupa teks (8-128 karakter).',
      'INVALID_IDEMPOTENCY_KEY'
    );
  }
  const trimmed = rawKey.trim();
  if (trimmed === '') return undefined;
  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
    throw new AppHttpError(
      400,
      'Format idempotency_key tidak valid (gunakan 8-128 karakter alfanumerik, titik, garis bawah, titik dua, atau tanda hubung).',
      'INVALID_IDEMPOTENCY_KEY'
    );
  }
  return trimmed;
}

function canonicalizeJson(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (obj[key] !== undefined) {
      result[key] = canonicalizeJson(obj[key]);
    }
  }
  return result;
}

export function computeRequestHash(payload: unknown): string {
  const serialized = JSON.stringify(canonicalizeJson(payload));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export interface IdempotencyCheckResult<T> {
  hit: boolean;
  statusCode?: number;
  responseBody?: T;
}

/**
 * Mengambil transactional advisory lock per (userId, scope, key) dan memeriksa apakah
 * mutasi dengan idempotency_key ini sudah pernah dieksekusi sebelumnya.
 * Wajib dipanggil di dalam blok BEGIN ... COMMIT pada PoolClient yang sama.
 */
export async function acquireAndCheckIdempotency<T>(
  client: PoolClient,
  params: {
    userId: string;
    scope: string;
    key: string;
    requestHash: string;
  }
): Promise<IdempotencyCheckResult<T>> {
  const namespace = `${params.userId}:${params.scope}`;

  // Serialisasi request paralel identik pada transaksi PostgreSQL yang sama (otomatis lepas saat COMMIT/ROLLBACK)
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    namespace,
    params.key,
  ]);

  const existingRes = await client.query(
    `SELECT id, request_hash, status_code, response_body, expires_at <= CURRENT_TIMESTAMP AS is_expired
     FROM idempotency_keys
     WHERE user_id = $1 AND scope = $2 AND idempotency_key = $3`,
    [params.userId, params.scope, params.key]
  );

  if (existingRes.rows.length === 0) {
    return { hit: false };
  }

  const row = existingRes.rows[0];
  if (row.is_expired) {
    await client.query('DELETE FROM idempotency_keys WHERE id = $1', [row.id]);
    return { hit: false };
  }

  if (row.request_hash !== params.requestHash) {
    throw new AppHttpError(
      422,
      'Idempotency key ini sudah pernah digunakan dengan isi permintaan (payload) yang berbeda.',
      'IDEMPOTENCY_PAYLOAD_MISMATCH'
    );
  }

  return {
    hit: true,
    statusCode: Number(row.status_code) || 200,
    responseBody: row.response_body as T,
  };
}

/**
 * Menyimpan hasil sukses mutasi ke tabel idempotency_keys dalam transaksi yang sama sebelum COMMIT.
 */
export async function saveIdempotencyResult(
  client: PoolClient,
  params: {
    userId: string;
    scope: string;
    key: string;
    requestHash: string;
    statusCode?: number;
    responseBody: unknown;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_keys (
       id, user_id, scope, idempotency_key, request_hash, status_code, response_body,
       created_at, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::jsonb,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days'
     )`,
    [
      generateUUIDv7(),
      params.userId,
      params.scope,
      params.key,
      params.requestHash,
      params.statusCode ?? 200,
      JSON.stringify(params.responseBody),
    ]
  );
}
