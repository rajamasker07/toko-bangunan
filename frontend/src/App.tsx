import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { Product, Category, DashboardSummary } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ProductListView } from './components/ProductListView';
import { ProductFormModal } from './components/ProductFormModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { StockMovementsView } from './components/StockMovementsView';
import { CategoryManagementView } from './components/CategoryManagementView';
import { ProductDetailModal } from './components/ProductDetailModal';
import { DocsView } from './components/DocsView';
import { useToast } from './components/Toast';

export const App: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState<boolean>(false);
  const [adjustVariantId, setAdjustVariantId] = useState<string | undefined>(undefined);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [productStockFilter, setProductStockFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sumData, prodData, catFlat, catTree] = await Promise.all([
        api.getDashboardSummary(),
        api.getProducts(),
        api.getCategories(false),
        api.getCategories(true),
      ]);

      setSummary(sumData);
      setProducts(prodData);
      setCategories(catFlat);
      setCategoriesTree(catTree);
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
    setActiveTab('products');
  };

  // Handle delete product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Hapus produk "${name}" dan seluruh variannya? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      await api.deleteProduct(id);
      showToast(`Produk "${name}" berhasil dihapus`, 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus produk', 'error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <Navbar
        lowStockCount={summary?.low_stock_count || 0}
        onNavigateToLowStock={() => handleNavigateToProducts('low')}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          lowStockCount={summary?.low_stock_count}
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
            <ProductListView
              products={products}
              categories={categories}
              loading={loading}
              onRefresh={loadData}
              onOpenCreate={() => setIsCreateOpen(true)}
              onOpenDetail={(p) => setDetailProduct(p)}
              onOpenAdjust={handleOpenAdjust}
              onDeleteProduct={handleDeleteProduct}
              initialStockFilter={productStockFilter}
            />
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
              onRefresh={loadData}
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

      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAdjustStock={(varId) => {
          setDetailProduct(null);
          handleOpenAdjust(varId);
        }}
      />
    </div>
  );
};
