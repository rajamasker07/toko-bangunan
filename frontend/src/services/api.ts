import {
  Category,
  Brand,
  Supplier,
  SupplierSales,
  Product,
  StockMovement,
  DashboardSummary,
  UnitMaster,
  StockReservation,
  ReservationAlertSummary,
} from '../types';

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
  getProducts: (filters?: { search?: string; categoryId?: string; brand?: string; stockStatus?: string; saleStatus?: string }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.brand) params.append('brand', filters.brand);
    if (filters?.stockStatus && filters.stockStatus !== 'all') params.append('stockStatus', filters.stockStatus);
    if (filters?.saleStatus && filters.saleStatus !== 'all') params.append('saleStatus', filters.saleStatus);
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
    created_by?: string;
  }) =>
    fetchJson<any>('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStockMovements: (filters?: { variantId?: string; productId?: string; type?: string; search?: string; limit?: number; offset?: number }) => {
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
  getReservations: (params?: {
    status?: string;
    search?: string;
    deadlineStatus?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.deadlineStatus && params.deadlineStatus !== 'all') query.append('deadlineStatus', params.deadlineStatus);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset !== undefined) query.append('offset', String(params.offset));
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<{ items: StockReservation[]; total: number }>(`/reservations${queryStr}`);
  },

  getReservationById: (id: string) => fetchJson<StockReservation>(`/reservations/${id}`),

  getReservationAlerts: () => fetchJson<ReservationAlertSummary>('/reservations/alerts'),

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
