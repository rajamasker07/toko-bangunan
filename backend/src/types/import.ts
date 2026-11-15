export type ImportEntityType = 'products' | 'suppliers' | 'categories' | 'brands';
export type ImportFileFormat = 'xlsx' | 'csv';
export type ImportDuplicateMode = 'skip' | 'upsert';
export type ImportRowStatus = 'valid' | 'warning' | 'error';
export type ImportRowAction = 'create' | 'update' | 'skip' | 'invalid';

export interface ImportCellIssue {
  severity: 'error' | 'warning';
  field?: string;
  code?: string;
  message: string;
}

export interface ImportAutoCreateDependencies {
  categories: string[];
  brands: string[];
  units: string[];
}

export interface ImportPreviewSummary {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  to_create: number;
  to_update: number;
  to_skip: number;
  auto_create_dependencies?: ImportAutoCreateDependencies;
}

export interface ImportPreviewRow {
  row_number: number;
  status: ImportRowStatus;
  action: ImportRowAction;
  identifier?: string | null;
  label?: string | null;
  raw: Record<string, string | number | boolean | null>;
  normalized?: Record<string, unknown>;
  messages: ImportCellIssue[];
}

export interface ImportPreviewResult {
  entity: ImportEntityType;
  file_name: string;
  file_format: ImportFileFormat;
  mode: ImportDuplicateMode;
  summary: ImportPreviewSummary;
  columns: string[];
  rows: ImportPreviewRow[];
  truncated?: boolean;
}

export interface ImportCommitErrorItem {
  row_number: number;
  identifier?: string | null;
  field?: string;
  message: string;
}

export interface ImportCommitSummary {
  total_rows: number;
  processed_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  auto_created?: {
    categories: number;
    brands: number;
    units: number;
  };
}

export interface ImportCommitResult {
  entity: ImportEntityType;
  mode: ImportDuplicateMode;
  committed: boolean;
  summary: ImportCommitSummary;
  errors: ImportCommitErrorItem[];
}

export interface ImportExecutionContext {
  userId?: string | null;
  createdBy: string;
  allowBuyPrice: boolean;
  allowPricingWrite: boolean;
}

export interface ParsedSpreadsheetRow {
  row_number: number;
  values: Record<string, string | number | boolean | null>;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: ParsedSpreadsheetRow[];
}
