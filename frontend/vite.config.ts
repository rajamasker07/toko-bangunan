import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveBuildMetadata() {
  let version = '1.0.0';
  let apiVersion = 'v1';

  const rootVersionPath = path.resolve(__dirname, '../version.json');
  const pkgPath = path.resolve(__dirname, './package.json');

  try {
    if (fs.existsSync(rootVersionPath)) {
      const meta = JSON.parse(fs.readFileSync(rootVersionPath, 'utf8'));
      if (meta.version) version = String(meta.version);
      if (meta.apiVersion) apiVersion = String(meta.apiVersion);
    } else if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) version = String(pkg.version);
    }
  } catch {
    // fallback ke default aman
  }

  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // abaikan jika di luar git repo
  }

  return {
    version,
    apiVersion,
    commit,
    buildTime: new Date().toISOString(),
  };
}

const buildMeta = resolveBuildMetadata();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildMeta.version),
    __APP_COMMIT__: JSON.stringify(buildMeta.commit),
    __APP_API_VERSION__: JSON.stringify(buildMeta.apiVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildMeta.buildTime),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
