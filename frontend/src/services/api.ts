import { Category, Brand, Product, StockMovement, DashboardSummary } from '../types';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.message || 'Terjadi kesalahan saat memproses permintaan.');
  }

  return json.data;
}

export const api = {
  // Dashboard
  getDashboardSummary: () => fetchJson<DashboardSummary>('/dashboard/summary'),

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

  // Products
  getProducts: (filters?: { search?: string; categoryId?: string; stockStatus?: string }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.stockStatus && filters.stockStatus !== 'all') params.append('stockStatus', filters.stockStatus);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<Product[]>(`/products${queryStr}`);
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
    created_by?: string;
  }) =>
    fetchJson<any>('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStockMovements: (filters?: { variantId?: string; productId?: string; type?: string; search?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.variantId) params.append('variantId', filters.variantId);
    if (filters?.productId) params.append('productId', filters.productId);
    if (filters?.type && filters.type !== 'ALL') params.append('type', filters.type);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', String(filters.limit));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<{ total: number; items: StockMovement[] }>(`/stock/movements${queryStr}`);
  },
};
