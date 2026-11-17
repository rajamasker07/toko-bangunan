import fs from 'node:fs';
import path from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);
const isErrorOnly = args.includes('--error') || args.includes('-e');
const isHttpOnly = args.includes('--http');
const isFollow = args.includes('--follow') || args.includes('-f');

let lineCount = 50;
const nIdx = args.findIndex((a) => a === '-n' || a === '--lines');
if (nIdx !== -1 && args[nIdx + 1]) {
  const parsed = parseInt(args[nIdx + 1], 10);
  if (!Number.isNaN(parsed) && parsed > 0) lineCount = parsed;
}

const targetFile = isErrorOnly ? 'error.log' : isHttpOnly ? 'http.log' : 'app.log';
const logDir = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.resolve(process.cwd(), 'logs');
const logPath = path.join(logDir, targetFile);

console.log(`\x1b[36m\x1b[1m=== Toko Bangunan Log Viewer [${targetFile}] ===\x1b[0m`);
console.log(`\x1b[90mTarget: ${logPath} | Menampilkan ${lineCount} baris terakhir${isFollow ? ' (Mode Follow Aktif)' : ''}\x1b[0m\n`);

if (!fs.existsSync(logPath)) {
  console.log(`\x1b[33mFile log "${targetFile}" belum memiliki rekaman.\x1b[0m`);
  process.exit(0);
}

function colorizeLogLine(line: string): string {
  if (line.includes('[ERROR]') || line.includes('[FATAL]')) {
    return `\x1b[31m${line}\x1b[0m`;
  }
  if (line.includes('[WARN ]') || line.includes('[WARN]')) {
    return `\x1b[33m${line}\x1b[0m`;
  }
  if (line.includes('[INFO ]') || line.includes('[INFO]')) {
    return `\x1b[36m${line}\x1b[0m`;
  }
  if (line.includes('[DEBUG]')) {
    return `\x1b[90m${line}\x1b[0m`;
  }
  return line;
}

function readLastLines(filePath: string, maxLines: number): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

const initialLines = readLastLines(logPath, lineCount);
for (const line of initialLines) {
  console.log(colorizeLogLine(line));
}

if (isFollow) {
  let currentSize = fs.statSync(logPath).size;
  fs.watch(logPath, (eventType) => {
    if (eventType === 'change') {
      try {
        const stat = fs.statSync(logPath);
        if (stat.size > currentSize) {
          const stream = fs.createReadStream(logPath, {
            start: currentSize,
            end: stat.size,
            encoding: 'utf8',
          });
          currentSize = stat.size;
          stream.on('data', (chunk) => {
            const newLines = chunk.toString().split('\n').filter(Boolean);
            for (const l of newLines) {
              console.log(colorizeLogLine(l));
            }
          });
        } else if (stat.size < currentSize) {
          // File was rotated
          currentSize = stat.size;
        }
      } catch {
        // Ignore read errors during rotation
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('\n\x1b[90mLog viewer dihentikan.\x1b[0m');
    process.exit(0);
  });
}
