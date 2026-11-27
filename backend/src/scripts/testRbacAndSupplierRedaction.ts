import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../config/db.js';
import {
  getPermissionsForRole,
  hasPermission,
  syncRolesCacheFromDb,
} from '../config/rbac.js';
import { initializeDatabase } from '../db/init.js';
import { requirePermission } from '../middleware/auth.js';
import { RoleService } from '../services/roleService.js';
import { SupplierService } from '../services/supplierService.js';
import { SupplierInvoiceService } from '../services/supplierInvoiceService.js';
import { ExportService } from '../services/exportService.js';
import { SupplierController } from '../controllers/supplierController.js';
import { SupplierInvoiceController } from '../controllers/supplierInvoiceController.js';
import { ALL_PERMISSIONS, type AuthenticatedUser, type Permission } from '../types/auth.js';
import { generateUUIDv7 } from '../utils/uuid.js';

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
  query?: Record<string, string>;
  body?: Record<string, any>;
  role: string;
}): Request {
  const role = options.role;
  const user: AuthenticatedUser = {
    id: generateUUIDv7(),
    username: `mock_${role}`,
    email: null,
    full_name: `Mock ${role}`,
    role,
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    session_id: generateUUIDv7(),
    token_version: 1,
    permissions: getPermissionsForRole(role),
  };

  return {
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    user,
  } as unknown as Request;
}

interface RoleRowSnapshot {
  code: string;
  name: string;
  short_name: string;
  description: string | null;
  badge_color: string;
  hierarchy_level: number;
  is_system: boolean;
  permissions: Permission[];
}

async function fetchRoleSnapshot(code: string): Promise<RoleRowSnapshot> {
  const res = await pool.query(
    `SELECT code, name, short_name, description, badge_color, hierarchy_level, is_system, permissions
     FROM roles WHERE LOWER(code) = LOWER($1) LIMIT 1`,
    [code]
  );
  assert.equal(res.rows.length, 1, `Role "${code}" harus tersedia di tabel roles`);
  const row = res.rows[0];
  return {
    code: row.code,
    name: row.name,
    short_name: row.short_name,
    description: row.description ?? null,
    badge_color: row.badge_color,
    hierarchy_level: Number(row.hierarchy_level),
    is_system: Boolean(row.is_system),
    permissions: Array.isArray(row.permissions) ? row.permissions : JSON.parse(row.permissions),
  };
}

async function restoreRoleSnapshot(snap: RoleRowSnapshot): Promise<void> {
  await pool.query(
    `UPDATE roles
     SET name = $1,
         short_name = $2,
         description = $3,
         badge_color = $4,
         hierarchy_level = $5,
         is_system = $6,
         permissions = $7::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(code) = LOWER($8)`,
    [
      snap.name,
      snap.short_name,
      snap.description,
      snap.badge_color,
      snap.hierarchy_level,
      snap.is_system,
      JSON.stringify(snap.permissions),
      snap.code,
    ]
  );
}

async function runTests() {
  console.log('🧪 Memulai pengujian Issue #3: Persistensi RBAC saat restart & sensor nominal hutang supplier...');

  await initializeDatabase();

  const gudangOriginal = await fetchRoleSnapshot('gudang');
  const ownerOriginal = await fetchRoleSnapshot('owner');

  const ownerActor: AuthenticatedUser = {
    id: generateUUIDv7(),
    username: 'test_owner_actor',
    email: null,
    full_name: 'Test Owner Actor',
    role: 'owner',
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    session_id: generateUUIDv7(),
    token_version: 1,
    permissions: [...ALL_PERMISSIONS],
  };

  let createdSupplierId: string | null = null;

  try {
    // =========================================================================
    // TEST 1: Kustomisasi izin & metadata role bawaan TIDAK ter-reset saat restart
    // =========================================================================
    const customGudangPerms: Permission[] = [
      'dashboard:read',
      'products:read',
      'master:write',
      'stock:read',
      'stock:adjust',
    ];
    const customGudangDesc = 'Deskripsi kustom Staf Gudang uji persistensi Issue #3';
    const customOwnerDesc = 'Deskripsi kustom Owner uji persistensi Issue #3';

    await RoleService.updateRole(ownerActor, 'gudang', {
      description: customGudangDesc,
      permissions: customGudangPerms,
    });
    await RoleService.updateRole(ownerActor, 'owner', {
      description: customOwnerDesc,
    });

    // Simulasi server restart penuh via initializeDatabase()
    await initializeDatabase();

    const gudangAfterRestart = await fetchRoleSnapshot('gudang');
    assert.deepEqual(
      [...gudangAfterRestart.permissions].sort(),
      [...customGudangPerms].sort(),
      'Izin kustom role gudang tidak boleh ter-reset setelah initializeDatabase()'
    );
    assert.equal(
      gudangAfterRestart.description,
      customGudangDesc,
      'Deskripsi kustom role gudang tidak boleh ter-reset setelah initializeDatabase()'
    );
    assert.equal(
      hasPermission('gudang', 'master:write'),
      true,
      'Cache in-memory harus mempertahankan izin tambahan master:write milik gudang setelah restart'
    );
    assert.equal(
      hasPermission('gudang', 'suppliers:read'),
      false,
      'Cache in-memory harus mempertahankan pencabutan izin suppliers:read milik gudang setelah restart'
    );

    const ownerAfterRestart = await fetchRoleSnapshot('owner');
    assert.equal(
      ownerAfterRestart.description,
      customOwnerDesc,
      'Metadata deskripsi kustom role owner tidak boleh ter-reset setelah restart'
    );
    assert.deepEqual(
      [...ownerAfterRestart.permissions].sort(),
      [...ALL_PERMISSIONS].sort(),
      'Role owner harus selalu mempertahankan seluruh ALL_PERMISSIONS setelah restart'
    );
    console.log('✅ 1. Kustomisasi RBAC (permissions & metadata) bertahan utuh setelah simulasi restart server');

    // =========================================================================
    // TEST 2: Middleware invoice mutasi menolak role dengan master:write tanpa products:view_buy_price
    // =========================================================================
    // Saat ini gudang punya master:write tapi tidak punya products:view_buy_price
    const guardMiddleware = requirePermission('master:write', 'products:view_buy_price');
    let nextCalled = false;
    const guardMockRes = createMockResponse();
    guardMiddleware(
      createMockRequest({ role: 'gudang' }),
      guardMockRes.res,
      (() => {
        nextCalled = true;
      }) as NextFunction
    );
    assert.equal(nextCalled, false, 'Role gudang tanpa products:view_buy_price harus ditolak pada mutasi invoice');
    assert.equal(guardMockRes.state.statusCode, 403);
    assert.equal(guardMockRes.state.body?.code, 'FORBIDDEN');
    console.log('✅ 2. Route guard mutasi invoice menolak role tanpa izin products:view_buy_price (403 FORBIDDEN)');

    // Kembalikan role gudang ke snapshot default sebelum uji sensor supplier/invoice
    await restoreRoleSnapshot(gudangOriginal);
    await syncRolesCacheFromDb();

    // Pastikan gudang tidak memiliki products:view_buy_price secara default
    assert.equal(hasPermission('gudang', 'suppliers:read'), true);
    assert.equal(hasPermission('gudang', 'products:view_buy_price'), false);

    // =========================================================================
    // TEST 3: Sensor nominal rupiah supplier & invoice untuk role gudang
    // =========================================================================
    const suffix = Date.now().toString().slice(-6);
    const supplier = await SupplierService.create({
      name: `PT Uji Sensor Issue3 ${suffix}`,
      code: `SUP-ISS3-${suffix}`,
      city: 'Surabaya',
    });
    createdSupplierId = supplier.id;

    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

    await SupplierInvoiceService.create(supplier.id, {
      invoice_number: `INV-ISS3-A-${suffix}`,
      purchase_order_no: `PO-${suffix}`,
      invoice_date: today,
      due_date: nextWeek,
      total_amount: 5000000,
      paid_amount: 1500000,
      notes: 'Faktur uji parsial',
    });
    await SupplierInvoiceService.create(supplier.id, {
      invoice_number: `INV-ISS3-B-${suffix}`,
      invoice_date: today,
      due_date: nextWeek,
      total_amount: 2000000,
      paid_amount: 2000000,
      notes: 'Faktur uji lunas',
    });

    // 3a. GET /api/suppliers & GET /api/suppliers/:id oleh gudang
    const listGudangRes = createMockResponse();
    await SupplierController.list(
      createMockRequest({ role: 'gudang', query: { search: `SUP-ISS3-${suffix}` } }),
      listGudangRes.res
    );
    assert.equal(listGudangRes.state.statusCode, 200);
    const gudangListItem = listGudangRes.state.body.data.find((s: any) => s.id === supplier.id);
    assert.ok(gudangListItem, 'Supplier uji harus muncul di daftar supplier gudang');
    assert.equal(gudangListItem.invoice_summary.total_debt_amount, null, 'total_debt_amount harus null untuk gudang');
    assert.equal(gudangListItem.invoice_summary.total_invoices, 2);
    assert.equal(gudangListItem.invoice_summary.unpaid_count, 1);

    const detailGudangRes = createMockResponse();
    await SupplierController.getById(
      createMockRequest({ role: 'gudang', params: { id: supplier.id } }),
      detailGudangRes.res
    );
    assert.equal(detailGudangRes.state.statusCode, 200);
    assert.equal(detailGudangRes.state.body.data.invoice_summary.total_debt_amount, null);

    // 3b. GET /api/suppliers/:supplierId/invoices oleh gudang
    const invGudangRes = createMockResponse();
    await SupplierInvoiceController.listBySupplier(
      createMockRequest({ role: 'gudang', params: { supplierId: supplier.id } }),
      invGudangRes.res
    );
    assert.equal(invGudangRes.state.statusCode, 200);
    const gudangInvoices = invGudangRes.state.body.data;
    assert.equal(gudangInvoices.length, 2);
    for (const inv of gudangInvoices) {
      assert.equal(inv.total_amount, null, 'total_amount invoice harus null untuk gudang');
      assert.equal(inv.paid_amount, null, 'paid_amount invoice harus null untuk gudang');
      assert.equal(inv.remaining_amount, null, 'remaining_amount invoice harus null untuk gudang');
      assert.ok(inv.invoice_number, 'Nomor invoice operasional tetap harus tampil');
      assert.ok(inv.status === 'PARTIAL' || inv.status === 'PAID', 'Status operasional tetap akurat');
    }

    // 3c. GET /api/suppliers/:supplierId/invoices/summary oleh gudang
    const sumGudangRes = createMockResponse();
    await SupplierInvoiceController.getSummaryBySupplier(
      createMockRequest({ role: 'gudang', params: { supplierId: supplier.id } }),
      sumGudangRes.res
    );
    assert.equal(sumGudangRes.state.statusCode, 200);
    const gudangSum = sumGudangRes.state.body.data;
    assert.equal(gudangSum.total_invoice_amount, null);
    assert.equal(gudangSum.total_paid_amount, null);
    assert.equal(gudangSum.total_debt_amount, null);
    assert.equal(gudangSum.total_invoices, 2);
    assert.equal(gudangSum.partial_count, 1);
    assert.equal(gudangSum.paid_count, 1);
    console.log('✅ 3. Seluruh nominal hutang & tagihan supplier tersensor (null) untuk role gudang');

    // =========================================================================
    // TEST 4: Role owner & admin tetap melihat seluruh nominal rupiah secara akurat
    // =========================================================================
    for (const role of ['owner', 'admin']) {
      const detailFinRes = createMockResponse();
      await SupplierController.getById(
        createMockRequest({ role, params: { id: supplier.id } }),
        detailFinRes.res
      );
      assert.equal(Number(detailFinRes.state.body.data.invoice_summary.total_debt_amount), 3500000);

      const invFinRes = createMockResponse();
      await SupplierInvoiceController.listBySupplier(
        createMockRequest({ role, params: { supplierId: supplier.id } }),
        invFinRes.res
      );
      const partialInv = invFinRes.state.body.data.find(
        (i: any) => i.invoice_number === `INV-ISS3-A-${suffix}`
      );
      assert.equal(partialInv.total_amount, 5000000);
      assert.equal(partialInv.paid_amount, 1500000);
      assert.equal(partialInv.remaining_amount, 3500000);

      const sumFinRes = createMockResponse();
      await SupplierInvoiceController.getSummaryBySupplier(
        createMockRequest({ role, params: { supplierId: supplier.id } }),
        sumFinRes.res
      );
      assert.equal(sumFinRes.state.body.data.total_invoice_amount, 7000000);
      assert.equal(sumFinRes.state.body.data.total_paid_amount, 3500000);
      assert.equal(sumFinRes.state.body.data.total_debt_amount, 3500000);
    }
    console.log('✅ 4. Role owner & admin tetap melihat nominal tagihan/hutang rupiah secara lengkap');

    // =========================================================================
    // TEST 5: ExportService menyensor nominal faktur supplier bila canViewBuyPrice=false
    // =========================================================================
    const redactedDataset = await ExportService.buildSupplierInvoicesDataset(false);
    const redactedColKeys = redactedDataset.columns.map((c) => c.key);
    assert.equal(redactedColKeys.includes('total_tagihan'), false);
    assert.equal(redactedColKeys.includes('jumlah_terbayar'), false);
    assert.equal(redactedColKeys.includes('sisa_tagihan'), false);
    const redactedRow = redactedDataset.rows.find((r) => r.nomor_invoice === `INV-ISS3-A-${suffix}`);
    assert.ok(redactedRow, 'Baris invoice uji harus tetap ada pada ekspor non-finansial');
    assert.equal('total_tagihan' in redactedRow, false);
    assert.equal('jumlah_terbayar' in redactedRow, false);
    assert.equal('sisa_tagihan' in redactedRow, false);

    const fullDataset = await ExportService.buildSupplierInvoicesDataset(true);
    const fullColKeys = fullDataset.columns.map((c) => c.key);
    assert.equal(fullColKeys.includes('total_tagihan'), true);
    assert.equal(fullColKeys.includes('sisa_tagihan'), true);
    const fullRow = fullDataset.rows.find((r) => r.nomor_invoice === `INV-ISS3-A-${suffix}`);
    assert.equal(fullRow?.total_tagihan, 5000000);
    assert.equal(fullRow?.sisa_tagihan, 3500000);
    console.log('✅ 5. ExportService menyensor kolom & data nominal faktur saat canViewBuyPrice=false');

    // =========================================================================
    // TEST 6: Integrasi Dynamic RBAC + Restart + Sensor Finansial
    // =========================================================================
    await RoleService.updateRole(ownerActor, 'gudang', {
      permissions: [...gudangOriginal.permissions, 'products:view_buy_price'],
    });
    await initializeDatabase(); // Restart tidak boleh mereset izin baru gudang

    const sumGudangGranted = createMockResponse();
    await SupplierInvoiceController.getSummaryBySupplier(
      createMockRequest({ role: 'gudang', params: { supplierId: supplier.id } }),
      sumGudangGranted.res
    );
    assert.equal(
      sumGudangGranted.state.body.data.total_debt_amount,
      3500000,
      'Setelah diberi izin products:view_buy_price & server restart, gudang harus bisa melihat nominal hutang'
    );
    console.log('✅ 6. Integrasi dinamis: pemberian izin products:view_buy_price ke gudang bertahan pasca-restart & langsung membuka nominal');

    console.log('\n🎉 Semua pengujian Issue #3 LULUS 100%!');
  } finally {
    // Cleanup: hapus supplier uji (cascade ke supplier_invoices) & kembalikan snapshot role asli
    if (createdSupplierId) {
      await pool.query('DELETE FROM suppliers WHERE id = $1', [createdSupplierId]);
    }
    await restoreRoleSnapshot(gudangOriginal);
    await restoreRoleSnapshot(ownerOriginal);
    await syncRolesCacheFromDb();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('❌ Pengujian Issue #3 gagal:', err);
  process.exit(1);
});
