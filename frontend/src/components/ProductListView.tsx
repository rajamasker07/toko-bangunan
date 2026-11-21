import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { Product, Category, Brand, ProductSearchMode, EmbeddingStatusResponse } from '../types';
import { formatRupiah, formatStock } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Pagination } from './common/Pagination';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { 
  Search, 
  Filter, 
  Plus, 
  Layers, 
  SlidersHorizontal, 
  Eye, 
  AlertTriangle, 
  ShieldCheck, 
  Download,
  Trash2,
  Package,
  ChevronRight,
  Edit2,
  Power,
  Folder,
  Tag,
  Upload,
  Sparkles,
  Brain,
  RefreshCw,
  X,
  GitMerge
} from 'lucide-react';

interface ProductListViewProps {
  products: Product[];
  categories: Category[];
  brands?: Brand[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenImport?: () => void;
  onOpenExport?: () => void;
  onOpenDetail: (product: Product) => void;
  onOpenAdjust: (variantId: string) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct: (id: string, name: string) => void;
  onToggleProductStatus?: (product: Product) => void;
  onOpenBulkMerge?: (selectedProducts: Product[]) => void;
  onOpenDetector?: () => void;
  initialStockFilter?: string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EXAMPLE_SEARCH_QUERIES = [
  { label: 'nambal tembok rembes', emoji: '💧' },
  { label: 'sambungan pipa belok', emoji: '🚰' },
  { label: 'cat besi anti karat', emoji: '🎨' },
  { label: 'perekat keramik lantai', emoji: '🧱' },
  { label: 'atap bening kanopi', emoji: '🏠' },
];

/**
 * Menghitung skor relevansi pencarian leksikal di sisi klien (fallback/debouncing)
 * Mengurutkan hasil dari yang paling relevan (exact match > prefix > contains > tokens)
 */
function computeClientRelevanceScore(p: Product, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const sku = (p.sku || '').toLowerCase();
  const barcode = (p.barcode || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  const brand = (p.brand || '').toLowerCase();
  const category = (p.category_name || '').toLowerCase();

  let score = 0;

  // 1. Exact match (prioritas tertinggi)
  if (sku === q || barcode === q) score += 1000;
  else if (name === q) score += 800;
  else if (brand === q) score += 300;
  else if (category === q) score += 200;

  // 2. Prefix match (diawali teks kueri)
  if (sku.startsWith(q) || barcode.startsWith(q)) score += 500;
  if (name.startsWith(q)) score += 450;
  if (brand.startsWith(q)) score += 180;
  if (category.startsWith(q)) score += 120;

  // 3. Phrase match (mengandung frase kueri)
  if (name.includes(q)) score += 250;
  if (sku.includes(q) || barcode.includes(q)) score += 200;
  if (brand.includes(q)) score += 100;
  if (category.includes(q)) score += 70;

  // 4. Variant matching
  if (Array.isArray(p.variants)) {
    for (const v of p.variants) {
      const vSku = (v.sku || '').toLowerCase();
      const vBarcode = (v.barcode || '').toLowerCase();
      const vName = (v.variant_name || '').toLowerCase();

      if (vSku === q || vBarcode === q) score += 900;
      else if (vSku.startsWith(q) || vBarcode.startsWith(q)) score += 400;
      else if (vSku.includes(q) || vBarcode.includes(q)) score += 180;

      if (vName === q) score += 250;
      else if (vName.startsWith(q)) score += 150;
      else if (vName.includes(q)) score += 80;
    }
  }

  // 5. Multi-token match
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    let tokenMatches = 0;
    for (const token of tokens) {
      if (name.startsWith(token)) {
        score += 70;
        tokenMatches++;
      } else if (name.includes(token)) {
        score += 50;
        tokenMatches++;
      } else if (brand.includes(token)) {
        score += 35;
        tokenMatches++;
      } else if (category.includes(token)) {
        score += 25;
        tokenMatches++;
      }
    }
    if (tokenMatches === tokens.length) {
      score += 200; // Bonus jika semua kata kueri ditemukan
    }
  }

  return score;
}

const CATALOG_FILTER_STORAGE_KEY = 'bangunjaya_catalog_filter_state';

interface CatalogFilterState {
  search: string;
  searchMode: ProductSearchMode;
  selectedCategory: string;
  selectedBrand: string;
  stockFilter: string;
  saleFilter: 'all' | 'active' | 'inactive';
  currentPage: number;
  pageSize: number;
}

function getStoredFilterState(): Partial<CatalogFilterState> {
  try {
    const raw = sessionStorage.getItem(CATALOG_FILTER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function storeFilterState(state: CatalogFilterState) {
  try {
    sessionStorage.setItem(CATALOG_FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const ProductListView: React.FC<ProductListViewProps> = ({
  products,
  categories,
  brands = [],
  loading,
  onRefresh,
  onOpenCreate,
  onOpenImport,
  onOpenExport,
  onOpenDetail,
  onOpenAdjust,
  onEditProduct,
  onDeleteProduct,
  onToggleProductStatus,
  onOpenBulkMerge,
  onOpenDetector,
  initialStockFilter = 'all',
  showToast,
}) => {
  const { can } = useAuth();
  const canCreate = can('products:create');
  const canImport = can('data:import') && canCreate;
  const canExport = can('data:export');
  const canUpdate = can('products:update');
  const canDelete = can('products:delete');
  const canAdjust = can('stock:adjust');
  const canManageAI = can('products:update') || can('products:create') || can('master:write');

  const [isExporting, setIsExporting] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const savedState = useMemo(() => getStoredFilterState(), []);

  const [search, setSearch] = useState<string>(savedState.search ?? '');
  const deferredSearch = useDeferredValue(search);
  const [searchMode, setSearchMode] = useState<ProductSearchMode>(savedState.searchMode ?? 'keyword');
  const [selectedCategory, setSelectedCategory] = useState<string>(savedState.selectedCategory ?? '');
  const [selectedBrand, setSelectedBrand] = useState<string>(savedState.selectedBrand ?? '');
  const [stockFilter, setStockFilter] = useState<string>(
    initialStockFilter !== 'all' ? initialStockFilter : (savedState.stockFilter ?? initialStockFilter)
  );
  const [saleFilter, setSaleFilter] = useState<'all' | 'active' | 'inactive'>(
    savedState.saleFilter ?? 'active'
  );

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(savedState.currentPage ?? 1);
  const [pageSize, setPageSize] = useState<number>(savedState.pageSize ?? 10);

  // Sinkronkan filter jika initialStockFilter berubah dari props (misal dari dashboard card)
  useEffect(() => {
    if (initialStockFilter && initialStockFilter !== 'all') {
      setStockFilter(initialStockFilter);
      setCurrentPage(1);
    }
  }, [initialStockFilter]);

  // Simpan state filter ke sessionStorage agar tidak hilang saat navigasi
  useEffect(() => {
    storeFilterState({
      search,
      searchMode,
      selectedCategory,
      selectedBrand,
      stockFilter,
      saleFilter,
      currentPage,
      pageSize,
    });
  }, [search, searchMode, selectedCategory, selectedBrand, stockFilter, saleFilter, currentPage, pageSize]);

  // Server Hybrid Search State
  const [serverSearchResults, setServerSearchResults] = useState<Product[] | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatusResponse | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  // Sinkronkan serverSearchResults dengan props products terbaru saat terjadi edit/delete produk
  useEffect(() => {
    if (serverSearchResults !== null) {
      const prodMap = new Map(products.map((p) => [p.id, p]));
      setServerSearchResults((prev) => {
        if (!prev) return null;
        return prev
          .filter((p) => prodMap.has(p.id))
          .map((p) => prodMap.get(p.id)!);
      });
    }
  }, [products]);

  // Load Embedding Status
  const fetchEmbeddingStatus = async () => {
    try {
      const res = await api.getEmbeddingStatus();
      setEmbeddingStatus(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEmbeddingStatus();
    const interval = setInterval(fetchEmbeddingStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Trigger Reindexing
  const handleReindex = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    try {
      const res = await api.reindexProductEmbeddings({ force: true });
      await fetchEmbeddingStatus();
      onRefresh();
      showToast?.(
        `Indeks AI berhasil disinkronkan: ${res.indexed} produk diindeks!`,
        'success'
      );
    } catch (err: any) {
      showToast?.(err.message || 'Gagal menyinkronkan indeks AI', 'error');
    } finally {
      setIsReindexing(false);
    }
  };

  // Debounced server search with AbortController
  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setServerSearchResults(null);
      setIsSearchingServer(false);
      return;
    }

    setIsSearchingServer(true);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const results = await api.getProducts(
          { search: query, mode: searchMode },
          { signal: controller.signal }
        );
        setServerSearchResults(results);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Hybrid search error:', err);
        }
      } finally {
        setIsSearchingServer(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, searchMode]);

  // Produk yang cocok dengan pencarian (server/lokal), status penjualan, dan filter kondisi stok
  const searchMatchedProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const baseList = serverSearchResults !== null ? serverSearchResults : products;

    const filtered = baseList.filter((p) => {
      let matchSearch = true;
      if (serverSearchResults === null && query) {
        matchSearch =
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          (p.brand && p.brand.toLowerCase().includes(query)) ||
          (p.category_name && p.category_name.toLowerCase().includes(query)) ||
          (p.material && p.material.toLowerCase().includes(query)) ||
          (p.specifications && p.specifications.toLowerCase().includes(query)) ||
          (p.description && p.description.toLowerCase().includes(query)) ||
          p.variants?.some(
            (v) =>
              v.variant_name.toLowerCase().includes(query) ||
              v.sku.toLowerCase().includes(query)
          );
      }

      let matchStock = true;
      if (stockFilter === 'low') {
        matchStock = Boolean(p.has_low_stock && Number(p.total_stock) > 0);
      } else if (stockFilter === 'out') {
        matchStock = Number(p.total_stock) <= 0;
      } else if (stockFilter === 'normal') {
        matchStock = !p.has_low_stock && Number(p.total_stock) > 0;
      }

      let matchSale = true;
      if (saleFilter === 'active') {
        matchSale = p.is_active !== false;
      } else if (saleFilter === 'inactive') {
        matchSale = p.is_active === false;
      }

      return matchSearch && matchStock && matchSale;
    });

    // Jika pencarian lokal (sebelum server merespons), urutkan dari yang paling relevan
    if (serverSearchResults === null && query) {
      return [...filtered].sort((a, b) => {
        const scoreA = computeClientRelevanceScore(a, query);
        const scoreB = computeClientRelevanceScore(b, query);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return a.name.localeCompare(b.name);
      });
    }

    return filtered;
  }, [products, serverSearchResults, deferredSearch, stockFilter, saleFilter]);

  // Searchable options Kategori: DIBATASI HANYA dari produk yang sedang tampil / cocok
  const categoryOptions = useMemo<SearchableOption[]>(() => {
    // Jika sedang memilih merek tertentu, opsi kategori hanya menampilkan kategori produk merek tersebut
    const candidates = selectedBrand
      ? searchMatchedProducts.filter((p) => p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase())
      : searchMatchedProducts;

    const catCountMap = new Map<string, { name: string; count: number }>();
    for (const p of candidates) {
      if (p.category_id) {
        const existing = catCountMap.get(p.category_id);
        const name = p.category_name || categories.find((c) => c.id === p.category_id)?.name || 'Kategori';
        if (existing) {
          existing.count += 1;
        } else {
          catCountMap.set(p.category_id, { name, count: 1 });
        }
      }
    }

    const options: SearchableOption[] = [];
    for (const [id, data] of catCountMap.entries()) {
      options.push({
        value: id,
        label: data.name,
        subtitle: `${data.count} produk`,
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [searchMatchedProducts, selectedBrand, categories]);

  // Searchable options Merek: DIBATASI HANYA dari produk yang sedang tampil / cocok
  const brandOptions = useMemo<SearchableOption[]>(() => {
    // Jika sedang memilih kategori tertentu, opsi merek hanya menampilkan merek yang ada di kategori tersebut
    const candidates = selectedCategory
      ? searchMatchedProducts.filter((p) => p.category_id === selectedCategory)
      : searchMatchedProducts;

    const brandCountMap = new Map<string, { name: string; count: number }>();
    for (const p of candidates) {
      if (p.brand && p.brand.trim()) {
        const key = p.brand.toLowerCase();
        const existing = brandCountMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          brandCountMap.set(key, { name: p.brand, count: 1 });
        }
      }
    }

    const options: SearchableOption[] = [];
    for (const [, data] of brandCountMap.entries()) {
      options.push({
        value: data.name,
        label: data.name,
        subtitle: `${data.count} produk`,
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [searchMatchedProducts, selectedCategory]);

  // Otomatis reset kategori terpilih jika tidak ada lagi pada produk yang cocok
  useEffect(() => {
    if (selectedCategory && !categoryOptions.some((opt) => opt.value === selectedCategory)) {
      setSelectedCategory('');
    }
  }, [categoryOptions, selectedCategory]);

  // Otomatis reset merek terpilih jika tidak ada lagi pada produk yang cocok
  useEffect(() => {
    if (selectedBrand && !brandOptions.some((opt) => opt.value.toLowerCase() === selectedBrand.toLowerCase())) {
      setSelectedBrand('');
    }
  }, [brandOptions, selectedBrand]);

  // Reset ke halaman 1 saat filter atau pencarian diubah (kecuali saat initial mount restore)
  const isInitialFilterRender = useRef(true);
  useEffect(() => {
    if (isInitialFilterRender.current) {
      isInitialFilterRender.current = false;
      return;
    }
    setCurrentPage(1);
  }, [deferredSearch, searchMode, selectedCategory, selectedBrand, stockFilter, saleFilter]);

  // Filter produk akhir untuk tabel (setelah filter kategori dan merek diaplikasikan)
  const filteredProducts = useMemo(() => {
    return searchMatchedProducts.filter((p) => {
      const matchCategory =
        !selectedCategory || p.category_id === selectedCategory;

      const matchBrand =
        !selectedBrand || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());

      return matchCategory && matchBrand;
    });
  }, [searchMatchedProducts, selectedCategory, selectedBrand]);

  // Paginated slice
  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredProducts, currentPage, pageSize]);

  const handleExportProducts = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    setIsExporting(true);
    try {
      await api.downloadEntityExport('products', format);
    } catch (err: any) {
      console.error('Export products failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Katalog Data Produk & Varian
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola barang bahan bangunan, varian ukuran/warna, dan multi-satuan harga
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canManageAI && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/70 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-xs">
              <Brain className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span className="font-semibold text-[11px]">
                {embeddingStatus?.status === 'downloading'
                  ? '⏳ Mengunduh AI...'
                  : `AI Lokal: Siap (${embeddingStatus?.indexed_products ?? products.length}/${embeddingStatus?.total_products ?? products.length})`}
              </span>
              <button
                type="button"
                onClick={handleReindex}
                disabled={isReindexing}
                className="ml-1 p-1 hover:bg-violet-200 dark:hover:bg-violet-900/60 rounded-md transition-colors"
                title="Sinkronkan Indeks Vektor AI Produk"
              >
                <RefreshCw className={`w-3 h-3 text-violet-600 dark:text-violet-400 ${isReindexing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}

          {canUpdate && onOpenDetector && (
            <button
              type="button"
              onClick={onOpenDetector}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-violet-200 dark:border-violet-900/60 bg-violet-50/70 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/60 text-violet-700 dark:text-violet-300 shadow-sm transition-colors"
              title="Pindai otomatis produk terpisah yang kemungkinan adalah varian untuk digabungkan massal"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Deteksi Produk Mirip</span>
            </button>
          )}

          {canExport && (
            <button
              onClick={() => handleExportProducts('xlsx')}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-colors disabled:opacity-50"
              title="Unduh data katalog lengkap dalam format Excel yang siap di-import ulang"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isExporting ? 'Mengekspor...' : 'Export Excel'}</span>
            </button>
          )}
          {canImport && onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-colors"
              title="Import Produk, Varian & Multi-Satuan dari Excel/CSV"
            >
              <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Import</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={onOpenCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Produk</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {/* Search Mode Pills */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold text-[11px] mr-1">Mode Pencarian:</span>
            <button
              type="button"
              onClick={() => setSearchMode('hybrid')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                searchMode === 'hybrid'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Pintar (Hybrid AI)</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('keyword')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                searchMode === 'keyword'
                  ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Kata Kunci Eksak</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('semantic')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                searchMode === 'semantic'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-cyan-300" />
              <span>Makna AI</span>
            </button>
          </div>

          {isSearchingServer && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400 animate-pulse">
              <div className="w-2.5 h-2.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span>Mencari secara semantik...</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari keluhan, makna, merek, nama, atau SKU..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="sm:col-span-4">
            <SearchableSelect
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              options={categoryOptions}
              placeholder={categoryOptions.length > 0 ? `Semua Kategori (${categoryOptions.length})` : 'Semua Kategori'}
              searchPlaceholder="Cari kategori..."
              allowClear={true}
              clearLabel="Semua Kategori"
              size="sm"
              icon={Folder}
              className="w-full"
            />
          </div>

          {/* Brand Filter (Merek) */}
          <div className="sm:col-span-3">
            <SearchableSelect
              value={selectedBrand}
              onChange={(val) => setSelectedBrand(val)}
              options={brandOptions}
              placeholder={brandOptions.length > 0 ? `Semua Merek (${brandOptions.length})` : 'Semua Merek'}
              searchPlaceholder="Cari merek..."
              allowClear={true}
              clearLabel="Semua Merek"
              size="sm"
              icon={Tag}
              className="w-full"
            />
          </div>
        </div>

        {/* Quick Example Chips for Semantic Search */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[11px] text-slate-400 font-medium">Contoh kueri:</span>
          {EXAMPLE_SEARCH_QUERIES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setSearch(q.label)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-violet-100 hover:text-violet-700 dark:bg-slate-800 dark:hover:bg-violet-950/60 dark:hover:text-violet-300 text-slate-600 dark:text-slate-300 transition-colors border border-transparent hover:border-violet-300 dark:hover:border-violet-800"
            >
              <span>{q.emoji}</span>
              <span>{q.label}</span>
            </button>
          ))}
        </div>

        {/* Quick status pills for Sale Status & Stock */}
        <div className="space-y-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Sale Status (Tingkat Produk) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-semibold text-[11px] mr-1">Status Penjualan:</span>
              <button
                type="button"
                onClick={() => setSaleFilter('active')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  saleFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                <span>Masih Dijual ({products.filter((p) => p.is_active !== false).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSaleFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  saleFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Semua Status ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setSaleFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  saleFilter === 'inactive'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                <span>Sudah Tidak Dijual ({products.filter((p) => p.is_active === false).length})</span>
              </button>
            </div>

            {(search || selectedCategory || selectedBrand || stockFilter !== 'all' || saleFilter !== 'active') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedBrand('');
                  setStockFilter('all');
                  setSaleFilter('active');
                  setServerSearchResults(null);
                  setCurrentPage(1);
                  try {
                    sessionStorage.removeItem(CATALOG_FILTER_STORAGE_KEY);
                  } catch {
                    // ignore
                  }
                }}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-semibold"
              >
                Reset Semua Filter
              </button>
            )}
          </div>

          {/* Stock Condition */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800/60">
            <span className="text-slate-400 font-semibold text-[11px] mr-1">Kondisi Stok:</span>
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                stockFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Semua ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('low')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'low'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Stok Kritis ({products.filter((p) => p.has_low_stock && Number(p.total_stock) > 0).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('out')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'out'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
              <span>Stok Habis ({products.filter((p) => Number(p.total_stock) <= 0).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('normal')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                stockFilter === 'normal'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Stok Aman ({products.filter((p) => !p.has_low_stock && Number(p.total_stock) > 0).length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Products Table / Cards */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Memuat daftar produk...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            Tidak ada produk yang cocok
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian, kategori, merek, atau filter stok.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {(search || selectedCategory || selectedBrand || stockFilter !== 'all' || saleFilter !== 'active') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedBrand('');
                  setStockFilter('all');
                  setSaleFilter('active');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Reset Filter
              </button>
            )}
            {canCreate && (
              <button
                onClick={onOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
              >
                <Plus className="w-4 h-4" /> Tambah Produk Baru
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  {canUpdate && onOpenBulkMerge && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          paginatedProducts.length > 0 &&
                          paginatedProducts.every((p) => selectedProductIds.includes(p.id))
                        }
                        onChange={() => {
                          const allPageSelected = paginatedProducts.every((p) =>
                            selectedProductIds.includes(p.id)
                          );
                          if (allPageSelected) {
                            const pageIds = new Set(paginatedProducts.map((p) => p.id));
                            setSelectedProductIds((prev) => prev.filter((id) => !pageIds.has(id)));
                          } else {
                            const newSet = new Set(selectedProductIds);
                            paginatedProducts.forEach((p) => newSet.add(p.id));
                            setSelectedProductIds(Array.from(newSet));
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Pilih semua produk di halaman ini"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Nama Produk & SKU</th>
                  <th className="py-3 px-4">Kategori & Brand</th>
                  <th className="py-3 px-4">Varian & Satuan</th>
                  <th className="py-3 px-4">Total Stok</th>
                  <th className="py-3 px-4">Harga Acuan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedProducts.map((product) => {
                  const firstVariant = product.variants?.[0];
                  const primaryUnit = firstVariant?.units?.find((u) => u.is_base_unit) || firstVariant?.units?.[0];
                  const isLow = product.has_low_stock && Number(product.total_stock) > 0;
                  const isOut = Number(product.total_stock) <= 0;
                  const reservedStock = Number(
                    (product as any).total_reserved_stock ??
                    (product as any).reserved_stock ??
                    product.variants?.reduce((sum, v) => sum + Number((v as any).reserved_stock || 0), 0) ??
                    0
                  );
                  const availableStock = Number(
                    (product as any).total_available_stock ??
                    (product as any).available_stock ??
                    Math.max(0, Number(product.total_stock) - reservedStock)
                  );

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        selectedProductIds.includes(product.id)
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                          : product.is_active === false
                          ? 'bg-rose-500/[0.02] dark:bg-rose-950/[0.05]'
                          : ''
                      }`}
                    >
                      {canUpdate && onOpenBulkMerge && (
                        <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(product.id)}
                            onChange={() => {
                              setSelectedProductIds((prev) =>
                                prev.includes(product.id)
                                  ? prev.filter((id) => id !== product.id)
                                  : [...prev, product.id]
                              );
                            }}
                            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(product)}
                            className="font-bold text-slate-900 dark:text-white text-sm hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left flex items-center gap-1.5 group/name"
                            title="Klik untuk melihat detail & varian produk ini"
                          >
                            <span>{product.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/name:opacity-100 transition-opacity text-amber-500 shrink-0" />
                          </button>

                          {product.is_active === false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-500/10 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Sudah Tidak Dijual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Masih Dijual
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {product.sku}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            UUID: {product.id.slice(0, 8)}...
                          </span>
                        </div>

                        {/* Match Badges & AI Score */}
                        {product.match_type && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {product.match_type === 'exact' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                🎯 Cocok Eksak (SKU/Nama)
                              </span>
                            ) : product.match_type === 'hybrid' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-950/70 dark:text-purple-300 px-2 py-0.5 rounded-full border border-purple-300 dark:border-purple-800">
                                <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                Cocok Pintar ({Math.round((product.similarity_score || 0.9) * 100)}%)
                              </span>
                            ) : product.match_type === 'semantic' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-300 dark:border-blue-800">
                                <Brain className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                Cocok Makna AI ({Math.round((product.similarity_score || 0.85) * 100)}%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700">
                                🔤 Kata Kunci
                              </span>
                            )}
                          </div>
                        )}

                        {/* Specs & Material Snippet Preview when searching */}
                        {Boolean(search.trim()) && (product.material || product.specifications || product.description) && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 italic max-w-md">
                            {product.material ? `Bahan: ${product.material}. ` : ''}
                            {product.specifications || product.description}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {product.category_name || 'Umum'}
                        </span>
                        {product.brand && (
                          <span className="block text-[11px] text-slate-400 mt-1">
                            Merk: {product.brand}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {product.variant_count || 1} Varian
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {primaryUnit?.unit_name ? `Satuan: ${primaryUnit.unit_name}` : ''}
                        </div>
                        {(() => {
                          const inactiveVars = product.variants?.filter((v) => v.is_active === false).length || 0;
                          if (inactiveVars > 0) {
                            return (
                              <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
                                {inactiveVars} varian tidak dijual
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                            {formatStock(product.total_stock)}
                          </span>

                          {isOut ? (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              Habis
                            </span>
                          ) : isLow ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Kritis
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Aman
                            </span>
                          )}
                        </div>
                        {reservedStock > 0 && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
                              Diamankan: {formatStock(reservedStock)} | Siap Jual: {formatStock(availableStock)}
                            </span>
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Min alert: {formatStock(product.min_stock_alert)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {primaryUnit ? (
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatRupiah(primaryUnit.sell_price)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              /{primaryUnit.unit_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canUpdate && onToggleProductStatus && (
                            <button
                              type="button"
                              onClick={() => onToggleProductStatus(product)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                product.is_active !== false
                                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  : 'text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                              }`}
                              title={
                                product.is_active !== false
                                  ? 'Status: Masih Dijual (Klik untuk hentikan penjualan)'
                                  : 'Status: Sudah Tidak Dijual (Klik untuk aktifkan kembali)'
                              }
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenDetail(product)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Lihat Detail Produk & Varian"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canUpdate && onEditProduct && (
                            <button
                              onClick={() => onEditProduct(product)}
                              className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              title="Edit Produk"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {canAdjust && (
                            <button
                              onClick={() => onOpenAdjust(firstVariant?.id || '')}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                              title="Penyesuaian Stok Cepat"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                              <span>Adjust</span>
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => onDeleteProduct(product.id, product.name)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Hapus Produk"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination for Products List */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10, 20, 50]}
          />
        </div>
      )}

      {/* Floating Action Bar for Selected Products */}
      {selectedProductIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-mono">
              {selectedProductIds.length}
            </span>
            <span>Produk Dipilih</span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {filteredProducts.length > paginatedProducts.length && (
            <button
              type="button"
              onClick={() => {
                const allFilteredIds = filteredProducts.map((p) => p.id);
                setSelectedProductIds(allFilteredIds);
              }}
              className="text-xs text-indigo-300 hover:text-indigo-200 underline font-medium"
            >
              Pilih Seluruh {filteredProducts.length} Produk Hasil Filter
            </button>
          )}

          <div className="flex items-center gap-2">
            {canUpdate && onOpenBulkMerge && (
              <button
                type="button"
                onClick={() => {
                  const selected = products.filter((p) => selectedProductIds.includes(p.id));
                  onOpenBulkMerge(selected);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all"
              >
                <GitMerge className="w-4 h-4" />
                <span>Gabung Jadi Varian</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedProductIds([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Batalkan Pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
