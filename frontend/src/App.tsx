import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { Product, ProductVariant, Category, Brand, Supplier, DashboardSummary } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ProductListView } from './components/ProductListView';
import { ProductDetailView } from './components/ProductDetailView';
import { VariantDetailView } from './components/VariantDetailView';
import { AddVariantModal } from './components/AddVariantModal';
import { ProductFormModal } from './components/ProductFormModal';
import { EditProductModal } from './components/EditProductModal';
import { EditVariantModal } from './components/EditVariantModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { StockMovementsView } from './components/StockMovementsView';
import { CategoryManagementView } from './components/CategoryManagementView';
import { BrandManagementView } from './components/BrandManagementView';
import { SupplierManagementView } from './components/SupplierManagementView';
import { DocsView } from './components/DocsView';
import { useToast } from './components/Toast';

export const App: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Independent Data States
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState<boolean>(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(false);

  // Navigation drill-down state for "Data Produk"
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState<boolean>(false);
  const [adjustVariantId, setAdjustVariantId] = useState<string | undefined>(undefined);
  const [productStockFilter, setProductStockFilter] = useState<string>('all');

  // Add Variant Modal state
  const [isAddVariantOpen, setIsAddVariantOpen] = useState<boolean>(false);
  const [addVariantProductId, setAddVariantProductId] = useState<string>('');
  const [addVariantProductName, setAddVariantProductName] = useState<string>('');

  // Edit Product & Variant state
  const [isEditProductOpen, setIsEditProductOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isEditVariantOpen, setIsEditVariantOpen] = useState<boolean>(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [editingVariantProductName, setEditingVariantProductName] = useState<string>('');

  // Sidebar collapsed state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          toggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // =========================================================================
  // FOCUSED ON-DEMAND DATA LOADERS (Prevents production freezing and bloat)
  // =========================================================================

  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const sumData = await api.getDashboardSummary();
      setSummary(sumData);
    } catch (err: any) {
      console.error('Failed to load dashboard summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setLoadingCategories(true);
      const [catFlat, catTree] = await Promise.all([
        api.getCategories(false),
        api.getCategories(true),
      ]);
      setCategories(catFlat);
      setCategoriesTree(catTree);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data kategori', 'error');
    } finally {
      setLoadingCategories(false);
    }
  }, [showToast]);

  const loadBrands = useCallback(async () => {
    try {
      setLoadingBrands(true);
      const brandData = await api.getBrands();
      setBrands(brandData);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data merek', 'error');
    } finally {
      setLoadingBrands(false);
    }
  }, [showToast]);

  const loadSuppliers = useCallback(async () => {
    try {
      setLoadingSuppliers(true);
      const supplierData = await api.getSuppliers();
      setSuppliers(supplierData);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data supplier', 'error');
    } finally {
      setLoadingSuppliers(false);
    }
  }, [showToast]);

  const loadProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const [prodData, catFlat, brandData] = await Promise.all([
        api.getProducts(),
        categories.length === 0 ? api.getCategories(false) : Promise.resolve(categories),
        brands.length === 0 ? api.getBrands() : Promise.resolve(brands),
      ]);

      setProducts(prodData);
      if (categories.length === 0) setCategories(catFlat);
      if (brands.length === 0) setBrands(brandData);

      // Keep selected product & variant in sync if currently viewing them
      setSelectedProduct((prevProd) => {
        if (!prevProd) return null;
        const fresh = prodData.find((p) => p.id === prevProd.id);
        if (!fresh) return null;

        setSelectedVariant((prevVar) => {
          if (!prevVar) return null;
          return fresh.variants?.find((v) => v.id === prevVar.id) || null;
        });

        return fresh;
      });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat produk dari server', 'error');
    } finally {
      setLoadingProducts(false);
    }
  }, [categories, brands, showToast]);

  // Initial load: summary only (lightweight boot)
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Tab switch listener: lazy load data for the active page
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadSummary();
    } else if (activeTab === 'products') {
      loadProducts();
    } else if (activeTab === 'categories') {
      loadCategories();
    } else if (activeTab === 'brands') {
      loadBrands();
    } else if (activeTab === 'suppliers') {
      loadSuppliers();
    }
  }, [activeTab]);

  // Handle open adjust stock modal
  const handleOpenAdjust = (variantId?: string) => {
    if (products.length === 0) {
      loadProducts();
    }
    setAdjustVariantId(variantId);
    setIsAdjustOpen(true);
  };

  // Handle navigate to products with specific stock filter
  const handleNavigateToProducts = (filter = 'all') => {
    setProductStockFilter(filter);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setActiveTab('products');
  };

  // Handle tab change from sidebar
  const handleTabChange = (tab: ActiveTab) => {
    if (tab === 'products' && activeTab === 'products') {
      setSelectedProduct(null);
      setSelectedVariant(null);
    }
    setActiveTab(tab);
  };

  // Handle delete product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Hapus produk "${name}" dan seluruh variannya? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      await api.deleteProduct(id);
      showToast(`Produk "${name}" berhasil dihapus`, 'success');
      setSelectedProduct(null);
      setSelectedVariant(null);
      loadProducts();
      loadSummary();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus produk', 'error');
    }
  };

  // Handle toggle product sale status (Masih Dijual vs Sudah Tidak Dijual)
  const handleToggleProductStatus = async (prod: Product) => {
    try {
      const res = await api.toggleProductStatus(prod.id);
      showToast(res.message || 'Status produk berhasil diperbarui', 'success');
      await loadProducts();
      await loadSummary();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status produk', 'error');
    }
  };

  // Handle toggle variant sale status (Masih Dijual vs Sudah Tidak Dijual)
  const handleToggleVariantStatus = async (variantId: string) => {
    try {
      const res = await api.toggleVariantStatus(variantId);
      showToast(res.message || 'Status varian berhasil diperbarui', 'success');
      await loadProducts();
      await loadSummary();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status varian', 'error');
    }
  };

  // Handle open edit product
  const handleOpenEditProduct = (prod: Product) => {
    if (categoriesTree.length === 0) {
      loadCategories();
    }
    setEditingProduct(prod);
    setIsEditProductOpen(true);
  };

  // Handle open edit variant
  const handleOpenEditVariant = (variant: ProductVariant, prodName?: string) => {
    setEditingVariant(variant);
    setEditingVariantProductName(prodName || selectedProduct?.name || '');
    setIsEditVariantOpen(true);
  };

  const handleOpenCreateProduct = () => {
    if (categoriesTree.length === 0) {
      loadCategories();
    }
    setIsCreateOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        lowStockCount={summary?.low_stock_count || 0}
        onNavigateToLowStock={() => handleNavigateToProducts('low')}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          lowStockCount={summary?.low_stock_count}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 min-h-0">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              loading={loadingSummary}
              onOpenCreateProduct={handleOpenCreateProduct}
              onOpenStockAdjust={handleOpenAdjust}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToMovements={() => setActiveTab('movements')}
            />
          )}

          {activeTab === 'products' && (
            <>
              {selectedProduct && selectedVariant ? (
                <VariantDetailView
                  product={selectedProduct}
                  variant={selectedVariant}
                  onBackToProduct={() => setSelectedVariant(null)}
                  onBackToCatalog={() => {
                    setSelectedVariant(null);
                    setSelectedProduct(null);
                  }}
                  onOpenAdjust={handleOpenAdjust}
                  showToast={showToast}
                  onEditVariant={(v) => handleOpenEditVariant(v, selectedProduct.name)}
                  onToggleVariantStatus={handleToggleVariantStatus}
                  onRefresh={() => {
                    loadProducts();
                    loadSummary();
                  }}
                />
              ) : selectedProduct ? (
                <ProductDetailView
                  product={selectedProduct}
                  onBackToCatalog={() => {
                    setSelectedVariant(null);
                    setSelectedProduct(null);
                  }}
                  onSelectVariant={(v) => setSelectedVariant(v)}
                  onOpenAdjust={handleOpenAdjust}
                  onAddVariant={(pId) => {
                    setAddVariantProductId(pId);
                    setAddVariantProductName(selectedProduct.name);
                    setIsAddVariantOpen(true);
                  }}
                  onDeleteProduct={handleDeleteProduct}
                  onEditProduct={handleOpenEditProduct}
                  onEditVariant={(v) => handleOpenEditVariant(v, selectedProduct.name)}
                  onToggleProductStatus={handleToggleProductStatus}
                  onToggleVariantStatus={handleToggleVariantStatus}
                />
              ) : (
                <ProductListView
                  products={products}
                  categories={categories}
                  brands={brands}
                  loading={loadingProducts}
                  onRefresh={loadProducts}
                  onOpenCreate={handleOpenCreateProduct}
                  onOpenDetail={(p) => {
                    setSelectedProduct(p);
                    setSelectedVariant(null);
                  }}
                  onOpenAdjust={handleOpenAdjust}
                  onDeleteProduct={handleDeleteProduct}
                  onEditProduct={handleOpenEditProduct}
                  onToggleProductStatus={handleToggleProductStatus}
                  initialStockFilter={productStockFilter}
                />
              )}
            </>
          )}

          {activeTab === 'adjust' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pusat Penyesuaian & Opname Stok
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Gunakan modal cepat di bawah untuk mencatat stok fisik, barang masuk dari supplier, atau barang pecah/cacat.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenAdjust()}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20"
                >
                  Buka Formulir Penyesuaian
                </button>
              </div>

              {/* Stock movements table beneath for reference */}
              <StockMovementsView />
            </div>
          )}

          {activeTab === 'movements' && <StockMovementsView />}

          {/* 3 Dedicated Standalone Pages for Master Data */}
          {activeTab === 'categories' && (
            <CategoryManagementView
              categories={categories}
              categoriesTree={categoriesTree}
              loading={loadingCategories}
              onRefresh={loadCategories}
              showToast={showToast}
            />
          )}

          {activeTab === 'brands' && (
            <BrandManagementView
              brands={brands}
              loading={loadingBrands}
              onRefresh={loadBrands}
              showToast={showToast}
            />
          )}

          {activeTab === 'suppliers' && (
            <SupplierManagementView
              suppliers={suppliers}
              loading={loadingSuppliers}
              onRefresh={loadSuppliers}
              showToast={showToast}
            />
          )}

          {activeTab === 'docs' && <DocsView />}
        </main>
      </div>

      {/* Modals */}
      <ProductFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        categories={categoriesTree}
        onSuccess={() => {
          loadProducts();
          loadSummary();
        }}
        showToast={showToast}
      />

      <StockAdjustmentModal
        isOpen={isAdjustOpen}
        onClose={() => {
          setIsAdjustOpen(false);
          setAdjustVariantId(undefined);
        }}
        products={products}
        initialVariantId={adjustVariantId}
        onSuccess={() => {
          loadProducts();
          loadSummary();
        }}
        showToast={showToast}
      />

      <AddVariantModal
        isOpen={isAddVariantOpen}
        onClose={() => setIsAddVariantOpen(false)}
        productId={addVariantProductId}
        productName={addVariantProductName}
        onSuccess={() => {
          loadProducts();
          loadSummary();
        }}
        showToast={showToast}
      />

      <EditProductModal
        isOpen={isEditProductOpen}
        onClose={() => {
          setIsEditProductOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        categories={categoriesTree}
        onSuccess={() => {
          loadProducts();
          loadSummary();
        }}
        showToast={showToast}
      />

      <EditVariantModal
        isOpen={isEditVariantOpen}
        onClose={() => {
          setIsEditVariantOpen(false);
          setEditingVariant(null);
        }}
        variant={editingVariant}
        productName={editingVariantProductName}
        onSuccess={() => {
          loadProducts();
          loadSummary();
        }}
        showToast={showToast}
      />
    </div>
  );
};
