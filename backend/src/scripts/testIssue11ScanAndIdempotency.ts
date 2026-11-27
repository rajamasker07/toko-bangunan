import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { pool, query } from '../config/db.js';
import { initializeDatabase } from '../db/init.js';
import apiRouter from '../routes/api.js';
import { ProductService } from '../services/productService.js';
import { ReservationService } from '../services/reservationService.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { signAccessToken } from '../utils/jwt.js';

async function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  const url = new URL(path, baseUrl);
  const payload = options?.body !== undefined ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
          ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options?.headers || {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 0, headers: res.headers, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Memulai pengujian E2E Issue #11 (Scan Lookup Instan & Idempotency)...\n');

  await initializeDatabase();

  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  const server = await new Promise<http.Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Gagal mendapatkan port server pengujian.');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const createdUserIds: string[] = [];
  let createdProductId: string | null = null;
  let createdReservationId: string | null = null;

  try {
    // Siapkan 2 user uji: owner (punya izin lihat buy_price) & gudang (buy_price disensor)
    const suffix = Date.now().toString().slice(-6);
    const ownerUserId = generateUUIDv7();
    const gudangUserId = generateUUIDv7();
    const ownerSessionId = generateUUIDv7();
    const gudangSessionId = generateUUIDv7();
    createdUserIds.push(ownerUserId, gudangUserId);

    await query(
      `INSERT INTO users (id, username, full_name, password_hash, role, is_active, token_version)
       VALUES
         ($1, $2, 'Owner Test 11', 'hash', 'owner', TRUE, 1),
         ($3, $4, 'Staf Gudang Test 11', 'hash', 'gudang', TRUE, 1)`,
      [ownerUserId, `owner_t11_${suffix}`, gudangUserId, `gudang_t11_${suffix}`]
    );

    await query(
      `INSERT INTO user_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES
         ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day'),
         ($4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [
        ownerSessionId,
        ownerUserId,
        `hash_owner_${suffix}`,
        gudangSessionId,
        gudangUserId,
        `hash_gudang_${suffix}`,
      ]
    );

    const ownerToken = signAccessToken({
      sub: ownerUserId,
      sid: ownerSessionId,
      role: 'owner',
      tv: 1,
    }).token;
    const gudangToken = signAccessToken({
      sub: gudangUserId,
      sid: gudangSessionId,
      role: 'gudang',
      tv: 1,
    }).token;

    // Buat produk uji multi-varian dengan barcode pada produk & varian
    const prodBarcode = `8990011${suffix}`;
    const varBarcodeA = `8990022${suffix}A`;
    const varBarcodeB = `8990022${suffix}B`;

    const createdProd = await ProductService.createProduct(
      {
        name: `Cat Pelapis Anti Bocor Uji11 ${suffix}`,
        barcode: prodBarcode,
        weight: 5.25,
        has_variants: true,
        variants: [
          {
            variant_name: 'Galon 5 Kg Abu-Abu',
            barcode: varBarcodeA,
            initial_stock: 40,
            min_stock: 5,
            units: [
              {
                unit_name: 'Galon',
                conversion_factor: 1,
                is_base_unit: true,
                buy_price: 185000,
                sell_price: 225000,
                wholesale_price: 215000,
              },
              {
                unit_name: 'Dus',
                conversion_factor: 4,
                is_base_unit: false,
                buy_price: 720000,
                sell_price: 880000,
              },
            ],
          },
          {
            variant_name: 'Pail 20 Kg Abu-Abu',
            barcode: varBarcodeB,
            initial_stock: 15,
            min_stock: 3,
            units: [
              {
                unit_name: 'Pail',
                conversion_factor: 1,
                is_base_unit: true,
                buy_price: 680000,
                sell_price: 820000,
              },
            ],
          },
        ],
      },
      { userId: ownerUserId, createdBy: 'Owner Test 11', allowBuyPrice: true }
    );
    createdProductId = createdProd.id;
    const variantA = createdProd.variants.find((v: any) => v.barcode === varBarcodeA);
    assert.ok(variantA, 'Varian A harus ditemukan');

    // =========================================================================
    // TEST 1: GET /api/v1/products/by-barcode/:code
    // =========================================================================
    console.log('1. Menguji GET /api/v1/products/by-barcode/:code (case-insensitive & RBAC redaction)...');
    const scanGudang = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/products/by-barcode/${encodeURIComponent(`  ${varBarcodeA.toLowerCase()}  `)}`,
      { token: gudangToken }
    );
    assert.equal(scanGudang.status, 200);
    assert.equal(scanGudang.body.data.matched_by, 'variant_barcode');
    assert.equal(scanGudang.body.data.matched_variant_id, variantA.id);
    assert.equal(scanGudang.body.data.matched_variant.units[0].buy_price, null, 'buy_price wajib null untuk role gudang');
    assert.equal(scanGudang.body.data.product.embedding, undefined, 'embedding tidak boleh bocor');

    const scanOwner = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/products/by-barcode/${varBarcodeA}`,
      { token: ownerToken }
    );
    assert.equal(scanOwner.status, 200);
    assert.equal(Number(scanOwner.body.data.matched_variant.units[0].buy_price), 185000);

    const scanProdBarcode = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/products/by-barcode/${prodBarcode}`,
      { token: gudangToken }
    );
    assert.equal(scanProdBarcode.status, 200);
    assert.equal(scanProdBarcode.body.data.matched_by, 'product_barcode');
    assert.equal(scanProdBarcode.body.data.product.id, createdProductId);

    const scanUnknown = await httpRequest(
      baseUrl,
      'GET',
      '/api/v1/products/by-barcode/BARCODE-TIDAK-ADA-999999',
      { token: gudangToken }
    );
    assert.equal(scanUnknown.status, 404);
    assert.equal(scanUnknown.body.code, 'BARCODE_NOT_FOUND');
    console.log('   ✓ Lookup barcode instan, case-insensitive, RBAC buy_price, & 404 bekerja akurat.');

    // =========================================================================
    // TEST 2: GET /api/v1/variants/:id
    // =========================================================================
    console.log('2. Menguji GET /api/v1/variants/:id (QR deep link bangunjaya://v/:id)...');
    const varDetailGudang = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/variants/${variantA.id}`,
      { token: gudangToken }
    );
    assert.equal(varDetailGudang.status, 200);
    assert.equal(varDetailGudang.body.data.id, variantA.id);
    assert.equal(varDetailGudang.body.data.current_stock, 40);
    assert.equal(varDetailGudang.body.data.available_stock, 40);
    assert.equal(varDetailGudang.body.data.units.length, 2);
    assert.equal(varDetailGudang.body.data.units[0].buy_price, null);
    assert.equal(Number(varDetailGudang.body.data.product.weight), 5.25);

    const varInvalidId = await httpRequest(
      baseUrl,
      'GET',
      '/api/v1/variants/bukan-uuid-valid',
      { token: gudangToken }
    );
    assert.equal(varInvalidId.status, 400);
    assert.equal(varInvalidId.body.code, 'INVALID_VARIANT_ID');

    const varMissing = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/variants/${generateUUIDv7()}`,
      { token: gudangToken }
    );
    assert.equal(varMissing.status, 404);
    assert.equal(varMissing.body.code, 'VARIANT_NOT_FOUND');
    console.log('   ✓ Lookup varian QR, dimensi logistik, validasi UUID 400, & 404 bekerja akurat.');

    // =========================================================================
    // TEST 3: GET /api/v1/reservations/by-code/:code
    // =========================================================================
    console.log('3. Menguji GET /api/v1/reservations/by-code/:code (QR tiket TTP-...)...');
    const reservation = await ReservationService.createReservation({
      customer_name: 'Kontraktor Budi Uji11',
      customer_phone: '08123456789',
      pickup_deadline: new Date(Date.now() + 3 * 86400_000).toISOString(),
      notes: 'Titip 10 galon cat',
      user_id: ownerUserId,
      created_by: 'Owner Test 11',
      items: [
        {
          variant_id: variantA.id,
          unit_name: 'Galon',
          conversion_factor: 1,
          qty_ordered_unit: 10,
        },
      ],
    });
    createdReservationId = reservation.id;

    const resByCode = await httpRequest(
      baseUrl,
      'GET',
      `/api/v1/reservations/by-code/${reservation.reservation_code.toLowerCase()}`,
      { token: gudangToken }
    );
    assert.equal(resByCode.status, 200);
    assert.equal(resByCode.body.data.id, reservation.id);
    assert.equal(resByCode.body.data.items.length, 1);
    assert.equal(Number(resByCode.body.data.items[0].qty_reserved_base), 10);

    const resUnknownCode = await httpRequest(
      baseUrl,
      'GET',
      '/api/v1/reservations/by-code/TTP-19990101-ZZZZ',
      { token: gudangToken }
    );
    assert.equal(resUnknownCode.status, 404);
    assert.equal(resUnknownCode.body.code, 'RESERVATION_NOT_FOUND');
    console.log(`   ✓ Lookup kode reservasi ${reservation.reservation_code} & 404 bekerja akurat.`);

    // =========================================================================
    // TEST 4: Idempotency pada POST /api/v1/stock/adjust (Sequential & Parallel Race)
    // =========================================================================
    console.log('4. Menguji idempotency_key pada POST /api/v1/stock/adjust (5 request paralel + mismatch)...');
    const stockIdemKey = `idem-restock-${suffix}-001`;
    const stockPayload = {
      variant_id: variantA.id,
      adjustment_mode: 'ADD',
      amount: 12,
      movement_type: 'PURCHASE_RESTOCK',
      reference_no: `SJ-${suffix}`,
      notes: 'Bongkar muatan truk pagi',
    };

    // Kirim 5 request identik secara paralel bersamaan (menguji pg_advisory_xact_lock)
    const parallelStockResponses = await Promise.all(
      Array.from({ length: 5 }, () =>
        httpRequest(baseUrl, 'POST', '/api/v1/stock/adjust', {
          token: gudangToken,
          headers: { 'Idempotency-Key': stockIdemKey },
          body: stockPayload,
        })
      )
    );

    for (const r of parallelStockResponses) {
      assert.equal(r.status, 200, `Semua request paralel harus 200 OK, dapat ${r.status}`);
      assert.equal(r.body.data.current_stock, 52, 'Stok hanya boleh bertambah sekali: 40 + 12 = 52');
    }

    const freshCalls = parallelStockResponses.filter(
      (r) => r.headers['x-idempotent-replayed'] === 'false'
    );
    const replayedCalls = parallelStockResponses.filter(
      (r) => r.headers['x-idempotent-replayed'] === 'true'
    );
    assert.equal(freshCalls.length, 1, 'Tepat 1 request pertama mengeksekusi mutasi');
    assert.equal(replayedCalls.length, 4, '4 request paralel lainnya menerima hasil replay');

    // Verifikasi jumlah baris di stock_movements untuk reference_no tersebut hanya 1
    const movCountRes = await query(
      `SELECT COUNT(*)::int AS cnt FROM stock_movements WHERE variant_id = $1 AND reference_no = $2`,
      [variantA.id, `SJ-${suffix}`]
    );
    assert.equal(movCountRes.rows[0].cnt, 1, 'Hanya boleh ada 1 baris di stock_movements');

    // Uji penyalahgunaan key yang sama dengan jumlah berbeda -> wajib 422 IDEMPOTENCY_PAYLOAD_MISMATCH
    const mismatchStockRes = await httpRequest(baseUrl, 'POST', '/api/v1/stock/adjust', {
      token: gudangToken,
      headers: { 'Idempotency-Key': stockIdemKey },
      body: { ...stockPayload, amount: 99 },
    });
    assert.equal(mismatchStockRes.status, 422);
    assert.equal(mismatchStockRes.body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');

    // Uji request gagal bisnis (SUBTRACT melebihi bebas jual -> STOCK_BELOW_RESERVED) tidak mengunci key baru
    const failRecoverKey = `idem-fail-recover-${suffix}`;
    const failedAdjust = await httpRequest(baseUrl, 'POST', '/api/v1/stock/adjust', {
      token: gudangToken,
      body: {
        variant_id: variantA.id,
        adjustment_mode: 'SET',
        amount: 5, // < reserved_stock (10) -> harus gagal 400
        movement_type: 'STOCK_OPNAME',
        notes: 'Salah ketik opname',
        idempotency_key: failRecoverKey,
      },
    });
    assert.equal(failedAdjust.status, 400);
    assert.equal(failedAdjust.body.code, 'STOCK_BELOW_RESERVED');

    const recoveredAdjust = await httpRequest(baseUrl, 'POST', '/api/v1/stock/adjust', {
      token: gudangToken,
      body: {
        variant_id: variantA.id,
        adjustment_mode: 'SET',
        amount: 52, // valid >= reserved_stock (10)
        movement_type: 'STOCK_OPNAME',
        notes: 'Opname dikoreksi',
        idempotency_key: failRecoverKey,
      },
    });
    assert.equal(recoveredAdjust.status, 200);
    console.log('   ✓ Idempotency mutasi stok (paralel 5x, mismatch 422, & rollback safety) bekerja sempurna.');

    // =========================================================================
    // TEST 5: Idempotency pada POST /api/v1/reservations/:id/pickup
    // =========================================================================
    console.log('5. Menguji idempotency_key pada POST /api/v1/reservations/:id/pickup (5 request paralel)...');
    const reservationItemId = reservation.items[0].id;
    const pickupIdemKey = `idem-pickup-${suffix}-001`;
    const pickupPayload = {
      receiver_name: 'Pak Slamet Supir Proyek',
      vehicle_plate: 'B 9123 KAA',
      notes: 'Ambil tahap pertama 6 galon',
      idempotency_key: pickupIdemKey,
      items: [
        {
          item_id: reservationItemId,
          qty_picked_up_base: 6,
        },
      ],
    };

    const parallelPickupResponses = await Promise.all(
      Array.from({ length: 5 }, () =>
        httpRequest(baseUrl, 'POST', `/api/v1/reservations/${reservation.id}/pickup`, {
          token: gudangToken,
          body: pickupPayload,
        })
      )
    );

    for (const r of parallelPickupResponses) {
      assert.equal(r.status, 200, `Semua request pickup paralel harus 200 OK, dapat ${r.status}`);
      assert.equal(r.body.data.status, 'PARTIAL');
      assert.equal(Number(r.body.data.items[0].qty_picked_up_base), 6, 'Hanya boleh terambil 6 galon (bukan 30)');
      assert.equal(r.body.data.pickups.length, 1, 'Hanya boleh tercatat 1 riwayat serah terima');
    }

    const pickupFresh = parallelPickupResponses.filter(
      (r) => r.headers['x-idempotent-replayed'] === 'false'
    );
    const pickupReplayed = parallelPickupResponses.filter(
      (r) => r.headers['x-idempotent-replayed'] === 'true'
    );
    assert.equal(pickupFresh.length, 1);
    assert.equal(pickupReplayed.length, 4);

    // Cek stok fisik akhir varian A: 52 - 6 = 46, reserved_stock: 10 - 6 = 4
    const finalVarCheck = await httpRequest(baseUrl, 'GET', `/api/v1/variants/${variantA.id}`, {
      token: gudangToken,
    });
    assert.equal(finalVarCheck.body.data.current_stock, 46);
    assert.equal(finalVarCheck.body.data.reserved_stock, 4);
    assert.equal(finalVarCheck.body.data.available_stock, 42);

    // Uji mismatch payload pada key pickup yang sama -> 422
    const mismatchPickup = await httpRequest(
      baseUrl,
      'POST',
      `/api/v1/reservations/${reservation.id}/pickup`,
      {
        token: gudangToken,
        body: {
          ...pickupPayload,
          receiver_name: 'Orang Berbeda',
        },
      }
    );
    assert.equal(mismatchPickup.status, 422);
    assert.equal(mismatchPickup.body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
    console.log('   ✓ Idempotency pickup reservasi (paralel 5x, stok akurat, & mismatch 422) bekerja sempurna.');

    console.log('\n✅ Seluruh rangkaian pengujian E2E Issue #11 LULUS 100%!');
  } finally {
    // Bersihkan data uji agar database tetap bersih
    if (createdReservationId) {
      await query('DELETE FROM stock_reservations WHERE id = $1', [createdReservationId]);
    }
    if (createdProductId) {
      await query('DELETE FROM products WHERE id = $1', [createdProductId]);
    }
    if (createdUserIds.length > 0) {
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Pengujian Issue #11 GAGAL:', err);
  process.exit(1);
});
