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
  sales?: SupplierSales[];
  sales_count?: number;
  active_sales_count?: number;
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
  min_stock: number | string;
  is_active?: boolean;
  units: VariantUnit[];
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
  variant_count: number;
  has_low_stock?: boolean;
  has_out_of_stock?: boolean;
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
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

export type UserRole = 'owner' | 'admin' | 'gudang' | 'kasir';

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
  | 'users:delete';

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
  by_role: Record<UserRole, number>;
}

export interface PaginatedUsersResponse {
  items: AuthUser[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  summary: UsersSummaryMetrics;
}
