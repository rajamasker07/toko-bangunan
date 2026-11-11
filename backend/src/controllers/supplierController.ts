import { Request, Response } from 'express';
import { SupplierService } from '../services/supplierService.js';

export class SupplierController {
  // ==========================================
  // SUPPLIERS
  // ==========================================

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

  // ==========================================
  // SALES REPRESENTATIVES
  // ==========================================

  static async listSales(req: Request, res: Response) {
    try {
      const supplierId = String(req.params.supplierId);
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const sales = await SupplierService.getSalesBySupplier(supplierId, isActive);
      res.json({ success: true, data: sales });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getSalesById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const sales = await SupplierService.getSalesById(id);
      if (!sales) {
        return res.status(404).json({ success: false, message: 'Data sales tidak ditemukan' });
      }
      res.json({ success: true, data: sales });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async createSales(req: Request, res: Response) {
    try {
      const supplierId = String(req.params.supplierId);
      const { name, email, is_active, phones, notes } = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nama sales wajib diisi' });
      }

      const sales = await SupplierService.createSales(supplierId, {
        name,
        email,
        is_active,
        phones,
        notes,
      });

      res.status(201).json({
        success: true,
        data: sales,
        message: `Sales "${sales.name}" berhasil ditambahkan`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateSales(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const sales = await SupplierService.updateSales(id, req.body);
      if (!sales) {
        return res.status(404).json({ success: false, message: 'Data sales tidak ditemukan' });
      }

      res.json({
        success: true,
        data: sales,
        message: `Data sales "${sales.name}" berhasil diperbarui`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async toggleSalesStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const sales = await SupplierService.toggleSalesStatus(id);
      if (!sales) {
        return res.status(404).json({ success: false, message: 'Data sales tidak ditemukan' });
      }

      const statusText = sales.is_active ? 'diaktifkan' : 'dinonaktifkan';
      res.json({
        success: true,
        data: sales,
        message: `Status sales "${sales.name}" berhasil ${statusText}`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteSales(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const sales = await SupplierService.deleteSales(id);
      if (!sales) {
        return res.status(404).json({ success: false, message: 'Data sales tidak ditemukan' });
      }

      res.json({
        success: true,
        message: `Sales "${sales.name}" berhasil dihapus`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
