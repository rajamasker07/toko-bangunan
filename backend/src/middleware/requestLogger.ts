import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { generateUUIDv7 } from '../utils/uuid.js';

// Extend Express Request interface to include id and user
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Contextual request logging middleware.
 * Assigns correlation ID, measures latency, attaches user identity, and writes structured logs.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startNs = process.hrtime.bigint();
  const requestId = (req.headers['x-request-id'] as string) || `req-${generateUUIDv7().slice(0, 18)}`;

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const userAgent = req.headers['user-agent'] || '-';
  const method = req.method;
  const url = req.originalUrl || req.url;

  // Run downstream middlewares and handlers within AsyncLocalStorage context
  logger.runWithContext(
    {
      requestId,
      ip,
      method,
      url,
    },
    () => {
      let isLogged = false;

      const logRequestCompletion = () => {
        if (isLogged) return;
        isLogged = true;

        const durationNs = process.hrtime.bigint() - startNs;
        const durationMs = Number(durationNs) / 1_000_000;
        const statusCode = res.statusCode;

        // Extract user context if authenticated
        const user = (req as any).user;
        const username = user?.username || (user?.id ? `id:${user.id.slice(0, 8)}` : null);
        const role = user?.role;

        const userInfo = username ? ` - User: ${username}${role ? ` (${role})` : ''}` : '';
        const message = `${method} ${url} ${statusCode} (${durationMs.toFixed(1)}ms)${userInfo}`;

        const context: Record<string, unknown> = {
          requestId,
          method,
          url,
          statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          ip,
          userAgent,
          ...(username ? { username } : {}),
          ...(role ? { role } : {}),
          ...(user?.id ? { userId: user.id } : {}),
        };

        if (statusCode >= 500) {
          logger.error('HTTP', message, context);
        } else if (statusCode >= 400) {
          logger.warn('HTTP', message, context);
        } else {
          logger.info('HTTP', message, context);
        }
      };

      res.on('finish', logRequestCompletion);
      res.on('close', () => {
        if (!res.writableEnded) {
          logRequestCompletion();
        }
      });

      next();
    }
  );
}
