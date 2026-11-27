import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { PriceHistoryService } from '../services/priceHistoryService.js';

export class PriceHistoryController {
  static async getHistory(req: Request, res: Response) {
    try {
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const {
        productId,
        variantId,
        variantUnitId,
        supplierId,
        source,
        direction,
        field,
        startDate,
        endDate,
        search,
        limit,
        offset,
      } = req.query;

      const data = await PriceHistoryService.getHistory(
        {
          productId: (productId || req.query.product_id) as string,
          variantId: (variantId || req.query.variant_id) as string,
          variantUnitId: (variantUnitId || req.query.variant_unit_id) as string,
          supplierId: (supplierId || req.query.supplier_id) as string,
          source: (source || req.query.change_source) as string,
          direction: (direction || req.query.change_direction) as string,
          field: field as any,
          startDate: (startDate || req.query.start_date) as string,
          endDate: (endDate || req.query.end_date) as string,
          search: search as string,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        },
        { includeBuyPrice }
      );

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getVariantAnalytics(req: Request, res: Response) {
    try {
      const variantId = String(req.params.id);
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const period = req.query.period as string;

      const data = await PriceHistoryService.getVariantAnalytics(variantId, {
        includeBuyPrice,
        period,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getProductAnalytics(req: Request, res: Response) {
    try {
      const productId = String(req.params.id);
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const period = req.query.period as string;

      const data = await PriceHistoryService.getProductAnalytics(productId, {
        includeBuyPrice,
        period,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getOverviewAnalytics(req: Request, res: Response) {
    try {
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const period = req.query.period as string;
      const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : undefined;

      const data = await PriceHistoryService.getOverviewAnalytics({
        includeBuyPrice,
        period,
        threshold,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getThreshold(req: Request, res: Response) {
    try {
      const threshold = await PriceHistoryService.getMarginThreshold();
      res.json({ success: true, data: { threshold_pct: threshold } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateThreshold(req: Request, res: Response) {
    try {
      const { threshold_pct } = req.body;
      if (threshold_pct === undefined || isNaN(Number(threshold_pct))) {
        return res
          .status(400)
          .json({ success: false, message: 'Nilai ambang batas margin (threshold_pct) wajib diisi' });
      }

      const data = await PriceHistoryService.updateMarginThreshold(
        Number(threshold_pct),
        req.user?.id
      );

      res.json({
        success: true,
        data,
        message: `Ambang batas margin berhasil diperbarui menjadi ${data.threshold_pct}%`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async previewBulkUpdate(req: Request, res: Response) {
    try {
      const { target_field, adjustment_mode, value } = req.body;
      if (!target_field || !adjustment_mode || value === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Kolom target, mode penyesuaian, dan nilai wajib diisi',
        });
      }

      const data = await PriceHistoryService.previewBulkPriceUpdate(req.body);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async commitBulkUpdate(req: Request, res: Response) {
    try {
      const { target_field, adjustment_mode, value } = req.body;
      if (!target_field || !adjustment_mode || value === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Kolom target, mode penyesuaian, dan nilai wajib diisi',
        });
      }

      const allowBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const userFullName = req.user?.full_name?.trim();
      const username = req.user?.username?.trim();
      const actorName = userFullName
        ? (username && username !== userFullName ? `${userFullName} (@${username})` : userFullName)
        : (username || 'Admin');

      const result = await PriceHistoryService.commitBulkPriceUpdate(req.body, {
        userId: req.user!.id,
        createdBy: actorName,
        allowBuyPrice,
      });

      res.json({ success: true, data: result, message: result.message });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
