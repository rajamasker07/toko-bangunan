import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxFailedPerAccount: number;
  maxFailedPerIp: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  maxFailedPerAccount: 10,
  maxFailedPerIp: 40,
};

/**
 * Create an in-memory sliding-window login rate limiter keyed by IP + normalized identifier,
 * with a secondary per-IP ceiling and periodic pruning to keep memory bounded.
 */
export function createLoginRateLimiter(options: Partial<RateLimitOptions> = {}) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const accountFailures = new Map<string, number[]>();
  const ipFailures = new Map<string, number[]>();

  const pruneBuckets = (map: Map<string, number[]>, cutoff: number) => {
    for (const [key, timestamps] of map.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        map.delete(key);
      } else if (fresh.length !== timestamps.length) {
        map.set(key, fresh);
      }
    }
  };

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - cfg.windowMs;
    pruneBuckets(accountFailures, cutoff);
    pruneBuckets(ipFailures, cutoff);
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  const getActiveWindow = (map: Map<string, number[]>, key: string, now: number): number[] => {
    const cutoff = now - cfg.windowMs;
    const active = (map.get(key) || []).filter((t) => t > cutoff);
    if (active.length === 0) map.delete(key);
    else map.set(key, active);
    return active;
  };

  const recordFailure = (map: Map<string, number[]>, key: string, now: number, maxEntries = 5000) => {
    if (!map.has(key) && map.size >= maxEntries) {
      pruneBuckets(map, now - cfg.windowMs);
      if (map.size >= maxEntries) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) map.delete(oldestKey);
      }
    }
    const active = getActiveWindow(map, key, now);
    active.push(now);
    map.set(key, active);
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rawIdentifier = req.body?.identifier ?? req.body?.username ?? '';
    const normalizedIdentifier = String(rawIdentifier).trim().toLowerCase();
    const accountKey = `${ip}:${normalizedIdentifier || '_empty'}`;

    const accountList = getActiveWindow(accountFailures, accountKey, now);
    const ipList = getActiveWindow(ipFailures, ip, now);

    if (accountList.length >= cfg.maxFailedPerAccount || ipList.length >= cfg.maxFailedPerIp) {
      const oldestBlocking =
        accountList.length >= cfg.maxFailedPerAccount ? accountList[0] : ipList[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestBlocking + cfg.windowMs - now) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${Math.ceil(retryAfterSeconds / 60)} menit.`,
      });
      return;
    }

    res.on('finish', () => {
      const finishedAt = Date.now();
      if (res.statusCode === 200) {
        accountFailures.delete(accountKey);
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        recordFailure(accountFailures, accountKey, finishedAt);
        recordFailure(ipFailures, ip, finishedAt);
      }
    });

    next();
  };
}

export const loginRateLimiter = createLoginRateLimiter();
