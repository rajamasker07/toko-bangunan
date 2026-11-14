import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAXMEM = 32 * 1024 * 1024;

function deriveScryptKey(
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash a plaintext password using async Node.js crypto.scrypt with a random 16-byte salt.
 * Stored format: `scrypt$N$r$p$<saltHex>$<hashHex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derivedKey = await deriveScryptKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N <= 1 ||
    r <= 0 ||
    p <= 0 ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(hashHex) ||
    hashHex.length % 2 !== 0
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(hashHex, 'hex');
    const maxmem = 32 * 1024 * 1024;
    const derivedKey = await deriveScryptKey(password, salt, expectedKey.length, {
      N,
      r,
      p,
      maxmem,
    });
    if (derivedKey.length !== expectedKey.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * Generate a URL-safe random temporary password guaranteed to contain letters and digits.
 */
export function generateRandomPassword(length = 14): string {
  const raw = crypto.randomBytes(Math.max(12, length)).toString('base64url').slice(0, length);
  return `${raw}A9`;
}
