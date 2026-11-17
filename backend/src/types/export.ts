export type ExportEntityType =
  | 'products'
  | 'suppliers'
  | 'categories'
  | 'brands'
  | 'units'
  | 'supplier_invoices'
  | 'stock_movements'
  | 'reservations';

export type ExportFileFormat = 'xlsx' | 'csv' | 'json';

export interface ExportColumnDef {
  key: string;
  label: string;
  width?: number;
  isText?: boolean;
}

export interface ExportDataset {
  entity: ExportEntityType | 'full_backup';
  title: string;
  columns: ExportColumnDef[];
  rows: Array<Record<string, any>>;
  totalRows: number;
}

export interface TableRecordCount {
  tableName: string;
  displayName: string;
  count: number;
  description: string;
}

export interface ExportStatsResponse {
  tables: TableRecordCount[];
  databaseSize: string;
  generatedAt: string;
  postgresVersion: string;
}

export interface RestoreDatabaseResult {
  success: boolean;
  message: string;
  tablesRestored: number;
  recordsRestored: number;
  executedAt: string;
}
