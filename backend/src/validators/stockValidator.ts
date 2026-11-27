import { z } from 'zod';
import { AppHttpError } from '../utils/errors.js';
import { validateOptionalIdempotencyKey } from '../utils/idempotency.js';

export const STOCK_ADJUSTMENT_MODES = ['SET', 'ADD', 'SUBTRACT'] as const;
export type StockAdjustmentMode = (typeof STOCK_ADJUSTMENT_MODES)[number];

export const MANUAL_STOCK_ACTION_TYPES = [
  'STOCK_OPNAME',      // Penyesuaian fisik opname
  'PURCHASE_RESTOCK',  // Barang masuk / restock dari supplier
  'SALE_DEDUCT',       // Barang keluar / penjualan
  'DAMAGED_EXPIRED',   // Barang rusak / pecah / cacat
  'RETURN_IN',         // Retur dari pelanggan
  'RETURN_OUT',        // Retur ke supplier
  'MANUAL_ADJUSTMENT', // Penyesuaian manual lainnya
] as const;
export type ManualStockActionType = (typeof MANUAL_STOCK_ACTION_TYPES)[number];

export const SYSTEM_ONLY_STOCK_ACTION_TYPES = [
  'RESERVATION_HOLD',    // Penahanan stok untuk reservasi titip barang
  'RESERVATION_PICKUP',  // Pengambilan stok barang titipan oleh pelanggan
  'RESERVATION_RELEASE', // Pelepasan penahanan stok karena reservasi batal
  'VARIANT_MOVED',       // Jejak audit pemindahan varian antar produk
] as const;
export type SystemOnlyStockActionType = (typeof SYSTEM_ONLY_STOCK_ACTION_TYPES)[number];

export const STOCK_ACTION_TYPES = [
  ...MANUAL_STOCK_ACTION_TYPES,
  ...SYSTEM_ONLY_STOCK_ACTION_TYPES,
] as const;
export type StockActionType = (typeof STOCK_ACTION_TYPES)[number];

/**
 * Matriks pasangan resmi adjustment_mode dan movement_type untuk penyesuaian stok manual.
 * Selaras dengan opsi di StockAdjustmentForm.tsx.
 */
export const ALLOWED_MOVEMENTS_BY_MODE: Record<
  StockAdjustmentMode,
  readonly ManualStockActionType[]
> = {
  SET: ['STOCK_OPNAME', 'MANUAL_ADJUSTMENT'],
  ADD: ['PURCHASE_RESTOCK', 'RETURN_IN', 'STOCK_OPNAME', 'MANUAL_ADJUSTMENT'],
  SUBTRACT: ['DAMAGED_EXPIRED', 'RETURN_OUT', 'SALE_DEDUCT', 'STOCK_OPNAME', 'MANUAL_ADJUSTMENT'],
};

const MAX_STOCK_NUMERIC_ABS = 9_999_999_999.99; // NUMERIC(12, 2) max

const uuidSchema = z.string().trim().uuid();

const optionalNonNegNumberSchema = z
  .union([z.number(), z.string()])
  .transform((val, ctx) => {
    if (typeof val === 'string' && val.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nilai harga tidak valid' });
      return z.NEVER;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nilai harga harus berupa angka >= 0' });
      return z.NEVER;
    }
    return num;
  });

const optionalNullableNonNegNumberSchema = z
  .union([optionalNonNegNumberSchema, z.null()])
  .optional();

export const priceUpdateOnRestockSchema = z.object({
  unit_id: z.string().trim().min(1, 'unit_id pada price_update wajib diisi'),
  buy_price: optionalNonNegNumberSchema.optional(),
  new_buy_price: optionalNonNegNumberSchema.optional(),
  sell_price: optionalNonNegNumberSchema.optional(),
  new_sell_price: optionalNonNegNumberSchema.optional(),
  wholesale_price: optionalNullableNonNegNumberSchema,
  new_wholesale_price: optionalNullableNonNegNumberSchema,
  reason: z.string().trim().max(500, 'Alasan perubahan harga maksimal 500 karakter').optional(),
  reference_no: z.string().trim().max(100, 'Nomor referensi harga maksimal 100 karakter').optional(),
});

export type PriceUpdateOnRestock = z.infer<typeof priceUpdateOnRestockSchema>;

export interface ValidatedAdjustStockInput {
  variant_id: string;
  adjustment_mode: StockAdjustmentMode;
  amount: number;
  movement_type: ManualStockActionType;
  reference_no?: string;
  notes: string;
  price_update?: PriceUpdateOnRestock;
  idempotency_key?: string;
}

/**
 * Pembulatan presisi 2 desimal simetris untuk kolom NUMERIC(12, 2)
 * guna menghindari floating-point drift dan nilai -0.
 */
export function roundStockQty(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseFiniteAmount(rawAmount: unknown): number | null {
  if (rawAmount === undefined || rawAmount === null || typeof rawAmount === 'boolean') {
    return null;
  }
  if (typeof rawAmount === 'string') {
    if (rawAmount.trim() === '') return null;
    const parsed = Number(rawAmount);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof rawAmount === 'number') {
    return Number.isFinite(rawAmount) ? rawAmount : null;
  }
  return null;
}

/**
 * Validasi ketat & normalisasi payload penyesuaian stok manual.
 * Digunakan bersama oleh StockController (HTTP boundary) dan StockService (defense-in-depth).
 */
export function validateAdjustStockInput(raw: unknown): ValidatedAdjustStockInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppHttpError(400, 'Payload penyesuaian stok tidak valid.', 'INVALID_PAYLOAD');
  }

  const body = raw as Record<string, unknown>;

  // 1. Validasi variant_id (UUID)
  const variantIdParsed = uuidSchema.safeParse(body.variant_id);
  if (!variantIdParsed.success) {
    throw new AppHttpError(
      400,
      'Format ID varian produk (variant_id) tidak valid atau kosong.',
      'INVALID_VARIANT_ID'
    );
  }
  const variantId = variantIdParsed.data;

  // 2. Validasi enum adjustment_mode (exact SET | ADD | SUBTRACT)
  if (
    typeof body.adjustment_mode !== 'string' ||
    !(STOCK_ADJUSTMENT_MODES as readonly string[]).includes(body.adjustment_mode)
  ) {
    throw new AppHttpError(
      400,
      `Mode penyesuaian (adjustment_mode) tidak valid. Harus salah satu dari: ${STOCK_ADJUSTMENT_MODES.join(', ')}.`,
      'INVALID_ADJUSTMENT_MODE'
    );
  }
  const adjustmentMode = body.adjustment_mode as StockAdjustmentMode;

  // 3. Validasi enum movement_type (katalog 11 tipe, tolak 4 tipe sistem, cek kompatibilitas mode)
  if (typeof body.movement_type !== 'string' || body.movement_type.trim() === '') {
    throw new AppHttpError(
      400,
      `Tipe mutasi stok (movement_type) wajib diisi. Tipe yang diizinkan: ${MANUAL_STOCK_ACTION_TYPES.join(', ')}.`,
      'INVALID_MOVEMENT_TYPE'
    );
  }
  const rawMovementType = body.movement_type;

  if ((SYSTEM_ONLY_STOCK_ACTION_TYPES as readonly string[]).includes(rawMovementType)) {
    throw new AppHttpError(
      400,
      `Tipe mutasi "${rawMovementType}" dikelola otomatis oleh sistem (reservasi/restrukturisasi) dan tidak dapat digunakan pada penyesuaian stok manual.`,
      'SYSTEM_MOVEMENT_NOT_ALLOWED'
    );
  }

  if (!(STOCK_ACTION_TYPES as readonly string[]).includes(rawMovementType)) {
    throw new AppHttpError(
      400,
      `Tipe mutasi "${rawMovementType}" tidak dikenal. Tipe yang valid untuk penyesuaian stok: ${MANUAL_STOCK_ACTION_TYPES.join(', ')}.`,
      'INVALID_MOVEMENT_TYPE'
    );
  }

  const movementType = rawMovementType as ManualStockActionType;
  const allowedForMode = ALLOWED_MOVEMENTS_BY_MODE[adjustmentMode];
  if (!allowedForMode.includes(movementType)) {
    throw new AppHttpError(
      400,
      `Tipe mutasi "${movementType}" tidak sesuai dengan mode "${adjustmentMode}". Tipe yang diizinkan untuk mode ${adjustmentMode}: ${allowedForMode.join(', ')}.`,
      'INCOMPATIBLE_MOVEMENT_MODE'
    );
  }

  // 4. Validasi amount
  const parsedAmount = parseFiniteAmount(body.amount);
  if (parsedAmount === null) {
    throw new AppHttpError(
      400,
      'Jumlah penyesuaian stok (amount) harus berupa angka yang valid.',
      'INVALID_STOCK_AMOUNT'
    );
  }

  if (Math.abs(parsedAmount) > MAX_STOCK_NUMERIC_ABS) {
    throw new AppHttpError(
      400,
      'Jumlah penyesuaian stok melebihi batas maksimal yang didukung sistem.',
      'INVALID_STOCK_AMOUNT'
    );
  }

  if (adjustmentMode === 'SET' && parsedAmount < 0) {
    throw new AppHttpError(
      400,
      'Jumlah stok opname (mode SET) tidak boleh bernilai negatif.',
      'INVALID_STOCK_AMOUNT'
    );
  }

  if ((adjustmentMode === 'ADD' || adjustmentMode === 'SUBTRACT') && parsedAmount <= 0) {
    throw new AppHttpError(
      400,
      `Jumlah stok untuk mode ${adjustmentMode} harus lebih besar dari 0.`,
      'INVALID_STOCK_AMOUNT'
    );
  }

  const roundedAmount = roundStockQty(parsedAmount);
  if ((adjustmentMode === 'ADD' || adjustmentMode === 'SUBTRACT') && roundedAmount <= 0) {
    throw new AppHttpError(
      400,
      `Jumlah stok untuk mode ${adjustmentMode} minimal 0.01.`,
      'INVALID_STOCK_AMOUNT'
    );
  }

  // 5. Validasi notes (wajib non-kosong setelah trim)
  if (typeof body.notes !== 'string' || body.notes.trim().length === 0) {
    throw new AppHttpError(
      400,
      'Catatan alasan penyesuaian stok (notes) wajib diisi.',
      'INVALID_NOTES'
    );
  }
  const notes = body.notes.trim();
  if (notes.length > 1000) {
    throw new AppHttpError(
      400,
      'Catatan alasan penyesuaian stok maksimal 1000 karakter.',
      'INVALID_NOTES'
    );
  }

  // 6. Validasi reference_no (opsional)
  let referenceNo: string | undefined;
  if (body.reference_no !== undefined && body.reference_no !== null) {
    if (typeof body.reference_no !== 'string') {
      throw new AppHttpError(
        400,
        'Nomor referensi (reference_no) harus berupa teks.',
        'INVALID_REFERENCE_NO'
      );
    }
    const trimmedRef = body.reference_no.trim();
    if (trimmedRef.length > 100) {
      throw new AppHttpError(
        400,
        'Nomor referensi (reference_no) maksimal 100 karakter.',
        'INVALID_REFERENCE_NO'
      );
    }
    if (trimmedRef.length > 0) {
      referenceNo = trimmedRef;
    }
  }

  // 7. Validasi price_update (opsional)
  let priceUpdate: PriceUpdateOnRestock | undefined;
  if (body.price_update !== undefined && body.price_update !== null) {
    const parsedPriceUpdate = priceUpdateOnRestockSchema.safeParse(body.price_update);
    if (!parsedPriceUpdate.success) {
      throw new AppHttpError(
        400,
        parsedPriceUpdate.error.issues[0]?.message || 'Data pembaruan harga (price_update) tidak valid.',
        'INVALID_PRICE_UPDATE'
      );
    }
    priceUpdate = parsedPriceUpdate.data;
  }

  // 8. Validasi idempotency_key (opsional)
  const idempotencyKey = validateOptionalIdempotencyKey(body.idempotency_key);

  return {
    variant_id: variantId,
    adjustment_mode: adjustmentMode,
    amount: roundedAmount,
    movement_type: movementType,
    reference_no: referenceNo,
    notes,
    price_update: priceUpdate,
    idempotency_key: idempotencyKey,
  };
}
