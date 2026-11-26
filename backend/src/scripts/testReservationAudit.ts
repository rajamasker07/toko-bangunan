import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { initializeDatabase } from '../db/init.js';
import { ProductService } from '../services/productService.js';
import { ReservationController } from '../controllers/reservationController.js';
import { StockService } from '../services/stockService.js';
import { generateUUIDv7 } from '../utils/uuid.js';
import { hashPassword } from '../utils/password.js';

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

function createMockRequest(options: {
  params?: Record<string, string>;
  body?: Record<string, any>;
  user: { id: string; username: string; full_name: string; role: string };
}): Request {
  return {
    params: options.params ?? {},
    body: options.body ?? {},
    query: {},
    user: {
      id: options.user.id,
      username: options.user.username,
      full_name: options.user.full_name,
      role: options.user.role,
      session_id: generateUUIDv7(),
      token_version: 1,
      permissions: [],
    },
  } as unknown as Request;
}

async function runTests() {
  console.log('🧪 Memulai pengujian audit reservasi & kontrak JSONB qty_picked_up_base (Issue #2)...');

  // Pastikan migrasi skema (termasuk stock_reservation_pickups.user_id) sudah diterapkan
  await initializeDatabase();

  const suffix = Date.now().toString().slice(-6);
  const testUserId = generateUUIDv7();
  const testUsername = `test_gudang_${suffix}`;
  const testFullName = `Budi Gudang ${suffix}`;

  let createdProductId: string | null = null;
  const createdReservationIds: string[] = [];

  try {
    // 1. Setup user uji nyata di tabel users (agar FK user_id & LEFT JOIN users valid)
    const passwordHash = await hashPassword('TestGudang123!');
    await pool.query(
      `INSERT INTO users (id, username, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'gudang', TRUE)`,
      [testUserId, testUsername, testFullName, passwordHash]
    );

    const mockUser = {
      id: testUserId,
      username: testUsername,
      full_name: testFullName,
      role: 'gudang',
    };

    // 2. Setup produk uji dengan 2 satuan (Sak = base unit, Truk = 10 Sak)
    const product = await ProductService.createProduct(
      {
        name: `Semen Uji Issue2 ${suffix}`,
        sku: `TEST-ISS2-${suffix}`,
        has_variants: false,
        initial_stock: 50,
        min_stock: 5,
        base_unit_name: 'Sak',
        buy_price: 50000,
        sell_price: 60000,
        units: [
          {
            unit_name: 'Sak',
            conversion_factor: 1,
            is_base_unit: true,
            buy_price: 50000,
            sell_price: 60000,
          },
          {
            unit_name: 'Truk',
            conversion_factor: 10,
            is_base_unit: false,
            buy_price: 500000,
            sell_price: 590000,
          },
        ],
      },
      { userId: testUserId, createdBy: testFullName, allowBuyPrice: true }
    );
    assert.ok(product?.id, 'Produk uji harus berhasil dibuat');
    createdProductId = product.id;
    const variantId = product.variants[0].id as string;

    const deadline = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

    // 3. Test ReservationController.create (anti-spoofing created_by + isi user_id di stock_movements)
    const createResMock = createMockResponse();
    await ReservationController.create(
      createMockRequest({
        user: mockUser,
        body: {
          customer_name: 'Proyek Uji Issue 2',
          pickup_deadline: deadline,
          created_by: 'Spoofed Kasir / Admin',
          items: [
            {
              variant_id: variantId,
              unit_name: 'Truk',
              conversion_factor: 10,
              qty_ordered_unit: 1, // = 10 Sak (unit dasar)
            },
          ],
        },
      }),
      createResMock.res
    );

    assert.equal(createResMock.state.statusCode, 201, `Create gagal: ${JSON.stringify(createResMock.state.body)}`);
    const res1 = createResMock.state.body.data;
    createdReservationIds.push(res1.id);
    assert.equal(res1.created_by, testFullName, 'created_by harus diambil dari req.user, bukan body spoof');
    const item1Id = res1.items[0].id as string;

    const holdMovements = await StockService.getStockMovements({
      variantId,
      type: 'RESERVATION_HOLD',
      limit: 10,
    });
    assert.equal(holdMovements.items.length, 1, 'Harus ada 1 log RESERVATION_HOLD');
    assert.equal(holdMovements.items[0].user_id, testUserId, 'RESERVATION_HOLD user_id harus terisi req.user.id');
    assert.equal(holdMovements.items[0].created_by, testFullName, 'RESERVATION_HOLD created_by harus req.user.full_name');
    assert.equal(holdMovements.items[0].created_by_username, testUsername, 'GET /api/stock/movements harus join username');
    assert.equal(holdMovements.items[0].created_by_role, 'gudang', 'GET /api/stock/movements harus join role');
    console.log('✅ 1. Create reservasi mengisi user_id & created_by dari req.user (anti-spoofing)');

    // 4. Test ReservationController.pickup dengan qty_picked_up_base + anti-spoofing handed_by
    const pickup1Mock = createMockResponse();
    await ReservationController.pickup(
      createMockRequest({
        params: { id: res1.id },
        user: mockUser,
        body: {
          receiver_name: 'Pak Supir A',
          vehicle_plate: 'B 1234 XY',
          handed_by: 'Petugas Palsu Dari Body',
          notes: 'Pengambilan tahap 1',
          items: [{ item_id: item1Id, qty_picked_up_base: 3.5 }],
        },
      }),
      pickup1Mock.res
    );

    assert.equal(pickup1Mock.state.statusCode, 200, `Pickup 1 gagal: ${JSON.stringify(pickup1Mock.state.body)}`);
    const afterPickup1 = pickup1Mock.state.body.data;
    assert.equal(afterPickup1.status, 'PARTIAL');
    assert.equal(afterPickup1.pickups.length, 1);

    const pickupLog1 = afterPickup1.pickups[0];
    assert.equal(pickupLog1.handed_by, testFullName, 'handed_by harus diambil dari req.user, bukan body spoof');
    assert.equal(pickupLog1.user_id, testUserId, 'stock_reservation_pickups.user_id harus terisi req.user.id');
    assert.equal(pickupLog1.handed_by_username, testUsername, 'pickups harus mengembalikan handed_by_username');

    const jsonbItem1 = pickupLog1.items[0];
    assert.equal(jsonbItem1.qty_picked_up_base, 3.5, 'JSONB items harus menyimpan key qty_picked_up_base');
    assert.equal(jsonbItem1.base_unit_name, 'Sak', 'JSONB items harus menyertakan base_unit_name (Sak, bukan Truk)');
    assert.equal(jsonbItem1.remaining_base_after, 6.5, 'remaining_base_after harus 6.5');

    const pickupMovements = await StockService.getStockMovements({
      variantId,
      type: 'RESERVATION_PICKUP',
      limit: 10,
    });
    assert.equal(pickupMovements.items.length, 1);
    assert.equal(pickupMovements.items[0].user_id, testUserId, 'RESERVATION_PICKUP user_id harus req.user.id');
    assert.equal(pickupMovements.items[0].created_by, testFullName, 'RESERVATION_PICKUP created_by harus req.user.full_name');
    assert.equal(pickupMovements.items[0].created_by_username, testUsername);
    assert.equal(pickupMovements.items[0].created_by_role, 'gudang');
    console.log('✅ 2. Pickup reservasi mengisi stock_movements.user_id, handed_by dari req.user, dan JSONB qty_picked_up_base + base_unit_name');

    // 5. Test duplikat item_id dalam 1 request pickup ditolak
    const dupPickupMock = createMockResponse();
    await ReservationController.pickup(
      createMockRequest({
        params: { id: res1.id },
        user: mockUser,
        body: {
          receiver_name: 'Pak Supir Dup',
          items: [
            { item_id: item1Id, qty_picked_up_base: 1 },
            { item_id: item1Id, qty_picked_up_base: 1 },
          ],
        },
      }),
      dupPickupMock.res
    );
    assert.equal(dupPickupMock.state.statusCode, 400, 'Duplikat item_id dalam 1 pickup wajib ditolak (400)');
    console.log('✅ 3. Duplikat item_id dalam 1 permintaan pickup berhasil ditolak');

    // 6. Test backward compatibility alias legacy qty_picked_up tetap tersimpan sebagai qty_picked_up_base
    const legacyPickupMock = createMockResponse();
    await ReservationController.pickup(
      createMockRequest({
        params: { id: res1.id },
        user: mockUser,
        body: {
          receiver_name: 'Pak Supir Legacy',
          items: [{ item_id: item1Id, qty_picked_up: 1.5 }],
        },
      }),
      legacyPickupMock.res
    );
    assert.equal(legacyPickupMock.state.statusCode, 200, `Legacy pickup gagal: ${JSON.stringify(legacyPickupMock.state.body)}`);
    const latestPickup = legacyPickupMock.state.body.data.pickups[0];
    assert.equal(latestPickup.items[0].qty_picked_up_base, 1.5, 'Alias legacy qty_picked_up tetap disimpan dengan key kanonik qty_picked_up_base');
    console.log('✅ 4. Kompatibilitas mundur alias qty_picked_up tetap normalisasi ke qty_picked_up_base');

    // 7. Test closePartial mengisi user_id pada RESERVATION_RELEASE
    const closePartialMock = createMockResponse();
    await ReservationController.closePartial(
      createMockRequest({
        params: { id: res1.id },
        user: mockUser,
        body: {
          settlement_type: 'REFUND',
          reason: 'Sisa proyek batal dipakai',
          closed_by: 'Spoofed Closer',
        },
      }),
      closePartialMock.res
    );
    assert.equal(closePartialMock.state.statusCode, 200);

    // 8. Test cancel mengisi user_id pada RESERVATION_RELEASE
    const createRes2Mock = createMockResponse();
    await ReservationController.create(
      createMockRequest({
        user: mockUser,
        body: {
          customer_name: 'Proyek Uji Cancel',
          pickup_deadline: deadline,
          items: [
            {
              variant_id: variantId,
              unit_name: 'Sak',
              conversion_factor: 1,
              qty_ordered_unit: 4,
            },
          ],
        },
      }),
      createRes2Mock.res
    );
    assert.equal(createRes2Mock.state.statusCode, 201);
    const res2 = createRes2Mock.state.body.data;
    createdReservationIds.push(res2.id);

    const cancelMock = createMockResponse();
    await ReservationController.cancel(
      createMockRequest({
        params: { id: res2.id },
        user: mockUser,
        body: {
          reason: 'Batal order',
          cancelled_by: 'Spoofed Canceller',
        },
      }),
      cancelMock.res
    );
    assert.equal(cancelMock.state.statusCode, 200);

    const releaseMovements = await StockService.getStockMovements({
      variantId,
      type: 'RESERVATION_RELEASE',
      limit: 10,
    });
    assert.equal(releaseMovements.items.length, 2, 'Harus ada 2 log RESERVATION_RELEASE (closePartial & cancel)');
    for (const mov of releaseMovements.items) {
      assert.equal(mov.user_id, testUserId, 'RESERVATION_RELEASE user_id harus req.user.id');
      assert.equal(mov.created_by, testFullName, 'RESERVATION_RELEASE created_by harus req.user.full_name');
      assert.equal(mov.created_by_username, testUsername);
    }
    console.log('✅ 5. Close Partial & Cancel reservasi mengisi user_id & created_by dari req.user');

    console.log('\n🎉 Semua pengujian Issue #2 LULUS 100%!');
  } finally {
    // Cleanup seluruh data uji agar DB tetap bersih
    for (const rId of createdReservationIds) {
      await pool.query('DELETE FROM stock_reservations WHERE id = $1', [rId]);
    }
    if (createdProductId) {
      await pool.query('DELETE FROM products WHERE id = $1', [createdProductId]);
    }
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('❌ Pengujian Issue #2 gagal:', err);
  process.exit(1);
});
