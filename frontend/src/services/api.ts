import {
  AuthMePayload,
  AuthSessionPayload,
  AuthUser,
  Brand,
  Category,
  DashboardSummary,
  PaginatedUsersResponse,
  Product,
  StockMovement,
  Supplier,
  SupplierSales,
  UnitMaster,
  UserRole,
  StockReservation,
  ReservationAlertSummary,
} from '../types';

const BASE_URL = '/api';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

const SESSION_ERROR_CODES = new Set([
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'TOKEN_MISSING',
  'USER_NOT_FOUND',
  'SESSION_REVOKED',
  'SESSION_INVALIDATED',
  'ACCOUNT_INACTIVE',
  'UNAUTHORIZED',
]);

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  isHandlingUnauthorized = false;
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let unauthorizedHandler: ((message?: string) => void) | null = null;
let tokensRefreshedHandler: ((session: AuthSessionPayload) => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;
let isHandlingUnauthorized = false;

export function setUnauthorizedHandler(handler: ((message?: string) => void) | null): void {
  unauthorizedHandler = handler;
}

export function setTokensRefreshedHandler(
  handler: ((session: AuthSessionPayload) => void) | null
): void {
  tokensRefreshedHandler = handler;
}

function notifyUnauthorizedOnce(message?: string): void {
  clearAuthTokens();
  if (!isHandlingUnauthorized) {
    isHandlingUnauthorized = true;
    unauthorizedHandler?.(message);
  }
}

async function safeParseJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const json = await safeParseJson(response);
      if (!response.ok || json?.success === false || !json?.data?.access_token) {
        clearAuthTokens();
        return false;
      }

      const session = json.data as AuthSessionPayload;
      setAuthTokens(session.access_token, session.refresh_token);
      tokensRefreshedHandler?.(session);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchJson<T>(url: string, options?: RequestInit, _isRetry = false): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const json = await safeParseJson(response);

  if (response.status === 401) {
    const code: string | undefined = json?.code;
    const message: string = json?.message || 'Sesi Anda telah berakhir. Silakan login kembali.';
    const isAuthCredentialEndpoint =
      url === '/auth/login' || url === '/auth/refresh' || url === '/auth/logout';
    const isChangePasswordCredentialError =
      url === '/auth/change-password' && (!code || !SESSION_ERROR_CODES.has(code));

    if (isAuthCredentialEndpoint || isChangePasswordCredentialError) {
      throw new ApiError(message, 401, code, json?.details);
    }

    if (!_isRetry && getRefreshToken()) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return fetchJson<T>(url, options, true);
      }
    }

    notifyUnauthorizedOnce(message);
    throw new ApiError(message, 401, code, json?.details);
  }

  if (!response.ok || json?.success === false) {
    const fallbackMessage =
      response.status === 403
        ? 'Anda tidak memiliki izin untuk melakukan aksi ini.'
        : 'Terjadi kesalahan saat memproses permintaan.';
    throw new ApiError(
      json?.message || fallbackMessage,
      response.status,
      json?.code,
      json?.details
    );
  }

  return json?.data as T;
}

export const api = {
  // Authentication & Profile
  login: (payload: { identifier: string; password: string }) =>
    fetchJson<AuthSessionPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  refresh: (refreshToken: string) =>
    fetchJson<AuthSessionPayload>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),
  logout: () =>
    fetchJson<void>('/auth/logout', {
      method: 'POST',
    }),
  logoutAll: () =>
    fetchJson<void>('/auth/logout-all', {
      method: 'POST',
    }),
  getMe: () => fetchJson<AuthMePayload>('/auth/me'),
  updateProfile: (data: { full_name?: string; email?: string | null }) =>
    fetchJson<AuthUser>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    fetchJson<AuthSessionPayload>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // User Management
  getUsers: (filters?: {
    search?: string;
    role?: string;
    isActive?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.role && filters.role !== 'all') params.append('role', filters.role);
    if (filters?.isActive && filters.isActive !== 'all') params.append('isActive', filters.isActive);
    if (filters?.page !== undefined) params.append('page', String(filters.page));
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<PaginatedUsersResponse>(`/users${queryStr}`);
  },
  getUserById: (id: string) => fetchJson<AuthUser>(`/users/${id}`),
  createUser: (data: {
    username: string;
    full_name: string;
    email?: string | null;
    password: string;
    role: UserRole;
    is_active?: boolean;
    must_change_password?: boolean;
  }) =>
    fetchJson<AuthUser>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (
    id: string,
    data: {
      username?: string;
      full_name?: string;
      email?: string | null;
      role?: UserRole;
      is_active?: boolean;
    }
  ) =>
    fetchJson<AuthUser>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleUserStatus: (id: string) =>
    fetchJson<AuthUser>(`/users/${id}/toggle-status`, {
      method: 'PATCH',
    }),
  resetUserPassword: (
    id: string,
    data: { new_password: string; force_change_on_login?: boolean }
  ) =>
    fetchJson<AuthUser>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteUser: (id: string) =>
    fetchJson<void>(`/users/${id}`, {
      method: 'DELETE',
    }),

  // Dashboard
  getDashboardSummary: () => fetchJson<DashboardSummary>('/dashboard/summary'),

  // Master Units (Satuan Bahan Bangunan)
  getUnits: () => fetchJson<UnitMaster[]>('/units'),
  createUnit: (data: { name: string; description?: string }) =>
    fetchJson<{ unit: UnitMaster; created: boolean }>('/units', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Categories
  getCategories: (asTree = false) => fetchJson<Category[]>(`/categories?tree=${asTree}`),
  createCategory: (data: { name: string; parent_id?: string | null; description?: string }) =>
    fetchJson<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: { name: string; parent_id?: string | null; description?: string }) =>
    fetchJson<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string) =>
    fetchJson<void>(`/categories/${id}`, {
      method: 'DELETE',
    }),

  // Brands (Master Merek anti-duplikat)
  getBrands: () => fetchJson<Brand[]>('/brands'),
  createBrand: (data: { name: string }) =>
    fetchJson<{ brand: Brand; created: boolean }>('/brands', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBrand: (id: string, data: { name: string }) =>
    fetchJson<Brand>(`/brands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteBrand: (id: string) =>
    fetchJson<void>(`/brands/${id}`, {
      method: 'DELETE',
    }),

  // Suppliers (Master Supplier / Pemasok)
  getSuppliers: (filters?: { search?: string; isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<Supplier[]>(`/suppliers${queryStr}`);
  },
  getSupplierById: (id: string) => fetchJson<Supplier>(`/suppliers/${id}`),
  createSupplier: (data: Partial<Supplier>) =>
    fetchJson<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSupplier: (id: string, data: Partial<Supplier>) =>
    fetchJson<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSupplier: (id: string) =>
    fetchJson<void>(`/suppliers/${id}`, {
      method: 'DELETE',
    }),

  // Supplier Sales (Tim Sales per Supplier)
  getSupplierSales: (supplierId: string, isActive?: boolean) => {
    const query = isActive !== undefined ? `?isActive=${isActive}` : '';
    return fetchJson<SupplierSales[]>(`/suppliers/${supplierId}/sales${query}`);
  },
  createSupplierSales: (supplierId: string, data: Partial<SupplierSales>) =>
    fetchJson<SupplierSales>(`/suppliers/${supplierId}/sales`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSupplierSales: (id: string, data: Partial<SupplierSales>) =>
    fetchJson<SupplierSales>(`/sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleSupplierSalesStatus: (id: string) =>
    fetchJson<SupplierSales>(`/sales/${id}/toggle`, {
      method: 'PATCH',
    }),
  deleteSupplierSales: (id: string) =>
    fetchJson<void>(`/sales/${id}`, {
      method: 'DELETE',
    }),

  // Products
  getProducts: (filters?: {
    search?: string;
    categoryId?: string;
    brand?: string;
    stockStatus?: string;
    saleStatus?: string;
  }, options?: RequestInit) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.brand) params.append('brand', filters.brand);
    if (filters?.stockStatus && filters.stockStatus !== 'all') params.append('stockStatus', filters.stockStatus);
    if (filters?.saleStatus && filters.saleStatus !== 'all') params.append('saleStatus', filters.saleStatus);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<Product[]>(`/products${queryStr}`, options);
  },
  getProductById: (id: string) => fetchJson<Product>(`/products/${id}`),
  createProduct: (data: any) =>
    fetchJson<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: any) =>
    fetchJson<Product>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleProductStatus: (id: string) =>
    fetchJson<{ success: boolean; data: Product; message: string }>(`/products/${id}/toggle-status`, {
      method: 'PATCH',
    }),
  deleteProduct: (id: string) =>
    fetchJson<void>(`/products/${id}`, {
      method: 'DELETE',
    }),

  // Variants & Units
  addVariant: (productId: string, data: any) =>
    fetchJson<any>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateVariant: (variantId: string, data: any) =>
    fetchJson<any>(`/variants/${variantId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleVariantStatus: (variantId: string) =>
    fetchJson<{ success: boolean; data: any; message: string }>(`/variants/${variantId}/toggle-status`, {
      method: 'PATCH',
    }),
  deleteVariant: (variantId: string) =>
    fetchJson<void>(`/variants/${variantId}`, {
      method: 'DELETE',
    }),
  addUnit: (variantId: string, data: any) =>
    fetchJson<any>(`/variants/${variantId}/units`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUnit: (unitId: string, data: any) =>
    fetchJson<any>(`/units/${unitId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteUnit: (unitId: string) =>
    fetchJson<void>(`/units/${unitId}`, {
      method: 'DELETE',
    }),

  // Stock Adjustments
  adjustStock: (data: {
    variant_id: string;
    adjustment_mode: 'SET' | 'ADD' | 'SUBTRACT';
    amount: number;
    movement_type: string;
    reference_no?: string;
    notes: string;
  }) =>
    fetchJson<any>('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStockMovements: (filters?: {
    variantId?: string;
    productId?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.variantId) params.append('variantId', filters.variantId);
    if (filters?.productId) params.append('productId', filters.productId);
    if (filters?.type && filters.type !== 'ALL') params.append('type', filters.type);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.append('offset', String(filters.offset));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<{ total: number; items: StockMovement[] }>(`/stock/movements${queryStr}`);
  },

  // Stock Reservations (Titip Simpan Barang / Ambil Nanti)
  getReservations: (
    params?: {
      status?: string;
      search?: string;
      deadlineStatus?: string;
      limit?: number;
      offset?: number;
    },
    options?: RequestInit
  ) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.deadlineStatus && params.deadlineStatus !== 'all') query.append('deadlineStatus', params.deadlineStatus);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset !== undefined) query.append('offset', String(params.offset));
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<{ items: StockReservation[]; total: number }>(`/reservations${queryStr}`, options);
  },

  getReservationById: (id: string, options?: RequestInit) =>
    fetchJson<StockReservation>(`/reservations/${id}`, options),

  getReservationAlerts: (options?: RequestInit) =>
    fetchJson<ReservationAlertSummary>('/reservations/alerts', options),

  createReservation: (data: {
    customer_name: string;
    customer_phone?: string;
    customer_address?: string;
    invoice_no?: string;
    pickup_deadline: string;
    notes?: string;
    created_by?: string;
    items: Array<{
      variant_id: string;
      unit_id?: string;
      unit_name: string;
      conversion_factor: number;
      qty_ordered_unit: number;
    }>;
  }) =>
    fetchJson<StockReservation>('/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  pickupReservation: (
    id: string,
    data: {
      receiver_name: string;
      vehicle_plate?: string;
      notes?: string;
      handed_by?: string;
      items: Array<{
        item_id: string;
        qty_picked_up: number;
      }>;
    }
  ) =>
    fetchJson<any>(`/reservations/${id}/pickup`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  extendReservationDeadline: (
    id: string,
    data: {
      new_deadline: string;
      notes?: string;
    }
  ) =>
    fetchJson<any>(`/reservations/${id}/extend-deadline`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancelReservation: (
    id: string,
    data: {
      reason: string;
    }
  ) =>
    fetchJson<any>(`/reservations/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  closePartialReservation: (
    id: string,
    data: {
      settlement_type: string;
      reason: string;
    }
  ) =>
    fetchJson<StockReservation>(`/reservations/${id}/close-partial`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
