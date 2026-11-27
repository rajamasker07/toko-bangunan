import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { VariantService } from '../services/variantService.js';
import { CatalogRestructureService } from '../services/catalogRestructureService.js';
import { sendErrorResponse } from '../utils/errors.js';

export class VariantController {
  static async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id ?? '').trim();
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const variant = await VariantService.getVariantById(id, { includeBuyPrice });
      if (!variant) {
        return res.status(404).json({
          success: false,
          code: 'VARIANT_NOT_FOUND',
          message: 'Varian produk tidak ditemukan.',
        });
      }
      res.json({ success: true, data: variant });
    } catch (error: unknown) {
      sendErrorResponse(res, error);
    }
  }

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
      const allowBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const unit = await VariantService.addUnit(variantId, req.body, {
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowBuyPrice,
      });
      res.status(201).json({ success: true, data: unit, message: 'Satuan harga berhasil ditambahkan' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateUnit(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const allowBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const unit = await VariantService.updateUnit(id, req.body, {
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowBuyPrice,
      });
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

  static async moveVariant(req: Request, res: Response) {
    try {
      const variantId = String(req.params.id);
      const { target_product_id, new_variant_name, new_sku, source_empty_action, notes } = req.body;

      if (!target_product_id) {
        return res.status(400).json({ success: false, message: 'Produk tujuan wajib dipilih' });
      }

      const allowDeleteProduct = hasPermission(req.user!.role, 'products:delete');
      const renameMap = new_variant_name ? { [variantId]: String(new_variant_name) } : undefined;
      const skuMap = new_sku ? { [variantId]: String(new_sku) } : undefined;

      const result = await CatalogRestructureService.moveVariants({
        variant_ids: [variantId],
        target_product_id: String(target_product_id),
        rename_map: renameMap,
        sku_map: skuMap,
        source_empty_action,
        notes,
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowDeleteProduct,
      });

      res.json({ success: true, data: result, message: result.message });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async promoteVariant(req: Request, res: Response) {
    try {
      const variantId = String(req.params.id);
      const {
        new_product_name,
        new_product_sku,
        category_id,
        brand_id,
        brand,
        supplier_id,
        description,
        min_stock_alert,
        new_variant_name,
        source_empty_action,
        notes,
      } = req.body;

      if (!new_product_name || !String(new_product_name).trim()) {
        return res.status(400).json({ success: false, message: 'Nama produk baru wajib diisi' });
      }

      const allowDeleteProduct = hasPermission(req.user!.role, 'products:delete');

      const result = await CatalogRestructureService.promoteVariant({
        variant_id: variantId,
        new_product_name: String(new_product_name),
        new_product_sku,
        category_id,
        brand_id,
        brand,
        supplier_id,
        description,
        min_stock_alert,
        new_variant_name,
        source_empty_action,
        notes,
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowDeleteProduct,
      });

      res.status(201).json({ success: true, data: result, message: result.message });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async bulkUpdateAttributes(req: Request, res: Response) {
    try {
      const productId = String(req.params.productId);
      const { updates, variant_options } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, message: 'Daftar update varian tidak boleh kosong' });
      }

      const result = await VariantService.bulkUpdateAttributes(
        productId,
        updates,
        variant_options
      );

      res.json({
        success: true,
        message: `Berhasil memperbarui atribut untuk ${result.count} varian`,
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
