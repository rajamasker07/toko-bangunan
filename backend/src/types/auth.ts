export const USER_ROLES = ['owner', 'admin', 'gudang', 'kasir'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
  by_role: Record<UserRole, number>;
}

export interface UserListResult {
  items: UserPublic[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  summary: UsersSummaryMetrics;
}
