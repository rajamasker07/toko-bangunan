export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name?: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  name_key: string;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

export interface UnitMaster {
  id: string;
  name: string;
  name_key: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SalesPhone {
  number: string;
  label?: string; // e.g. "WhatsApp", "HP Utama", "Telepon Kantor", "HP Pribadi"
  is_primary?: boolean;
}

export interface SupplierSales {
  id: string;
  supplier_id: string;
  name: string;
  email?: string | null;
  is_active: boolean;
  phones: SalesPhone[];
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type InvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface SupplierInvoice {
  id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_order_no: string | null;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: InvoicePaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  days_until_due?: number;
  days_overdue?: number;
  is_overdue?: boolean;
  is_due_soon?: boolean;
}

export interface SupplierInvoiceSummary {
  total_invoices: number;
  unpaid_count: number;
  partial_count: number;
  paid_count: number;
  overdue_count: number;
  due_soon_count: number;
  total_invoice_amount: number;
  total_paid_amount: number;
  total_debt_amount: number;
}

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
  active_product_count?: number;
  sales?: SupplierSales[];
  sales_count?: number;
  active_sales_count?: number;
  invoice_summary?: {
    total_invoices: number;
    unpaid_count: number;
    overdue_count: number;
    due_soon_count: number;
    total_debt_amount: number;
  };
}

export interface VariantUnit {
  id: string;
  unit_name: string;
  conversion_factor: number | string;
  is_base_unit: boolean;
  buy_price: number | string | null;
  sell_price: number | string;
  wholesale_price?: number | string | null;
}

export interface ProductVariant {
  id: string;
  variant_name: string;
  sku: string;
  barcode?: string | null;
  current_stock: number | string;
  reserved_stock?: number | string;
  available_stock?: number | string;
  min_stock: number | string;
  is_active?: boolean;
  units: VariantUnit[];
}

export type ProductSearchMode = 'hybrid' | 'keyword' | 'semantic';
export type ProductMatchType = 'exact' | 'hybrid' | 'semantic' | 'keyword';

export interface EmbeddingStatusResponse {
  status: 'ready' | 'initializing' | 'downloading' | 'error';
  model_status: 'ready' | 'initializing' | 'downloading' | 'error';
  indexed_products: number;
  total_products: number;
  dimensions: number;
  model_name: string;
  cache_size: number;
  last_reindex_at: string | null;
  passage_version?: number;
  needs_reindex?: boolean;
  reranker_enabled?: boolean;
  reranker_status?: 'disabled' | 'initializing' | 'downloading' | 'ready' | 'error';
  reranker_model?: string | null;
  error?: string | null;
}

export interface ReindexEmbeddingsResponse {
  total: number;
  indexed: number;
  skipped: number;
  errors: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_code?: string | null;
  description?: string | null;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  material?: string | null;
  specifications?: string | null;
  min_stock_alert: number | string;
  is_active: boolean;
  has_variants: boolean;
  total_stock: number | string;
  total_reserved_stock?: number | string;
  total_available_stock?: number | string;
  variant_count: number;
  has_low_stock?: boolean;
  has_out_of_stock?: boolean;
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
  // Metadata Pencarian Semantik & Hybrid
  match_type?: ProductMatchType;
  similarity_score?: number;
  rrf_score?: number;
  rerank_score?: number;
  matched_terms?: string[];
}

export interface StockMovement {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  variant_sku: string;
  movement_type: string;
  previous_stock: number | string;
  quantity_change: number | string;
  current_stock: number | string;
  reference_no: string | null;
  notes: string | null;
  user_id?: string | null;
  created_by: string;
  created_by_username?: string | null;
  created_by_role?: UserRole | null;
  created_at: string;
}

export interface DashboardSummary {
  total_products: number;
  total_variants: number;
  total_categories: number;
  total_brands?: number;
  total_suppliers?: number;
  total_sales?: number;
  active_sales?: number;
  low_stock_count: number;
  out_of_stock_count: number;
  recent_movements: StockMovement[];
  low_stock_items: Array<{
    variant_id: string;
    variant_name: string;
    sku: string;
    current_stock: number | string;
    min_stock: number | string;
    product_id: string;
    product_name: string;
    category_name?: string;
  }>;
}

export type UserRole = 'owner' | 'admin' | 'gudang' | 'kasir' | string;

export type Permission =
  | 'dashboard:read'
  | 'products:read'
  | 'products:create'
  | 'products:update'
  | 'products:delete'
  | 'products:view_buy_price'
  | 'pricing:write'
  | 'master:read'
  | 'suppliers:read'
  | 'master:write'
  | 'master:delete'
  | 'stock:read'
  | 'stock:adjust'
  | 'users:read'
  | 'users:manage'
  | 'users:delete'
  | 'reservations:read'
  | 'reservations:create'
  | 'reservations:pickup'
  | 'reservations:cancel'
  | 'roles:manage'
  | 'data:import'
  | 'data:export';

export interface RoleDefinition {
  id: string;
  code: string;
  name: string;
  short_name: string;
  description?: string | null;
  badge_color: string;
  hierarchy_level: number;
  is_system: boolean;
  permissions: Permission[];
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionCatalogItem {
  id?: string;
  code: Permission;
  name?: string;
  label: string;
  description?: string;
  module?: string;
  category?: string;
}

export interface PermissionGroup {
  id?: string;
  module?: string;
  category?: string;
  label: string;
  description?: string;
  permissions: PermissionCatalogItem[];
}

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUser;
  permissions: Permission[];
}

export interface AuthMePayload {
  user: AuthUser;
  permissions: Permission[];
}

export interface UsersSummaryMetrics {
  total: number;
  active: number;
  inactive: number;
  by_role: Record<string, number>;
}

export interface PaginatedUsersResponse {
  items: AuthUser[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  summary: UsersSummaryMetrics;
}

export interface ReservationItem {
  id: string;
  reservation_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  unit_name: string;
  conversion_factor: number;
  qty_ordered_unit: number;
  qty_reserved_base: number;
  qty_picked_up_base: number;
  qty_remaining_base: number;
  base_unit_name?: string;
}

export interface ReservationPickupItem {
  item_id: string;
  qty_picked_up: number;
  product_name?: string;
  variant_name?: string;
  unit_name?: string;
  [key: string]: any;
}

export interface ReservationPickup {
  id: string;
  reservation_id: string;
  receiver_name: string;
  vehicle_plate?: string | null;
  notes?: string | null;
  handed_by: string;
  items: ReservationPickupItem[] | any[];
  picked_up_at: string;
}

export interface StockReservation {
  id: string;
  reservation_code: string;
  invoice_no?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED' | 'CLOSED_PARTIAL';
  pickup_deadline: string;
  notes?: string | null;
  created_by: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  settlement_type?: 'REFUND' | 'EXCHANGE' | 'DEPOSIT' | 'OTHER' | null;
  settlement_notes?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  items: ReservationItem[];
  pickups?: ReservationPickup[];
  is_overdue?: boolean;
  is_due_soon?: boolean;
  days_remaining?: number;
  days_overdue?: number;
  total_items_count?: number;
}

export interface ReservationAlertSummary {
  total_active: number;
  overdue_count: number;
  due_soon_count: number;
  total_items_held: number;
}

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
  file_hash?: string;
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

export interface MoveVariantsPayload {
  variant_ids: string[];
  target_product_id: string;
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate' | 'keep';
  notes?: string;
}

export interface MergeProductPayload {
  target_product_id: string;
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate';
  notes?: string;
}

export interface PromoteVariantPayload {
  new_product_name: string;
  new_product_sku?: string;
  category_id?: string | null;
  brand_id?: string | null;
  brand?: string;
  supplier_id?: string | null;
  description?: string;
  min_stock_alert?: number;
  new_variant_name?: string;
  source_empty_action?: 'delete' | 'deactivate' | 'keep';
  notes?: string;
}

export interface RestructureResult {
  success: boolean;
  moved_count?: number;
  target_product_id?: string;
  target_product_name?: string;
  new_product_id?: string;
  new_product_name?: string;
  variant_id?: string;
  message: string;
}

export interface BulkMergeProductsPayload {
  source_product_ids: string[];
  target_mode: 'existing' | 'new';
  target_product_id?: string;
  target_product_name?: string;
  target_standard_variant_name?: string;
  new_product_name?: string;
  new_product_sku?: string;
  category_id?: string | null;
  brand_id?: string | null;
  brand?: string;
  supplier_id?: string | null;
  description?: string;
  min_stock_alert?: number;
  rename_map?: Record<string, string>;
  sku_map?: Record<string, string>;
  source_empty_action?: 'delete' | 'deactivate';
  notes?: string;
}

export interface BulkMergeResult {
  success: boolean;
  target_product_id: string;
  target_product_name: string;
  target_variant_count?: number;
  moved_variants_count: number;
  merged_source_count: number;
  deleted_source_product_ids: string[];
  updated_source_product_ids: string[];
  message: string;
}

export interface SimilarProductGroup {
  id: string;
  commonPrefix: string;
  categoryName?: string;
  brandName?: string;
  products: Product[];
  totalStock: number;
}


