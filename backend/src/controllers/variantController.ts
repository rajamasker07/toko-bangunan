import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { VariantService } from '../services/variantService.js';

export class VariantController {
  static async addVariant(req: Request, res: Response) {
    try {
      const productId = String(req.params.productId);
      const { variant_name } = req.body;
      if (!variant_name) {
        return res.status(400).json({ success: false, message: 'Nama varian wajib diisi' });
      }
      const allowBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const variant = await VariantService.addVariant(productId, req.body, {
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowBuyPrice,
      });
      res.status(201).json({ success: true, data: variant, message: 'Varian berhasil ditambahkan' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateVariant(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const variant = await VariantService.updateVariant(id, req.body);
      res.json({ success: true, data: variant, message: 'Varian berhasil diperbarui' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteVariant(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await VariantService.deleteVariant(id);
      res.json({ success: true, message: 'Varian berhasil dihapus' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async toggleStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const variant = await VariantService.toggleVariantStatus(id);
      res.json({
        success: true,
        data: variant,
        message: `Status varian berhasil diubah menjadi ${variant.is_active ? 'Masih Dijual' : 'Sudah Tidak Dijual'}`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addUnit(req: Request, res: Response) {
    try {
      const variantId = String(req.params.variantId);
      const { unit_name, sell_price } = req.body;
      if (!unit_name || sell_price === undefined) {
        return res.status(400).json({ success: false, message: 'Nama satuan dan harga jual wajib diisi' });
      }
      const unit = await VariantService.addUnit(variantId, req.body);
      res.status(201).json({ success: true, data: unit, message: 'Satuan harga berhasil ditambahkan' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateUnit(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const unit = await VariantService.updateUnit(id, req.body);
      res.json({ success: true, data: unit, message: 'Satuan harga berhasil diperbarui' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteUnit(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await VariantService.deleteUnit(id);
      res.json({ success: true, message: 'Satuan harga berhasil dihapus' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
