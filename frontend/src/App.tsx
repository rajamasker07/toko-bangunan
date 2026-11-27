import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HardHat, Loader2, RefreshCw, LogOut, WifiOff, Sparkles, X } from 'lucide-react';
import { api } from './services/api';
import { CLIENT_VERSION_INFO, subscribeServerVersionMismatch } from './utils/version';
import {
  Product,
  ProductVariant,
  Category,
  Brand,
  Supplier,
  DashboardSummary,
  ReservationAlertSummary,
  ImportEntityType,
  ExportEntityType,
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { StockReservationView } from './components/StockReservationView';
import { ProductListView } from './components/ProductListView';
import { ProductDetailView } from './components/ProductDetailView';
import { VariantDetailView } from './components/VariantDetailView';
import { AddVariantModal } from './components/AddVariantModal';
import { ProductFormModal } from './components/ProductFormModal';
import { EditProductModal } from './components/EditProductModal';
import { EditVariantModal } from './components/EditVariantModal';
import { MoveVariantModal } from './components/MoveVariantModal';
import { MergeProductModal } from './components/MergeProductModal';
import { BulkMergeProductsModal } from './components/BulkMergeProductsModal';
import { SimilarProductsDetectorModal } from './components/SimilarProductsDetectorModal';
import { PromoteVariantModal } from './components/PromoteVariantModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { StockAdjustmentView } from './components/StockAdjustmentView';
import { CategoryManagementView } from './components/CategoryManagementView';
import { BrandManagementView } from './components/BrandManagementView';
import { SupplierManagementView } from './components/SupplierManagementView';
import { DocsView } from './components/DocsView';
import { LoginView } from './components/LoginView';
import { ProfileAccountModal } from './components/ProfileAccountModal';
import { UserManagementView } from './components/UserManagementView';
import { ImportDataView } from './components/ImportDataView';
import { ExportDataView } from './components/ExportDataView';
import { PriceAnalyticsView } from './components/PriceAnalyticsView';
import { useToast } from './components/Toast';
import { useAuth } from './context/AuthContext';

export const App: React.FC = () => {
  const { showToast } = useToast();
  const {
    user,
    isAuthenticated,
    isHydrating,
    hydrationError,
    retryHydration,
    logout,
    can,
    canAccess,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [detectedServerVersion, setDetectedServerVersion] = useState<string | null>(null);
  const [dismissedServerVersion, setDismissedServerVersion] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeServerVersionMismatch((serverVer) => {
      setDetectedServerVersion(serverVer);
    });
    api.getSystemVersion().catch(() => {
      // Abaikan jika offline saat pengecekan awal
    });
    return unsubscribe;
  }, []);

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

  const [reservationAlerts, setReservationAlerts] = useState<ReservationAlertSummary | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState<boolean>(false);

  // Navigation drill-down state for "Data Produk"
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState<boolean>(false);
  const [adjustVariantId, setAdjustVariantId] = useState<string | undefined>(undefined);
  const [adjustInitialTab, setAdjustInitialTab] = useState<'form' | 'history'>('form');
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

  // Catalog Restructuring Modals state
  const [isMoveVariantOpen, setIsMoveVariantOpen] = useState<boolean>(false);
  const [moveVariantSourceProduct, setMoveVariantSourceProduct] = useState<Product | null>(null);
  const [moveVariantsList, setMoveVariantsList] = useState<ProductVariant[]>([]);

  const [isMergeProductOpen, setIsMergeProductOpen] = useState<boolean>(false);
  const [mergeProductSource, setMergeProductSource] = useState<Product | null>(null);

  const [isBulkMergeOpen, setIsBulkMergeOpen] = useState<boolean>(false);
  const [bulkMergeSourceProducts, setBulkMergeSourceProducts] = useState<Product[]>([]);
  const [bulkMergeLockedTarget, setBulkMergeLockedTarget] = useState<Product | null>(null);

  const [isDetectorOpen, setIsDetectorOpen] = useState<boolean>(false);

  const [isPromoteVariantOpen, setIsPromoteVariantOpen] = useState<boolean>(false);
  const [promoteVariantSourceProduct, setPromoteVariantSourceProduct] = useState<Product | null>(null);
  const [promoteVariantItem, setPromoteVariantItem] = useState<ProductVariant | null>(null);

  // Import Data context state (pre-selected entity & return target when opened via shortcut)
  const [importInitialEntity, setImportInitialEntity] = useState<ImportEntityType | undefined>(undefined);
  const [importReturnTab, setImportReturnTab] = useState<ActiveTab | null>(null);
  const [exportInitialEntity, setExportInitialEntity] = useState<ExportEntityType | null>(null);

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

  // Stable references to state to prevent callback recreation and cyclic re-render loops
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const brandsRef = useRef(brands);
  brandsRef.current = brands;

  const suppliersRef = useRef(suppliers);
  suppliersRef.current = suppliers;

  const productsRef = useRef(products);
  productsRef.current = products;

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

  const loadCategories = useCallback(async (force = false) => {
    try {
      setLoadingCategories(true);
      const [catFlat, catTree] = await Promise.all([
        api.getCategories(false, { force }),
        api.getCategories(true, { force }),
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

  const loadBrands = useCallback(async (force = false) => {
    try {
      setLoadingBrands(true);
      const brandData = await api.getBrands({ force });
      setBrands(brandData);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data merek', 'error');
    } finally {
      setLoadingBrands(false);
    }
  }, [showToast]);

  const loadSuppliers = useCallback(async (force = false) => {
    try {
      setLoadingSuppliers(true);
      const supplierData = await api.getSuppliers({ force });
      setSuppliers(supplierData);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Gagal memuat data supplier', 'error');
    } finally {
      setLoadingSuppliers(false);
    }
  }, [showToast]);

  const loadReservationAlerts = useCallback(async () => {
    try {
      setLoadingAlerts(true);
      const alertData = await api.getReservationAlerts();
      setReservationAlerts(alertData);
    } catch (err: any) {
      console.error('Failed to load reservation alerts:', err);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  // AbortController ref to cancel in-flight product queries on rapid tab switches or unmount
  const loadProductsAbortRef = useRef<AbortController | null>(null);

  const loadProducts = useCallback(async () => {
    // Abort previous in-flight product fetch if any
    if (loadProductsAbortRef.current) {
      loadProductsAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadProductsAbortRef.current = controller;

    try {
      setLoadingProducts(true);

      const needCategories = categoriesRef.current.length === 0;
      const needBrands = brandsRef.current.length === 0;

      const [prodData, catFlat, brandData] = await Promise.all([
        api.getProducts(undefined, { signal: controller.signal }),
        needCategories ? api.getCategories(false, { signal: controller.signal }) : Promise.resolve(categoriesRef.current),
        needBrands ? api.getBrands({ signal: controller.signal }) : Promise.resolve(brandsRef.current),
      ]);

      if (controller.signal.aborted) return;

      setProducts(prodData);
      if (needCategories && catFlat) setCategories(catFlat);
      if (needBrands && brandData) setBrands(brandData);

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
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return;
      }
      console.error(err);
      showToast(err.message || 'Gagal memuat produk dari server', 'error');
    } finally {
      if (!controller.signal.aborted) {
        setLoadingProducts(false);
      }
    }
  }, [showToast]);

  // Clear cached application data on logout / 401
  useEffect(() => {
    if (!isAuthenticated) {
      setSummary(null);
      setLoadingSummary(false);
      setReservationAlerts(null);
      setLoadingAlerts(false);
      setProducts([]);
      setCategories([]);
      setCategoriesTree([]);
      setBrands([]);
      setSuppliers([]);
      setSelectedProduct(null);
      setSelectedVariant(null);
      setIsCreateOpen(false);
      setIsAdjustOpen(false);
      setAdjustVariantId(undefined);
      setIsAddVariantOpen(false);
      setIsEditProductOpen(false);
      setEditingProduct(null);
      setIsEditVariantOpen(false);
      setEditingVariant(null);
      setIsProfileModalOpen(false);
      setImportInitialEntity(undefined);
      setImportReturnTab(null);
      setActiveTab('dashboard');
    }
  }, [isAuthenticated]);

  // Initial load: summary only once authenticated (lightweight boot)
  useEffect(() => {
    if (!isAuthenticated) return;
    loadSummary();
  }, [isAuthenticated, loadSummary]);

  // Keep latest loader and permission helpers in ref so the tab-switch effect has stable minimal dependencies
  const tabHandlersRef = useRef({
    loadSummary,
    loadReservationAlerts,
    loadProducts,
    loadCategories,
    loadBrands,
    loadSuppliers,
    canAccess,
    showToast,
  });
  tabHandlersRef.current = {
    loadSummary,
    loadReservationAlerts,
    loadProducts,
    loadCategories,
    loadBrands,
    loadSuppliers,
    canAccess,
    showToast,
  };

  // Route guard + tab switch listener: lazy load data for the active page ONCE per tab change
  useEffect(() => {
    if (!isAuthenticated) return;

    const {
      canAccess: checkAccess,
      showToast: notify,
      loadSummary: fetchSummary,
      loadReservationAlerts: fetchAlerts,
      loadProducts: fetchProducts,
      loadCategories: fetchCategories,
      loadBrands: fetchBrands,
      loadSuppliers: fetchSuppliers,
    } = tabHandlersRef.current;

    if (!checkAccess(activeTab)) {
      notify('Anda tidak memiliki izin mengakses halaman tersebut.', 'error');
      setActiveTab('dashboard');
      return;
    }

    if (activeTab === 'dashboard') {
      fetchSummary();
      fetchAlerts();
    } else if (activeTab === 'products') {
      fetchProducts();
    } else if (activeTab === 'categories') {
      fetchCategories();
    } else if (activeTab === 'adjust') {
      fetchProducts();
      fetchSummary();
    } else if (activeTab === 'brands') {
      fetchBrands();
    } else if (activeTab === 'suppliers') {
      fetchSuppliers();
    } else if (activeTab === 'reservations') {
      if (productsRef.current.length === 0) {
        fetchProducts();
      }
      fetchAlerts();
    }
  }, [activeTab, isAuthenticated]);

  // Handle open adjust stock modal
  const handleOpenAdjust = (variantId?: string) => {
    if (!can('stock:adjust')) {
      showToast('Anda tidak memiliki izin melakukan penyesuaian stok.', 'error');
      return;
    }
    if (products.length === 0) {
      loadProducts();
    }
    setAdjustVariantId(variantId);
    setIsAdjustOpen(true);
  };

  // Handle navigate to products with specific stock filter
  const handleNavigateToProducts = (filter = 'all') => {
    if (!canAccess('products')) {
      showToast('Anda tidak memiliki izin mengakses data produk.', 'error');
      return;
    }
    setProductStockFilter(filter);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setActiveTab('products');
  };

  // Handle tab change from sidebar
  const handleTabChange = (tab: ActiveTab) => {
    if (!canAccess(tab)) {
      showToast('Anda tidak memiliki izin mengakses menu tersebut.', 'error');
      return;
    }
    if (tab === 'products' && activeTab === 'products') {
      setSelectedProduct(null);
      setSelectedVariant(null);
    }
    if (tab === 'adjust') {
      setAdjustInitialTab(can('stock:adjust') ? 'form' : 'history');
    }
    if (tab === 'import') {
      setImportReturnTab(null);
      setImportInitialEntity(undefined);
    }
    setActiveTab(tab);
  };

  // Navigate to Import Data view from entity shortcut button
  const handleOpenImport = (entity: ImportEntityType, fromTab: ActiveTab) => {
    const hasEntityWrite =
      entity === 'products' ? can('products:create') : can('master:write');
    if (!canAccess('import') || !hasEntityWrite) {
      showToast('Anda tidak memiliki izin mengimport data untuk modul ini.', 'error');
      return;
    }
    setImportInitialEntity(entity);
    setImportReturnTab(fromTab);
    setActiveTab('import');
  };

  // Refresh affected states after bulk import commit
  const handleImportSuccess = useCallback(
    (entity: ImportEntityType) => {
      loadSummary();
      if (entity === 'products') {
        loadProducts();
        loadCategories(true);
        loadBrands(true);
      } else if (entity === 'categories') {
        loadCategories(true);
      } else if (entity === 'brands') {
        loadBrands(true);
      } else if (entity === 'suppliers') {
        loadSuppliers(true);
      }
    },
    [loadSummary, loadProducts, loadCategories, loadBrands, loadSuppliers]
  );

  const IMPORT_ENTITY_TAB_MAP: Record<ImportEntityType, ActiveTab> = {
    products: 'products',
    suppliers: 'suppliers',
    categories: 'categories',
    brands: 'brands',
  };

  const RETURN_TAB_LABELS: Partial<Record<ActiveTab, string>> = {
    products: 'Katalog Produk',
    suppliers: 'Master Supplier',
    categories: 'Kategori Bertingkat',
    brands: 'Master Merek',
  };

  // Handle delete product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!can('products:delete')) {
      showToast('Anda tidak memiliki izin menghapus produk.', 'error');
      return;
    }
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
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin mengubah status produk.', 'error');
      return;
    }
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
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin mengubah status varian.', 'error');
      return;
    }
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
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin mengedit produk.', 'error');
      return;
    }
    if (categoriesTree.length === 0) {
      loadCategories();
    }
    setEditingProduct(prod);
    setIsEditProductOpen(true);
  };

  // Handle open edit variant
  const handleOpenEditVariant = (variant: ProductVariant, prodName?: string) => {
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin mengedit varian.', 'error');
      return;
    }
    setEditingVariant(variant);
    setEditingVariantProductName(prodName || selectedProduct?.name || '');
    setIsEditVariantOpen(true);
  };

  const handleOpenCreateProduct = () => {
    if (!can('products:create')) {
      showToast('Anda tidak memiliki izin menambah produk baru.', 'error');
      return;
    }
    if (categoriesTree.length === 0) {
      loadCategories();
    }
    setIsCreateOpen(true);
  };

  // Handle Catalog Restructuring Operations
  const handleOpenMoveVariants = (sourceProduct: Product, variants: ProductVariant[]) => {
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin memindahkan varian produk.', 'error');
      return;
    }
    setMoveVariantSourceProduct(sourceProduct);
    setMoveVariantsList(variants);
    setIsMoveVariantOpen(true);
  };

  const handleOpenMergeProduct = (sourceProduct: Product) => {
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin menggabungkan produk.', 'error');
      return;
    }
    setMergeProductSource(sourceProduct);
    setIsMergeProductOpen(true);
  };

  const handleOpenBulkMerge = (sourceProducts: Product[], lockedTarget?: Product | null) => {
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin menggabungkan produk.', 'error');
      return;
    }
    setBulkMergeSourceProducts(sourceProducts);
    setBulkMergeLockedTarget(lockedTarget || null);
    setIsBulkMergeOpen(true);
  };

  const handleOpenDetector = () => {
    if (!can('products:update')) {
      showToast('Anda tidak memiliki izin mengelola katalog produk.', 'error');
      return;
    }
    setIsDetectorOpen(true);
  };

  const handleOpenPromoteVariant = (sourceProduct: Product, variant: ProductVariant) => {
    if (!can('products:create')) {
      showToast('Anda tidak memiliki izin membuat produk mandiri dari varian.', 'error');
      return;
    }
    if (categoriesTree.length === 0) {
      loadCategories();
    }
    setPromoteVariantSourceProduct(sourceProduct);
    setPromoteVariantItem(variant);
    setIsPromoteVariantOpen(true);
  };

  const handleRestructureSuccess = async (targetOrNewProductId?: string) => {
    await loadProducts();
    await loadSummary();
    if (targetOrNewProductId) {
      try {
        const freshList = await api.getProducts();
        const found = freshList.find((p) => p.id === targetOrNewProductId);
        if (found) {
          setSelectedProduct(found);
          setSelectedVariant(null);
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedVariant(null);
  };

  if (isHydrating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
        <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg shadow-orange-500/25 mb-4">
          <HardHat className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          <span>Memverifikasi sesi pengguna...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && hydrationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <WifiOff className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Koneksi ke Server Terputus
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {hydrationError}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => retryHydration()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Coba Lagi
            </button>
            <button
              type="button"
              onClick={() => logout({ silent: true })}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
              Kembali ke Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const isForcedPasswordChange = Boolean(user?.must_change_password);

  const showUpdateBanner =
    Boolean(detectedServerVersion) && detectedServerVersion !== dismissedServerVersion;

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors overflow-hidden">
      {/* New App Version Available Banner */}
      {showUpdateBanner && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-500 text-white px-4 py-2 text-xs flex items-center justify-between gap-3 shrink-0 shadow-sm z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Pembaruan aplikasi <strong>v{detectedServerVersion}</strong> telah tersedia (versi tab ini:{' '}
              <span className="font-mono">{CLIENT_VERSION_INFO.displayVersion}</span>). Muat ulang halaman agar sinkron dengan server.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1 rounded-lg bg-white text-amber-700 hover:bg-amber-50 font-bold transition-colors shadow-xs"
            >
              Muat Ulang Sekarang
            </button>
            <button
              type="button"
              onClick={() => setDismissedServerVersion(detectedServerVersion)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Tutup pemberitahuan pembaruan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        lowStockCount={summary?.low_stock_count || 0}
        onNavigateToLowStock={() => handleNavigateToProducts('low')}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        onNavigateToUsers={() => handleTabChange('users')}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          lowStockCount={summary?.low_stock_count}
          alertCount={(reservationAlerts?.overdue_count || 0) + (reservationAlerts?.due_soon_count || 0)}
          criticalMarginCount={summary?.critical_margin_count || 0}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 min-h-0">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              loading={loadingSummary}
              reservationAlerts={reservationAlerts}
              onNavigateToReservations={() => setActiveTab('reservations')}
              onOpenCreateProduct={handleOpenCreateProduct}
              onOpenStockAdjust={handleOpenAdjust}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToPricing={() => setActiveTab('price-analytics')}
              onNavigateToMovements={() => {
                setAdjustInitialTab('history');
                setActiveTab('adjust');
              }}
            />
          )}

          {activeTab === 'products' && (
            <>
              <div className={selectedProduct ? 'hidden' : 'block'}>
                <ProductListView
                  products={products}
                  categories={categories}
                  brands={brands}
                  loading={loadingProducts}
                  onRefresh={loadProducts}
                  onOpenCreate={handleOpenCreateProduct}
                  onOpenImport={() => handleOpenImport('products', 'products')}
                  onOpenDetail={(p) => {
                    setSelectedProduct(p);
                    setSelectedVariant(null);
                  }}
                  onOpenAdjust={handleOpenAdjust}
                  onDeleteProduct={handleDeleteProduct}
                  onEditProduct={handleOpenEditProduct}
                  onToggleProductStatus={handleToggleProductStatus}
                  onOpenBulkMerge={(selected) => handleOpenBulkMerge(selected)}
                  onOpenDetector={handleOpenDetector}
                  initialStockFilter={productStockFilter}
                  showToast={showToast}
                />
              </div>

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
                  onMoveVariant={(v) => handleOpenMoveVariants(selectedProduct, [v])}
                  onPromoteVariant={(v) => handleOpenPromoteVariant(selectedProduct, v)}
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
                  onMergeProduct={(p) => handleOpenMergeProduct(p)}
                  onAbsorbProducts={(targetProd) => handleOpenBulkMerge([], targetProd)}
                  onMoveVariants={(vars) => handleOpenMoveVariants(selectedProduct, vars)}
                  onRefresh={() => {
                    loadProducts();
                    loadSummary();
                  }}
                  showToast={showToast}
                />
              ) : null}
            </>
          )}

          {activeTab === 'price-analytics' && (
            <PriceAnalyticsView />
          )}

          {activeTab === 'adjust' && (
            <StockAdjustmentView
              products={products}
              onRefresh={() => {
                loadProducts();
                loadSummary();
              }}
              showToast={showToast}
              initialVariantId={adjustVariantId}
              initialTab={adjustInitialTab}
            />
          )}

          {activeTab === 'reservations' && (
            <StockReservationView
              products={products}
              showToast={showToast}
              onRefreshGlobal={() => {
                loadProducts();
                loadSummary();
                loadReservationAlerts();
              }}
            />
          )}

          {/* 3 Dedicated Standalone Pages for Master Data */}
          {activeTab === 'categories' && (
            <CategoryManagementView
              categories={categories}
              categoriesTree={categoriesTree}
              loading={loadingCategories}
              onRefresh={() => loadCategories(true)}
              onOpenImport={() => handleOpenImport('categories', 'categories')}
              showToast={showToast}
            />
          )}

          {activeTab === 'brands' && (
            <BrandManagementView
              brands={brands}
              loading={loadingBrands}
              onRefresh={() => loadBrands(true)}
              onOpenImport={() => handleOpenImport('brands', 'brands')}
              showToast={showToast}
            />
          )}

          {activeTab === 'suppliers' && canAccess('suppliers') && (
            <SupplierManagementView
              suppliers={suppliers}
              loading={loadingSuppliers}
              onRefresh={() => loadSuppliers(true)}
              onOpenImport={() => handleOpenImport('suppliers', 'suppliers')}
              showToast={showToast}
            />
          )}

          {activeTab === 'import' && canAccess('import') && (
            <ImportDataView
              initialEntity={importInitialEntity}
              returnTabLabel={importReturnTab ? RETURN_TAB_LABELS[importReturnTab] : undefined}
              onBack={
                importReturnTab
                  ? () => {
                      const target = importReturnTab;
                      setImportReturnTab(null);
                      setActiveTab(target);
                    }
                  : undefined
              }
              onImportSuccess={(entity) => handleImportSuccess(entity)}
              onNavigateToEntity={(entity) => {
                setImportReturnTab(null);
                handleTabChange(IMPORT_ENTITY_TAB_MAP[entity]);
              }}
              showToast={showToast}
            />
          )}

          {activeTab === 'export' && canAccess('export') && (
            <ExportDataView
              initialEntity={exportInitialEntity}
              showToast={showToast}
              onRefreshMasterData={() => {
                loadProducts();
                loadCategories(true);
                loadBrands(true);
                loadSuppliers(true);
              }}
            />
          )}

          {activeTab === 'users' && canAccess('users') && (
            <UserManagementView showToast={showToast} />
          )}

          {activeTab === 'docs' && <DocsView />}
        </main>
      </div>

      {/* Modals */}
      <ProfileAccountModal
        isOpen={isProfileModalOpen || isForcedPasswordChange}
        isForced={isForcedPasswordChange}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {can('products:create') && (
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
      )}

      {can('stock:adjust') && (
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
      )}

      {can('products:create') && (
        <AddVariantModal
          isOpen={isAddVariantOpen}
          onClose={() => setIsAddVariantOpen(false)}
          productId={addVariantProductId}
          productName={addVariantProductName}
          product={selectedProduct || products.find((p) => p.id === addVariantProductId)}
          onSuccess={() => {
            loadProducts();
            loadSummary();
          }}
          showToast={showToast}
        />
      )}

      {can('products:update') && (
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
      )}

      {can('products:update') && (
        <EditVariantModal
          isOpen={isEditVariantOpen}
          onClose={() => {
            setIsEditVariantOpen(false);
            setEditingVariant(null);
          }}
          variant={editingVariant}
          productName={editingVariantProductName}
          product={selectedProduct || products.find((p) => p.variants?.some((v) => v.id === editingVariant?.id))}
          onSuccess={() => {
            loadProducts();
            loadSummary();
          }}
          showToast={showToast}
        />
      )}

      {can('products:update') && moveVariantSourceProduct && (
        <MoveVariantModal
          isOpen={isMoveVariantOpen}
          onClose={() => {
            setIsMoveVariantOpen(false);
            setMoveVariantSourceProduct(null);
            setMoveVariantsList([]);
          }}
          sourceProduct={moveVariantSourceProduct}
          variantsToMove={moveVariantsList}
          allProducts={products}
          onSuccess={(targetId) => handleRestructureSuccess(targetId)}
          showToast={showToast}
        />
      )}

      {can('products:update') && mergeProductSource && (
        <MergeProductModal
          isOpen={isMergeProductOpen}
          onClose={() => {
            setIsMergeProductOpen(false);
            setMergeProductSource(null);
          }}
          sourceProduct={mergeProductSource}
          allProducts={products}
          onSuccess={(targetId) => handleRestructureSuccess(targetId)}
          showToast={showToast}
        />
      )}

      {can('products:update') && (
        <BulkMergeProductsModal
          isOpen={isBulkMergeOpen}
          onClose={() => {
            setIsBulkMergeOpen(false);
            setBulkMergeSourceProducts([]);
            setBulkMergeLockedTarget(null);
          }}
          initialSourceProducts={bulkMergeSourceProducts}
          lockedTargetProduct={bulkMergeLockedTarget}
          allProducts={products}
          categories={categories}
          brands={brands}
          onSuccess={(targetId) => handleRestructureSuccess(targetId)}
          showToast={showToast}
        />
      )}

      {can('products:update') && (
        <SimilarProductsDetectorModal
          isOpen={isDetectorOpen}
          onClose={() => setIsDetectorOpen(false)}
          products={products}
          onSelectGroup={(groupProducts) => {
            setIsDetectorOpen(false);
            handleOpenBulkMerge(groupProducts);
          }}
        />
      )}

      {can('products:create') && promoteVariantSourceProduct && promoteVariantItem && (
        <PromoteVariantModal
          isOpen={isPromoteVariantOpen}
          onClose={() => {
            setIsPromoteVariantOpen(false);
            setPromoteVariantSourceProduct(null);
            setPromoteVariantItem(null);
          }}
          sourceProduct={promoteVariantSourceProduct}
          variant={promoteVariantItem}
          categories={categoriesTree}
          onSuccess={(newId) => handleRestructureSuccess(newId)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
