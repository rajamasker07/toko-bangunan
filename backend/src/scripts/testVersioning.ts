import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getAppVersionInfo } from '../utils/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

function readJson(relPath: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8'));
}

function runTests() {
  console.log('🧪 Memulai pengujian konsistensi & mekanisme App Versioning...\n');

  const versionFile = readJson('version.json');
  const rootPkg = readJson('package.json');
  const backendPkg = readJson('backend/package.json');
  const frontendPkg = readJson('frontend/package.json');

  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(versionFile.version)) {
    throw new Error(`version.json memiliki format tidak valid: ${versionFile.version}`);
  }

  console.log(`1. Cek sinkronisasi SemVer lintas workspace (${versionFile.version})...`);
  if (
    rootPkg.version !== versionFile.version ||
    backendPkg.version !== versionFile.version ||
    frontendPkg.version !== versionFile.version
  ) {
    throw new Error(
      `Versi tidak sinkron! version.json=${versionFile.version}, root=${rootPkg.version}, backend=${backendPkg.version}, frontend=${frontendPkg.version}`
    );
  }
  console.log('   ✓ Seluruh file manifest sinkron.');

  console.log('2. Cek output runtime getAppVersionInfo()...');
  const runtimeInfo = getAppVersionInfo();
  console.log(
    `   ✓ Runtime info: v${runtimeInfo.version} (${runtimeInfo.commit}) | API ${runtimeInfo.apiVersion} | Env: ${runtimeInfo.environment}`
  );
  if (runtimeInfo.version !== versionFile.version) {
    throw new Error(`getAppVersionInfo().version (${runtimeInfo.version}) != ${versionFile.version}`);
  }
  if (runtimeInfo.apiVersion !== (versionFile.apiVersion || 'v1')) {
    throw new Error(`apiVersion tidak sesuai: ${runtimeInfo.apiVersion}`);
  }
  if (!runtimeInfo.commit) {
    throw new Error('Commit hash kosong');
  }

  console.log('3. Cek simulasi skrip rilis (node scripts/release.mjs patch --dry-run)...');
  const dryOutput = execSync('node scripts/release.mjs patch --dry-run', {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();

  const [maj, min, pat] = versionFile.version.split('.').map(Number);
  const expectedNextPatch = `${maj}.${min}.${pat + 1}`;
  if (!dryOutput.includes(`v${expectedNextPatch}`)) {
    throw new Error(
      `Output dry-run tidak menampilkan target versi v${expectedNextPatch}:\n${dryOutput}`
    );
  }

  // Pastikan dry-run tidak memodifikasi version.json
  const afterDryRun = readJson('version.json');
  if (afterDryRun.version !== versionFile.version) {
    throw new Error('Mode --dry-run tidak boleh memodifikasi version.json!');
  }
  console.log(`   ✓ Simulasi rilis patch -> v${expectedNextPatch} valid & bebas efek samping.`);

  console.log('\n✅ Semua pengujian App Versioning LULUS!');
}

runTests();
