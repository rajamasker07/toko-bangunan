import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { Product, VariantUnit } from '../types';
import { api } from '../services/api';
import { formatStock, formatDate } from '../utils/format';
import {
  X,
  User,
  Phone,
  MapPin,
  FileText,
  Calendar,
  Clock,
  Package,
  Layers,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Info,
  Check,
  Tag,
  Boxes,
} from 'lucide-react';

export interface SelectedItemConfig {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  category_name?: string;
  brand?: string;
  available_stock: number;
  current_stock: number;
  base_unit_name: string;
  units: VariantUnit[];
  unit_name: string;
  conversion_factor: number;
  qty: number | string;
}

interface FlattenedVariant {
  id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode?: string | null;
  category_name: string;
  brand: string;
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  units: VariantUnit[];
  baseUnitName: string;
}

interface CreateReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  products?: Product[];
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialCustomerAddress?: string;
}

export const CreateReservationModal: React.FC<CreateReservationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
  products: initialProducts,
  initialCustomerName,
  initialCustomerPhone,
  initialCustomerAddress,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [productList, setProductList] = useState<Product[]>(initialProducts || []);

  // STEP 1: Customer Data
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [step1Errors, setStep1Errors] = useState<{ [key: string]: string }>({});

  // STEP 2: Product Selection Catalog
  const [configuredItems, setConfiguredItems] = useState<SelectedItemConfig[]>([]);
  const [variantSearch, setVariantSearch] = useState<string>('');
  const deferredSearch = useDeferredValue(variantSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // STEP 3: Deadline & Qty Configuration
  const [deadlinePreset, setDeadlinePreset] = useState<'3' | '7' | '14' | 'custom'>('7');
  const [customDeadlineDate, setCustomDeadlineDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(17, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSaving(false);
      setCustomerName(initialCustomerName || '');
      setCustomerPhone(initialCustomerPhone || '');
      setCustomerAddress(initialCustomerAddress || '');
      setInvoiceNo('');
      setNotes('');
      setStep1Errors({});
      setConfiguredItems([]);
      setVariantSearch('');
      setSelectedCategory('ALL');
      setDeadlinePreset('7');
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(17, 0, 0, 0);
      setCustomDeadlineDate(d.toISOString().slice(0, 16));

      // Load products if not available
      if (!initialProducts || initialProducts.length === 0) {
        setLoadingProducts(true);
        api.getProducts()
          .then((res) => setProductList(res))
          .catch((err) => console.error('Failed to load products for reservation:', err))
          .finally(() => setLoadingProducts(false));
      } else {
        setProductList(initialProducts);
      }
    }
  }, [isOpen, initialProducts]);

  // Flatten variants from products
  const flattenedVariants: FlattenedVariant[] = useMemo(() => {
    const list: FlattenedVariant[] = [];
    for (const product of productList) {
      if (!product.variants || product.variants.length === 0) continue;
      for (const v of product.variants) {
        const curStock = Number(v.current_stock || 0);
        const resStock = Number(v.reserved_stock || 0);
        const availStock = Math.max(0, curStock - resStock);
        const baseUnit =
          v.units?.find((u) => u.is_base_unit)?.unit_name ||
          v.units?.[0]?.unit_name ||
          'Unit';

        list.push({
          id: v.id,
          product_id: product.id,
          product_name: product.name,
          variant_name: v.variant_name,
          sku: v.sku,
          barcode: v.barcode,
          category_name: product.category_name || 'Umum',
          brand: product.brand || '-',
          current_stock: curStock,
          reserved_stock: resStock,
          available_stock: availStock,
          units: v.units || [],
          baseUnitName: baseUnit,
        });
      }
    }
    return list;
  }, [productList]);

  // Unique categories for filtering
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    for (const v of flattenedVariants) {
      if (v.category_name && v.category_name !== 'Umum') {
        catSet.add(v.category_name);
      }
    }
    return Array.from(catSet).sort();
  }, [flattenedVariants]);

  // Filtered variants by search query and category
  const filteredVariants = useMemo(() => {
    let list = flattenedVariants;

    if (selectedCategory !== 'ALL') {
      list = list.filter((v) => v.category_name === selectedCategory);
    }

    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((v) => {
        return (
          v.product_name.toLowerCase().includes(q) ||
          v.variant_name.toLowerCase().includes(q) ||
          v.sku.toLowerCase().includes(q) ||
          (v.barcode && v.barcode.toLowerCase().includes(q)) ||
          (v.brand && v.brand.toLowerCase().includes(q)) ||
          (v.category_name && v.category_name.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [flattenedVariants, selectedCategory, deferredSearch]);

  // Set of selected variant IDs for fast lookup
  const selectedVariantIds = useMemo(() => {
    return new Set(configuredItems.map((item) => item.variant_id));
  }, [configuredItems]);

  // Toggle variant selection in Step 2
  const handleToggleVariant = (v: FlattenedVariant) => {
    if (v.available_stock <= 0) {
      showToast(`Stok "${v.product_name} (${v.variant_name})" sedang kosong atau habis!`, 'error');
      return;
    }

    setConfiguredItems((prev) => {
      const exists = prev.some((item) => item.variant_id === v.id);
      if (exists) {
        return prev.filter((item) => item.variant_id !== v.id);
      } else {
        const baseUnit = v.units.find((u) => u.is_base_unit) || v.units[0];
        const unitName = baseUnit?.unit_name || v.baseUnitName || 'Unit';
        const convFactor = Number(baseUnit?.conversion_factor) || 1;
        return [
          ...prev,
          {
            variant_id: v.id,
            product_id: v.product_id,
            product_name: v.product_name,
            variant_name: v.variant_name,
            sku: v.sku,
            category_name: v.category_name,
            brand: v.brand,
            available_stock: v.available_stock,
            current_stock: v.current_stock,
            base_unit_name: v.baseUnitName,
            units: v.units,
            unit_name: unitName,
            conversion_factor: convFactor,
            qty: 1,
          },
        ];
      }
    });
  };

  // Step 3 item handlers
  const handleUnitChange = (variantId: string, newUnitName: string) => {
    setConfiguredItems((prev) =>
      prev.map((item) => {
        if (item.variant_id !== variantId) return item;
        const u = item.units.find((unit) => unit.unit_name === newUnitName);
        const conv = Number(u?.conversion_factor) || 1;
        return {
          ...item,
          unit_name: newUnitName,
          conversion_factor: conv,
        };
      })
    );
  };

  const handleQtyChange = (variantId: string, newQty: number | string) => {
    setConfiguredItems((prev) =>
      prev.map((item) => {
        if (item.variant_id !== variantId) return item;
        return {
          ...item,
          qty: newQty,
        };
      })
    );
  };

  const handleRemoveItem = (variantId: string) => {
    setConfiguredItems((prev) => prev.filter((item) => item.variant_id !== variantId));
  };

  // Item validation helper for Step 3
  const getItemValidation = (item: SelectedItemConfig) => {
    const numQty = Number(item.qty);
    if (isNaN(numQty) || numQty <= 0) {
      return {
        isValid: false,
        errorMsg: 'Jumlah harus lebih besar dari 0.',
        qtyReservedBase: 0,
      };
    }
    const qtyReservedBase = numQty * item.conversion_factor;
    if (qtyReservedBase > item.available_stock) {
      const maxInThisUnit = Math.floor((item.available_stock / item.conversion_factor) * 100) / 100;
      return {
        isValid: false,
        errorMsg: `Stok siap jual tidak mencukupi! Maksimal yang dapat dititipkan: ${formatStock(
          maxInThisUnit
        )} ${item.unit_name} (${formatStock(item.available_stock)} ${item.base_unit_name}).`,
        qtyReservedBase,
      };
    }
    return {
      isValid: true,
      errorMsg: null,
      qtyReservedBase,
    };
  };

  // Step 3 total validity
  const isStep3Valid = useMemo(() => {
    if (configuredItems.length === 0) return false;
    if (deadlinePreset === 'custom' && (!customDeadlineDate || isNaN(new Date(customDeadlineDate).getTime()))) {
      return false;
    }
    return configuredItems.every((item) => getItemValidation(item).isValid);
  }, [configuredItems, deadlinePreset, customDeadlineDate]);

  // Calculate final deadline timestamp
  const calculateDeadline = (): string => {
    if (deadlinePreset === 'custom') {
      return new Date(customDeadlineDate).toISOString();
    }
    const days = parseInt(deadlinePreset, 10) || 7;
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(17, 0, 0, 0);
    return d.toISOString();
  };

  // Friendly date preview for deadline
  const formatFriendlyDeadline = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '-';
      const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d);
      const dateFormatted = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${dayName}, ${dateFormatted} pukul ${hours}:${minutes} WIB`;
    } catch {
      return formatDate(isoStr);
    }
  };

  // Step 1 Validation & Proceed to Step 2
  const handleProceedToStep2 = () => {
    const errs: { [key: string]: string } = {};
    if (!customerName.trim()) {
      errs.customerName = 'Nama pelanggan wajib diisi.';
    }

    if (Object.keys(errs).length > 0) {
      setStep1Errors(errs);
      return;
    }

    setStep1Errors({});
    setStep(2);
  };

  // Step 2 Validation & Proceed to Step 3
  const handleProceedToStep3 = () => {
    if (configuredItems.length === 0) {
      showToast('Pilih minimal 1 produk barang terlebih dahulu!', 'error');
      return;
    }
    setStep(3);
  };

  // Submit Reservation
  const handleSubmit = async () => {
    if (!isStep3Valid) {
      showToast('Periksa kembali kuantitas dan tenggat waktu pengambilan!', 'error');
      return;
    }

    setSaving(true);
    try {
      const deadlineIso = calculateDeadline();
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_address: customerAddress.trim() || undefined,
        invoice_no: invoiceNo.trim() || undefined,
        pickup_deadline: deadlineIso,
        notes: notes.trim() || undefined,
        created_by: 'Kasir / Admin',
        items: configuredItems.map((item) => ({
          variant_id: item.variant_id,
          unit_name: item.unit_name,
          conversion_factor: item.conversion_factor,
          qty_ordered_unit: Number(item.qty),
        })),
      };

      const res = await api.createReservation(payload);
      showToast(`Titip simpan stok ${res.reservation_code} berhasil dibuat!`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to create reservation:', err);
      showToast(err.message || 'Gagal membuat reservasi stok.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut listener (Esc to close, Shift+Enter to advance, Ctrl+Enter to submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape' && !saving) {
        onClose();
        return;
      }

      // Ctrl+Enter or Cmd+Enter: Submit if on step 3, or advance step
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (step === 1) {
          handleProceedToStep2();
        } else if (step === 2) {
          handleProceedToStep3();
        } else if (step === 3 && isStep3Valid && !saving) {
          handleSubmit();
        }
        return;
      }

      // Shift+Enter: Advance step
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (step === 1) {
          handleProceedToStep2();
        } else if (step === 2) {
          handleProceedToStep3();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, step, isStep3Valid, customerName, configuredItems]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl lg:max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Buat Titip Simpan Stok Baru
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  Tahap {step} dari 3
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 1 && 'Langkah 1: Masukkan data pelanggan dan informasi nota pembelian'}
                {step === 2 && 'Langkah 2: Pilih produk/varian bahan bangunan yang hendak diamankan'}
                {step === 3 && 'Langkah 3: Atur kuantitas per satuan dan tentukan tenggat waktu pengambilan'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Wizard Header */}
        <div className="px-6 py-3 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {/* Step 1 Button */}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-2.5 group text-left transition-all"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === 1
                    ? 'bg-amber-500 text-white shadow-xs shadow-amber-500/30'
                    : step > 1
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {step > 1 ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tahap 1</p>
                <p
                  className={`text-xs font-bold ${
                    step === 1
                      ? 'text-amber-600 dark:text-amber-400'
                      : step > 1
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Data Pelanggan
                </p>
              </div>
            </button>

            {/* Connector 1 */}
            <div
              className={`flex-1 h-0.5 mx-3 transition-colors ${
                step > 1 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />

            {/* Step 2 Button */}
            <button
              type="button"
              onClick={() => {
                if (customerName.trim()) setStep(2);
              }}
              disabled={!customerName.trim()}
              className={`flex items-center gap-2.5 group text-left transition-all ${
                !customerName.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === 2
                    ? 'bg-amber-500 text-white shadow-xs shadow-amber-500/30'
                    : step > 2
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {step > 2 ? <Check className="w-4 h-4" /> : '2'}
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tahap 2</p>
                <p
                  className={`text-xs font-bold ${
                    step === 2
                      ? 'text-amber-600 dark:text-amber-400'
                      : step > 2
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Pilih Produk {configuredItems.length > 0 && `(${configuredItems.length})`}
                </p>
              </div>
            </button>

            {/* Connector 2 */}
            <div
              className={`flex-1 h-0.5 mx-3 transition-colors ${
                step > 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />

            {/* Step 3 Button */}
            <button
              type="button"
              onClick={() => {
                if (customerName.trim() && configuredItems.length > 0) setStep(3);
              }}
              disabled={!customerName.trim() || configuredItems.length === 0}
              className={`flex items-center gap-2.5 group text-left transition-all ${
                !customerName.trim() || configuredItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === 3
                    ? 'bg-amber-500 text-white shadow-xs shadow-amber-500/30'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                3
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tahap 3</p>
                <p
                  className={`text-xs font-bold ${
                    step === 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Qty & Tenggat Waktu
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-6">
          {/* STEP 1: Input Data Pelanggan */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200 max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Pelanggan <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (step1Errors.customerName) {
                          setStep1Errors((prev) => ({ ...prev, customerName: '' }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleProceedToStep2();
                        }
                      }}
                      placeholder="Contoh: Pak Haji Rudi (Proyek Ruko Sentosa)"
                      className={`w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border rounded-xl outline-none focus:ring-2 transition-all dark:text-white ${
                        step1Errors.customerName
                          ? 'border-rose-400 focus:ring-rose-500'
                          : 'border-slate-300 dark:border-slate-700 focus:ring-amber-500 focus:border-amber-500'
                      }`}
                      autoFocus
                    />
                  </div>
                  {step1Errors.customerName && (
                    <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {step1Errors.customerName}
                    </p>
                  )}
                </div>

                {/* Customer Phone / WhatsApp */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      No. Telepon / WhatsApp
                    </span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Direkomendasikan
                    </span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleProceedToStep2();
                        }
                      }}
                      placeholder="08123456789 (untuk notifikasi WA)"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Digunakan untuk pengingat otomatis via pesan WhatsApp satu-klik.
                  </span>
                </div>

                {/* Invoice / Nota No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    No. Nota Penjualan / Invoice (Opsional)
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleProceedToStep2();
                        }
                      }}
                      placeholder="Contoh: INV-2026-0045"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Tautkan ke nomor nota kasir jika sudah dibayar lunas.
                  </span>
                </div>

                {/* Project / Delivery Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Alamat Proyek / Pengiriman (Opsional)
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleProceedToStep2();
                        }
                      }}
                      placeholder="Contoh: Proyek Ruko Sentosa, Jl. Merpati No. 12"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Catatan Awal Pesanan (Opsional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Misal: Barang dititipkan sementara menunggu gudang proyek siap atapnya..."
                    rows={3}
                    className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Pilih Produk (Multi-select Catalog) */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Search & Category Filter */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={variantSearch}
                    onChange={(e) => setVariantSearch(e.target.value)}
                    placeholder="Cari nama semen, besi, bata, cat, merek, atau SKU..."
                    className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                    autoFocus
                  />
                  {variantSearch && (
                    <button
                      type="button"
                      onClick={() => setVariantSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <div className="sm:w-60">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full py-2 px-3 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 dark:text-white font-medium"
                  >
                    <option value="ALL">Semua Kategori ({flattenedVariants.length} varian)</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingProducts ? (
                <div className="p-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs">Memuat katalog barang bangunan...</p>
                </div>
              ) : filteredVariants.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tidak ada produk yang cocok dengan pencarian
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Coba ganti kata kunci atau pilih kategori lain.
                  </p>
                </div>
              ) : (
                /* Variant Cards Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredVariants.map((v) => {
                    const isSelected = selectedVariantIds.has(v.id);
                    const isOutOfStock = v.available_stock <= 0;

                    return (
                      <div
                        key={v.id}
                        onClick={() => !isOutOfStock && handleToggleVariant(v)}
                        className={`relative p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between select-none ${
                          isOutOfStock
                            ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                            : isSelected
                            ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 shadow-xs ring-2 ring-amber-500 cursor-pointer'
                            : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:border-amber-400 dark:hover:border-amber-500/60 hover:shadow-xs cursor-pointer'
                        }`}
                      >
                        {/* Top: Category, Brand & Selection checkmark */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">
                              {v.category_name}
                            </span>
                            {v.brand && v.brand !== '-' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-slate-100/80 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                                {v.brand}
                              </span>
                            )}
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 ${
                              isOutOfStock
                                ? 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400'
                                : isSelected
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>

                        {/* Middle: Product & Variant Name, SKU */}
                        <div className="space-y-0.5 mb-3">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight line-clamp-2">
                            {v.product_name}
                          </h4>
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            {v.variant_name}
                          </p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-400" />
                            SKU: {v.sku}
                          </p>
                        </div>

                        {/* Bottom: Stock Information */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">
                            Fisik: {formatStock(v.current_stock)}
                          </span>

                          {isOutOfStock ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-[10px]">
                              Habis
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              Siap: {formatStock(v.available_stock)} {v.baseUnitName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Summary Bar for Step 2 */}
              <div className="sticky bottom-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-xs p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {configuredItems.length} produk dipilih
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {configuredItems.length === 0
                        ? 'Klik kartu barang di atas untuk memilih'
                        : 'Siap diatur kuantitas & satuan di tahap 3'}
                    </p>
                  </div>
                </div>

                {configuredItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfiguredItems([])}
                    className="text-xs text-rose-500 hover:underline px-2 py-1"
                  >
                    Kosongkan Pilihan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Isi Qty & Tenggat Waktu */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Customer Info Reminder Bar */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-500" />
                  <span>
                    Pelanggan: <strong className="text-slate-900 dark:text-white">{customerName}</strong>
                    {customerPhone && (
                      <span className="text-slate-400 ml-1.5">({customerPhone})</span>
                    )}
                  </span>
                </div>
                {invoiceNo && (
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    Nota: {invoiceNo}
                  </span>
                )}
              </div>

              {/* Product Quantity & Multi-Unit Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-500" />
                    Kuantitas & Satuan Barang ({configuredItems.length} barang)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    + Tambah Produk Lain
                  </button>
                </div>

                {configuredItems.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-xs text-slate-500">
                      Semua produk telah dihapus. Silakan kembali ke tahap Pilih Produk.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="mt-3 px-4 py-2 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-800 hover:bg-amber-100"
                    >
                      ← Kembali ke Pilih Produk
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {configuredItems.map((item) => {
                      const validation = getItemValidation(item);

                      return (
                        <div
                          key={item.variant_id}
                          className={`p-4 rounded-xl border transition-all ${
                            !validation.isValid
                              ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
                              : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 shadow-2xs'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                  {item.product_name}
                                </h4>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                                  {item.variant_name}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                SKU: {item.sku} • Stok Siap Dititip:{' '}
                                <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                                  {formatStock(item.available_stock)} {item.base_unit_name}
                                </strong>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.variant_id)}
                              className="self-end sm:self-center p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Hapus dari daftar titip simpan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Inputs: Unit selector & Qty */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                            {/* Unit Selector */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Satuan Pengambilan
                              </label>
                              <select
                                value={item.unit_name}
                                onChange={(e) => handleUnitChange(item.variant_id, e.target.value)}
                                className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                              >
                                {item.units.map((u) => (
                                  <option key={u.id} value={u.unit_name}>
                                    {u.unit_name}{' '}
                                    {Number(u.conversion_factor) !== 1
                                      ? `(1 ${u.unit_name} = ${u.conversion_factor} ${item.base_unit_name})`
                                      : '(Satuan Dasar)'}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Qty Input */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Jumlah Titip ({item.unit_name})
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.qty}
                                onChange={(e) => handleQtyChange(item.variant_id, e.target.value)}
                                className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                              />
                            </div>
                          </div>

                          {/* Validation Alert or Conversion Info */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            {!validation.isValid ? (
                              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {validation.errorMsg}
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>
                                  Mengamankan{' '}
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    {formatStock(item.qty)} {item.unit_name}
                                  </strong>
                                  {item.conversion_factor !== 1 && (
                                    <>
                                      {' '}
                                      = {formatStock(validation.qtyReservedBase)} {item.base_unit_name}
                                    </>
                                  )}{' '}
                                  dari stok siap jual.
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pickup Deadline Configuration */}
              <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Tenggat Waktu Pengambilan Barang (Pickup Deadline)
                  </label>
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    Batas: {formatDate(calculateDeadline())}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeadlinePreset('3')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                      deadlinePreset === '3'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    ⚡ 3 Hari (Cepat)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeadlinePreset('7')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                      deadlinePreset === '7'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    ⭐ 7 Hari (Standar)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeadlinePreset('14')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                      deadlinePreset === '14'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    🏗️ 14 Hari (Proyek)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeadlinePreset('custom')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                      deadlinePreset === 'custom'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    📅 Tanggal Khusus
                  </button>
                </div>

                {deadlinePreset === 'custom' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pilih Tanggal & Jam Batas Pengambilan:
                    </label>
                    <input
                      type="datetime-local"
                      value={customDeadlineDate}
                      onChange={(e) => setCustomDeadlineDate(e.target.value)}
                      className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                    />
                  </div>
                )}

                {/* Friendly Preview of Target Deadline */}
                <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/40 flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                  <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Batas Pengambilan:{' '}
                    <strong className="font-bold underline decoration-amber-400">
                      {formatFriendlyDeadline(calculateDeadline())}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleProceedToStep2}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <span>Lanjut ke Pilih Produk</span>
                <ChevronRight className="w-4 h-4" />
                <span className="hidden sm:inline-block text-[10px] ml-1 px-1.5 py-0.5 rounded bg-amber-700/60 text-amber-100">
                  Shift+Enter
                </span>
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Data Pelanggan
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleProceedToStep3}
                  disabled={configuredItems.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>Lanjut ke Isi Qty & Tenggat Waktu</span>
                  <ChevronRight className="w-4 h-4" />
                  <span className="hidden sm:inline-block text-[10px] ml-1 px-1.5 py-0.5 rounded bg-amber-700/60 text-amber-100">
                    Shift+Enter
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Pilih Produk
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !isStep3Valid}
                  className="px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md flex items-center gap-2 transition-all"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan & Mengamankan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan & Amankan Stok ({configuredItems.length} Item)</span>
                      <span className="hidden sm:inline-block text-[10px] ml-1 px-1.5 py-0.5 rounded bg-emerald-700/60 text-emerald-100">
                        Ctrl+Enter
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
