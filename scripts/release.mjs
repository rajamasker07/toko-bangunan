#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VERSION_JSON_PATH = path.join(ROOT_DIR, 'version.json');
const ROOT_PKG_PATH = path.join(ROOT_DIR, 'package.json');
const BACKEND_PKG_PATH = path.join(ROOT_DIR, 'backend', 'package.json');
const FRONTEND_PKG_PATH = path.join(ROOT_DIR, 'frontend', 'package.json');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function execSafe(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function bumpSemver(current, mode) {
  const match = SEMVER_REGEX.exec(current);
  if (!match) {
    throw new Error(`Versi saat ini tidak valid (harus X.Y.Z): "${current}"`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (mode === 'major') return `${major + 1}.0.0`;
  if (mode === 'minor') return `${major}.${minor + 1}.0`;
  if (mode === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (SEMVER_REGEX.test(mode)) return mode;

  throw new Error(
    `Argumen rilis tidak dikenal: "${mode}". Gunakan: sync | patch | minor | major | X.Y.Z`
  );
}

function getLastGitTag() {
  return execSafe('git describe --tags --abbrev=0');
}

function collectCommitsSince(lastTag) {
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD -n 30';
  const raw = execSafe(`git log ${range} --pretty=format:"%h|%s"`);
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('|');
      if (idx === -1) return null;
      return {
        hash: line.slice(0, idx).trim(),
        subject: line.slice(idx + 1).trim(),
      };
    })
    .filter((item) => item && !item.subject.startsWith('chore(release):'));
}

function buildChangelogEntry(newVersion, releaseDate, commits) {
  const groups = {
    feat: [],
    fix: [],
    perf: [],
    other: [],
  };

  for (const c of commits) {
    if (/^feat(\(.+\))?!?:/i.test(c.subject)) {
      groups.feat.push(`- ${c.subject} (\`${c.hash}\`)`);
    } else if (/^fix(\(.+\))?!?:/i.test(c.subject)) {
      groups.fix.push(`- ${c.subject} (\`${c.hash}\`)`);
    } else if (/^(perf|refactor)(\(.+\))?!?:/i.test(c.subject)) {
      groups.perf.push(`- ${c.subject} (\`${c.hash}\`)`);
    } else if (!/^Merge /i.test(c.subject)) {
      groups.other.push(`- ${c.subject} (\`${c.hash}\`)`);
    }
  }

  const lines = [`## [v${newVersion}] - ${releaseDate}`, ''];

  if (groups.feat.length > 0) {
    lines.push('### Fitur Baru', ...groups.feat, '');
  }
  if (groups.fix.length > 0) {
    lines.push('### Perbaikan Bug', ...groups.fix, '');
  }
  if (groups.perf.length > 0) {
    lines.push('### Peningkatan & Refaktor', ...groups.perf, '');
  }
  if (groups.other.length > 0 && groups.feat.length === 0 && groups.fix.length === 0) {
    lines.push('### Perubahan Lainnya', ...groups.other, '');
  }
  if (
    groups.feat.length === 0 &&
    groups.fix.length === 0 &&
    groups.perf.length === 0 &&
    groups.other.length === 0
  ) {
    lines.push('- Pemeliharaan rutin dan sinkronisasi versi rilis.', '');
  }

  return lines.join('\n');
}

function prependChangelog(entryText, newVersion) {
  const header =
    '# Changelog\n\nSeluruh perubahan penting pada aplikasi **Toko Bangunan** dicatat dalam dokumen ini.\nFormat mengacu pada Semantic Versioning (`MAJOR.MINOR.PATCH`).\n\n';

  if (!fs.existsSync(CHANGELOG_PATH)) {
    fs.writeFileSync(CHANGELOG_PATH, `${header}${entryText}`, 'utf8');
    return;
  }

  const existing = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  if (existing.includes(`## [v${newVersion}]`)) {
    return;
  }

  const firstSectionIdx = existing.indexOf('## [');
  if (firstSectionIdx === -1) {
    fs.writeFileSync(CHANGELOG_PATH, `${existing.trimEnd()}\n\n${entryText}`, 'utf8');
  } else {
    const before = existing.slice(0, firstSectionIdx);
    const after = existing.slice(firstSectionIdx);
    fs.writeFileSync(CHANGELOG_PATH, `${before}${entryText}${after}`, 'utf8');
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noGit = args.includes('--no-git');
  const allowDirty = args.includes('--allow-dirty');
  const positional = args.filter((a) => !a.startsWith('--'));
  const action = positional[0] || 'sync';

  const versionData = readJson(VERSION_JSON_PATH);
  const currentVersion = versionData.version;

  if (action === 'sync') {
    for (const pkgPath of [ROOT_PKG_PATH, BACKEND_PKG_PATH, FRONTEND_PKG_PATH]) {
      if (fs.existsSync(pkgPath)) {
        const pkg = readJson(pkgPath);
        pkg.version = currentVersion;
        if (!dryRun) writeJson(pkgPath, pkg);
      }
    }
    console.log(
      `[VERSION] Sinkronisasi selesai -> v${currentVersion} (API ${versionData.apiVersion || 'v1'})${dryRun ? ' [DRY-RUN]' : ''}`
    );
    return;
  }

  if (!dryRun && !noGit && !allowDirty) {
    const dirty = execSafe('git status --porcelain');
    if (dirty) {
      console.error(
        '[ERROR] Working tree Git masih memiliki perubahan yang belum di-commit.\n' +
          'Harap commit/stash terlebih dahulu atau tambahkan flag --no-git / --dry-run.'
      );
      process.exit(1);
    }
  }

  const nextVersion = bumpSemver(currentVersion, action);
  const today = new Date().toISOString().slice(0, 10);
  const lastTag = getLastGitTag();
  const commits = collectCommitsSince(lastTag);
  const changelogEntry = buildChangelogEntry(nextVersion, today, commits);

  console.log(`=== Rilis Toko Bangunan: v${currentVersion} -> v${nextVersion} ===`);
  if (lastTag) {
    console.log(`Tag sebelumnya : ${lastTag}`);
  }
  console.log(`Commit tercatat: ${commits.length} commit`);

  if (dryRun) {
    console.log('\n--- Pratinjau CHANGELOG.md (DRY-RUN) ---\n');
    console.log(changelogEntry);
    console.log('[DRY-RUN] Tidak ada file, commit, atau git tag yang diubah.');
    return;
  }

  // 1. Update version.json
  versionData.version = nextVersion;
  versionData.releasedAt = today;
  writeJson(VERSION_JSON_PATH, versionData);

  // 2. Sync package.json di seluruh workspace
  for (const pkgPath of [ROOT_PKG_PATH, BACKEND_PKG_PATH, FRONTEND_PKG_PATH]) {
    if (fs.existsSync(pkgPath)) {
      const pkg = readJson(pkgPath);
      pkg.version = nextVersion;
      writeJson(pkgPath, pkg);
    }
  }

  // 3. Update CHANGELOG.md
  prependChangelog(changelogEntry, nextVersion);

  // 4. Buat commit & git tag lokal (tanpa auto-push)
  if (!noGit) {
    execSync(
      'git add version.json package.json backend/package.json frontend/package.json CHANGELOG.md',
      { cwd: ROOT_DIR, stdio: 'inherit' }
    );
    execSync(`git commit -m "chore(release): v${nextVersion}"`, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    execSync(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    console.log(
      `\n✅ Rilis v${nextVersion} berhasil dibuat secara lokal (commit + git tag v${nextVersion}).`
    );
    console.log(`Gunakan "git push && git push --tags" saat Anda siap mengunggah ke remote.`);
  } else {
    console.log(`\n✅ File versi & CHANGELOG berhasil diperbarui ke v${nextVersion} (--no-git).`);
  }
}

main();
