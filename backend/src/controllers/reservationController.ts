import { Request, Response } from 'express';
import { ReservationService } from '../services/reservationService.js';
import { AppHttpError, sendErrorResponse } from '../utils/errors.js';
import { resolveIdempotencyKey } from '../utils/idempotency.js';

function resolveAuthenticatedActor(req: Request): { userId: string | null; fullName: string } {
  const userId = req.user?.id ?? null;
  const fullName = (req.user?.full_name || req.user?.username || 'Admin').trim().slice(0, 100) || 'Admin';
  return { userId, fullName };
}

export class ReservationController {
  static async list(req: Request, res: Response) {
    try {
      const status = req.query.status as string;
      const search = req.query.search as string;
      const deadlineStatus = req.query.deadlineStatus as 'all' | 'overdue' | 'due_soon' | 'on_track';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const result = await ReservationService.getReservations({
        status,
        search,
        deadlineStatus,
        limit,
        offset
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAlertStats(req: Request, res: Response) {
    try {
      const stats = await ReservationService.getAlertStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getByCode(req: Request, res: Response) {
    try {
      const code = String(req.params.code ?? '').trim();
      if (!code) {
        throw new AppHttpError(400, 'Kode reservasi wajib diisi.', 'INVALID_RESERVATION_CODE');
      }
      const reservation = await ReservationService.getReservationByCode(code);
      if (!reservation) {
        return res.status(404).json({
          success: false,
          code: 'RESERVATION_NOT_FOUND',
          message: `Tiket reservasi "${code}" tidak ditemukan.`,
        });
      }
      res.json({ success: true, data: reservation });
    } catch (error: unknown) {
      sendErrorResponse(res, error);
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const reservation = await ReservationService.getReservationById(id);
      if (!reservation) {
        return res.status(404).json({ success: false, message: 'Data reservasi tidak ditemukan' });
      }
      res.json({ success: true, data: reservation });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const {
        customer_name,
        customer_phone,
        customer_address,
        invoice_no,
        pickup_deadline,
        notes,
        items
      } = req.body;

      if (!customer_name || !pickup_deadline || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nama pelanggan, batas waktu pickup (pickup_deadline), dan daftar item reservasi wajib diisi'
        });
      }

      const actor = resolveAuthenticatedActor(req);

      const result = await ReservationService.createReservation({
        customer_name,
        customer_phone,
        customer_address,
        invoice_no,
        pickup_deadline,
        notes,
        user_id: actor.userId,
        created_by: actor.fullName,
        items
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Reservasi berhasil dibuat dengan kode ${result?.reservation_code}`
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async pickup(req: Request, res: Response) {
    try {
      const id = String(req.params.id ?? '').trim();
      const idempotencyKey = resolveIdempotencyKey(req);
      const { receiver_name, vehicle_plate, notes, items } = req.body || {};

      if (!receiver_name || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nama penerima barang (receiver_name) dan daftar item pengambilan wajib diisi'
        });
      }

      const actor = resolveAuthenticatedActor(req);

      const result = await ReservationService.pickupReservation(id, {
        receiver_name,
        vehicle_plate,
        notes,
        user_id: actor.userId,
        handed_by: actor.fullName,
        items,
        idempotency_key: idempotencyKey,
      });

      const isReplayed = Boolean((result as any)?._idempotent_replayed);
      if (typeof res.setHeader === 'function') {
        res.setHeader('X-Idempotent-Replayed', isReplayed ? 'true' : 'false');
      }

      res.json({
        success: true,
        data: result,
        message: 'Pengambilan barang reservasi berhasil diproses'
      });
    } catch (error: any) {
      if (error instanceof AppHttpError) {
        sendErrorResponse(res, error);
        return;
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async extendDeadline(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const pickup_deadline = req.body.pickup_deadline || req.body.new_deadline;
      const notes = req.body.notes;

      if (!pickup_deadline) {
        return res.status(400).json({
          success: false,
          message: 'Batas waktu baru (pickup_deadline / new_deadline) wajib diisi'
        });
      }

      const result = await ReservationService.extendDeadline(id, pickup_deadline, notes);
      res.json({
        success: true,
        data: result,
        message: 'Batas waktu pengambilan reservasi berhasil diperpanjang'
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async cancel(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const cancel_reason = req.body.cancel_reason || req.body.reason;
      const actor = resolveAuthenticatedActor(req);

      if (!cancel_reason || !String(cancel_reason).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Alasan pembatalan reservasi (cancel_reason / reason) wajib diisi'
        });
      }

      const result = await ReservationService.cancelReservation(
        id,
        String(cancel_reason).trim(),
        actor.fullName,
        actor.userId
      );
      res.json({
        success: true,
        data: result,
        message: 'Reservasi berhasil dibatalkan dan stok ditahan telah dilepaskan'
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async closePartial(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const settlement_type = req.body.settlement_type;
      const reason = req.body.reason || req.body.settlement_notes || req.body.notes;
      const actor = resolveAuthenticatedActor(req);

      if (!settlement_type) {
        return res.status(400).json({
          success: false,
          message: 'Tipe penyelesaian (settlement_type) wajib diisi (REFUND, EXCHANGE, DEPOSIT, OTHER)'
        });
      }

      if (!reason || !String(reason).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Alasan / catatan penyelesaian sebagian (reason) wajib diisi'
        });
      }

      const result = await ReservationService.closePartialReservation(id, {
        settlement_type,
        reason: String(reason).trim(),
        user_id: actor.userId,
        closed_by: actor.fullName
      });

      res.json({
        success: true,
        data: result,
        message: 'Reservasi berhasil diselesaikan sebagian dan sisa stok ditahan telah dilepaskan'
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
