import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { StockService } from '../services/stockService.js';
import { ProductService } from '../services/productService.js';
import { ReservationService } from '../services/reservationService.js';
import { StockController } from '../controllers/stockController.js';
import { AppHttpError } from '../utils/errors.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import {
  ALLOWED_MOVEMENTS_BY_MODE,
  STOCK_ADJUSTMENT_MODES,
  SYSTEM_ONLY_STOCK_ACTION_TYPES,
  validateAdjustStockInput,
  type StockAdjustmentMode,
} from '../validators/stockValidator.js';

function expectAppHttpError(
  fn: () => unknown,
  expectedStatus: number,
  expectedCode: string,
  label: string
) {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof AppHttpError,
    `[${label}] Expected AppHttpError, got: ${caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)}`
  );
  assert.equal(caught.statusCode, expectedStatus, `[${label}] Status code mismatch`);
  assert.equal(caught.code, expectedCode, `[${label}] Error code mismatch (msg: ${caught.message})`);
}

async function expectAsyncAppHttpError(
  fn: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
  label: string
) {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof AppHttpError,
    `[${label}] Expected AppHttpError, got: ${caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)}`
  );
  assert.equal(caught.statusCode, expectedStatus, `[${label}] Status code mismatch`);
  assert.equal(caught.code, expectedCode, `[${label}] Error code mismatch (msg: ${caught.message})`);
}

function createMockResponse() {
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

function runValidatorUnitTests() {
  console.log('\n=== Bagian 1: Unit Test Validator & Enum Mutasi Stok ===');
  const validVariantId = generateUUIDv7();

  // 1a. Semua pasangan resmi di ALLOWED_MOVEMENTS_BY_MODE harus lulus
  for (const mode of STOCK_ADJUSTMENT_MODES) {
    for (const movementType of ALLOWED_MOVEMENTS_BY_MODE[mode]) {
      const amount = mode === 'SET' ? 0 : 1.25;
      const parsed = validateAdjustStockInput({
        variant_id: validVariantId,
        adjustment_mode: mode,
        amount,
        movement_type: movementType,
        notes: 'Validasi kombinasi resmi',
      });
      assert.equal(parsed.adjustment_mode, mode);
      assert.equal(parsed.movement_type, movementType);
      assert.equal(parsed.amount, amount);
    }
  }
  console.log('✅ 1a. Seluruh kombinasi resmi adjustment_mode + movement_type lulus (termasuk SET 0 & desimal 1.25)');

  // 1b. Tolak adjustment_mode tidak valid (menutup bug silent no-op quantity_change = 0)
  for (const badMode of ['INVALID', 'add', 'sub', '', null, 123]) {
    expectAppHttpError(
      () =>
        validateAdjustStockInput({
          variant_id: validVariantId,
          adjustment_mode: badMode,
          amount: 10,
          movement_type: 'STOCK_OPNAME',
          notes: 'Tes mode salah',
        }),
      400,
      'INVALID_ADJUSTMENT_MODE',
      `Invalid adjustment_mode: ${String(badMode)}`
    );
  }
  console.log('✅ 1b. adjustment_mode tidak valid ditolak dengan 400 INVALID_ADJUSTMENT_MODE');

  // 1c. Tolak 4 tipe internal sistem di penyesuaian manual
  for (const sysType of SYSTEM_ONLY_STOCK_ACTION_TYPES) {
    expectAppHttpError(
      () =>
        validateAdjustStockInput({
          variant_id: validVariantId,
          adjustment_mode: 'SUBTRACT',
          amount: 5,
          movement_type: sysType,
          notes: 'Coba bypass tipe sistem',
        }),
      400,
      'SYSTEM_MOVEMENT_NOT_ALLOWED',
      `System movement blocked: ${sysType}`
    );
  }
  console.log('✅ 1c. 4 tipe internal sistem (RESERVATION_* & VARIANT_MOVED) ditolak dengan 400 SYSTEM_MOVEMENT_NOT_ALLOWED');

  // 1d. Tolak movement_type tidak dikenal
  for (const unknownType of ['UNKNOWN_ACTION', 'INITIAL_STOCK', 'purchase_restock', '', null]) {
    expectAppHttpError(
      () =>
        validateAdjustStockInput({
          variant_id: validVariantId,
          adjustment_mode: 'ADD',
          amount: 5,
          movement_type: unknownType,
          notes: 'Tes movement tidak dikenal',
        }),
      400,
      'INVALID_MOVEMENT_TYPE',
      `Unknown movement_type: ${String(unknownType)}`
    );
  }
  console.log('✅ 1d. movement_type tidak dikenal ditolak dengan 400 INVALID_MOVEMENT_TYPE');

  // 1e. Tolak pasangan adjustment_mode & movement_type yang kontradiktif
  const incompatiblePairs: Array<[StockAdjustmentMode, string]> = [
    ['SUBTRACT', 'PURCHASE_RESTOCK'],
    ['SUBTRACT', 'RETURN_IN'],
    ['ADD', 'DAMAGED_EXPIRED'],
    ['ADD', 'SALE_DEDUCT'],
    ['ADD', 'RETURN_OUT'],
    ['SET', 'PURCHASE_RESTOCK'],
    ['SET', 'DAMAGED_EXPIRED'],
    ['SET', 'SALE_DEDUCT'],
  ];
  for (const [mode, movementType] of incompatiblePairs) {
    expectAppHttpError(
      () =>
        validateAdjustStockInput({
          variant_id: validVariantId,
          adjustment_mode: mode,
          amount: 5,
          movement_type: movementType,
          notes: 'Tes pasangan kontradiktif',
        }),
      400,
      'INCOMPATIBLE_MOVEMENT_MODE',
      `Incompatible pair ${mode} + ${movementType}`
    );
  }
  console.log('✅ 1e. Kombinasi kontradiktif mode + movement_type ditolak dengan 400 INCOMPATIBLE_MOVEMENT_MODE');

  // 1f. Tolak amount, variant_id, dan notes tidak valid
  for (const badAmount of [NaN, Infinity, -5, 'abc', '', null, true]) {
    expectAppHttpError(
      () =>
        validateAdjustStockInput({
          variant_id: validVariantId,
          adjustment_mode: 'SET',
          amount: badAmount,
          movement_type: 'STOCK_OPNAME',
          notes: 'Tes amount invalid',
        }),
      400,
      'INVALID_STOCK_AMOUNT',
      `Invalid SET amount: ${String(badAmount)}`
    );
  }
  for (const mode of ['ADD', 'SUBTRACT'] as const) {
    for (const zeroOrNeg of [0, -1, -0.5, 0.001]) {
      expectAppHttpError(
        () =>
          validateAdjustStockInput({
            variant_id: validVariantId,
            adjustment_mode: mode,
            amount: zeroOrNeg,
            movement_type: 'STOCK_OPNAME',
            notes: 'Tes amount <= 0 pada ADD/SUBTRACT',
          }),
        400,
        'INVALID_STOCK_AMOUNT',
        `Invalid ${mode} amount: ${zeroOrNeg}`
      );
    }
  }
  expectAppHttpError(
    () =>
      validateAdjustStockInput({
        variant_id: 'not-a-uuid',
        adjustment_mode: 'ADD',
        amount: 5,
        movement_type: 'PURCHASE_RESTOCK',
        notes: 'Tes UUID salah',
      }),
    400,
    'INVALID_VARIANT_ID',
    'Invalid UUID'
  );
  expectAppHttpError(
    () =>
      validateAdjustStockInput({
        variant_id: validVariantId,
        adjustment_mode: 'ADD',
        amount: 5,
        movement_type: 'PURCHASE_RESTOCK',
        notes: '   ',
      }),
    400,
    'INVALID_NOTES',
    'Whitespace notes'
  );
  console.log('✅ 1f. Validasi amount (NaN/negatif/0), UUID variant_id, dan notes whitespace lulus');
}

async function runDatabaseIntegrationTests() {
  console.log('\n=== Bagian 2: Integration Test Guardrail reserved_stock & Controller ===');

  let testProductId: string | null = null;
  const createdReservationIds: string[] = [];

  try {
    // 2a. Setup produk & varian uji (initial_stock = 50)
    const product = await ProductService.createProduct(
      {
        name: `Test Guardrail Semen ${Date.now()}`,
        category_id: null,
        brand_id: null,
        supplier_id: null,
        description: 'Produk uji otomatis Issue #1',
        min_stock_alert: 5,
        variants: [
          {
            variant_name: 'Sak 50kg',
            sku: `TST-GRD-${Date.now().toString().slice(-6)}`,
            initial_stock: 50,
            min_stock: 5,
            units: [
              {
                unit_name: 'Sak',
                conversion_factor: 1,
                is_base_unit: true,
                buy_price: 55000,
                sell_price: 68000,
              },
            ],
          },
        ],
      },
      { userId: null, createdBy: 'Guardrail Tester', allowBuyPrice: true }
    );
    testProductId = product.id;
    const variantId = product.variants![0].id;

    // 2b. Tahan 30 Sak via ReservationService (current_stock = 50, reserved_stock = 30, available = 20)
    const reservation = await ReservationService.createReservation({
      customer_name: 'Pelanggan Uji Guardrail',
      pickup_deadline: new Date(Date.now() + 3 * 86400_000).toISOString(),
      notes: 'Titip barang 30 sak',
      created_by: 'Guardrail Tester',
      items: [
        {
          product_id: product.id,
          variant_id: variantId,
          unit_name: 'Sak',
          conversion_factor: 1,
          qty_ordered_unit: 30,
        },
      ],
    });
    createdReservationIds.push(reservation.id);

    // 2c. SUBTRACT 15 (DAMAGED_EXPIRED) -> newStock = 35 >= 30 -> HARUS SUKSES
    const subOk = await StockService.adjustStock({
      variant_id: variantId,
      adjustment_mode: 'SUBTRACT',
      amount: 15,
      movement_type: 'DAMAGED_EXPIRED',
      notes: '15 sak rusak masih dalam batas stok bebas (20)',
      created_by: 'Guardrail Tester',
    });
    assert.equal(subOk.current_stock, 35);
    assert.equal(subOk.reserved_stock, 30);
    assert.equal(subOk.available_stock, 5);
    console.log('✅ 2a. SUBTRACT dalam batas stok bebas berhasil (50 -> 35, reserved=30, available=5)');

    // Hitung jumlah movement sebelum tes penolakan
    const beforeCountRes = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM stock_movements WHERE variant_id = $1',
      [variantId]
    );
    const movementsBeforeReject = beforeCountRes.rows[0].cnt;

    // 2d. SUBTRACT 10 (target 25 < 30) -> HARUS DITOLAK STOCK_BELOW_RESERVED & DB tidak berubah
    await expectAsyncAppHttpError(
      () =>
        StockService.adjustStock({
          variant_id: variantId,
          adjustment_mode: 'SUBTRACT',
          amount: 10,
          movement_type: 'DAMAGED_EXPIRED',
          notes: 'Mencoba potong melebihi stok bebas',
          created_by: 'Guardrail Tester',
        }),
      400,
      'STOCK_BELOW_RESERVED',
      'SUBTRACT below reserved_stock'
    );

    const afterRejectRow = await pool.query(
      'SELECT current_stock, reserved_stock FROM product_variants WHERE id = $1',
      [variantId]
    );
    const afterRejectMovements = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM stock_movements WHERE variant_id = $1',
      [variantId]
    );
    assert.equal(Number(afterRejectRow.rows[0].current_stock), 35);
    assert.equal(Number(afterRejectRow.rows[0].reserved_stock), 30);
    assert.equal(afterRejectMovements.rows[0].cnt, movementsBeforeReject);
    console.log('✅ 2b. SUBTRACT menembus reserved_stock ditolak 400 STOCK_BELOW_RESERVED & transaksi ter-rollback bersih');

    // 2e. SET tepat di batas reserved_stock (30) -> HARUS SUKSES
    const setBoundary = await StockService.adjustStock({
      variant_id: variantId,
      adjustment_mode: 'SET',
      amount: 30,
      movement_type: 'STOCK_OPNAME',
      notes: 'Opname fisik tepat sama dengan stok titipan',
      created_by: 'Guardrail Tester',
    });
    assert.equal(setBoundary.current_stock, 30);
    assert.equal(setBoundary.available_stock, 0);
    console.log('✅ 2c. SET tepat di batas reserved_stock (30) berhasil (available=0)');

    // 2f. SET di bawah batas reserved_stock (29.99) -> HARUS DITOLAK
    await expectAsyncAppHttpError(
      () =>
        StockService.adjustStock({
          variant_id: variantId,
          adjustment_mode: 'SET',
          amount: 29.99,
          movement_type: 'STOCK_OPNAME',
          notes: 'Opname di bawah stok ditahan',
          created_by: 'Guardrail Tester',
        }),
      400,
      'STOCK_BELOW_RESERVED',
      'SET below reserved_stock'
    );
    console.log('✅ 2d. SET di bawah reserved_stock (29.99 < 30) ditolak 400 STOCK_BELOW_RESERVED');

    // 2g. Simulasi legacy deficit recovery (current_stock = 20, reserved_stock = 30)
    await pool.query('UPDATE product_variants SET current_stock = 20 WHERE id = $1', [variantId]);

    // ADD 5 (PURCHASE_RESTOCK) -> HARUS DIIZINKAN untuk memulihkan defisit (20 -> 25)
    const recoverAdd = await StockService.adjustStock({
      variant_id: variantId,
      adjustment_mode: 'ADD',
      amount: 5,
      movement_type: 'PURCHASE_RESTOCK',
      notes: 'Restock pemulihan defisit lama',
      created_by: 'Guardrail Tester',
    });
    assert.equal(recoverAdd.current_stock, 25);
    assert.equal(recoverAdd.reserved_stock, 30);

    // SUBTRACT 1 dan SET 24 pada kondisi defisit tetap HARUS DITOLAK
    await expectAsyncAppHttpError(
      () =>
        StockService.adjustStock({
          variant_id: variantId,
          adjustment_mode: 'SUBTRACT',
          amount: 1,
          movement_type: 'DAMAGED_EXPIRED',
          notes: 'Tidak boleh memperparah defisit',
          created_by: 'Guardrail Tester',
        }),
      400,
      'STOCK_BELOW_RESERVED',
      'SUBTRACT during legacy deficit'
    );
    await expectAsyncAppHttpError(
      () =>
        StockService.adjustStock({
          variant_id: variantId,
          adjustment_mode: 'SET',
          amount: 24,
          movement_type: 'STOCK_OPNAME',
          notes: 'SET masih di bawah reserved',
          created_by: 'Guardrail Tester',
        }),
      400,
      'STOCK_BELOW_RESERVED',
      'SET during legacy deficit'
    );
    console.log('✅ 2e. Pemulihan defisit lama via ADD diizinkan (20 -> 25), sementara SUBTRACT/SET tetap ditolak');

    // 2h. Batalkan reservasi (reserved_stock -> 0), lalu uji SET 0 dan NEGATIVE_STOCK_NOT_ALLOWED
    await ReservationService.cancelReservation(reservation.id, 'Selesai uji guardrail', 'Guardrail Tester');

    const setZero = await StockService.adjustStock({
      variant_id: variantId,
      adjustment_mode: 'SET',
      amount: 0,
      movement_type: 'STOCK_OPNAME',
      notes: 'Stok habis setelah reservasi dibatalkan',
      created_by: 'Guardrail Tester',
    });
    assert.equal(setZero.current_stock, 0);
    assert.equal(setZero.reserved_stock, 0);

    await expectAsyncAppHttpError(
      () =>
        StockService.adjustStock({
          variant_id: variantId,
          adjustment_mode: 'SUBTRACT',
          amount: 1,
          movement_type: 'SALE_DEDUCT',
          notes: 'Mencoba mengurangi stok 0 menjadi negatif',
          created_by: 'Guardrail Tester',
        }),
      400,
      'NEGATIVE_STOCK_NOT_ALLOWED',
      'SUBTRACT below zero'
    );
    console.log('✅ 2f. Setelah reservasi dilepas, SET 0 berhasil dan SUBTRACT di bawah 0 ditolak NEGATIVE_STOCK_NOT_ALLOWED');

    // 2i. Pengujian HTTP Controller (status 400 enum & status 404 varian tidak ditemukan)
    const fakeReqBadEnum = {
      body: {
        variant_id: variantId,
        adjustment_mode: 'INVALID_MODE',
        amount: 5,
        movement_type: 'STOCK_OPNAME',
        notes: 'Tes controller invalid mode',
      },
      user: { id: generateUUIDv7(), role: 'gudang', full_name: 'Staf Gudang Uji' },
    } as unknown as Request;
    const mockRes400 = createMockResponse();
    await StockController.adjust(fakeReqBadEnum, mockRes400.res);
    assert.equal(mockRes400.state.statusCode, 400);
    assert.equal(mockRes400.state.body.success, false);
    assert.equal(mockRes400.state.body.code, 'INVALID_ADJUSTMENT_MODE');

    const fakeReqNotFound = {
      body: {
        variant_id: generateUUIDv7(),
        adjustment_mode: 'ADD',
        amount: 5,
        movement_type: 'PURCHASE_RESTOCK',
        notes: 'Tes controller varian tidak ada',
      },
      user: { id: generateUUIDv7(), role: 'gudang', full_name: 'Staf Gudang Uji' },
    } as unknown as Request;
    const mockRes404 = createMockResponse();
    await StockController.adjust(fakeReqNotFound, mockRes404.res);
    assert.equal(mockRes404.state.statusCode, 404);
    assert.equal(mockRes404.state.body.success, false);
    assert.equal(mockRes404.state.body.code, 'VARIANT_NOT_FOUND');
    console.log('✅ 2g. StockController.adjust mengembalikan HTTP 400 & 404 dengan format { success: false, code, message }');
  } finally {
    // Cleanup data uji secara berurutan (stock_reservations -> products)
    for (const resId of createdReservationIds) {
      await pool.query('DELETE FROM stock_reservations WHERE id = $1', [resId]);
    }
    if (testProductId) {
      await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
    }
    await pool.end();
  }
}

async function main() {
  console.log('🧪 Starting Issue #1 Stock Guardrails & Enum Validation Tests...');
  runValidatorUnitTests();
  await runDatabaseIntegrationTests();
  console.log('\n🎉 Semua pengujian Issue #1 (Unit + Integrasi DB + Controller) LULUS 100%!');
}

main().catch((err) => {
  console.error('\n❌ Pengujian gagal:', err);
  process.exit(1);
});
