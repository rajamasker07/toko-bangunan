import React, { useState, useEffect, useRef } from 'react';
import { Category, Brand, Supplier, UnitMaster } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
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
  Minus,
  ArrowRight,
  ArrowLeft,
  Ruler,
  FileText,
  Check,
  Info,
  Box,
  Barcode
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
  const { can } = useAuth();
  const canViewBuyPrice = can('products:view_buy_price');
  const canWriteMaster = can('master:write');

  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Multi-step Wizard Navigation State
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Common Product Info (Tahap 1)
  const [name, setName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  // Physical Dimensions & Technical Specifications (Tahap 3)
  const [weight, setWeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [material, setMaterial] = useState<string>('');
  const [specifications, setSpecifications] = useState<string>('');

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
    setCurrentStep(1);
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

    // Physical Dimensions & Specs (Tahap 3)
    setWeight('');
    setLength('');
    setWidth('');
    setHeight('');
    setMaterial('');
    setSpecifications('');

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
      hasVariants ||
      weight.trim() !== '' ||
      length.trim() !== '' ||
      width.trim() !== '' ||
      height.trim() !== '' ||
      material.trim() !== '' ||
      specifications.trim() !== ''
    );
  };

  // Multi-step validation handlers
  const validateStep1 = (): boolean => {
    if (!name.trim()) {
      showToast('Nama produk wajib diisi!', 'error');
      setCurrentStep(1);
      setTimeout(() => nameInputRef.current?.focus(), 50);
      return false;
    }
    if (!categoryId) {
      showToast('Silakan pilih kategori produk terlebih dahulu!', 'error');
      setCurrentStep(1);
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (hasVariants) {
      if (!variantsList || variantsList.length === 0) {
        showToast('Minimal harus ada 1 varian produk!', 'error');
        setCurrentStep(2);
        return false;
      }
      for (let i = 0; i < variantsList.length; i++) {
        if (!variantsList[i].variant_name.trim()) {
          showToast(`Nama varian ke-${i + 1} wajib diisi!`, 'error');
          setCurrentStep(2);
          return false;
        }
      }
    } else {
      if (!baseUnitName.trim()) {
        showToast('Satuan dasar produk wajib diisi!', 'error');
        setCurrentStep(2);
        return false;
      }
    }
    return true;
  };

  const goToStep = (target: 1 | 2 | 3) => {
    if (target === currentStep) return;
    if (target > currentStep) {
      if (currentStep === 1 && !validateStep1()) return;
      if (currentStep === 2 && !validateStep2()) return;
      if (target === 3 && currentStep === 1) {
        if (!validateStep1()) return;
        if (!validateStep2()) {
          setCurrentStep(2);
          return;
        }
      }
    }
    setCurrentStep(target);
  };

  // Live cubic volume calculation for building materials
  const volumeMetrics = React.useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    if (l <= 0 || w <= 0 || h <= 0) return null;
    const cm3 = l * w * h;
    const liter = cm3 / 1000;
    const m3 = cm3 / 1000000;
    return {
      cm3: cm3.toLocaleString('id-ID'),
      liter: liter < 0.01 ? liter.toFixed(3) : liter.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
      m3: m3 < 0.001 ? m3.toFixed(4) : m3.toLocaleString('id-ID', { maximumFractionDigits: 3 }),
    };
  }, [length, width, height]);

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

  // Lookups for Step 3 summary card
  const selectedCategoryName = React.useMemo(() => {
    const cat = categoryOptions.find((c) => c.value === categoryId);
    return cat ? cat.label : 'Belum dipilih';
  }, [categoryOptions, categoryId]);

  const selectedBrandName = React.useMemo(() => {
    const b = brands.find((x) => x.id === brandId);
    return b ? b.name : 'Tanpa Merek';
  }, [brands, brandId]);

  const selectedSupplierName = React.useMemo(() => {
    const s = suppliers.find((x) => x.id === supplierId);
    return s ? s.name : 'Tanpa Pemasok';
  }, [suppliers, supplierId]);

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

  // Keyboard navigation helper: Shift+Enter to advance steps (plain Enter will NOT advance steps)
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    // Shift+Enter to advance to the next step
    if (e.shiftKey && e.key === 'Enter') {
      if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (currentStep === 1) {
          if (validateStep1()) goToStep(2);
        } else if (currentStep === 2) {
          if (validateStep2()) goToStep(3);
        }
      }
      return;
    }

    // Normal Enter: do NOT advance steps, and prevent premature submit on step 1 & 2
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {
        if (currentStep < 3) {
          e.preventDefault();
        }
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateStep1()) return;
    if (!validateStep2()) return;

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
        weight: weight ? Number(weight) : null,
        length: length ? Number(length) : null,
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
        material: material.trim() || undefined,
        specifications: specifications.trim() || undefined,
      };

      if (!hasVariants) {
        // Simple product: backend automatically creates 1 variant and its units
        const units = [
          {
            unit_name: baseUnitName,
            conversion_factor: 1,
            is_base_unit: true,
            ...(canViewBuyPrice ? { buy_price: Number(buyPrice) || 0 } : {}),
            sell_price: Number(sellPrice) || 0,
            wholesale_price: wholesalePrice ? Number(wholesalePrice) : null,
          },
          ...simpleAdditionalUnits.map((u) => {
            const effectiveBuy = Number(u.buy_price) || ((Number(buyPrice) || 0) * (Number(u.conversion_factor) || 1));
            return {
              unit_name: u.unit_name,
              conversion_factor: Number(u.conversion_factor) || 1,
              is_base_unit: false,
              ...(canViewBuyPrice ? { buy_price: effectiveBuy } : {}),
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
          ...(canViewBuyPrice ? { buy_price: Number(buyPrice) || 0 } : {}),
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
                  ...(canViewBuyPrice ? { buy_price: effectiveBuy } : {}),
                  sell_price: Number(u.sell_price) || 0,
                  wholesale_price: u.wholesale_price ? Number(u.wholesale_price) : null,
                };
              }),
            };
          }),
        };
      }

      await api.createProduct(payload);

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
                <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white dark:bg-slate-700 px-1 py-0.2 rounded shadow-2xs font-bold text-slate-700 dark:text-slate-200">Shift+Enter</kbd>
                    <span>lanjut</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white dark:bg-slate-700 px-1 py-0.2 rounded shadow-2xs font-bold text-slate-700 dark:text-slate-200">Ctrl+Enter</kbd>
                    <span>simpan</span>
                  </span>
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

        {/* Step Wizard Progress Bar */}
        <div className="px-6 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => goToStep(1)}
              className={`flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 1
                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                  : currentStep > 1
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 1
                    ? 'bg-amber-600 text-white ring-4 ring-amber-500/20 shadow-xs'
                    : currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {currentStep > 1 ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : '1'}
              </div>
              <span className="hidden sm:inline">1. Data Dasar</span>
            </button>

            <div
              className={`flex-1 h-0.5 mx-2 sm:mx-3 rounded-full transition-colors ${
                currentStep > 1 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => goToStep(2)}
              className={`flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 2
                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                  : currentStep > 2
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 2
                    ? 'bg-amber-600 text-white ring-4 ring-amber-500/20 shadow-xs'
                    : currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {currentStep > 2 ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : '2'}
              </div>
              <span className="hidden sm:inline">2. Satuan & Harga</span>
            </button>

            <div
              className={`flex-1 h-0.5 mx-2 sm:mx-3 rounded-full transition-colors ${
                currentStep > 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => goToStep(3)}
              className={`flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                currentStep === 3
                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  currentStep === 3
                    ? 'bg-amber-600 text-white ring-4 ring-amber-500/20 shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                3
              </div>
              <span className="hidden sm:inline">3. Dimensi & Logistik</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="p-6 overflow-y-auto space-y-6"
        >
          {/* TAHAP 1: DATA DASAR PRODUK */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    <span>Tahap 1 dari 3: Identitas & Klasifikasi Produk</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Lengkapi identitas dasar barang agar mudah ditemukan saat transaksi kasir.
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Langkah 1/3
                </span>
              </div>

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
                  {canWriteMaster && (
                    <button
                      type="button"
                      onClick={() => setShowQuickCategory((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>{showQuickCategory ? 'Tutup' : '+ Kategori Baru'}</span>
                    </button>
                  )}
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
                  onAddNew={canWriteMaster ? handleDirectAddCategory : undefined}
                  addNewLabel={(q) => `+ Buat Kategori Baru "${q}"`}
                />

                {/* Inline Quick Category Form */}
                {canWriteMaster && showQuickCategory && (
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
                  {canWriteMaster && (
                    <button
                      type="button"
                      onClick={() => setShowQuickBrand((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>{showQuickBrand ? 'Tutup' : '+ Merk Baru'}</span>
                    </button>
                  )}
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
                  onAddNew={canWriteMaster ? handleDirectAddBrand : undefined}
                  addNewLabel={(q) => `+ Buat Merk Baru "${q}"`}
                />

                {/* Inline Quick Brand Form */}
                {canWriteMaster && showQuickBrand && (
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
                  {canWriteMaster && (
                    <button
                      type="button"
                      onClick={() => setShowQuickSupplier((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>{showQuickSupplier ? 'Tutup' : '+ Supplier Baru'}</span>
                    </button>
                  )}
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
                  onAddNew={canWriteMaster ? handleDirectAddSupplier : undefined}
                  addNewLabel={(q) => `+ Buat Supplier Baru "${q}"`}
                />

                {/* Inline Quick Supplier Form */}
                {canWriteMaster && showQuickSupplier && (
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

              {/* Barcode Master */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Barcode / Kode Scanner (Opsional):
                </label>
                <div className="relative">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan atau ketik kode barcode..."
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi / Catatan Tambahan (Opsional):
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan mengenai produk, kegunaan, atau petunjuk penyimpanan..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAHAP 2: SATUAN, VARIAN, HARGA & STOK */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  <span>Tahap 2 dari 3: Satuan, Varian, Harga & Stok</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Atur struktur varian, satuan bertingkat (Pcs/Dus/Ikat), harga beli modal, dan harga jual produk.
                </p>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                Langkah 2/3
              </span>
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
                    {canWriteMaster && (
                      <button
                        type="button"
                        onClick={() => setShowQuickUnit((prev) => !prev)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline transition-colors"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>{showQuickUnit ? 'Tutup' : '+ Satuan Baru'}</span>
                      </button>
                    )}
                  </div>
                  <UnitSelect
                    value={baseUnitName}
                    onChange={setBaseUnitName}
                    units={unitsList}
                    onAddNewUnit={canWriteMaster ? handleQuickAddUnit : undefined}
                    placeholder="Pilih atau cari satuan..."
                  />

                  {/* Inline Quick Unit Form */}
                  {canWriteMaster && showQuickUnit && (
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
                {canViewBuyPrice && (
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
                )}

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
                {canViewBuyPrice && (buyPrice > 0 || sellPrice > 0) && (
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
                      Tentukan harga jual untuk satuan kemasan yang lebih besar{canViewBuyPrice ? ' (Modal otomatis dihitung dari Modal Dasar × Isi)' : ''}.
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
                    <div className={canViewBuyPrice ? 'col-span-3' : 'col-span-4'}>Nama Satuan</div>
                    <div className={canViewBuyPrice ? 'col-span-2' : 'col-span-3'}>Isi ({baseUnitName})</div>
                    <div className={canViewBuyPrice ? 'col-span-3' : 'col-span-4'}>Harga Jual</div>
                    {canViewBuyPrice && <div className="col-span-3">Keuntungan</div>}
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
                        <div className={canViewBuyPrice ? 'col-span-12 sm:col-span-3' : 'col-span-12 sm:col-span-4'}>
                          <UnitSelect
                            size="sm"
                            value={u.unit_name}
                            onChange={(val) => handleUpdateSimpleUnit(u.id, 'unit_name', val)}
                            units={unitsList}
                            onAddNewUnit={canWriteMaster ? handleQuickAddUnit : undefined}
                            placeholder="Pilih atau cari satuan..."
                          />
                        </div>
                        <div className={canViewBuyPrice ? 'col-span-6 sm:col-span-2' : 'col-span-5 sm:col-span-3'}>
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
                        <div className={canViewBuyPrice ? 'col-span-6 sm:col-span-3' : 'col-span-5 sm:col-span-4'}>
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
                        {canViewBuyPrice && (
                          <div className="col-span-10 sm:col-span-3 flex items-center min-w-0">
                            <ProfitBadge
                              buyPrice={autoModal}
                              sellPrice={u.sell_price}
                              compact={true}
                              unitName={u.unit_name || 'Unit'}
                            />
                          </div>
                        )}
                        <div className={canViewBuyPrice ? 'col-span-2 sm:col-span-1 flex items-center justify-center' : 'col-span-2 sm:col-span-1 flex items-center justify-center'}>
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
                                  {canViewBuyPrice && (
                                    <div className="min-w-0">
                                      <ProfitBadge
                                        buyPrice={baseUnit.buy_price}
                                        sellPrice={baseUnit.sell_price}
                                        compact={true}
                                        unitName={baseUnit.unit_name}
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className={`grid grid-cols-1 gap-2.5 ${canViewBuyPrice ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                                      Nama Satuan Dasar:
                                    </label>
                                    <UnitSelect
                                      size="sm"
                                      value={baseUnit.unit_name}
                                      onChange={(val) => handleUnitChange(variant.id, baseUnit.id, 'unit_name', val)}
                                      units={unitsList}
                                      onAddNewUnit={canWriteMaster ? handleQuickAddUnit : undefined}
                                      placeholder="Pilih satuan..."
                                    />
                                  </div>
                                  {canViewBuyPrice && (
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
                                  )}
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
                                    {canViewBuyPrice
                                      ? 'Harga modal otomatis dihitung dari (Modal Dasar × Isi Konversi).'
                                      : 'Atur satuan kemasan tambahan dan faktor konversinya.'}
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
                                  <div className={canViewBuyPrice ? 'col-span-3' : 'col-span-4'}>Nama Satuan</div>
                                  <div className={canViewBuyPrice ? 'col-span-2' : 'col-span-3'}>Isi ({baseUnit?.unit_name || 'Dasar'})</div>
                                  <div className={canViewBuyPrice ? 'col-span-3' : 'col-span-4'}>Harga Jual</div>
                                  {canViewBuyPrice && <div className="col-span-3">Keuntungan</div>}
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
                                      <div className={canViewBuyPrice ? 'col-span-12 sm:col-span-3' : 'col-span-12 sm:col-span-4'}>
                                        <UnitSelect
                                          size="sm"
                                          value={u.unit_name}
                                          onChange={(val) => handleUnitChange(variant.id, u.id, 'unit_name', val)}
                                          units={unitsList}
                                          onAddNewUnit={canWriteMaster ? handleQuickAddUnit : undefined}
                                          placeholder="Pilih satuan..."
                                        />
                                      </div>
                                      <div className={canViewBuyPrice ? 'col-span-6 sm:col-span-2' : 'col-span-5 sm:col-span-3'}>
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
                                      <div className={canViewBuyPrice ? 'col-span-6 sm:col-span-3' : 'col-span-5 sm:col-span-4'}>
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
                                      {canViewBuyPrice && (
                                        <div className="col-span-10 sm:col-span-3 flex items-center min-w-0">
                                          <ProfitBadge
                                            buyPrice={autoModal}
                                            sellPrice={u.sell_price}
                                            compact={true}
                                            unitName={u.unit_name || 'Unit'}
                                          />
                                        </div>
                                      )}
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
        </div>
      )}

      {/* TAHAP 3: DIMENSI, BERAT & SPESIFIKASI LOGISTIK */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Ruler className="w-4 h-4" />
                    <span>Tahap 3 dari 3: Dimensi Fisik, Berat & Spesifikasi Logistik</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Opsional. Sangat bermanfaat untuk perhitungan kapasitas armada angkut (truk, pick-up) dan spesifikasi bahan bangunan.
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Langkah 3/3
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Berat */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Berat per Unit Dasar:
                  </label>
                  <div className="relative">
                    <Scale className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="Contoh: 40 (untuk Semen 40kg) atau 0.25"
                      className="w-full pl-10 pr-12 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      kg
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Digunakan sistem POS untuk menghitung batas muatan tonase kendaraan pengiriman toko bangunan.
                  </p>
                </div>

                {/* Material */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Material / Bahan Pembuat:
                  </label>
                  <input
                    type="text"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="Contoh: Baja Ringan Zincalume, PVC AW, Semen Portland, Keramik"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Dimensi Fisik: P x L x T */}
                <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Dimensi Ukuran Fisik (Panjang × Lebar × Tebal/Tinggi)
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">Satuan Centimeter (cm)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Panjang:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          placeholder="0"
                          className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">cm</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Lebar:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          placeholder="0"
                          className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">cm</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Tinggi / Tebal:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          placeholder="0"
                          className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">cm</span>
                      </div>
                    </div>
                  </div>

                  {/* Volume Metric Display */}
                  {volumeMetrics ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                      <Sparkles className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        <strong>Estimasi Kubikasi:</strong> {volumeMetrics.m3} m³ ({volumeMetrics.liter} Liter / {volumeMetrics.cm3} cm³)
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      Ketik panjang, lebar, dan tinggi untuk menghitung otomatis volume kubikasi ruang angkut.
                    </p>
                  )}
                </div>

                {/* Spesifikasi Teknis / Standar Mutu */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Spesifikasi Teknis / Standar Mutu (SNI, Ketebalan, dsb.):
                  </label>
                  <textarea
                    value={specifications}
                    onChange={(e) => setSpecifications(e.target.value)}
                    rows={2}
                    placeholder="Contoh: Standar SNI 03-2847-2002, Toleransi tebal 0.75mm BMT, Kuat tekan mortar kelas K-300..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Ringkasan Cepat Produk (Review Card) */}
                <div className="sm:col-span-2 p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-amber-50/40 dark:from-slate-800/60 dark:to-slate-800/30 border border-slate-200 dark:border-slate-700/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Ringkasan Data Produk Baru
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      Siap Disimpan
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-medium">Nama Produk</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                        {name || '-'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-medium">Kategori & Merek</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {selectedCategoryName} • {selectedBrandName}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-medium">Harga Jual Utama</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate block">
                        {!hasVariants ? `Rp ${formatIdNumber(sellPrice)} / ${baseUnitName}` : `${variantsList.length} Varian`}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-medium">Stok Awal</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {!hasVariants ? `${initialStock} ${baseUnitName}` : `${variantsList.reduce((acc, v) => acc + (Number(v.initial_stock) || 0), 0)} Unit Total`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stepper Action Buttons */}
          <div className="flex items-center justify-between gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            {/* Left Action */}
            {currentStep === 1 ? (
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToStep((currentStep - 1) as 1 | 2)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
            )}

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {currentStep === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep1()) goToStep(2);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                >
                  <span>Lanjut: Satuan & Harga</span>
                  <kbd className="hidden sm:inline-block text-[10px] font-mono bg-amber-700/60 text-amber-100 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Shift+Enter
                  </kbd>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
                    title="Simpan langsung tanpa mengisi dimensi/spesifikasi (Ctrl+Enter)"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Simpan Langsung</span>
                    <kbd className="hidden sm:inline-block text-[10px] font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                      Ctrl+Enter
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep2()) goToStep(3);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                  >
                    <span>Lanjut: Dimensi & Logistik</span>
                    <kbd className="hidden sm:inline-block text-[10px] font-mono bg-amber-700/60 text-amber-100 px-1.5 py-0.5 rounded border border-amber-500/30">
                      Shift+Enter
                    </kbd>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {currentStep === 3 && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-50 transition-all cursor-pointer"
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
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
