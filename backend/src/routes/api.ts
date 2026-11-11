import { Router } from 'express';
import { CategoryController } from '../controllers/categoryController.js';
import { ProductController } from '../controllers/productController.js';
import { VariantController } from '../controllers/variantController.js';
import { StockController } from '../controllers/stockController.js';
import { DashboardController } from '../controllers/dashboardController.js';
import { BrandController } from '../controllers/brandController.js';
import { SupplierController } from '../controllers/supplierController.js';
import { UnitController } from '../controllers/unitController.js';

const router = Router();

// Dashboard summary
router.get('/dashboard/summary', DashboardController.summary);

// Master Units (Satuan Barang, anti-duplikat & searchable)
router.get('/units', UnitController.list);
router.post('/units', UnitController.create);

// Categories
router.get('/categories', CategoryController.list);
router.get('/categories/:id', CategoryController.getById);
router.post('/categories', CategoryController.create);
router.put('/categories/:id', CategoryController.update);
router.delete('/categories/:id', CategoryController.delete);

// Brands (master merek, anti-duplikat)
router.get('/brands', BrandController.list);
router.post('/brands', BrandController.create);
router.put('/brands/:id', BrandController.update);
router.delete('/brands/:id', BrandController.delete);

// Suppliers (master pemasok / distributor)
router.get('/suppliers', SupplierController.list);
router.get('/suppliers/:id', SupplierController.getById);
router.post('/suppliers', SupplierController.create);
router.put('/suppliers/:id', SupplierController.update);
router.delete('/suppliers/:id', SupplierController.delete);

// Supplier Sales (Tim Sales per Supplier)
router.get('/suppliers/:supplierId/sales', SupplierController.listSales);
router.post('/suppliers/:supplierId/sales', SupplierController.createSales);
router.get('/sales/:id', SupplierController.getSalesById);
router.put('/sales/:id', SupplierController.updateSales);
router.put('/suppliers/:supplierId/sales/:id', SupplierController.updateSales);
router.patch('/sales/:id/toggle', SupplierController.toggleSalesStatus);
router.delete('/sales/:id', SupplierController.deleteSales);
router.delete('/suppliers/:supplierId/sales/:id', SupplierController.deleteSales);

// Products
router.get('/products', ProductController.list);
router.get('/products/:id', ProductController.getById);
router.post('/products', ProductController.create);
router.put('/products/:id', ProductController.update);
router.delete('/products/:id', ProductController.delete);

// Product Variants
router.post('/products/:productId/variants', VariantController.addVariant);
router.put('/variants/:id', VariantController.updateVariant);
router.delete('/variants/:id', VariantController.deleteVariant);

// Variant Units (Satuan Harga bertingkat)
router.post('/variants/:variantId/units', VariantController.addUnit);
router.put('/units/:id', VariantController.updateUnit);
router.delete('/units/:id', VariantController.deleteUnit);

// Stock Adjustments & Movement Logs
router.post('/stock/adjust', StockController.adjust);
router.get('/stock/movements', StockController.movements);

export default router;
