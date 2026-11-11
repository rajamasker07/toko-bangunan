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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
        // Prevent default if not typing in input/textarea
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sumData, prodData, catFlat, catTree, brandData, supplierData] = await Promise.all([
        api.getDashboardSummary(),
        api.getProducts(),
        api.getCategories(false),
        api.getCategories(true),
        api.getBrands(),
        api.getSuppliers(),
      ]);

      setSummary(sumData);
      setProducts(prodData);
      setCategories(catFlat);
      setCategoriesTree(catTree);
      setBrands(brandData);
      setSuppliers(supplierData);

      // Keep selected product & variant in sync if currently viewing them
      setSelectedProduct((prevProd) => {
        if (!prevProd) return null;
        const fresh = prodData.find((p) => p.id === prevProd.id);
        if (!fresh) return null;

        // Also sync selected variant if open
        setSelectedVariant((prevVar) => {
          if (!prevVar) return null;
          return fresh.variants?.find((v) => v.id === prevVar.id) || null;
        });

        return fresh;
      });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data dari server', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle open adjust stock modal
  const handleOpenAdjust = (variantId?: string) => {
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
      // If already on products tab and user clicks sidebar, reset to list
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
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus produk', 'error');
    }
  };

  // Handle open edit product
  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setIsEditProductOpen(true);
  };

  // Handle open edit variant
  const handleOpenEditVariant = (variant: ProductVariant, prodName?: string) => {
    setEditingVariant(variant);
    setEditingVariantProductName(prodName || selectedProduct?.name || '');
    setIsEditVariantOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <Navbar
        lowStockCount={summary?.low_stock_count || 0}
        onNavigateToLowStock={() => handleNavigateToProducts('low')}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          lowStockCount={summary?.low_stock_count}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              loading={loading}
              onOpenCreateProduct={() => setIsCreateOpen(true)}
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
                  onRefresh={loadData}
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
                />
              ) : (
                <ProductListView
                  products={products}
                  categories={categories}
                  brands={brands}
                  loading={loading}
                  onRefresh={loadData}
                  onOpenCreate={() => setIsCreateOpen(true)}
                  onOpenDetail={(p) => {
                    setSelectedProduct(p);
                    setSelectedVariant(null);
                  }}
                  onOpenAdjust={handleOpenAdjust}
                  onDeleteProduct={handleDeleteProduct}
                  onEditProduct={handleOpenEditProduct}
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

              {/* Also show movements table beneath for instant reference */}
              <StockMovementsView />
            </div>
          )}

          {activeTab === 'movements' && <StockMovementsView />}

          {activeTab === 'categories' && (
            <CategoryManagementView
              categories={categories}
              categoriesTree={categoriesTree}
              brandCount={brands.length}
              supplierCount={suppliers.length}
              onRefresh={loadData}
              showToast={showToast}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'brands' && (
            <BrandManagementView
              brands={brands}
              categoryCount={categories.length}
              supplierCount={suppliers.length}
              onRefresh={loadData}
              showToast={showToast}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'suppliers' && (
            <SupplierManagementView
              suppliers={suppliers}
              categoryCount={categories.length}
              brandCount={brands.length}
              onRefresh={loadData}
              showToast={showToast}
              onNavigateTab={(tab) => setActiveTab(tab)}
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
        onSuccess={loadData}
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
        onSuccess={loadData}
        showToast={showToast}
      />

      <AddVariantModal
        isOpen={isAddVariantOpen}
        onClose={() => setIsAddVariantOpen(false)}
        productId={addVariantProductId}
        productName={addVariantProductName}
        onSuccess={loadData}
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
        onSuccess={loadData}
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
        onSuccess={loadData}
        showToast={showToast}
      />
    </div>
  );
};
