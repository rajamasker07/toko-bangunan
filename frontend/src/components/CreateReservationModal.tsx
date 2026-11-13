import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { Product, ProductVariant, VariantUnit } from '../types';
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
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  ShoppingBag,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface CartItem {
  id: string; // temporary local id
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  unit_name: string;
  conversion_factor: number;
  qty_ordered_unit: number;
  qty_reserved_base: number;
  available_stock: number;
  base_unit_name: string;
}

interface FlattenedVariant {
  id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode?: string | null;
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
}

export const CreateReservationModal: React.FC<CreateReservationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
  products: initialProducts,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [productList, setProductList] = useState<Product[]>(initialProducts || []);

  // Step 1: Customer & Deadline details
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [deadlinePreset, setDeadlinePreset] = useState<'3' | '7' | '14' | 'custom'>('7');
  const [customDeadlineDate, setCustomDeadlineDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(17, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [step1Errors, setStep1Errors] = useState<{ [key: string]: string }>({});

  // Step 2: Item Selection State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variantSearch, setVariantSearch] = useState<string>('');
  const deferredSearch = useDeferredValue(variantSearch);

  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [selectedUnitName, setSelectedUnitName] = useState<string>('');
  const [inputQty, setInputQty] = useState<number | string>(1);
  const [qtyError, setQtyError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSaving(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setInvoiceNo('');
      setNotes('');
      setDeadlinePreset('7');
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(17, 0, 0, 0);
      setCustomDeadlineDate(d.toISOString().slice(0, 16));
      setStep1Errors({});
      setCart([]);
      setVariantSearch('');
      setSelectedVariantId('');
      setSelectedUnitName('');
      setInputQty(1);
      setQtyError(null);

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
        const baseUnit = v.units?.find((u) => u.is_base_unit)?.unit_name || v.units?.[0]?.unit_name || 'Unit';

        list.push({
          id: v.id,
          product_id: product.id,
          product_name: product.name,
          variant_name: v.variant_name,
          sku: v.sku,
          barcode: v.barcode,
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

  // Filtered variants by search query
  const filteredVariants = useMemo(() => {
    if (!deferredSearch.trim()) return flattenedVariants.slice(0, 50);
    const q = deferredSearch.toLowerCase();
    return flattenedVariants
      .filter((v) => {
        return (
          v.product_name.toLowerCase().includes(q) ||
          v.variant_name.toLowerCase().includes(q) ||
          v.sku.toLowerCase().includes(q) ||
          (v.barcode && v.barcode.toLowerCase().includes(q))
        );
      })
      .slice(0, 50);
  }, [flattenedVariants, deferredSearch]);

  // Currently selected variant
  const selectedVariant = useMemo(() => {
    return flattenedVariants.find((v) => v.id === selectedVariantId) || null;
  }, [flattenedVariants, selectedVariantId]);

  // Reset selected unit when variant changes
  useEffect(() => {
    if (selectedVariant) {
      const base = selectedVariant.units.find((u) => u.is_base_unit) || selectedVariant.units[0];
      if (base) {
        setSelectedUnitName(base.unit_name);
      }
      setInputQty(1);
      setQtyError(null);
    } else {
      setSelectedUnitName('');
      setInputQty(1);
      setQtyError(null);
    }
  }, [selectedVariant]);

  // Selected unit object
  const currentUnit = useMemo(() => {
    if (!selectedVariant) return null;
    return selectedVariant.units.find((u) => u.unit_name === selectedUnitName) || selectedVariant.units[0] || null;
  }, [selectedVariant, selectedUnitName]);

  // Remaining available stock of selected variant accounting for already added items in cart
  const availableStockForSelected = useMemo(() => {
    if (!selectedVariant) return 0;
    const reservedInCart = cart
      .filter((item) => item.variant_id === selectedVariant.id)
      .reduce((sum, item) => sum + item.qty_reserved_base, 0);
    return Math.max(0, selectedVariant.available_stock - reservedInCart);
  }, [selectedVariant, cart]);

  // Validate entered quantity whenever qty or unit changes
  useEffect(() => {
    if (!selectedVariant || !currentUnit) {
      setQtyError(null);
      return;
    }
    const numQty = Number(inputQty);
    if (isNaN(numQty) || numQty <= 0) {
      setQtyError('Jumlah harus lebih dari 0');
      return;
    }
    const conv = Number(currentUnit.conversion_factor) || 1;
    const baseRequested = numQty * conv;
    if (baseRequested > availableStockForSelected) {
      const maxInThisUnit = Math.floor((availableStockForSelected / conv) * 100) / 100;
      setQtyError(
        `Stok siap jual tidak mencukupi! Maksimal yang dapat dititipkan: ${formatStock(maxInThisUnit)} ${currentUnit.unit_name} (${formatStock(availableStockForSelected)} ${selectedVariant.baseUnitName}).`
      );
    } else {
      setQtyError(null);
    }
  }, [inputQty, currentUnit, selectedVariant, availableStockForSelected]);

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

  // Step 1 Validation & Proceed
  const handleProceedToStep2 = () => {
    const errs: { [key: string]: string } = {};
    if (!customerName.trim()) {
      errs.customerName = 'Nama pelanggan wajib diisi.';
    }
    if (deadlinePreset === 'custom' && (!customDeadlineDate || isNaN(new Date(customDeadlineDate).getTime()))) {
      errs.deadline = 'Format tanggal batas pengambilan tidak valid.';
    }

    if (Object.keys(errs).length > 0) {
      setStep1Errors(errs);
      return;
    }

    setStep1Errors({});
    setStep(2);
  };

  // Add Item to Cart
  const handleAddToCart = () => {
    if (!selectedVariant || !currentUnit) return;
    const numQty = Number(inputQty);
    if (isNaN(numQty) || numQty <= 0) {
      setQtyError('Jumlah harus lebih besar dari 0.');
      return;
    }

    const conv = Number(currentUnit.conversion_factor) || 1;
    const baseRequested = numQty * conv;

    if (baseRequested > availableStockForSelected) {
      setQtyError('Jumlah melebihi stok yang tersedia.');
      return;
    }

    const newItem: CartItem = {
      id: `${selectedVariant.id}-${Date.now()}`,
      product_id: selectedVariant.product_id,
      variant_id: selectedVariant.id,
      product_name: selectedVariant.product_name,
      variant_name: selectedVariant.variant_name,
      sku: selectedVariant.sku,
      unit_name: currentUnit.unit_name,
      conversion_factor: conv,
      qty_ordered_unit: numQty,
      qty_reserved_base: baseRequested,
      available_stock: selectedVariant.available_stock,
      base_unit_name: selectedVariant.baseUnitName,
    };

    setCart((prev) => [...prev, newItem]);
    setSelectedVariantId('');
    setVariantSearch('');
    setInputQty(1);
    setQtyError(null);
  };

  // Remove Item from Cart
  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit Reservation
  const handleSubmit = async () => {
    if (cart.length === 0) {
      showToast('Pilih minimal satu barang untuk dititipkan!', 'error');
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
        items: cart.map((item) => ({
          variant_id: item.variant_id,
          unit_name: item.unit_name,
          conversion_factor: item.conversion_factor,
          qty_ordered_unit: item.qty_ordered_unit,
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
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Buat Titip Simpan Stok Baru
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  Langkah {step} dari 2
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 1
                  ? 'Isi identitas pelanggan, nomor nota, dan tenggat waktu pengambilan'
                  : 'Pilih barang bangunan yang diamankan dengan proteksi stok siap jual'}
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

        {/* Stepper Navigation Indicator */}
        <div className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                step === 1
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              {step > 1 ? '✓' : '1'}
            </span>
            <span className={step === 1 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500'}>
              1. Info Pelanggan & Batas Waktu
            </span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400" />

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                step === 2
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              2
            </span>
            <span className={step === 2 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500'}>
              2. Pilih Barang & Satuan ({cart.length} item)
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-6">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Form Grid */}
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
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Contoh: Pak Haji Rudi (Proyek Ruko)"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
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

                {/* Customer Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    No. HP / WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="08123456789 (untuk notifikasi WA)"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Digunakan untuk kirim pengingat pesan WhatsApp satu klik
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
                      placeholder="Contoh: INV-2026-0045"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                </div>

                {/* Project / Delivery Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Alamat Proyek / Lokasi Pengambilan (Opsional)
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Contoh: Jl. Merpati No. 12, Samping Bank BRI"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Deadline Setting */}
              <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Tenggat Waktu Pengambilan Barang (Deadline)
                  </label>
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
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
                    <input
                      type="datetime-local"
                      value={customDeadlineDate}
                      onChange={(e) => setCustomDeadlineDate(e.target.value)}
                      className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Catatan / Keterangan Tambahan
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: Barang dititipkan karena gudang proyek belum siap atapnya..."
                  rows={2}
                  className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Variant Selector Area */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-500" />
                    Pilih Barang & Tentukan Kuantitas
                  </h3>
                  {loadingProducts && (
                    <span className="text-xs text-slate-400 animate-pulse">Memuat daftar barang...</span>
                  )}
                </div>

                {/* Variant Search & Selection */}
                <div>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={variantSearch}
                      onChange={(e) => setVariantSearch(e.target.value)}
                      placeholder="Cari nama semen, besi, pipa, cat, atau SKU..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                    />
                  </div>

                  {/* Dropdown list of variants */}
                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {filteredVariants.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Tidak ada barang yang cocok dengan kata kunci "{deferredSearch}"
                      </div>
                    ) : (
                      filteredVariants.map((v) => {
                        const isSelected = selectedVariantId === v.id;
                        const isOutOfStock = v.available_stock <= 0;

                        return (
                          <div
                            key={v.id}
                            onClick={() => !isOutOfStock && setSelectedVariantId(v.id)}
                            className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              isOutOfStock
                                ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40'
                                : isSelected
                                ? 'bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="truncate text-slate-800 dark:text-slate-100 font-medium">
                                {v.product_name} <span className="text-slate-500 font-normal">({v.variant_name})</span>
                              </p>
                              <p className="text-[11px] text-slate-400">SKU: {v.sku}</p>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  Siap: {formatStock(v.available_stock)} {v.baseUnitName}
                                </span>
                                {v.reserved_stock > 0 && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                    (Dititip: {formatStock(v.reserved_stock)})
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Total Fisik: {formatStock(v.current_stock)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* If variant selected: Unit & Qty inputs */}
                {selectedVariant && (
                  <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-amber-900 dark:text-amber-300">
                          {selectedVariant.product_name} - {selectedVariant.variant_name}
                        </span>
                        <div className="text-[11px] text-amber-800 dark:text-amber-400 flex items-center gap-2 mt-0.5">
                          <span>SKU: {selectedVariant.sku}</span>
                          <span>•</span>
                          <span>
                            Stok Siap Dititip:{' '}
                            <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                              {formatStock(availableStockForSelected)} {selectedVariant.baseUnitName}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedVariantId('')}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-white underline"
                      >
                        Ganti Barang
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      {/* Unit Dropdown */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Satuan Pengambilan
                        </label>
                        <select
                          value={selectedUnitName}
                          onChange={(e) => setSelectedUnitName(e.target.value)}
                          className="w-full py-2 px-3 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                        >
                          {selectedVariant.units.map((u) => (
                            <option key={u.id} value={u.unit_name}>
                              {u.unit_name} {Number(u.conversion_factor) !== 1 ? `(1 ${u.unit_name} = ${u.conversion_factor} ${selectedVariant.baseUnitName})` : '(Satuan Dasar)'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Qty Input */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Jumlah ({selectedUnitName})
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={inputQty}
                          onChange={(e) => setInputQty(e.target.value)}
                          className="w-full py-2 px-3 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                        />
                      </div>

                      {/* Add Button */}
                      <div>
                        <button
                          type="button"
                          onClick={handleAddToCart}
                          disabled={!!qtyError || Number(inputQty) <= 0}
                          className="w-full py-2 px-3 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Tambah Barang
                        </button>
                      </div>
                    </div>

                    {qtyError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {qtyError}
                      </p>
                    )}

                    {currentUnit && Number(currentUnit.conversion_factor) !== 1 && !qtyError && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        ℹ️ Konversi: {Number(inputQty) || 0} {currentUnit.unit_name} ={' '}
                        {(Number(inputQty) || 0) * Number(currentUnit.conversion_factor)} {selectedVariant.baseUnitName}{' '}
                        akan diamankan dari stok fisik.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cart Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-500" />
                    Daftar Barang Dititipkan ({cart.length} item)
                  </h4>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Kosongkan Semua
                    </button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Belum ada barang dalam daftar titip simpan
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gunakan pencarian di atas untuk memilih barang yang hendak diamankan.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3">Barang & Varian</th>
                          <th className="py-2.5 px-3">Satuan</th>
                          <th className="py-2.5 px-3 text-right">Qty Titip</th>
                          <th className="py-2.5 px-3 text-right">Total Satuan Dasar</th>
                          <th className="py-2.5 px-3 text-center w-12">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {cart.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {item.product_name}
                              </span>
                              <div className="text-[11px] text-slate-400">
                                {item.variant_name} • SKU: {item.sku}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                              {item.unit_name}
                              {item.conversion_factor !== 1 && (
                                <span className="text-[10px] text-slate-400 block">
                                  x{item.conversion_factor} {item.base_unit_name}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                              {formatStock(item.qty_ordered_unit)} {item.unit_name}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                              {formatStock(item.qty_reserved_base)} {item.base_unit_name}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromCart(idx)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Hapus dari daftar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {step === 1 ? (
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
                Lanjut ke Pilih Barang
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Info Pelanggan
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
                  disabled={saving || cart.length === 0}
                  className="px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md flex items-center gap-2 transition-all"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan Titipan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan & Amankan Stok ({cart.length} Item)</span>
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
