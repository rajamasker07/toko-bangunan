import pg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5432/toko_bangunan',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.fatal('DATABASE', 'Unexpected error on idle PostgreSQL client', {}, err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn('DATABASE', `Slow query detected (${duration}ms)`, {
        durationMs: duration,
        query: text.replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    }
    return res;
  } catch (err: any) {
    logger.error('DATABASE', `Query error: ${err.message}`, {
      query: text.replace(/\s+/g, ' ').trim().slice(0, 300),
    }, err);
    throw err;
  }
};
