import { Request, Response } from 'express';
import { BrandService, DuplicateBrandError } from '../services/brandService.js';

export class BrandController {
  static async list(_req: Request, res: Response) {
    try {
      const brands = await BrandService.getAll();
      res.json({ success: true, data: brands });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Buat merek baru. Jika merek dengan nama setara sudah ada,
   * TIDAK membuat duplikat — mengembalikan data yang sudah ada (created: false).
   */
  static async create(req: Request, res: Response) {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nama merek wajib diisi' });
      }
      const { brand, created } = await BrandService.findOrCreate(String(name));
      res.status(created ? 201 : 200).json({
        success: true,
        data: { brand, created },
        message: created
          ? `Merek "${brand.name}" berhasil ditambahkan`
          : `Merek "${brand.name}" sudah terdaftar, menggunakan data yang ada`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const brand = await BrandService.update(String(req.params.id), String(req.body.name || ''));
      if (!brand) return res.status(404).json({ success: false, message: 'Merek tidak ditemukan' });
      res.json({ success: true, data: brand, message: 'Merek berhasil diperbarui' });
    } catch (error: any) {
      if (error instanceof DuplicateBrandError) {
        return res.status(409).json({ success: false, message: error.message, data: error.existing });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const brand = await BrandService.delete(String(req.params.id));
      if (!brand) return res.status(404).json({ success: false, message: 'Merek tidak ditemukan' });
      res.json({ success: true, message: 'Merek berhasil dihapus' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
