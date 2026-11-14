import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { BrandController } from '../controllers/brandController.js';
import { CategoryController } from '../controllers/categoryController.js';
import { DashboardController } from '../controllers/dashboardController.js';
import { ProductController } from '../controllers/productController.js';
import { StockController } from '../controllers/stockController.js';
import { SupplierController } from '../controllers/supplierController.js';
import { UnitController } from '../controllers/unitController.js';
import { ReservationController } from '../controllers/reservationController.js';
import { UserController } from '../controllers/userController.js';
import { VariantController } from '../controllers/variantController.js';
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// ==========================================
// PUBLIC AUTH ROUTES
// ==========================================
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

// Products
router.get('/products', requirePermission('products:read'), ProductController.list);
router.get('/products/:id', requirePermission('products:read'), ProductController.getById);
router.post('/products', requirePermission('products:create'), ProductController.create);
router.put('/products/:id', requirePermission('products:update'), ProductController.update);
router.patch(
  '/products/:id/toggle-status',
  requirePermission('products:update'),
  ProductController.toggleStatus
);
router.delete('/products/:id', requirePermission('products:delete'), ProductController.delete);

// Product Variants
router.post(
  '/products/:productId/variants',
  requirePermission('products:create'),
  VariantController.addVariant
);
router.put('/variants/:id', requirePermission('products:update'), VariantController.updateVariant);
router.patch(
  '/variants/:id/toggle-status',
  requirePermission('products:update'),
  VariantController.toggleStatus
);
router.delete('/variants/:id', requirePermission('products:delete'), VariantController.deleteVariant);

// Variant Units (Satuan Harga bertingkat)
router.post(
  '/variants/:variantId/units',
  requirePermission('pricing:write'),
  VariantController.addUnit
);
router.put('/units/:id', requirePermission('pricing:write'), VariantController.updateUnit);
router.delete('/units/:id', requirePermission('pricing:write'), VariantController.deleteUnit);

// Stock Adjustments & Movement Logs
router.post('/stock/adjust', requirePermission('stock:adjust'), StockController.adjust);
router.get('/stock/movements', requirePermission('stock:read'), StockController.movements);

// Stock Reservations (Titip Barang & Alert Pengambilan Pelanggan)
router.get('/reservations', ReservationController.list);
router.get('/reservations/alerts', ReservationController.getAlertStats);
router.get('/reservations/:id', ReservationController.getById);
router.post('/reservations', ReservationController.create);
router.post('/reservations/:id/pickup', ReservationController.pickup);
router.patch('/reservations/:id/extend-deadline', ReservationController.extendDeadline);
router.post('/reservations/:id/cancel', ReservationController.cancel);
router.post('/reservations/:id/close-partial', ReservationController.closePartial);

export default router;
