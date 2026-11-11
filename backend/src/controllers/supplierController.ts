import { Request, Response } from 'express';
import { SupplierService } from '../services/supplierService.js';

export class SupplierController {
  static async list(req: Request, res: Response) {
    try {
      const search = req.query.search as string;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const suppliers = await SupplierService.getAll({ search, isActive });
      res.json({ success: true, data: suppliers });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const supplier = await SupplierService.getById(String(req.params.id));
      if (!supplier) {
        return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
      }
      res.json({ success: true, data: supplier });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name, code, contact_person, phone, email, address, city, notes, is_active } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi' });
      }

      const supplier = await SupplierService.create({
        name,
        code,
        contact_person,
        phone,
        email,
        address,
        city,
        notes,
        is_active,
      });

      res.status(201).json({
        success: true,
        data: supplier,
        message: `Supplier "${supplier.name}" berhasil ditambahkan`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const supplier = await SupplierService.update(id, req.body);
      if (!supplier) {
        return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
      }
      res.json({
        success: true,
        data: supplier,
        message: `Supplier "${supplier.name}" berhasil diperbarui`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const supplier = await SupplierService.delete(id);
      if (!supplier) {
        return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
      }
      res.json({
        success: true,
        message: `Supplier "${supplier.name}" berhasil dihapus`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
