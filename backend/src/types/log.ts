export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogCategory =
  | 'HTTP'
  | 'AUTH'
  | 'DATABASE'
  | 'IMPORT'
  | 'PRODUCT'
  | 'STOCK'
  | 'RESERVATION'
  | 'SYSTEM'
  | 'SECURITY'
  | (string & {});

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601 string, e.g. "2026-11-17T12:05:00.123Z"
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface RequestLogContext {
  requestId: string;
  ip?: string;
  method?: string;
  url?: string;
  userId?: string;
  username?: string;
  role?: string;
  startTime?: bigint;
}

export interface LogFilterOptions {
  level?: LogLevel | 'all';
  category?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface LogFileInfo {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  updatedAt: string;
}

export interface LogStats {
  totalInBuffer: number;
  levels: Record<LogLevel, number>;
  categories: Record<string, number>;
  recentErrors: LogEntry[];
  files: LogFileInfo[];
  diskUsageBytes: number;
  diskUsageFormatted: string;
  uptimeSeconds: number;
  memory: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
    external: string;
  };
}
