export const DEFAULT_USER_ROLES = ['owner', 'admin', 'gudang', 'kasir'] as const;
export const USER_ROLES = DEFAULT_USER_ROLES;
export type DefaultUserRole = (typeof DEFAULT_USER_ROLES)[number];
export type UserRole = DefaultUserRole | string;

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
  | 'reservations:read'
  | 'reservations:create'
  | 'reservations:pickup'
  | 'reservations:cancel'
  | 'users:read'
  | 'users:manage'
  | 'users:delete'
  | 'roles:manage';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'dashboard:read',
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
  'products:view_buy_price',
  'pricing:write',
  'master:read',
  'suppliers:read',
  'master:write',
  'master:delete',
  'stock:read',
  'stock:adjust',
  'reservations:read',
  'reservations:create',
  'reservations:pickup',
  'reservations:cancel',
  'users:read',
  'users:manage',
  'users:delete',
  'roles:manage',
] as const;

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
  id: Permission;
  label: string;
  description: string;
  module: string;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionCatalogItem[];
}

export interface CreateRoleInput {
  code: string;
  name: string;
  short_name: string;
  description?: string | null;
  badge_color?: string;
  hierarchy_level?: number;
  permissions: Permission[];
}

export interface UpdateRoleInput {
  name?: string;
  short_name?: string;
  description?: string | null;
  badge_color?: string;
  hierarchy_level?: number;
  permissions?: Permission[];
}

export interface UserPublic {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser extends UserPublic {
  session_id: string;
  token_version: number;
  permissions: Permission[];
}

export interface JwtAccessPayload {
  sub: string;
  sid: string;
  tv: number;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: UserPublic;
  permissions: Permission[];
}

export interface UsersSummaryMetrics {
  total: number;
  active: number;
  inactive: number;
  by_role: Record<string, number>;
}

export interface UserListResult {
  items: UserPublic[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  summary: UsersSummaryMetrics;
}
