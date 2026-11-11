import { Request, Response } from 'express';
import { UnitService } from '../services/unitService.js';

export class UnitController {
  static async list(_req: Request, res: Response) {
    try {
      const units = await UnitService.getAll();
      res.json({ success: true, data: units });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name, description } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nama satuan wajib diisi' });
      }

      const { unit, created } = await UnitService.findOrCreate(String(name), description);
      res.status(created ? 201 : 200).json({
        success: true,
        data: { unit, created },
        message: created
          ? `Satuan "${unit.name}" berhasil ditambahkan`
          : `Satuan "${unit.name}" sudah ada dalam daftar`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
