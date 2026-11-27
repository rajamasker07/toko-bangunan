import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { StockService } from '../services/stockService.js';
import { sendErrorResponse } from '../utils/errors.js';
import { validateAdjustStockInput } from '../validators/stockValidator.js';

export class StockController {
  static async adjust(req: Request, res: Response) {
    try {
      const validated = validateAdjustStockInput(req.body);

      const allowBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const canWritePricing = hasPermission(req.user!.role, 'pricing:write');

      const result = await StockService.adjustStock({
        variant_id: validated.variant_id,
        adjustment_mode: validated.adjustment_mode,
        amount: validated.amount,
        movement_type: validated.movement_type,
        notes: validated.notes,
        reference_no: validated.reference_no,
        user_id: req.user!.id,
        created_by: req.user!.full_name,
        price_update: canWritePricing ? validated.price_update : undefined,
        allow_buy_price: allowBuyPrice,
      });

      res.json({ success: true, data: result, message: 'Penyesuaian stok berhasil disimpan!' });
    } catch (error: unknown) {
      sendErrorResponse(res, error);
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
    } catch (error: unknown) {
      sendErrorResponse(res, error);
    }
  }
}
