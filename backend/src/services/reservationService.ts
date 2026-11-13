import type { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export interface CreateReservationItemDto {
  product_id?: string;
  variant_id: string;
  unit_name: string;
  conversion_factor?: number;
  qty_ordered_unit: number;
  qty_reserved_base?: number;
}

export interface CreateReservationDto {
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  invoice_no?: string;
  pickup_deadline: string | Date;
  notes?: string;
  created_by?: string;
  items: CreateReservationItemDto[];
}

export interface PickupItemDto {
  item_id: string;
  qty_pickup?: number;
  qty_picked_up?: number;
  qty_picked_up_base?: number;
}

export interface PickupReservationDto {
  receiver_name: string;
  vehicle_plate?: string;
  notes?: string;
  handed_by?: string;
  items: PickupItemDto[];
}

export interface ReservationFilterOptions {
  status?: string;
  search?: string;
  deadlineStatus?: 'all' | 'overdue' | 'due_soon' | 'on_track';
  limit?: number;
  offset?: number;
}

export class ReservationService {
  /**
   * Helper to generate unique reservation code: TTP-YYYYMMDD-XXXX
   */
  private static generateReservationCode(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TTP-${dateStr}-${randomSuffix}`;
  }

  /**
   * Create a new reservation with hold on variant stocks
   */
  static async createReservation(input: CreateReservationDto) {
    if (!input.customer_name || !input.customer_name.trim()) {
      throw new Error('Nama pelanggan wajib diisi');
    }
    if (!input.pickup_deadline) {
      throw new Error('Batas waktu pengambilan (pickup deadline) wajib diisi');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Daftar barang reservasi tidak boleh kosong');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reservationId = generateUUIDv7();
      let reservationCode = this.generateReservationCode();

      // Check unique reservation code (in rare case of collision)
      let codeExists = await client.query('SELECT 1 FROM stock_reservations WHERE reservation_code = $1', [reservationCode]);
      while ((codeExists.rowCount ?? 0) > 0) {
        reservationCode = this.generateReservationCode();
        codeExists = await client.query('SELECT 1 FROM stock_reservations WHERE reservation_code = $1', [reservationCode]);
      }

      const creator = input.created_by || 'Admin';

      // 1. Insert reservation header
      await client.query(
        `INSERT INTO stock_reservations (
          id, reservation_code, invoice_no, customer_name, customer_phone, customer_address,
          status, pickup_deadline, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9)`,
        [
          reservationId,
          reservationCode,
          input.invoice_no?.trim() || null,
          input.customer_name.trim(),
          input.customer_phone?.trim() || null,
          input.customer_address?.trim() || null,
          new Date(input.pickup_deadline),
          input.notes?.trim() || null,
          creator
        ]
      );

      // 2. Process and validate each item
      for (const item of input.items) {
        if (!item.variant_id || !item.unit_name) {
          throw new Error('Setiap item reservasi wajib memiliki variant_id dan unit_name');
        }

        const qtyOrdered = Number(item.qty_ordered_unit);
        if (isNaN(qtyOrdered) || qtyOrdered <= 0) {
          throw new Error(`Jumlah pesanan untuk ${item.unit_name} harus lebih besar dari 0`);
        }

        const convFactor = Number(item.conversion_factor) > 0 ? Number(item.conversion_factor) : 1;
        const qtyReservedBase = item.qty_reserved_base !== undefined && Number(item.qty_reserved_base) > 0
          ? Number(item.qty_reserved_base)
          : qtyOrdered * convFactor;

        // Fetch variant with lock
        const variantRes = await client.query(
          `SELECT pv.*, p.name as product_name
           FROM product_variants pv
           JOIN products p ON pv.product_id = p.id
           WHERE pv.id = $1
           FOR UPDATE`,
          [item.variant_id]
        );

        if (variantRes.rows.length === 0) {
          throw new Error(`Varian produk dengan ID ${item.variant_id} tidak ditemukan.`);
        }

        const variant = variantRes.rows[0];
        const productId = item.product_id || variant.product_id;
        const currentStock = Number(variant.current_stock);
        const currentReserved = Number(variant.reserved_stock || 0);
        const availableStock = currentStock - currentReserved;

        if (availableStock < qtyReservedBase) {
          throw new Error(
            `Stok tidak mencukupi untuk "${variant.product_name} - ${variant.variant_name}". Stok tersedia: ${availableStock}, dibutuhkan: ${qtyReservedBase} (Stok fisik: ${currentStock}, Ditahan sebelumnya: ${currentReserved})`
          );
        }

        // Atomically increment variant reserved_stock
        await client.query(
          `UPDATE product_variants
           SET reserved_stock = reserved_stock + $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [qtyReservedBase, item.variant_id]
        );

        // Insert reservation item
        const itemId = generateUUIDv7();
        await client.query(
          `INSERT INTO stock_reservation_items (
            id, reservation_id, product_id, variant_id, unit_name, conversion_factor,
            qty_ordered_unit, qty_reserved_base, qty_picked_up_base
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
          [
            itemId,
            reservationId,
            productId,
            item.variant_id,
            item.unit_name,
            convFactor,
            qtyOrdered,
            qtyReservedBase
          ]
        );

        // Record stock_movements for hold
        const movementId = generateUUIDv7();
        await client.query(
          `INSERT INTO stock_movements (
            id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock,
            reference_no, notes, created_by
          ) VALUES ($1, $2, $3, 'RESERVATION_HOLD', $4, 0, $4, $5, $6, $7)`,
          [
            movementId,
            productId,
            item.variant_id,
            currentStock,
            reservationCode,
            `Penahanan stok reservasi ${reservationCode} untuk ${input.customer_name} (${qtyOrdered} ${item.unit_name} = ${qtyReservedBase} unit dasar)`,
            creator
          ]
        );
      }

      await client.query('COMMIT');
      return await this.getReservationById(reservationId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get list of reservations with filtering, search, alert calculation, and pagination
   */
  static async getReservations(filters?: ReservationFilterOptions) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.status && filters.status !== 'ALL') {
      params.push(filters.status.toUpperCase());
      conditions.push(`r.status = $${params.length}`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      conditions.push(`(
        LOWER(r.customer_name) LIKE $${pIdx} OR
        LOWER(COALESCE(r.customer_phone, '')) LIKE $${pIdx} OR
        LOWER(r.reservation_code) LIKE $${pIdx} OR
        LOWER(COALESCE(r.invoice_no, '')) LIKE $${pIdx}
      )`);
    }

    if (filters?.deadlineStatus && filters.deadlineStatus !== 'all') {
      if (filters.deadlineStatus === 'overdue') {
        conditions.push(`r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP`);
      } else if (filters.deadlineStatus === 'due_soon') {
        conditions.push(`r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP AND r.pickup_deadline <= CURRENT_TIMESTAMP + INTERVAL '2 days'`);
      } else if (filters.deadlineStatus === 'on_track') {
        conditions.push(`r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline > CURRENT_TIMESTAMP + INTERVAL '2 days'`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 50;
    const offset = filters?.offset && filters.offset >= 0 ? filters.offset : 0;

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT 
        r.*,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP THEN TRUE
          ELSE FALSE
        END as is_overdue,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP AND r.pickup_deadline <= CURRENT_TIMESTAMP + INTERVAL '2 days' THEN TRUE
          ELSE FALSE
        END as is_due_soon,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP
            THEN CEIL(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.pickup_deadline)) / 86400)::int
          ELSE 0
        END as days_overdue,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP
            THEN CEIL(EXTRACT(EPOCH FROM (r.pickup_deadline - CURRENT_TIMESTAMP)) / 86400)::int
          ELSE 0
        END as days_remaining,
        (
          SELECT COUNT(*)::int FROM stock_reservation_items sri WHERE sri.reservation_id = r.id
        ) as total_items_count,
        (
          SELECT COALESCE(SUM(sri.qty_reserved_base), 0)::numeric FROM stock_reservation_items sri WHERE sri.reservation_id = r.id
        ) as total_reserved_base,
        (
          SELECT COALESCE(SUM(sri.qty_picked_up_base), 0)::numeric FROM stock_reservation_items sri WHERE sri.reservation_id = r.id
        ) as total_picked_up_base,
        (
          SELECT json_agg(
            json_build_object(
              'id', sri.id,
              'reservation_id', sri.reservation_id,
              'product_id', sri.product_id,
              'product_name', p.name,
              'variant_id', sri.variant_id,
              'variant_name', pv.variant_name,
              'sku', pv.sku,
              'unit_name', sri.unit_name,
              'base_unit_name', (SELECT vu.unit_name FROM variant_units vu WHERE vu.variant_id = pv.id AND vu.is_base_unit = true LIMIT 1),
              'conversion_factor', sri.conversion_factor,
              'qty_ordered_unit', sri.qty_ordered_unit,
              'qty_reserved_base', sri.qty_reserved_base,
              'qty_picked_up_base', sri.qty_picked_up_base,
              'remaining_base', (sri.qty_reserved_base - sri.qty_picked_up_base),
              'qty_remaining_base', (sri.qty_reserved_base - sri.qty_picked_up_base)
            ) ORDER BY sri.id ASC
          )
          FROM stock_reservation_items sri
          JOIN products p ON sri.product_id = p.id
          JOIN product_variants pv ON sri.variant_id = pv.id
          WHERE sri.reservation_id = r.id
        ) as items
      FROM stock_reservations r
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP THEN 1
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline <= CURRENT_TIMESTAMP + INTERVAL '2 days' THEN 2
          WHEN r.status IN ('PENDING', 'PARTIAL') THEN 3
          ELSE 4
        END ASC,
        r.pickup_deadline ASC,
        r.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countSql = `
      SELECT COUNT(*)::int as total 
      FROM stock_reservations r
      ${whereClause}
    `;

    const [rowsRes, countRes] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2))
    ]);

    return {
      total: countRes.rows[0]?.total || 0,
      items: rowsRes.rows,
      reservations: rowsRes.rows
    };
  }

  /**
   * Get single reservation by ID with items, products, variants, and pickup history
   */
  static async getReservationById(id: string) {
    const sql = `
      SELECT 
        r.*,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP THEN TRUE
          ELSE FALSE
        END as is_overdue,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP AND r.pickup_deadline <= CURRENT_TIMESTAMP + INTERVAL '2 days' THEN TRUE
          ELSE FALSE
        END as is_due_soon,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP
            THEN CEIL(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.pickup_deadline)) / 86400)::int
          ELSE 0
        END as days_overdue,
        CASE
          WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP
            THEN CEIL(EXTRACT(EPOCH FROM (r.pickup_deadline - CURRENT_TIMESTAMP)) / 86400)::int
          ELSE 0
        END as days_remaining,
        (
          SELECT json_agg(
            json_build_object(
              'id', sri.id,
              'reservation_id', sri.reservation_id,
              'product_id', sri.product_id,
              'product_name', p.name,
              'variant_id', sri.variant_id,
              'variant_name', pv.variant_name,
              'sku', pv.sku,
              'barcode', pv.barcode,
              'current_stock', pv.current_stock,
              'reserved_stock', pv.reserved_stock,
              'available_stock', (pv.current_stock - COALESCE(pv.reserved_stock, 0)),
              'unit_name', sri.unit_name,
              'base_unit_name', (SELECT vu.unit_name FROM variant_units vu WHERE vu.variant_id = pv.id AND vu.is_base_unit = true LIMIT 1),
              'conversion_factor', sri.conversion_factor,
              'qty_ordered_unit', sri.qty_ordered_unit,
              'qty_reserved_base', sri.qty_reserved_base,
              'qty_picked_up_base', sri.qty_picked_up_base,
              'remaining_base', (sri.qty_reserved_base - sri.qty_picked_up_base),
              'qty_remaining_base', (sri.qty_reserved_base - sri.qty_picked_up_base)
            ) ORDER BY sri.id ASC
          )
          FROM stock_reservation_items sri
          JOIN products p ON sri.product_id = p.id
          JOIN product_variants pv ON sri.variant_id = pv.id
          WHERE sri.reservation_id = r.id
        ) as items,
        (
          SELECT json_agg(
            json_build_object(
              'id', srp.id,
              'reservation_id', srp.reservation_id,
              'receiver_name', srp.receiver_name,
              'vehicle_plate', srp.vehicle_plate,
              'notes', srp.notes,
              'handed_by', srp.handed_by,
              'items', srp.items,
              'picked_up_at', srp.picked_up_at
            ) ORDER BY srp.picked_up_at DESC
          )
          FROM stock_reservation_pickups srp
          WHERE srp.reservation_id = r.id
        ) as pickups
      FROM stock_reservations r
      WHERE r.id = $1
    `;

    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Pickup partial or full items from reservation
   */
  static async pickupReservation(id: string, input: PickupReservationDto) {
    if (!input.receiver_name || !input.receiver_name.trim()) {
      throw new Error('Nama penerima / pengambil barang wajib diisi');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Daftar barang yang diambil tidak boleh kosong');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and check reservation
      const resQuery = await client.query(
        'SELECT * FROM stock_reservations WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (resQuery.rows.length === 0) {
        throw new Error('Data reservasi tidak ditemukan');
      }

      const reservation = resQuery.rows[0];
      if (reservation.status === 'COMPLETED') {
        throw new Error('Reservasi ini sudah selesai diambil sepenuhnya');
      }
      if (reservation.status === 'CANCELLED') {
        throw new Error('Reservasi ini telah dibatalkan dan tidak dapat diambil');
      }

      // 2. Fetch reservation items
      const itemsRes = await client.query(
        `SELECT sri.*, p.name as product_name, pv.variant_name, pv.sku
         FROM stock_reservation_items sri
         JOIN products p ON sri.product_id = p.id
         JOIN product_variants pv ON sri.variant_id = pv.id
         WHERE sri.reservation_id = $1`,
        [id]
      );

      const itemsMap = new Map<string, any>();
      for (const row of itemsRes.rows) {
        itemsMap.set(row.id, row);
      }

      const handedBy = input.handed_by || 'Admin';
      const pickupDetails: any[] = [];

      // 3. Process each item pickup
      for (const pItem of input.items) {
        const itemRow = itemsMap.get(pItem.item_id);
        if (!itemRow) {
          throw new Error(`Item reservasi dengan ID ${pItem.item_id} tidak valid untuk reservasi ini`);
        }

        const pickupQtyBase = Number(pItem.qty_picked_up_base ?? pItem.qty_picked_up ?? pItem.qty_pickup ?? 0);
        if (isNaN(pickupQtyBase) || pickupQtyBase <= 0) {
          throw new Error(`Jumlah pengambilan untuk "${itemRow.product_name} - ${itemRow.variant_name}" harus lebih besar dari 0`);
        }

        const remainingBase = Number(itemRow.qty_reserved_base) - Number(itemRow.qty_picked_up_base);
        if (pickupQtyBase > remainingBase) {
          throw new Error(
            `Jumlah pengambilan (${pickupQtyBase}) melebihi sisa barang yang ditahan (${remainingBase}) untuk "${itemRow.product_name} - ${itemRow.variant_name}"`
          );
        }

        // Lock variant
        const varRes = await client.query(
          `SELECT current_stock, reserved_stock FROM product_variants WHERE id = $1 FOR UPDATE`,
          [itemRow.variant_id]
        );
        const currentStock = Number(varRes.rows[0].current_stock);
        const currentReserved = Number(varRes.rows[0].reserved_stock);

        if (currentStock < pickupQtyBase) {
          throw new Error(
            `Stok fisik gudang (${currentStock}) tidak cukup untuk pengambilan ${pickupQtyBase} unit "${itemRow.product_name} - ${itemRow.variant_name}"`
          );
        }

        const newStock = currentStock - pickupQtyBase;
        const newReserved = Math.max(0, currentReserved - pickupQtyBase);

        // Update variant current_stock AND reserved_stock
        await client.query(
          `UPDATE product_variants 
           SET current_stock = $1, reserved_stock = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newStock, newReserved, itemRow.variant_id]
        );

        // Update reservation item picked up base
        await client.query(
          `UPDATE stock_reservation_items
           SET qty_picked_up_base = qty_picked_up_base + $1
           WHERE id = $2`,
          [pickupQtyBase, pItem.item_id]
        );

        // Record stock_movements for pickup
        const movementId = generateUUIDv7();
        await client.query(
          `INSERT INTO stock_movements (
            id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock,
            reference_no, notes, created_by
          ) VALUES ($1, $2, $3, 'RESERVATION_PICKUP', $4, $5, $6, $7, $8, $9)`,
          [
            movementId,
            itemRow.product_id,
            itemRow.variant_id,
            currentStock,
            -pickupQtyBase,
            newStock,
            reservation.reservation_code,
            `Pengambilan barang reservasi ${reservation.reservation_code} oleh ${input.receiver_name} (${pickupQtyBase} unit dasar). Kendaraan: ${input.vehicle_plate || '-'}`,
            handedBy
          ]
        );

        pickupDetails.push({
          item_id: itemRow.id,
          product_id: itemRow.product_id,
          product_name: itemRow.product_name,
          variant_id: itemRow.variant_id,
          variant_name: itemRow.variant_name,
          unit_name: itemRow.unit_name,
          qty_picked_up_base: pickupQtyBase,
          remaining_base_after: remainingBase - pickupQtyBase
        });
      }

      // 4. Record stock_reservation_pickups
      const pickupLogId = generateUUIDv7();
      await client.query(
        `INSERT INTO stock_reservation_pickups (
          id, reservation_id, receiver_name, vehicle_plate, notes, handed_by, items, picked_up_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          pickupLogId,
          id,
          input.receiver_name.trim(),
          input.vehicle_plate?.trim() || null,
          input.notes?.trim() || null,
          handedBy,
          JSON.stringify(pickupDetails)
        ]
      );

      // 5. Check if all items are fully picked up
      const checkRes = await client.query(
        `SELECT bool_and(qty_picked_up_base >= qty_reserved_base) as all_completed
         FROM stock_reservation_items
         WHERE reservation_id = $1`,
        [id]
      );

      const isAllCompleted = checkRes.rows[0]?.all_completed === true;

      if (isAllCompleted) {
        await client.query(
          `UPDATE stock_reservations
           SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
      } else {
        await client.query(
          `UPDATE stock_reservations
           SET status = 'PARTIAL', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
      }

      await client.query('COMMIT');
      return await this.getReservationById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Extend pickup deadline and optionally append notes
   */
  static async extendDeadline(id: string, newDeadline: string | Date, notes?: string) {
    if (!newDeadline) {
      throw new Error('Batas waktu baru wajib diisi');
    }

    const resCheck = await query('SELECT status FROM stock_reservations WHERE id = $1', [id]);
    if (resCheck.rows.length === 0) {
      throw new Error('Data reservasi tidak ditemukan');
    }
    const currentStatus = resCheck.rows[0].status;
    if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
      throw new Error(`Tidak dapat memperpanjang deadline reservasi yang berstatus ${currentStatus}`);
    }

    const cleanNotes = notes?.trim() || null;
    let sql: string;
    let params: any[];

    if (cleanNotes) {
      sql = `
        UPDATE stock_reservations
        SET 
          pickup_deadline = $1,
          notes = CASE 
            WHEN notes IS NOT NULL AND TRIM(notes) <> '' 
              THEN notes || E'\n' || $2 
            ELSE $2 
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      params = [new Date(newDeadline), `[Perpanjangan Deadline] ${cleanNotes}`, id];
    } else {
      sql = `
        UPDATE stock_reservations
        SET pickup_deadline = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      params = [new Date(newDeadline), id];
    }

    await query(sql, params);
    return await this.getReservationById(id);
  }

  /**
   * Cancel reservation: release uncollected reserved_stock back to available pool
   */
  static async cancelReservation(id: string, cancelReason: string, cancelledBy?: string) {
    if (!cancelReason || !cancelReason.trim()) {
      throw new Error('Alasan pembatalan reservasi wajib diisi');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resQuery = await client.query(
        'SELECT * FROM stock_reservations WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (resQuery.rows.length === 0) {
        throw new Error('Data reservasi tidak ditemukan');
      }

      const reservation = resQuery.rows[0];
      if (reservation.status === 'CANCELLED') {
        throw new Error('Reservasi ini sudah dibatalkan sebelumnya');
      }
      if (reservation.status === 'COMPLETED') {
        throw new Error('Reservasi yang sudah selesai tidak dapat dibatalkan');
      }

      const creator = cancelledBy || 'Admin';

      // 1. Fetch items to release uncollected reserved stock
      const itemsRes = await client.query(
        `SELECT sri.*, pv.current_stock, pv.reserved_stock, p.name as product_name, pv.variant_name
         FROM stock_reservation_items sri
         JOIN products p ON sri.product_id = p.id
         JOIN product_variants pv ON sri.variant_id = pv.id
         WHERE sri.reservation_id = $1`,
        [id]
      );

      for (const item of itemsRes.rows) {
        const uncollectedBase = Number(item.qty_reserved_base) - Number(item.qty_picked_up_base);
        if (uncollectedBase > 0) {
          // Decrement variant reserved_stock without touching current_stock
          await client.query(
            `UPDATE product_variants
             SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [uncollectedBase, item.variant_id]
          );

          // Record stock movement for release
          const movementId = generateUUIDv7();
          const currentStock = Number(item.current_stock);
          await client.query(
            `INSERT INTO stock_movements (
              id, product_id, variant_id, movement_type, previous_stock, quantity_change, current_stock,
              reference_no, notes, created_by
            ) VALUES ($1, $2, $3, 'RESERVATION_RELEASE', $4, 0, $4, $5, $6, $7)`,
            [
              movementId,
              item.product_id,
              item.variant_id,
              currentStock,
              reservation.reservation_code,
              `Pelepasan stok reservasi ${reservation.reservation_code} (${uncollectedBase} unit dasar) karena pembatalan: ${cancelReason.trim()}`,
              creator
            ]
          );
        }
      }

      // 2. Update reservation status to CANCELLED
      await client.query(
        `UPDATE stock_reservations
         SET 
           status = 'CANCELLED',
           cancelled_at = CURRENT_TIMESTAMP,
           cancel_reason = $1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [cancelReason.trim(), id]
      );

      await client.query('COMMIT');
      return await this.getReservationById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get overall alert statistics for badge indicators and dashboard
   */
  static async getAlertStats() {
    const sql = `
      SELECT 
        COUNT(DISTINCT CASE WHEN r.status IN ('PENDING', 'PARTIAL') THEN r.id END)::int as total_active,
        COUNT(DISTINCT CASE WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline < CURRENT_TIMESTAMP THEN r.id END)::int as overdue_count,
        COUNT(DISTINCT CASE WHEN r.status IN ('PENDING', 'PARTIAL') AND r.pickup_deadline >= CURRENT_TIMESTAMP AND r.pickup_deadline <= CURRENT_TIMESTAMP + INTERVAL '2 days' THEN r.id END)::int as due_soon_count,
        COALESCE(SUM(CASE WHEN r.status IN ('PENDING', 'PARTIAL') THEN (sri.qty_reserved_base - sri.qty_picked_up_base) ELSE 0 END), 0)::numeric as total_items_held
      FROM stock_reservations r
      LEFT JOIN stock_reservation_items sri ON r.id = sri.reservation_id
    `;

    const res = await query(sql);
    const row = res.rows[0];

    return {
      total_active: Number(row?.total_active || 0),
      overdue_count: Number(row?.overdue_count || 0),
      due_soon_count: Number(row?.due_soon_count || 0),
      total_items_held: Number(row?.total_items_held || 0)
    };
  }
}
