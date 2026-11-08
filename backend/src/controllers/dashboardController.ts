import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboardService.js';

export class DashboardController {
  static async summary(req: Request, res: Response) {
    try {
      const summary = await DashboardService.getSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
