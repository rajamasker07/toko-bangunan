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
  SupplierInvoice,
  SupplierInvoiceSummary,
  UnitMaster,
  UserRole,
  StockReservation,
  ReservationAlertSummary,
  RoleDefinition,
  Permission,
  ImportEntityType,
  ImportFileFormat,
  ImportDuplicateMode,
  ImportPreviewResult,
  ImportCommitResult,
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

interface MasterDataCacheEntry<T> {
  data: T;
  timestamp: number;
}

const masterDataCache = new Map<string, MasterDataCacheEntry<any>>();
const inFlightMasterRequests = new Map<string, Promise<any>>();

export function getCachedMasterData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 120000,
  force = false
): Promise<T> {
  if (!force) {
    const cached = masterDataCache.get(key);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return Promise.resolve(cached.data);
    }
  }

  // Deduplicate in-flight requests to prevent parallel duplicate HTTP fetches
  const existing = inFlightMasterRequests.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetcher()
    .then((data) => {
      masterDataCache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inFlightMasterRequests.delete(key);
    });

  inFlightMasterRequests.set(key, promise);
  return promise;
}

export function invalidateMasterDataCache(prefix?: string): void {
  if (!prefix) {
    masterDataCache.clear();
    return;
  }
  for (const key of masterDataCache.keys()) {
    if (key.startsWith(prefix)) {
      masterDataCache.delete(key);
    }
  }
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  invalidateMasterDataCache();
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

async function executeWithAuthRetry(
  url: string,
  buildRequestInit: (token: string | null) => RequestInit,
  _isRetry = false
): Promise<Response> {
  const token = getAuthToken();
  const response = await fetch(`${BASE_URL}${url}`, buildRequestInit(token));

  if (response.status === 401) {
    const json = await safeParseJson(response);
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
        return executeWithAuthRetry(url, buildRequestInit, true);
      }
    }

    notifyUnauthorizedOnce(message);
    throw new ApiError(message, 401, code, json?.details);
  }

  return response;
}

function throwApiErrorFromPayload(response: Response, json: any): never {
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

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await executeWithAuthRetry(url, (token) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    };

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    return {
      ...options,
      headers,
    };
  });

  const json = await safeParseJson(response);

  if (!response.ok || json?.success === false) {
    throwApiErrorFromPayload(response, json);
  }

  return json?.data as T;
}

async function fetchFormData<T>(
  url: string,
  formData: FormData,
  options?: Omit<RequestInit, 'body'>
): Promise<T> {
  const response = await executeWithAuthRetry(url, (token) => {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> | undefined),
    };
    delete headers['Content-Type'];
    delete headers['content-type'];

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    return {
      method: 'POST',
      ...options,
      body: formData,
      headers,
    };
  });

  const json = await safeParseJson(response);

  if (!response.ok || json?.success === false) {
    throwApiErrorFromPayload(response, json);
  }

  return json?.data as T;
}

function extractFilenameFromDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      return utf8Match[1].trim();
    }
  }
  const asciiMatch = /filename=([^;]+)/i.exec(headerValue);
  if (asciiMatch?.[1]) {
    return asciiMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function fetchBlob(
  url: string,
  options?: RequestInit
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await executeWithAuthRetry(url, (token) => {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> | undefined),
    };

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    return {
      ...options,
      headers,
    };
  });

  if (!response.ok) {
    const json = await safeParseJson(response);
    throwApiErrorFromPayload(response, json);
  }

  const blob = await response.blob();
  const filename = extractFilenameFromDisposition(response.headers.get('Content-Disposition'));
  return { blob, filename };
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
  getCategories: (asTree = false, options?: { force?: boolean; signal?: AbortSignal }) =>
    getCachedMasterData(
      `categories:${asTree}`,
      () => fetchJson<Category[]>(`/categories?tree=${asTree}`, { signal: options?.signal }),
      120000,
      options?.force
    ),
  createCategory: async (data: { name: string; parent_id?: string | null; description?: string }) => {
    const res = await fetchJson<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('categories');
    return res;
  },
  updateCategory: async (id: string, data: { name: string; parent_id?: string | null; description?: string }) => {
    const res = await fetchJson<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('categories');
    return res;
  },
  deleteCategory: async (id: string) => {
    const res = await fetchJson<void>(`/categories/${id}`, {
      method: 'DELETE',
    });
    invalidateMasterDataCache('categories');
    return res;
  },

  // Brands (Master Merek anti-duplikat)
  getBrands: (options?: { force?: boolean; signal?: AbortSignal }) =>
    getCachedMasterData(
      'brands',
      () => fetchJson<Brand[]>('/brands', { signal: options?.signal }),
      120000,
      options?.force
    ),
  createBrand: async (data: { name: string }) => {
    const res = await fetchJson<{ brand: Brand; created: boolean }>('/brands', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('brands');
    return res;
  },
  updateBrand: async (id: string, data: { name: string }) => {
    const res = await fetchJson<Brand>(`/brands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('brands');
    return res;
  },
  deleteBrand: async (id: string) => {
    const res = await fetchJson<void>(`/brands/${id}`, {
      method: 'DELETE',
    });
    invalidateMasterDataCache('brands');
    return res;
  },

  // Suppliers (Master Supplier / Pemasok)
  getSuppliers: (filters?: { search?: string; isActive?: boolean; force?: boolean; signal?: AbortSignal }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return getCachedMasterData(
      `suppliers:${queryStr}`,
      () => fetchJson<Supplier[]>(`/suppliers${queryStr}`, { signal: filters?.signal }),
      120000,
      filters?.force
    );
  },
  getSupplierById: (id: string) => fetchJson<Supplier>(`/suppliers/${id}`),
  createSupplier: async (data: Partial<Supplier>) => {
    const res = await fetchJson<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('suppliers');
    return res;
  },
  updateSupplier: async (id: string, data: Partial<Supplier>) => {
    const res = await fetchJson<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateMasterDataCache('suppliers');
    return res;
  },
  deleteSupplier: async (id: string) => {
    const res = await fetchJson<void>(`/suppliers/${id}`, {
      method: 'DELETE',
    });
    invalidateMasterDataCache('suppliers');
    return res;
  },

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

  // Supplier Invoices & Due Dates (Nota Hutang & Jatuh Tempo)
  getSupplierInvoices: (supplierId: string, filters?: { status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<SupplierInvoice[]>(`/suppliers/${supplierId}/invoices${queryStr}`);
  },
  getSupplierInvoiceSummary: (supplierId: string) =>
    fetchJson<SupplierInvoiceSummary>(`/suppliers/${supplierId}/invoices/summary`),
  createSupplierInvoice: (
    supplierId: string,
    data: {
      invoice_number: string;
      purchase_order_no?: string | null;
      invoice_date: string;
      due_date: string;
      total_amount: number;
      paid_amount?: number;
      notes?: string | null;
    }
  ) =>
    fetchJson<SupplierInvoice>(`/suppliers/${supplierId}/invoices`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSupplierInvoice: (
    id: string,
    data: {
      invoice_number?: string;
      purchase_order_no?: string | null;
      invoice_date?: string;
      due_date?: string;
      total_amount?: number;
      paid_amount?: number;
      notes?: string | null;
    }
  ) =>
    fetchJson<SupplierInvoice>(`/supplier-invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  recordSupplierInvoicePayment: (id: string, amount: number) =>
    fetchJson<SupplierInvoice>(`/supplier-invoices/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  deleteSupplierInvoice: (id: string) =>
    fetchJson<void>(`/supplier-invoices/${id}`, {
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

  // Role & Permissions Management
  getRoles: (options?: RequestInit) => fetchJson<RoleDefinition[]>('/roles', options),

  getPermissionCatalog: (options?: RequestInit) =>
    fetchJson<any>('/roles/permissions', options),

  createRole: (data: {
    code: string;
    name: string;
    short_name?: string;
    description?: string;
    badge_color?: string;
    hierarchy_level?: number;
    permissions: Permission[];
  }) =>
    fetchJson<RoleDefinition>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRole: (
    code: string,
    data: {
      name?: string;
      short_name?: string;
      description?: string;
      badge_color?: string;
      hierarchy_level?: number;
      permissions?: Permission[];
    }
  ) =>
    fetchJson<RoleDefinition>(`/roles/${code}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRole: (code: string) =>
    fetchJson<void>(`/roles/${code}`, {
      method: 'DELETE',
    }),

  // Bulk Import Data (Excel & CSV)
  downloadImportTemplate: async (
    entity: ImportEntityType,
    format: ImportFileFormat = 'xlsx',
    options?: RequestInit
  ) => {
    const params = new URLSearchParams({ format });
    const { blob, filename } = await fetchBlob(
      `/import/templates/${entity}?${params.toString()}`,
      options
    );
    return {
      blob,
      filename: filename || `template-import-${entity}.${format}`,
    };
  },

  previewImport: (
    entity: ImportEntityType,
    file: File,
    mode: ImportDuplicateMode = 'skip',
    options?: Omit<RequestInit, 'body'>
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    return fetchFormData<ImportPreviewResult>(`/import/${entity}/preview`, formData, options);
  },

  commitImport: async (
    entity: ImportEntityType,
    file: File,
    mode: ImportDuplicateMode = 'skip',
    skipInvalidRows = false,
    options?: Omit<RequestInit, 'body'>
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    formData.append('skip_invalid_rows', String(skipInvalidRows));
    const result = await fetchFormData<ImportCommitResult>(`/import/${entity}/commit`, formData, options);
    invalidateMasterDataCache(); // Clear master data caches so subsequent views receive freshly imported data
    return result;
  },
};
