import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { env } from './config/env.js';
import apiRouter from './routes/api.js';
import { initializeDatabase } from './db/init.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './utils/logger.js';
import { EmbeddingService } from './services/embeddingService.js';

const app = express();
const port = env.port;

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan jika tanpa origin (curl, server-to-server), wildcard '*', atau origin ada di daftar corsOrigins
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Dalam mode development: izinkan akses dari localhost atau IP LAN privat (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (!env.isProduction) {
        try {
          const url = new URL(origin);
          const hostname = url.hostname;
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
          ) {
            callback(null, true);
            return;
          }
        } catch {
          // ignore parsing error
        }
      }

      callback(new Error(`Origin ${origin} tidak diizinkan oleh kebijakan CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  })
);
app.use(express.json());

// Production-ready correlated request logger with ANSI terminal output, file storage & ring-buffer
app.use(requestLogger);

// API Routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Toko Bangunan API', timestamp: new Date() });
});

// Root welcome
app.get('/', (_req, res) => {
  res.json({
    name: 'Toko Bangunan Backend API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      products: '/api/products',
      categories: '/api/categories',
      stock: '/api/stock/movements',
      dashboard: '/api/dashboard/summary'
    }
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError || err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      logger.warn('HTTP', 'Upload rejected: file size exceeds 5 MB limit', { ip: req.ip });
      res.status(413).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: 'Ukuran file melebihi batas maksimal 5 MB.',
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      logger.warn('HTTP', 'Upload rejected: invalid upload field', { ip: req.ip });
      res.status(400).json({
        success: false,
        code: 'INVALID_UPLOAD_FIELD',
        message: 'Field upload tidak valid (gunakan field "file" untuk 1 file).',
      });
      return;
    }
    logger.warn('HTTP', `Upload error: ${err.message}`, { ip: req.ip });
    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: err.message || 'Gagal mengunggah file import.',
    });
    return;
  }

  const statusCode =
    typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.message === 'string' && err.message.includes('CORS')
        ? 403
        : 500;

  if (statusCode >= 500) {
    logger.error('SYSTEM', `Unhandled server error: ${err.message || 'Internal error'}`, {
      statusCode,
      method: req.method,
      url: req.originalUrl,
    }, err);
  } else {
    logger.warn('HTTP', `Client error rejected (${statusCode}): ${err.message}`, {
      statusCode,
      method: req.method,
      url: req.originalUrl,
    });
  }

  res.status(statusCode).json({
    success: false,
    ...(typeof err?.code === 'string' ? { code: err.code } : {}),
    message: err.message || 'Terjadi kesalahan internal server',
  });
});

// Process crash & unhandled exception guards
process.on('uncaughtException', (err) => {
  logger.fatal('SYSTEM', `Uncaught Exception detected: ${err.message}`, {}, err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('SYSTEM', 'Unhandled Promise Rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Auto initialize tables if not exists and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      logger.info('SYSTEM', `🚀 Toko Bangunan API server running on http://localhost:${port}`);
      // Inisialisasi semantic search & embedding engine di latar belakang (non-blocking)
      EmbeddingService.initializeInBackground().catch((err) => {
        logger.warn('AI_EMBEDDING', `Inisialisasi embedding background gagal: ${err.message}`);
      });
    });
  } catch (err) {
    logger.fatal('SYSTEM', 'Failed to start server during initialization', {}, err);
    process.exit(1);
  }
}

startServer();
