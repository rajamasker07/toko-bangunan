import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

export interface AppVersionInfo {
  name: string;
  version: string;
  apiVersion: string;
  commit: string;
  releasedAt: string | null;
  startedAt: string;
  uptimeSeconds: number;
  environment: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Baik dari src/utils maupun dist/utils, ../../../ mengarah ke root monorepo
const ROOT_VERSION_FILE = path.resolve(__dirname, '../../../version.json');
const BACKEND_PACKAGE_FILE = path.resolve(__dirname, '../../package.json');

const STARTED_AT = new Date().toISOString();

function readJsonSafe(filePath: string): Record<string, any> | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // fallback ke sumber berikutnya
  }
  return null;
}

function resolveGitCommit(): string {
  if (process.env.APP_COMMIT && process.env.APP_COMMIT.trim()) {
    return process.env.APP_COMMIT.trim();
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: path.resolve(__dirname, '../../..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const rootMeta = readJsonSafe(ROOT_VERSION_FILE);
const pkgMeta = readJsonSafe(BACKEND_PACKAGE_FILE);

const CACHED_BASE_VERSION = {
  name: String(rootMeta?.name || pkgMeta?.name || 'toko-bangunan'),
  version: String(
    process.env.APP_VERSION?.trim() || rootMeta?.version || pkgMeta?.version || '1.0.0'
  ),
  apiVersion: String(rootMeta?.apiVersion || 'v1'),
  commit: resolveGitCommit(),
  releasedAt: typeof rootMeta?.releasedAt === 'string' ? rootMeta.releasedAt : null,
};

export function getAppVersionInfo(): AppVersionInfo {
  return {
    ...CACHED_BASE_VERSION,
    startedAt: STARTED_AT,
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.isProduction ? 'production' : 'development',
  };
}
