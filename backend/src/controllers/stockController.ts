import { Request, Response } from 'express';
import { StockService } from '../services/stockService.js';

export class StockController {
  static async adjust(req: Request, res: Response) {
    try {
      const { variant_id, adjustment_mode, amount, movement_type, notes, reference_no, created_by } = req.body;
      
      if (!variant_id || !adjustment_mode || amount === undefined || !movement_type || !notes) {
        return res.status(400).json({ 
          success: false, 
          message: 'Varian, mode penyesuaian, jumlah perubahan, tipe mutasi, dan catatan alasan wajib diisi' 
        });
      }

      const result = await StockService.adjustStock({
        variant_id,
        adjustment_mode,
        amount: Number(amount),
        movement_type,
        notes,
        reference_no,
        created_by
      });

      res.json({ success: true, data: result, message: 'Penyesuaian stok berhasil disimpan!' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async movements(req: Request, res: Response) {
    try {
      const variantId = req.query.variantId as string;
      const productId = req.query.productId as string;
      const type = req.query.type as string;
      const search = req.query.search as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const result = await StockService.getStockMovements({
        variantId,
        productId,
        type,
        search,
        limit,
        offset
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
