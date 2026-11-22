import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { DashboardService } from '../services/dashboardService.js';

export class DashboardController {
  static async summary(req: Request, res: Response) {
    try {
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const hasAnalytics = hasPermission(req.user!.role, 'pricing:analytics');
      const summary = await DashboardService.getSummary({ includeBuyPrice, hasAnalytics });
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
