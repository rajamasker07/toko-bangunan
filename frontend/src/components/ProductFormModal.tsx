import React, { useState, useEffect, useRef } from 'react';
import { Category, Brand, Supplier, UnitMaster } from '../types';
import { api } from '../services/api';
import { NumericInput, formatIdNumber } from './common/NumericInput';
import { ProfitBadge } from './common/ProfitBadge';
import { UnitSelect } from './common/UnitSelect';
import { SearchableSelect, SearchableOption } from './common/SearchableSelect';
import { 
  X, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Layers, 
  Package, 
  Tag, 
  Sparkles, 
  FolderPlus, 
  Award, 
  Truck,
  Banknote,
  Coins,
  Boxes,
  Scale,
  ArrowLeftRight,
  AlertTriangle,
  BadgePercent,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSuccess,
  showToast,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Common Product Info
  const [name, setName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  // Master Brands & Suppliers List
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Local Categories List (allows immediate addition without full page reload)
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  // Shortcut: Quick Add Category State
  const [showQuickCategory, setShowQuickCategory] = useState<boolean>(false);
  const [quickCatName, setQuickCatName] = useState<string>('');
  const [quickCatParentId, setQuickCatParentId] = useState<string>('');
  const [isSubmittingQuickCat, setIsSubmittingQuickCat] = useState<boolean>(false);

  // Shortcut: Quick Add Brand State (anti-duplication)
  const [showQuickBrand, setShowQuickBrand] = useState<boolean>(false);
  const [quickBrandName, setQuickBrandName] = useState<string>('');
  const [isSubmittingQuickBrand, setIsSubmittingQuickBrand] = useState<boolean>(false);

  // Shortcut: Quick Add Supplier State
  const [showQuickSupplier, setShowQuickSupplier] = useState<boolean>(false);
  const [quickSupplierName, setQuickSupplierName] = useState<string>('');
  const [quickSupplierContact, setQuickSupplierContact] = useState<string>('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState<string>('');
  const [quickSupplierCity, setQuickSupplierCity] = useState<string>('');
  const [isSubmittingQuickSupplier, setIsSubmittingQuickSupplier] = useState<boolean>(false);

  // Master Units List & Shortcut Quick Add Unit
  const [unitsList, setUnitsList] = useState<UnitMaster[]>([]);
  const [showQuickUnit, setShowQuickUnit] = useState<boolean>(false);
  const [quickUnitName, setQuickUnitName] = useState<string>('');
  const [quickUnitDesc, setQuickUnitDesc] = useState<string>('');
  const [isSubmittingQuickUnit, setIsSubmittingQuickUnit] = useState<boolean>(false);

  // Helper generator for unique keys
  const createUniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const getDefaultVariantsList = () => [
    {
      id: createUniqueId('var'),
      variant_name: '',
      sku: '',
      barcode: '',
      initial_stock: 0,
      min_stock: 5,
      units: [
        {
          id: createUniqueId('unit'),
          unit_name: 'Pcs',
          conversion_factor: 1,
          is_base_unit: true,
          buy_price: 0,
          sell_price: 0,
        },
      ],
    },
  ];

  // Reset all form fields to default initial state
  const resetForm = () => {
    setHasVariants(false);
    setName('');
    setSku('');
    setBarcode('');
    setCategoryId('');
    setBrandId('');
    setSupplierId('');
    setDescription('');
    setMinStockAlert(5);

    // Simple Product Form States
    setInitialStock(0);
    setBaseUnitName('Pcs');
    setBuyPrice(0);
    setSellPrice(0);
    setWholesalePrice('');
    setSimpleAdditionalUnits([]);

    // Multi-variant Form States
    setVariantsList(getDefaultVariantsList());

    // Quick add popovers
    setShowQuickCategory(false);
    setQuickCatName('');
    setQuickCatParentId('');
    setShowQuickBrand(false);
    setQuickBrandName('');
    setShowQuickSupplier(false);
    setQuickSupplierName('');
    setQuickSupplierContact('');
    setQuickSupplierPhone('');
    setQuickSupplierCity('');
    setShowQuickUnit(false);
    setQuickUnitName('');
    setQuickUnitDesc('');
  };

  // Check if user has entered unsaved changes
  const isFormDirty = () => {
    return (
      name.trim() !== '' ||
      sku.trim() !== '' ||
      barcode.trim() !== '' ||
      description.trim() !== '' ||
      categoryId !== '' ||
      brandId !== '' ||
      supplierId !== '' ||
      buyPrice > 0 ||
      sellPrice > 0 ||
      initialStock > 0 ||
      simpleAdditionalUnits.length > 0 ||
      hasVariants
    );
  };

  const handleRequestClose = () => {
    if (isFormDirty()) {
      const confirmClose = window.confirm(
        'Ada data produk yang belum disimpan. Yakin ingin menutup formulir tambah produk?'
      );
      if (!confirmClose) return;
    }
    onClose();
  };

  // Preload master data safely and auto-focus first input on open
  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      resetForm();

      // Auto-focus Nama Produk so user can type immediately
      setTimeout(() => {
        if (isMounted) {
          nameInputRef.current?.focus();
        }
      }, 50);

      // Concurrent fetch with memory-leak protection
      Promise.all([
        api.getBrands(),
        api.getSuppliers({ isActive: true }),
        api.getUnits(),
      ])
        .then(([brandData, suppData, unitData]) => {
          if (!isMounted) return;
          setBrands(brandData);
          setSuppliers(suppData);
          setUnitsList(unitData);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error('Failed to preload master data:', err);
        });

      setLocalCategories(categories);
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, categories]);

  // Global keyboard shortcut: Ctrl+Enter or Cmd+Enter to quickly submit product from anywhere
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting) {
          formRef.current?.requestSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, isSubmitting]);

  // Handle Quick Add Unit (Satuan Bahan Bangunan)
  const handleQuickAddUnit = async (nameToAdd?: string, descToAdd?: string): Promise<void> => {
    const targetName = (nameToAdd || quickUnitName).trim();
    if (!targetName) {
      showToast('Nama satuan wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickUnit(true);
      const res = await api.createUnit({
        name: targetName,
        description: descToAdd || quickUnitDesc.trim() || undefined,
      });

      // Refresh units list
      const updatedUnits = await api.getUnits();
      setUnitsList(updatedUnits);

      setQuickUnitName('');
      setQuickUnitDesc('');
      setShowQuickUnit(false);

      if (res.created) {
        showToast(`Satuan "${res.unit.name}" berhasil ditambahkan ke daftar master`, 'success');
      } else {
        showToast(`Satuan "${res.unit.name}" sudah ada dalam daftar`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan satuan baru', 'error');
    } finally {
      setIsSubmittingQuickUnit(false);
    }
  };

  // Handle Quick Add Category
  const handleQuickAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCatName.trim()) {
      showToast('Nama kategori wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickCat(true);
      const newCat = await api.createCategory({
        name: quickCatName.trim(),
        parent_id: quickCatParentId || null,
      });

      // Update local categories list
      const updatedCategories = await api.getCategories(true);
      setLocalCategories(updatedCategories);

      // Select the newly created category immediately
      setCategoryId(newCat.id);
      setQuickCatName('');
      setQuickCatParentId('');
      setShowQuickCategory(false);
      showToast(`Kategori "${newCat.name}" berhasil ditambahkan & dipilih`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan kategori', 'error');
    } finally {
      setIsSubmittingQuickCat(false);
    }
  };

  // Handle Quick Add Brand (Anti-duplikat)
  const handleQuickAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickBrandName.trim()) {
      showToast('Nama merek wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickBrand(true);
      const res = await api.createBrand({ name: quickBrandName.trim() });
      const brandData = res.brand;

      // Refresh brands list
      const updatedBrands = await api.getBrands();
      setBrands(updatedBrands);

      // Select brand
      setBrandId(brandData.id);
      setQuickBrandName('');
      setShowQuickBrand(false);

      if (res.created) {
        showToast(`Merek "${brandData.name}" berhasil ditambahkan`, 'success');
      } else {
        showToast(`Merek "${brandData.name}" sudah terdaftar, otomatis dipilih`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan merek', 'error');
    } finally {
      setIsSubmittingQuickBrand(false);
    }
  };

  // Simple Product Form States
  const [initialStock, setInitialStock] = useState<number>(0);
  const [baseUnitName, setBaseUnitName] = useState<string>('Pcs');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<string>('');

  // Additional units for simple product
  const [simpleAdditionalUnits, setSimpleAdditionalUnits] = useState<Array<{
    id: string;
    unit_name: string;
    conversion_factor: number;
    sell_price: number;
    buy_price: number;
  }>>([]);

  // Multi-variant Form States
  const [variantsList, setVariantsList] = useState<Array<{
    id: string;
    variant_name: string;
    sku: string;
    barcode: string;
    initial_stock: number;
    min_stock: number;
    units: Array<{
      id: string;
      unit_name: string;
      conversion_factor: number;
      is_base_unit: boolean;
      buy_price: number;
      sell_price: number;
      wholesale_price?: number;
    }>;
  }>>([
    {
      id: 'var-init-1',
      variant_name: '',
      sku: '',
      barcode: '',
      initial_stock: 0,
      min_stock: 5,
      units: [
        {
          id: 'unit-init-1',
          unit_name: 'Pcs',
          conversion_factor: 1,
          is_base_unit: true,
          buy_price: 0,
          sell_price: 0,
        },
      ],
    },
  ]);

  // Build searchable category options with hierarchical indentation
  const categoryOptions = React.useMemo(() => {
    const opts: SearchableOption[] = [];
    const traverse = (cats: Category[], level = 0) => {
      if (!Array.isArray(cats)) return;
      for (const cat of cats) {
        if (!cat || !cat.id) continue;
        opts.push({
          value: cat.id,
          label: cat.name || 'Tanpa Nama',
          level,
        });
        if (cat.children && Array.isArray(cat.children) && cat.children.length > 0) {
          traverse(cat.children, level + 1);
        }
      }
    };
    traverse(localCategories);
    return opts;
  }, [localCategories]);

  // Build searchable brand options
  const brandOptions = React.useMemo(() => {
    if (!Array.isArray(brands)) return [];
    return brands
      .filter((b) => b && b.id)
      .map((b) => ({
        value: b.id,
        label: b.name || 'Tanpa Nama',
      }));
  }, [brands]);

  // Handle direct quick-add category from SearchableSelect inline search
  const handleDirectAddCategory = async (nameToAdd: string) => {
    try {
      const newCat = await api.createCategory({
        name: nameToAdd.trim(),
        parent_id: null,
      });
      const updatedCategories = await api.getCategories(true);
      setLocalCategories(updatedCategories);
      setCategoryId(newCat.id);
      showToast(`Kategori "${newCat.name}" berhasil dibuat & dipilih`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan kategori', 'error');
    }
  };

  // Build searchable supplier options
  const supplierOptions = React.useMemo(() => {
    if (!Array.isArray(suppliers)) return [];
    return suppliers
      .filter((s) => s && s.id)
      .map((s) => {
        const details = [
          s.code ? `[${s.code}]` : '',
          s.city || '',
          s.phone || '',
        ].filter(Boolean).join(' • ');
        return {
          value: s.id,
          label: s.name || 'Tanpa Nama',
          subtitle: details || undefined,
        };
      });
  }, [suppliers]);

  // Handle direct quick-add brand from SearchableSelect inline search
  const handleDirectAddBrand = async (nameToAdd: string) => {
    try {
      const res = await api.createBrand({ name: nameToAdd.trim() });
      const updatedBrands = await api.getBrands();
      setBrands(updatedBrands);
      setBrandId(res.brand.id);
      if (res.created) {
        showToast(`Merek "${res.brand.name}" berhasil dibuat & dipilih`, 'success');
      } else {
        showToast(`Merek "${res.brand.name}" sudah ada, otomatis dipilih`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan merek', 'error');
    }
  };

  // Handle Quick Add Supplier via inline panel
  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupplierName.trim()) {
      showToast('Nama supplier wajib diisi', 'error');
      return;
    }
    try {
      setIsSubmittingQuickSupplier(true);
      const newSupplier = await api.createSupplier({
        name: quickSupplierName.trim(),
        contact_person: quickSupplierContact.trim() || undefined,
        phone: quickSupplierPhone.trim() || undefined,
        city: quickSupplierCity.trim() || undefined,
        is_active: true,
      });

      const updatedSuppliers = await api.getSuppliers({ isActive: true });
      setSuppliers(updatedSuppliers);
      setSupplierId(newSupplier.id);
      setQuickSupplierName('');
      setQuickSupplierContact('');
      setQuickSupplierPhone('');
      setQuickSupplierCity('');
      setShowQuickSupplier(false);
      showToast(`Supplier "${newSupplier.name}" berhasil ditambahkan & dipilih`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan supplier baru', 'error');
    } finally {
      setIsSubmittingQuickSupplier(false);
    }
  };

  // Handle direct quick-add supplier from SearchableSelect inline search
  const handleDirectAddSupplier = async (nameToAdd: string) => {
    try {
      const newSupplier = await api.createSupplier({
        name: nameToAdd.trim(),
        is_active: true,
      });
      const updatedSuppliers = await api.getSuppliers({ isActive: true });
      setSuppliers(updatedSuppliers);
      setSupplierId(newSupplier.id);
      showToast(`Supplier "${newSupplier.name}" berhasil dibuat & dipilih`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan supplier baru', 'error');
    }
  };

  // Variant handlers
  const handleAddVariant = () => {
    const newVariantId = createUniqueId('var');
    const newUnitId = createUniqueId('unit');
    setVariantsList((prev) => [
      ...prev,
      {
        id: newVariantId,
        variant_name: '',
        sku: '',
        barcode: '',
        initial_stock: 0,
        min_stock: 5,
        units: [
          {
            id: newUnitId,
            unit_name: 'Pcs',
            conversion_factor: 1,
            is_base_unit: true,
            buy_price: 0,
            sell_price: 0,
          },
        ],
      },
    ]);
  };

  const handleRemoveVariant = (variantId: string) => {
    if (variantsList.length <= 1) {
      showToast('Minimal harus ada 1 varian jika menggunakan multi-varian', 'error');
      return;
    }
    setVariantsList((prev) => prev.filter((v) => v.id !== variantId));
  };

  const handleVariantChange = (variantId: string, field: string, value: any) => {
    setVariantsList((prev) =>
      prev.map((variant) => (variant.id === variantId ? { ...variant, [field]: value } : variant))
    );
  };

  const handleAddUnitToVariant = (variantId: string) => {
    const newUnitId = createUniqueId('unit');
    setVariantsList((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) return variant;
        return {
          ...variant,
          units: [
            ...variant.units,
            {
              id: newUnitId,
              unit_name: 'Dus',
              conversion_factor: 10,
              is_base_unit: false,
              buy_price: 0,
              sell_price: 0,
            },
          ],
        };
      })
    );
  };

  const handleRemoveUnitFromVariant = (variantId: string, unitId: string) => {
    setVariantsList((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) return variant;
        const targetUnit = variant.units.find((u) => u.id === unitId);
        if (targetUnit?.is_base_unit) {
          showToast('Satuan dasar utama tidak boleh dihapus!', 'error');
          return variant;
        }
        return {
          ...variant,
          units: variant.units.filter((u) => u.id !== unitId),
        };
      })
    );
  };

  const handleUnitChange = (variantId: string, unitId: string, field: string, value: any) => {
    setVariantsList((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) return variant;
        return {
          ...variant,
          units: variant.units.map((unit) =>
            unit.id === unitId ? { ...unit, [field]: value } : unit
          ),
        };
      })
    );
  };

  // Additional units for simple product
  const handleAddSimpleUnit = () => {
    const newUnitId = createUniqueId('simple-unit');
    setSimpleAdditionalUnits((prev) => [
      ...prev,
      { id: newUnitId, unit_name: 'Dus', conversion_factor: 10, buy_price: 0, sell_price: 0 },
    ]);
  };

  const handleUpdateSimpleUnit = (unitId: string, field: string, value: any) => {
    setSimpleAdditionalUnits((prev) =>
      prev.map((u) => (u.id === unitId ? { ...u, [field]: value } : u))
    );
  };

  const handleRemoveSimpleUnit = (unitId: string) => {
    setSimpleAdditionalUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama produk wajib diisi', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      let payload: any = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        category_id: categoryId || null,
        brand_id: brandId || null,
        supplier_id: supplierId || null,
        description: description.trim() || undefined,
        min_stock_alert: Number(minStockAlert) || 5,
        has_variants: hasVariants,
      };

      if (!hasVariants) {
        // Simple product: backend automatically creates 1 variant and its units
        const units = [
          {
            unit_name: baseUnitName,
            conversion_factor: 1,
            is_base_unit: true,
            buy_price: Number(buyPrice) || 0,
            sell_price: Number(sellPrice) || 0,
            wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
          },
          ...simpleAdditionalUnits.map((u) => {
            const effectiveBuy = Number(u.buy_price) || ((Number(buyPrice) || 0) * (Number(u.conversion_factor) || 1));
            return {
              unit_name: u.unit_name,
              conversion_factor: Number(u.conversion_factor) || 1,
              is_base_unit: false,
              buy_price: effectiveBuy,
              sell_price: Number(u.sell_price) || 0,
              wholesale_price: null,
            };
          }),
        ];

        payload = {
          ...payload,
          initial_stock: Number(initialStock) || 0,
          min_stock: Number(minStockAlert) || 5,
          base_unit_name: baseUnitName,
          buy_price: Number(buyPrice) || 0,
          sell_price: Number(sellPrice) || 0,
          wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
          units,
        };
      } else {
        // Multi-variant validation
        for (let i = 0; i < variantsList.length; i++) {
          if (!variantsList[i].variant_name.trim()) {
            throw new Error(`Nama varian ke-${i + 1} wajib diisi!`);
          }
        }

        payload = {
          ...payload,
          variants: variantsList.map((v) => {
            const baseUnit = v.units.find((x) => x.is_base_unit);
            return {
              variant_name: v.variant_name.trim(),
              sku: v.sku.trim() || undefined,
              barcode: v.barcode.trim() || undefined,
              initial_stock: Number(v.initial_stock) || 0,
              min_stock: Number(v.min_stock) || 5,
              units: v.units.map((u) => {
                const effectiveBuy = Number(u.buy_price) || (
                  !u.is_base_unit && baseUnit && baseUnit.buy_price > 0
                    ? Number(baseUnit.buy_price) * (Number(u.conversion_factor) || 1)
                    : 0
                );
                return {
                  unit_name: u.unit_name,
                  conversion_factor: Number(u.conversion_factor) || 1,
                  is_base_unit: Boolean(u.is_base_unit),
                  buy_price: effectiveBuy,
                  sell_price: Number(u.sell_price) || 0,
                  wholesale_price: u.wholesale_price ? Number(u.wholesale_price) : null,
                };
              }),
            };
          }),
        };
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan produk');
      }

      showToast('Produk dan varian baru berhasil ditambahkan!', 'success');
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleRequestClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Tambah Produk Bahan Bangunan Baru
                </h2>
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono">
                  <kbd className="bg-white dark:bg-slate-700 px-1 py-0.2 rounded shadow-2xs font-bold text-slate-700 dark:text-slate-200">Ctrl+Enter</kbd>
                  <span>simpan</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Otomatis menghasilkan ID UUIDv7 dan 1 varian default jika tanpa varian
              </p>
            </div>
          </div>
          <button
            onClick={handleRequestClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              1. Informasi Utama Produk
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>:
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Misal: Semen Gresik PPC 50kg, Cat Dulux Weathershield, Pipa PVC..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                />
              </div>

              {/* Kategori Field with SearchableSelect & Quick-Add Shortcut */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Kategori / Sub-Kategori:
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickCategory((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>{showQuickCategory ? 'Tutup' : '+ Kategori Baru'}</span>
                  </button>
                </div>
                <SearchableSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={categoryOptions}
                  placeholder="-- Pilih atau Cari Kategori --"
                  searchPlaceholder="Ketik untuk mencari kategori..."
                  icon={FolderPlus}
                  allowClear={true}
                  clearLabel="-- Tanpa Kategori --"
                  onAddNew={handleDirectAddCategory}
                  addNewLabel={(q) => `+ Buat Kategori Baru "${q}"`}
                />

                {/* Inline Quick Category Form */}
                {showQuickCategory && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-1">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      Tambah Kategori Cepat:
                    </p>
                    <input
                      type="text"
                      value={quickCatName}
                      onChange={(e) => setQuickCatName(e.target.value)}
                      placeholder="Nama kategori baru..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                    <select
                      value={quickCatParentId}
                      onChange={(e) => setQuickCatParentId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="">Sebagai Kategori Utama (Tanpa Induk)</option>
                      {categoryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {'\u00A0\u00A0'.repeat(opt.level || 0)}{opt.level ? '↳ ' : ''}{opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowQuickCategory(false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickAddCategory}
                        disabled={isSubmittingQuickCat}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {isSubmittingQuickCat ? 'Menyimpan...' : 'Simpan Kategori'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Merek / Brand Field with SearchableSelect & Quick-Add Shortcut & Anti-Duplication */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Merk / Brand:
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickBrand((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>{showQuickBrand ? 'Tutup' : '+ Merk Baru'}</span>
                  </button>
                </div>
                <SearchableSelect
                  value={brandId}
                  onChange={setBrandId}
                  options={brandOptions}
                  placeholder="-- Pilih atau Cari Merk (Opsional) --"
                  searchPlaceholder="Ketik untuk mencari merk..."
                  icon={Award}
                  allowClear={true}
                  clearLabel="-- Tanpa Merk (Polos / No Brand) --"
                  onAddNew={handleDirectAddBrand}
                  addNewLabel={(q) => `+ Buat Merk Baru "${q}"`}
                />

                {/* Inline Quick Brand Form */}
                {showQuickBrand && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-1">
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Tambah Merk Baru:
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Sistem otomatis memeriksa agar nama merek tidak duplikat.
                      </p>
                    </div>
                    <input
                      type="text"
                      value={quickBrandName}
                      onChange={(e) => setQuickBrandName(e.target.value)}
                      placeholder="Contoh: Semen Gresik, Rucika, Dulux, Roman..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowQuickBrand(false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickAddBrand}
                        disabled={isSubmittingQuickBrand}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {isSubmittingQuickBrand ? 'Menyimpan...' : 'Simpan Merk'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Supplier Field with SearchableSelect & Quick-Add Shortcut */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Mitra Supplier / Pemasok (Opsional):
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickSupplier((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>{showQuickSupplier ? 'Tutup' : '+ Supplier Baru'}</span>
                  </button>
                </div>
                <SearchableSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  placeholder="-- Pilih atau Cari Supplier (Opsional) --"
                  searchPlaceholder="Ketik untuk mencari supplier (nama, kode, kota)..."
                  icon={Truck}
                  allowClear={true}
                  clearLabel="-- Tanpa Supplier Terpilih (Bisa Diatur Nanti) --"
                  onAddNew={handleDirectAddSupplier}
                  addNewLabel={(q) => `+ Buat Supplier Baru "${q}"`}
                />

                {/* Inline Quick Supplier Form */}
                {showQuickSupplier && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-1">
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Tambah Supplier Baru Cepat:
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Supplier ini otomatis aktif dan dapat langsung dipilih untuk produk ini.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={quickSupplierName}
                        onChange={(e) => setQuickSupplierName(e.target.value)}
                        placeholder="Nama Supplier / Toko *"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={quickSupplierContact}
                        onChange={(e) => setQuickSupplierContact(e.target.value)}
                        placeholder="Nama Kontak Person / Sales (Opsional)"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={quickSupplierPhone}
                        onChange={(e) => setQuickSupplierPhone(e.target.value)}
                        placeholder="Nomor Telepon / WA (Opsional)"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={quickSupplierCity}
                        onChange={(e) => setQuickSupplierCity(e.target.value)}
                        placeholder="Kota / Daerah (Opsional)"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowQuickSupplier(false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickAddSupplier}
                        disabled={isSubmittingQuickSupplier}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {isSubmittingQuickSupplier ? 'Menyimpan...' : 'Simpan Supplier'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  SKU Master (Opsional):
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate unik"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Batas Peringatan Stok Minimal:
                </label>
                <NumericInput
                  value={minStockAlert}
                  onChange={setMinStockAlert}
                  min={1}
                  prefixIcon={AlertTriangle}
                  suffixText="Unit"
                  placeholder="5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi / Spesifikasi:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Keterangan dimensi, daya sebar, sertifikasi SNI, dll..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Mode Varian Selector */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>Struktur Varian Produk</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {hasVariants
                    ? 'Mode Multi-Varian aktif: Tambahkan varian ukuran/warna beserta harga masing-masing.'
                    : 'Mode Sederhana aktif: Sistem otomatis membuat 1 Varian Standar di database.'}
                </p>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <button
                  type="button"
                  onClick={() => setHasVariants(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !hasVariants
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Tanpa Varian (Otomatis 1)
                </button>
                <button
                  type="button"
                  onClick={() => setHasVariants(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    hasVariants
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Multi-Varian
                </button>
              </div>
            </div>
          </div>

          {/* Simple Product Configuration Form */}
          {!hasVariants && (
            <div className="space-y-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Pengaturan Stok & Satuan Harga (Varian Otomatis)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Satuan Dasar (Stock Unit) dengan Searchable Select & Shortcut Baru */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Satuan Dasar (Stock Unit):
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowQuickUnit((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>{showQuickUnit ? 'Tutup' : '+ Satuan Baru'}</span>
                    </button>
                  </div>
                  <UnitSelect
                    value={baseUnitName}
                    onChange={setBaseUnitName}
                    units={unitsList}
                    onAddNewUnit={handleQuickAddUnit}
                    placeholder="Pilih atau cari satuan..."
                  />

                  {/* Inline Quick Unit Form */}
                  {showQuickUnit && (
                    <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-1">
                      <div>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          Tambah Satuan Baru ke Master:
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Satuan ini akan otomatis tersedia di seluruh pilihan satuan toko.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={quickUnitName}
                          onChange={(e) => setQuickUnitName(e.target.value)}
                          placeholder="Nama Satuan (misal: Kotak, Kranjang, Drum)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                        <input
                          type="text"
                          value={quickUnitDesc}
                          onChange={(e) => setQuickUnitDesc(e.target.value)}
                          placeholder="Deskripsi singkat / jenis bahan (Opsional)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowQuickUnit(false)}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingQuickUnit || !quickUnitName.trim()}
                          onClick={async () => {
                            const newName = quickUnitName.trim();
                            await handleQuickAddUnit();
                            if (newName) setBaseUnitName(newName);
                          }}
                          className="px-3 py-1 text-xs font-semibold bg-amber-500 text-slate-900 rounded-md hover:bg-amber-400 disabled:opacity-50"
                        >
                          {isSubmittingQuickUnit ? 'Menyimpan...' : 'Simpan Satuan'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Stok Awal Fisik */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Stok Awal Fisik:
                  </label>
                  <NumericInput
                    value={initialStock}
                    onChange={setInitialStock}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={Boxes}
                    suffixText={baseUnitName}
                    placeholder="0"
                  />
                </div>

                {/* 3. Harga Beli / Modal (Rp) -> Urut lebih dulu sebelum harga jual */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Beli / Modal (Rp):
                  </label>
                  <NumericInput
                    value={buyPrice}
                    onChange={setBuyPrice}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={Coins}
                    prefixText="Rp"
                    placeholder="Contoh: 62.000"
                  />
                </div>

                {/* 4. Harga Jual Standar (Rp) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Jual Standar (Rp):
                  </label>
                  <NumericInput
                    value={sellPrice}
                    onChange={setSellPrice}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={Banknote}
                    prefixText="Rp"
                    placeholder="Contoh: 68.000"
                    required
                    inputClassName="font-bold"
                  />
                </div>

                {/* 5. Harga Grosir / Proyek (Rp) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Harga Grosir / Proyek (Rp):
                  </label>
                  <NumericInput
                    value={wholesalePrice}
                    onChange={(val) => setWholesalePrice(val > 0 ? String(val) : '')}
                    allowDecimals={true}
                    maxDecimals={2}
                    prefixIcon={BadgePercent}
                    prefixText="Rp"
                    placeholder="Contoh: 65.000 (Opsional)"
                  />
                </div>

                {/* Ringkasan Keuntungan Produk Standar */}
                {(buyPrice > 0 || sellPrice > 0) && (
                  <div className="sm:col-span-2 md:col-span-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Keuntungan Standar ({baseUnitName}):
                      </span>
                      <ProfitBadge buyPrice={buyPrice} sellPrice={sellPrice} unitName={baseUnitName} />
                    </div>
                    {Number(wholesalePrice) > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          Keuntungan Grosir:
                        </span>
                        <ProfitBadge buyPrice={buyPrice} sellPrice={Number(wholesalePrice)} unitName={baseUnitName} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Extra multi-unit pricing for single variant */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Satuan Harga Tambahan (Multi-Satuan e.g. Truk, Ikat, Dus):
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Tentukan harga jual untuk satuan kemasan yang lebih besar (Modal otomatis dihitung dari Modal Dasar × Isi).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSimpleUnit}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Satuan Lain
                  </button>
                </div>

                {simpleAdditionalUnits.length > 0 && (
                  <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-1.5">
                    <div className="col-span-3">Nama Satuan</div>
                    <div className="col-span-2">Isi ({baseUnitName})</div>
                    <div className="col-span-3">Harga Jual</div>
                    <div className="col-span-3">Keuntungan</div>
                    <div className="col-span-1 text-center">Aksi</div>
                  </div>
                )}

                <div className="space-y-2">
                  {simpleAdditionalUnits.map((u) => {
                    const conversion = Number(u.conversion_factor) || 1;
                    const autoModal = (Number(buyPrice) || 0) * conversion;

                    return (
                      <div
                        key={u.id}
                        className="grid grid-cols-12 gap-2 items-center bg-slate-50/70 dark:bg-slate-800/40 p-2.5 sm:p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/40"
                      >
                        <div className="col-span-12 sm:col-span-3">
                          <UnitSelect
                            size="sm"
                            value={u.unit_name}
                            onChange={(val) => handleUpdateSimpleUnit(u.id, 'unit_name', val)}
                            units={unitsList}
                            onAddNewUnit={handleQuickAddUnit}
                            placeholder="Pilih atau cari satuan..."
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <NumericInput
                            size="sm"
                            allowDecimals={true}
                            maxDecimals={2}
                            prefixIcon={ArrowLeftRight}
                            suffixText={`x ${baseUnitName}`}
                            placeholder="Isi berapa"
                            value={u.conversion_factor}
                            onChange={(val) => handleUpdateSimpleUnit(u.id, 'conversion_factor', val)}
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <NumericInput
                            size="sm"
                            allowDecimals={true}
                            maxDecimals={2}
                            prefixIcon={Banknote}
                            prefixText="Rp"
                            placeholder="Harga Jual"
                            value={u.sell_price}
                            onChange={(val) => handleUpdateSimpleUnit(u.id, 'sell_price', val)}
                            inputClassName="font-bold"
                          />
                        </div>
                        <div className="col-span-10 sm:col-span-3 flex items-center min-w-0">
                          <ProfitBadge
                            buyPrice={autoModal}
                            sellPrice={u.sell_price}
                            compact={true}
                            unitName={u.unit_name || 'Unit'}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSimpleUnit(u.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                            title="Hapus Satuan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Multi-Variant Configuration Form */}
          {hasVariants && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Konfigurasi Varian & Multi-Satuan
                </h4>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Varian Baru</span>
                </button>
              </div>

              <div className="space-y-4">
                {variantsList.map((variant, vIdx) => (
                  <div
                    key={variant.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        <span>Varian #{vIdx + 1}</span>
                      </span>
                      {variantsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(variant.id)}
                          className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Varian
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          Nama Varian (Spesifikasi/Warna/Ukuran):
                        </label>
                        <input
                          type="text"
                          value={variant.variant_name}
                          onChange={(e) => handleVariantChange(variant.id, 'variant_name', e.target.value)}
                          placeholder="Contoh: 1/2 inch AW, Putih Salju 5kg, Ulir 10mm"
                          required
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          SKU Varian (Opsional):
                        </label>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => handleVariantChange(variant.id, 'sku', e.target.value)}
                          placeholder="Auto-generate jika kosong"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                          Stok Awal Fisik:
                        </label>
                        <NumericInput
                          size="sm"
                          value={variant.initial_stock}
                          onChange={(val) => handleVariantChange(variant.id, 'initial_stock', val)}
                          allowDecimals={true}
                          maxDecimals={2}
                          prefixIcon={Boxes}
                          suffixText={variant.units[0]?.unit_name || 'Unit'}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Units inside this variant */}
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 space-y-3">
                      {/* Satuan Dasar Pokok Varian */}
                      {(() => {
                        const baseUnit = variant.units.find((x) => x.is_base_unit) || variant.units[0];
                        const additionalUnits = variant.units.filter((x) => !x.is_base_unit);

                        return (
                          <>
                            {baseUnit && (
                              <div className="p-3 rounded-xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] font-extrabold uppercase">
                                      Satuan Dasar
                                    </span>
                                    <span>({baseUnit.unit_name || 'Satuan Pokok'})</span>
                                  </span>
                                  <div className="min-w-0">
                                    <ProfitBadge
                                      buyPrice={baseUnit.buy_price}
                                      sellPrice={baseUnit.sell_price}
                                      compact={true}
                                      unitName={baseUnit.unit_name}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                                      Nama Satuan Dasar:
                                    </label>
                                    <UnitSelect
                                      size="sm"
                                      value={baseUnit.unit_name}
                                      onChange={(val) => handleUnitChange(variant.id, baseUnit.id, 'unit_name', val)}
                                      units={unitsList}
                                      onAddNewUnit={handleQuickAddUnit}
                                      placeholder="Pilih satuan..."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                                      Harga Beli / Modal (Rp):
                                    </label>
                                    <NumericInput
                                      size="sm"
                                      value={baseUnit.buy_price}
                                      onChange={(val) => handleUnitChange(variant.id, baseUnit.id, 'buy_price', val)}
                                      allowDecimals={true}
                                      maxDecimals={2}
                                      prefixIcon={Coins}
                                      prefixText="Rp"
                                      placeholder="Modal Dasar"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                                      Harga Jual Standar (Rp):
                                    </label>
                                    <NumericInput
                                      size="sm"
                                      value={baseUnit.sell_price}
                                      onChange={(val) => handleUnitChange(variant.id, baseUnit.id, 'sell_price', val)}
                                      allowDecimals={true}
                                      maxDecimals={2}
                                      prefixIcon={Banknote}
                                      prefixText="Rp"
                                      placeholder="Harga Jual"
                                      inputClassName="font-bold"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Multi-Satuan Tambahan (Tanpa Input Modal Berulang) */}
                            <div className="pt-1">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                                    Satuan Tambahan (Multi-Satuan e.g. Dus, Truk, Ikat):
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    Harga modal otomatis dihitung dari (Modal Dasar × Isi Konversi).
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddUnitToVariant(variant.id)}
                                  className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Tambah Satuan
                                </button>
                              </div>

                              {additionalUnits.length > 0 && (
                                <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-1.5">
                                  <div className="col-span-3">Nama Satuan</div>
                                  <div className="col-span-2">Isi ({baseUnit?.unit_name || 'Dasar'})</div>
                                  <div className="col-span-3">Harga Jual</div>
                                  <div className="col-span-3">Keuntungan</div>
                                  <div className="col-span-1 text-center">Aksi</div>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                {additionalUnits.map((u) => {
                                  const autoModal = (Number(baseUnit?.buy_price) || 0) * (Number(u.conversion_factor) || 1);

                                  return (
                                    <div
                                      key={u.id}
                                      className="grid grid-cols-12 gap-2 items-center bg-white dark:bg-slate-800/80 p-2 sm:p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60"
                                    >
                                      <div className="col-span-12 sm:col-span-3">
                                        <UnitSelect
                                          size="sm"
                                          value={u.unit_name}
                                          onChange={(val) => handleUnitChange(variant.id, u.id, 'unit_name', val)}
                                          units={unitsList}
                                          onAddNewUnit={handleQuickAddUnit}
                                          placeholder="Pilih satuan..."
                                        />
                                      </div>
                                      <div className="col-span-6 sm:col-span-2">
                                        <NumericInput
                                          size="sm"
                                          value={u.conversion_factor}
                                          onChange={(val) => handleUnitChange(variant.id, u.id, 'conversion_factor', val)}
                                          allowDecimals={true}
                                          maxDecimals={2}
                                          prefixIcon={ArrowLeftRight}
                                          suffixText={`x ${baseUnit?.unit_name || 'Unit'}`}
                                          placeholder="Isi berapa"
                                        />
                                      </div>
                                      <div className="col-span-6 sm:col-span-3">
                                        <NumericInput
                                          size="sm"
                                          value={u.sell_price}
                                          onChange={(val) => handleUnitChange(variant.id, u.id, 'sell_price', val)}
                                          allowDecimals={true}
                                          maxDecimals={2}
                                          prefixIcon={Banknote}
                                          prefixText="Rp"
                                          placeholder="Harga Jual"
                                          inputClassName="font-bold"
                                        />
                                      </div>
                                      <div className="col-span-10 sm:col-span-3 flex items-center min-w-0">
                                        <ProfitBadge
                                          buyPrice={autoModal}
                                          sellPrice={u.sell_price}
                                          compact={true}
                                          unitName={u.unit_name || 'Unit'}
                                        />
                                      </div>
                                      <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveUnitFromVariant(variant.id, u.id)}
                                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                                          title="Hapus Satuan"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menyimpan Produk...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Produk</span>
                  <kbd className="hidden sm:inline-block text-[10px] font-mono bg-amber-700/60 text-amber-100 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Ctrl+Enter
                  </kbd>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
