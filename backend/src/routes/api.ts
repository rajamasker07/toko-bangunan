import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { BrandController } from '../controllers/brandController.js';
import { CategoryController } from '../controllers/categoryController.js';
import { DashboardController } from '../controllers/dashboardController.js';
import { ExportController } from '../controllers/exportController.js';
import { ImportController } from '../controllers/importController.js';
import { ProductController } from '../controllers/productController.js';
import { StockController } from '../controllers/stockController.js';
import { SupplierController } from '../controllers/supplierController.js';
import { UnitController } from '../controllers/unitController.js';
import { ReservationController } from '../controllers/reservationController.js';
import { RoleController } from '../controllers/roleController.js';
import { SupplierInvoiceController } from '../controllers/supplierInvoiceController.js';
import { UserController } from '../controllers/userController.js';
import { VariantController } from '../controllers/variantController.js';
import { PriceHistoryController } from '../controllers/priceHistoryController.js';
import { LogController } from '../controllers/logController.js';
import { getAppVersionInfo } from '../utils/version.js';
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { importFileUpload, sqlFileUpload } from '../middleware/upload.js';

const router = Router();

// ==========================================
// PUBLIC SYSTEM METADATA & AUTH ROUTES
// ==========================================
router.get('/version', (_req, res) => {
  res.json({ success: true, data: getAppVersionInfo() });
});
router.post('/auth/login', loginRateLimiter, AuthController.login);
router.post('/auth/refresh', AuthController.refresh);

// ==========================================
// FAIL-CLOSED AUTH GATE (All routes below require valid active session)
// ==========================================
router.use(requireAuth);

// Self-service Auth & Profile
router.post('/auth/logout', AuthController.logout);
router.post('/auth/logout-all', AuthController.logoutAll);
router.get('/auth/me', AuthController.me);
router.patch('/auth/profile', AuthController.updateProfile);
router.post('/auth/change-password', AuthController.changePassword);

// User Management (RBAC + hierarchy checks enforced in service)
router.get('/users', requirePermission('users:read'), UserController.list);
router.get('/users/:id', requirePermission('users:read'), UserController.getById);
router.post('/users', requirePermission('users:manage'), UserController.create);
router.put('/users/:id', requirePermission('users:manage'), UserController.update);
router.patch(
  '/users/:id/toggle-status',
  requirePermission('users:manage'),
  UserController.toggleStatus
);
router.post(
  '/users/:id/reset-password',
  requirePermission('users:manage'),
  UserController.resetPassword
);
router.delete('/users/:id', requirePermission('users:delete'), UserController.delete);

// Role & Permission Management (Dynamic RBAC)
router.get(
  '/roles',
  requireAnyPermission('roles:manage', 'users:read'),
  RoleController.list
);
router.get(
  '/roles/permissions',
  requireAnyPermission('roles:manage', 'users:read'),
  RoleController.getPermissions
);
router.get(
  '/roles/:code',
  requireAnyPermission('roles:manage', 'users:read'),
  RoleController.getByCode
);
router.post('/roles', requirePermission('roles:manage'), RoleController.create);
router.put('/roles/:code', requirePermission('roles:manage'), RoleController.update);
router.delete('/roles/:code', requirePermission('roles:manage'), RoleController.delete);

// Dashboard summary
router.get('/dashboard/summary', requirePermission('dashboard:read'), DashboardController.summary);

// Master Units (Satuan Barang, anti-duplikat & searchable)
router.get('/units', requirePermission('master:read'), UnitController.list);
router.post(
  '/units',
  requireAnyPermission('master:write', 'products:create'),
  UnitController.create
);

// Categories
router.get('/categories', requirePermission('master:read'), CategoryController.list);
router.get('/categories/:id', requirePermission('master:read'), CategoryController.getById);
router.post('/categories', requirePermission('master:write'), CategoryController.create);
router.put('/categories/:id', requirePermission('master:write'), CategoryController.update);
router.delete('/categories/:id', requirePermission('master:delete'), CategoryController.delete);

// Brands (master merek, anti-duplikat)
router.get('/brands', requirePermission('master:read'), BrandController.list);
router.post('/brands', requirePermission('master:write'), BrandController.create);
router.put('/brands/:id', requirePermission('master:write'), BrandController.update);
router.delete('/brands/:id', requirePermission('master:delete'), BrandController.delete);

// Suppliers (master pemasok / distributor)
router.get('/suppliers', requirePermission('suppliers:read'), SupplierController.list);
router.get('/suppliers/:id', requirePermission('suppliers:read'), SupplierController.getById);
router.post('/suppliers', requirePermission('master:write'), SupplierController.create);
router.put('/suppliers/:id', requirePermission('master:write'), SupplierController.update);
router.delete('/suppliers/:id', requirePermission('master:delete'), SupplierController.delete);

// Supplier Sales (Tim Sales per Supplier)
router.get(
  '/suppliers/:supplierId/sales',
  requirePermission('suppliers:read'),
  SupplierController.listSales
);
router.post(
  '/suppliers/:supplierId/sales',
  requirePermission('master:write'),
  SupplierController.createSales
);
router.get('/sales/:id', requirePermission('suppliers:read'), SupplierController.getSalesById);
router.put('/sales/:id', requirePermission('master:write'), SupplierController.updateSales);
router.put(
  '/suppliers/:supplierId/sales/:id',
  requirePermission('master:write'),
  SupplierController.updateSales
);
router.patch(
  '/sales/:id/toggle',
  requirePermission('master:write'),
  SupplierController.toggleSalesStatus
);
router.delete('/sales/:id', requirePermission('master:delete'), SupplierController.deleteSales);
router.delete(
  '/suppliers/:supplierId/sales/:id',
  requirePermission('master:delete'),
  SupplierController.deleteSales
);

// Supplier Invoices & Due Dates (Nota Hutang & Jatuh Tempo Pembelian)
router.get(
  '/suppliers/:supplierId/invoices',
  requirePermission('suppliers:read'),
  SupplierInvoiceController.listBySupplier
);
router.get(
  '/suppliers/:supplierId/invoices/summary',
  requirePermission('suppliers:read'),
  SupplierInvoiceController.getSummaryBySupplier
);
router.post(
  '/suppliers/:supplierId/invoices',
  requirePermission('master:write', 'products:view_buy_price'),
  SupplierInvoiceController.create
);
router.put(
  '/supplier-invoices/:id',
  requirePermission('master:write', 'products:view_buy_price'),
  SupplierInvoiceController.update
);
router.post(
  '/supplier-invoices/:id/payment',
  requirePermission('master:write', 'products:view_buy_price'),
  SupplierInvoiceController.recordPayment
);
router.delete(
  '/supplier-invoices/:id',
  requirePermission('master:delete', 'products:view_buy_price'),
  SupplierInvoiceController.delete
);

// Products
router.get('/products', requirePermission('products:read'), ProductController.list);
router.get(
  '/products/embedding-status',
  requirePermission('products:read'),
  ProductController.getEmbeddingStatus
);
router.post(
  '/products/reindex-embeddings',
  requireAnyPermission('products:update', 'products:create', 'master:write'),
  ProductController.reindexEmbeddings
);
router.post(
  '/products/bulk-merge',
  requirePermission('products:update'),
  ProductController.bulkMerge
);
router.get('/products/:id', requirePermission('products:read'), ProductController.getById);
router.post('/products', requirePermission('products:create'), ProductController.create);
router.put('/products/:id', requirePermission('products:update'), ProductController.update);
router.patch(
  '/products/:id/toggle-status',
  requirePermission('products:update'),
  ProductController.toggleStatus
);
router.delete('/products/:id', requirePermission('products:delete'), ProductController.delete);
router.post(
  '/products/:id/move-variants',
  requirePermission('products:update'),
  ProductController.moveVariants
);
router.post(
  '/products/:id/merge',
  requirePermission('products:update'),
  ProductController.mergeProduct
);

// Product Variants
router.post(
  '/products/:productId/variants',
  requirePermission('products:create'),
  VariantController.addVariant
);
router.put(
  '/products/:productId/variants/bulk-attributes',
  requirePermission('products:update'),
  VariantController.bulkUpdateAttributes
);
router.put('/variants/:id', requirePermission('products:update'), VariantController.updateVariant);
router.patch(
  '/variants/:id/toggle-status',
  requirePermission('products:update'),
  VariantController.toggleStatus
);
router.delete('/variants/:id', requirePermission('products:delete'), VariantController.deleteVariant);
router.post(
  '/variants/:id/move',
  requirePermission('products:update'),
  VariantController.moveVariant
);
router.post(
  '/variants/:id/promote',
  requireAnyPermission('products:create', 'products:update'),
  VariantController.promoteVariant
);

// Variant Units (Satuan Harga bertingkat)
router.post(
  '/variants/:variantId/units',
  requirePermission('pricing:write'),
  VariantController.addUnit
);
router.put('/units/:id', requirePermission('pricing:write'), VariantController.updateUnit);
router.delete('/units/:id', requirePermission('pricing:write'), VariantController.deleteUnit);

// Price History & Analytics (Histori Perubahan Harga & Margin)
router.get(
  '/price-history',
  requireAnyPermission('pricing:analytics', 'pricing:write', 'products:read'),
  PriceHistoryController.getHistory
);
router.get(
  '/price-analytics/overview',
  requireAnyPermission('pricing:analytics', 'pricing:write'),
  PriceHistoryController.getOverviewAnalytics
);
router.get(
  '/pricing/threshold',
  requireAnyPermission('pricing:analytics', 'pricing:write', 'pricing:threshold'),
  PriceHistoryController.getThreshold
);
router.put(
  '/pricing/threshold',
  requirePermission('pricing:threshold'),
  PriceHistoryController.updateThreshold
);
router.post(
  '/pricing/bulk-update/preview',
  requirePermission('pricing:write'),
  PriceHistoryController.previewBulkUpdate
);
router.post(
  '/pricing/bulk-update/commit',
  requirePermission('pricing:write'),
  PriceHistoryController.commitBulkUpdate
);
router.get(
  '/products/:id/price-analytics',
  requireAnyPermission('pricing:analytics', 'pricing:write', 'products:read'),
  PriceHistoryController.getProductAnalytics
);
router.get(
  '/variants/:id/price-analytics',
  requireAnyPermission('pricing:analytics', 'pricing:write', 'products:read'),
  PriceHistoryController.getVariantAnalytics
);

// Stock Adjustments & Movement Logs
router.post('/stock/adjust', requirePermission('stock:adjust'), StockController.adjust);
router.get('/stock/movements', requirePermission('stock:read'), StockController.movements);

// Stock Reservations (Titip Barang & Alert Pengambilan Pelanggan)
router.get('/reservations', requirePermission('reservations:read'), ReservationController.list);
router.get('/reservations/alerts', requirePermission('reservations:read'), ReservationController.getAlertStats);
router.get('/reservations/:id', requirePermission('reservations:read'), ReservationController.getById);
router.post('/reservations', requirePermission('reservations:create'), ReservationController.create);
router.post('/reservations/:id/pickup', requirePermission('reservations:pickup'), ReservationController.pickup);
router.patch('/reservations/:id/extend-deadline', requirePermission('reservations:pickup'), ReservationController.extendDeadline);
router.post('/reservations/:id/cancel', requirePermission('reservations:cancel'), ReservationController.cancel);
router.post('/reservations/:id/close-partial', requirePermission('reservations:cancel'), ReservationController.closePartial);

// Bulk Import Data (.xlsx / .csv)
router.get(
  '/import/templates/:entity',
  requirePermission('data:import'),
  ImportController.downloadTemplate
);
router.post(
  '/import/:entity/preview',
  requirePermission('data:import'),
  importFileUpload.single('file'),
  ImportController.preview
);
router.post(
  '/import/:entity/commit',
  requirePermission('data:import'),
  importFileUpload.single('file'),
  ImportController.commit
);

// ==========================================
// DATA EXPORT & DATABASE BACKUP / RESTORE
// ==========================================
router.get(
  '/export/stats',
  requirePermission('data:export'),
  ExportController.getStats
);
router.get(
  '/export/database/sql',
  requirePermission('data:export'),
  ExportController.exportDatabaseSql
);
router.get(
  '/export/full-workbook',
  requirePermission('data:export'),
  ExportController.exportFullWorkbook
);
router.post(
  '/export/database/restore',
  requirePermission('data:export'),
  sqlFileUpload.single('file'),
  ExportController.restoreDatabase
);
router.get(
  '/export/:entity',
  requirePermission('data:export'),
  ExportController.exportEntity
);

// ==========================================
// SYSTEM LOGS & AUDIT MANAGEMENT
// ==========================================
router.get(
  '/system/logs',
  requireAnyPermission('logs:read', 'users:manage', 'roles:manage'),
  LogController.listLogs
);
router.get(
  '/system/logs/stats',
  requireAnyPermission('logs:read', 'users:manage', 'roles:manage'),
  LogController.getStats
);
router.get(
  '/system/logs/files',
  requireAnyPermission('logs:read', 'users:manage', 'roles:manage'),
  LogController.listFiles
);
router.get(
  '/system/logs/files/:filename/download',
  requireAnyPermission('logs:manage', 'users:manage', 'roles:manage'),
  LogController.downloadFile
);
router.delete(
  '/system/logs/buffer',
  requireAnyPermission('logs:manage', 'users:manage', 'roles:manage'),
  LogController.clearBuffer
);
router.post(
  '/system/logs/rotate',
  requireAnyPermission('logs:manage', 'users:manage', 'roles:manage'),
  LogController.rotateFiles
);

export default router;
