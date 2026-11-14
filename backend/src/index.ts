import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import apiRouter from './routes/api.js';
import { initializeDatabase } from './db/init.js';

const app = express();
const port = env.port;

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} tidak diizinkan oleh kebijakan CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(morgan('dev'));

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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  const statusCode =
    typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.message === 'string' && err.message.includes('CORS')
        ? 403
        : 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal server'
  });
});

// Auto initialize tables if not exists and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`🚀 Toko Bangunan API server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
