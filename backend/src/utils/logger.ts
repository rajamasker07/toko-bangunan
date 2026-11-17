import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  LogCategory,
  LogEntry,
  LogFileInfo,
  LogFilterOptions,
  LogLevel,
  LogStats,
  RequestLogContext,
} from '../types/log.js';
import { generateUUIDv7 } from './uuid.js';

// Priority mapping for log levels
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// ANSI color codes for terminal formatting
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  brightGreen: '\x1b[92m',
};

// Sensitive field keys that must be sanitized before output
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'old_password',
  'new_password',
  'current_password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'jwt',
  'cookie',
  'credit_card',
  'cvv',
]);

const MAX_BUFFER_SIZE = 1000;
const MAX_LOG_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file before auto-rotate
const MAX_ARCHIVES_PER_TYPE = 10;

/**
 * Format bytes to readable string (e.g. 1.25 MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Sanitize context object to prevent sensitive data leaks
 */
export function sanitizeContext(data: unknown, depth = 0): unknown {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > 2000) {
      return `${data.slice(0, 2000)}... [TRUNCATED]`;
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitizeContext(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token')) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeContext(val, depth + 1);
    }
  }
  return sanitized;
}

/**
 * Logger class with dual-output (ANSI terminal + file transports + memory ring buffer)
 */
export class Logger {
  private logDir: string;
  private minLevel: LogLevel;
  private memoryBuffer: LogEntry[] = [];
  private requestContext = new AsyncLocalStorage<RequestLogContext>();
  private startTime = Date.now();

  constructor() {
    this.logDir = process.env.LOG_DIR
      ? path.resolve(process.env.LOG_DIR)
      : path.resolve(process.cwd(), 'logs');

    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    this.minLevel =
      envLevel && LEVEL_PRIORITY[envLevel] !== undefined
        ? envLevel
        : process.env.NODE_ENV === 'production'
          ? 'info'
          : 'debug';

    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create logs directory:', err);
    }
  }

  /**
   * Run a function within an AsyncLocalStorage request context
   */
  runWithContext<T>(context: RequestLogContext, fn: () => T): T {
    return this.requestContext.run(context, fn);
  }

  /**
   * Get current request context (if inside an HTTP request)
   */
  getContext(): RequestLogContext | undefined {
    return this.requestContext.getStore();
  }

  /**
   * Update active user info on current request context
   */
  setContextUser(user: { userId: string; username?: string; role?: string }): void {
    const store = this.requestContext.getStore();
    if (store) {
      store.userId = user.userId;
      if (user.username) store.username = user.username;
      if (user.role) store.role = user.role;
    }
  }

  /**
   * Format timestamp in human-readable ISO format with local offset
   */
  private formatTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  /**
   * Format a log level for terminal output
   */
  private formatLevelTerminal(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return `${COLORS.gray}[DEBUG]${COLORS.reset}`;
      case 'info':
        return `${COLORS.cyan}[INFO ]${COLORS.reset}`;
      case 'warn':
        return `${COLORS.yellow}${COLORS.bold}[WARN ]${COLORS.reset}`;
      case 'error':
        return `${COLORS.red}${COLORS.bold}[ERROR]${COLORS.reset}`;
      case 'fatal':
        return `${COLORS.bgRed}${COLORS.white}${COLORS.bold}[FATAL]${COLORS.reset}`;
    }
  }

  /**
   * Print colored log line to terminal
   */
  private printToTerminal(entry: LogEntry): void {
    const timeStr = `${COLORS.dim}${entry.timestamp}${COLORS.reset}`;
    const levelStr = this.formatLevelTerminal(entry.level);
    const catStr = `${COLORS.magenta}[${entry.category.padEnd(8).slice(0, 8)}]${COLORS.reset}`;
    const reqStr = entry.context?.requestId
      ? `${COLORS.gray}[${String(entry.context.requestId)}]${COLORS.reset} `
      : '';

    let out = `${timeStr} ${levelStr} ${catStr} ${reqStr}${entry.message}`;

    // Print additional context keys if any (excluding requestId already in header)
    if (entry.context) {
      const restContext = { ...entry.context };
      delete restContext.requestId;
      if (Object.keys(restContext).length > 0) {
        const jsonStr = JSON.stringify(restContext);
        if (jsonStr.length < 100) {
          out += ` ${COLORS.dim}${jsonStr}${COLORS.reset}`;
        } else {
          out += `\n  ${COLORS.dim}Context: ${JSON.stringify(restContext, null, 2).replace(/\n/g, '\n  ')}${COLORS.reset}`;
        }
      }
    }

    if (entry.error?.stack) {
      out += `\n  ${COLORS.red}└─ Error: ${entry.error.message}\n${entry.error.stack
        .split('\n')
        .slice(1)
        .map((line) => `     ${line}`)
        .join('\n')}${COLORS.reset}`;
    } else if (entry.error?.message) {
      out += `\n  ${COLORS.red}└─ Error: ${entry.error.message}${COLORS.reset}`;
    }

    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(out);
    } else if (entry.level === 'warn') {
      console.warn(out);
    } else {
      console.log(out);
    }
  }

  /**
   * Append log entry to a file with size-based rotation check
   */
  private appendToFile(filename: string, text: string): void {
    try {
      this.ensureDirectoryExists();
      const filePath = path.join(this.logDir, filename);

      // Check for rotation if file exceeds max size
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size >= MAX_LOG_FILE_SIZE_BYTES) {
            this.rotateFile(filename);
          }
        }
      } catch {
        // Ignore rotation check error on fast concurrent appends
      }

      fs.appendFile(filePath, `${text}\n`, 'utf8', (err) => {
        if (err) {
          // Fallback to stderr if file append fails
          process.stderr.write(`Failed to write to log file (${filename}): ${err.message}\n`);
        }
      });
    } catch (err: any) {
      process.stderr.write(`Logger file write error: ${err?.message || err}\n`);
    }
  }

  /**
   * Rotate a log file when it reaches size limit
   */
  public rotateFile(filename: string): void {
    try {
      const srcPath = path.join(this.logDir, filename);
      if (!fs.existsSync(srcPath)) return;

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const destName = `${base}-${dateStr}${ext}`;
      const destPath = path.join(this.logDir, destName);

      fs.renameSync(srcPath, destPath);

      // Clean up old archives if count exceeds maximum
      this.cleanupOldArchives(base, ext);
    } catch (err: any) {
      console.error(`Failed to rotate log file ${filename}:`, err);
    }
  }

  /**
   * Clean up old archives keeping only the most recent ones
   */
  private cleanupOldArchives(basePrefix: string, ext: string): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const archives = files
        .filter((f) => f.startsWith(`${basePrefix}-`) && f.endsWith(ext))
        .map((f) => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);

      if (archives.length > MAX_ARCHIVES_PER_TYPE) {
        for (const oldFile of archives.slice(MAX_ARCHIVES_PER_TYPE)) {
          try {
            fs.unlinkSync(oldFile.path);
          } catch {
            // Ignore unlink errors
          }
        }
      }
    } catch {
      // Ignore archive cleanup error
    }
  }

  /**
   * Core log entry recorder
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    const now = new Date();
    const store = this.requestContext.getStore();

    // Auto-merge context from Active Request Context (AsyncLocalStorage)
    const mergedContext: Record<string, unknown> = {
      ...(store?.requestId ? { requestId: store.requestId } : {}),
      ...(store?.userId ? { userId: store.userId } : {}),
      ...(store?.username ? { username: store.username } : {}),
      ...(store?.role ? { role: store.role } : {}),
      ...(store?.ip ? { ip: store.ip } : {}),
      ...(context || {}),
    };

    const sanitizedContext = sanitizeContext(mergedContext) as Record<string, unknown>;

    let parsedError: LogEntry['error'] | undefined;
    if (error) {
      if (error instanceof Error) {
        parsedError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        };
      } else if (typeof error === 'string') {
        parsedError = { message: error };
      } else {
        parsedError = { message: String(error) };
      }
    }

    const entry: LogEntry = {
      id: generateUUIDv7(),
      timestamp: this.formatTimestamp(now),
      level,
      category,
      message,
      ...(Object.keys(sanitizedContext).length > 0 ? { context: sanitizedContext } : {}),
      ...(parsedError ? { error: parsedError } : {}),
    };

    // 1. In-Memory Ring Buffer (holds up to 1000 items)
    this.memoryBuffer.push(entry);
    if (this.memoryBuffer.length > MAX_BUFFER_SIZE) {
      this.memoryBuffer.shift();
    }

    // 2. Terminal Output (if level matches configured threshold)
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel]) {
      this.printToTerminal(entry);
    }

    // 3. File Outputs
    // Formatted line for standard file viewing
    const fileLine = `${entry.timestamp} [${entry.level.toUpperCase().padEnd(5)}] [${entry.category.padEnd(8)}] ${
      entry.context?.requestId ? `[${String(entry.context.requestId)}] ` : ''
    }${entry.message}${
      entry.context && Object.keys(entry.context).length > 1
        ? ` | Context: ${JSON.stringify(entry.context)}`
        : ''
    }${
      entry.error?.stack
        ? ` | Stack: ${entry.error.stack.replace(/\r?\n\s*/g, ' -> ')}`
        : entry.error?.message
          ? ` | Error: ${entry.error.message}`
          : ''
    }`;

    // Write to app.log (all logs meeting threshold)
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel]) {
      this.appendToFile('app.log', fileLine);
    }

    // Write to error.log (WARN, ERROR, FATAL only)
    if (level === 'warn' || level === 'error' || level === 'fatal') {
      this.appendToFile('error.log', fileLine);
    }

    // Write to http.log if category is HTTP
    if (category === 'HTTP') {
      this.appendToFile('http.log', fileLine);
    }
  }

  // Public Logging Methods
  debug(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    this.log('debug', category, message, context);
  }

  info(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    this.log('info', category, message, context);
  }

  warn(
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.log('warn', category, message, context, error);
  }

  error(
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.log('error', category, message, context, error);
  }

  fatal(
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.log('fatal', category, message, context, error);
  }

  http(message: string, context?: Record<string, unknown>): void {
    this.log('info', 'HTTP', message, context);
  }

  // Log Management & Inspection APIs
  /**
   * Query in-memory logs with filtering, search, and pagination
   */
  getRecentLogs(options: LogFilterOptions = {}): {
    logs: LogEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
    const search = options.search?.trim().toLowerCase() || '';
    const level = options.level && options.level !== 'all' ? options.level.toLowerCase() : null;
    const category = options.category?.trim().toUpperCase() || null;

    let filtered = [...this.memoryBuffer];

    if (level) {
      filtered = filtered.filter((l) => l.level === level);
    }

    if (category) {
      filtered = filtered.filter((l) => l.category.toUpperCase() === category);
    }

    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      if (!Number.isNaN(start)) {
        filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= start);
      }
    }

    if (options.endDate) {
      const end = new Date(options.endDate).getTime();
      if (!Number.isNaN(end)) {
        filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= end);
      }
    }

    if (search) {
      filtered = filtered.filter((l) => {
        const matchMsg = l.message.toLowerCase().includes(search);
        const matchCat = l.category.toLowerCase().includes(search);
        const matchErr = l.error?.message.toLowerCase().includes(search);
        const matchReq = (l.context?.requestId as string)?.toLowerCase()?.includes(search);
        const matchUser = (l.context?.username as string)?.toLowerCase()?.includes(search);
        return Boolean(matchMsg || matchCat || matchErr || matchReq || matchUser);
      });
    }

    // Newest logs first
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const logs = filtered.slice(startIndex, startIndex + limit);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get log metrics, breakdown by level and category, file stats and memory usage
   */
  getStats(): LogStats {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };

    const categories: Record<string, number> = {};

    for (const entry of this.memoryBuffer) {
      levels[entry.level] = (levels[entry.level] || 0) + 1;
      categories[entry.category] = (categories[entry.category] || 0) + 1;
    }

    const recentErrors = this.memoryBuffer
      .filter((e) => e.level === 'error' || e.level === 'fatal')
      .slice(-10)
      .reverse();

    const files = this.listLogFiles();
    const diskUsageBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

    const mem = process.memoryUsage();

    return {
      totalInBuffer: this.memoryBuffer.length,
      levels,
      categories,
      recentErrors,
      files,
      diskUsageBytes,
      diskUsageFormatted: formatBytes(diskUsageBytes),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        rss: formatBytes(mem.rss),
        heapTotal: formatBytes(mem.heapTotal),
        heapUsed: formatBytes(mem.heapUsed),
        external: formatBytes(mem.external),
      },
    };
  }

  /**
   * List all log files in the log directory
   */
  listLogFiles(): LogFileInfo[] {
    try {
      this.ensureDirectoryExists();
      const filenames = fs.readdirSync(this.logDir);
      return filenames
        .filter((name) => name.endsWith('.log'))
        .map((filename) => {
          const filePath = path.join(this.logDir, filename);
          const stat = fs.statSync(filePath);
          return {
            filename,
            sizeBytes: stat.size,
            sizeFormatted: formatBytes(stat.size),
            updatedAt: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Safely resolve log file path with strict path-traversal prevention
   */
  resolveSafeLogFilePath(filename: string): string | null {
    const cleanName = path.basename(filename);
    if (!cleanName.endsWith('.log')) return null;

    const resolved = path.resolve(this.logDir, cleanName);
    if (!resolved.startsWith(this.logDir)) return null;
    if (!fs.existsSync(resolved)) return null;

    return resolved;
  }

  /**
   * Clear in-memory log buffer
   */
  clearMemoryBuffer(): void {
    this.memoryBuffer = [];
  }
}

// Global Singleton Instance
export const logger = new Logger();
