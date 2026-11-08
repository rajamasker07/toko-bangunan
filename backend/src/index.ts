import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRouter from './routes/api.js';
import { initializeDatabase } from './db/init.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
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
  res.status(500).json({
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
