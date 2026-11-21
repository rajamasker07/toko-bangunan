import { Request, Response } from 'express';
import { hasPermission } from '../config/rbac.js';
import { ProductService } from '../services/productService.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { CatalogRestructureService } from '../services/catalogRestructureService.js';

export class ProductController {
  static async list(req: Request, res: Response) {
    try {
      const search = req.query.search as string;
      const categoryId = req.query.categoryId as string;
      const brand = req.query.brand as string;
      const stockStatus = req.query.stockStatus as any;
      const saleStatus = req.query.saleStatus as any;
      const mode = (req.query.mode || req.query.searchMode) as any;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;

      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const products = await ProductService.getProducts(
        { search, searchMode: mode, categoryId, brand, stockStatus, saleStatus, limit, offset, minScore },
        { includeBuyPrice }
      );
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getEmbeddingStatus(req: Request, res: Response) {
    try {
      const status = await EmbeddingService.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async reindexEmbeddings(req: Request, res: Response) {
    try {
      const force = req.body?.force === true || req.query?.force === 'true';
      const result = await EmbeddingService.reindexAllProducts({ force });
      res.json({
        success: true,
        data: result,
        message: `Sinkronisasi AI selesai: ${result.indexed} produk diindeks (${result.errors} gagal).`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const product = await ProductService.getProductById(id, { includeBuyPrice });
      if (!product) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      }
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Nama produk wajib diisi' });
      }
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const product = await ProductService.createProduct(req.body, {
        userId: req.user!.id,
        createdBy: req.user!.full_name,
        allowBuyPrice: includeBuyPrice,
      });
      res.status(201).json({ success: true, data: product, message: 'Produk berhasil dibuat' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const product = await ProductService.updateProduct(id, req.body, { includeBuyPrice });
      res.json({ success: true, data: product, message: 'Produk berhasil diperbarui' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await ProductService.deleteProduct(id);
      res.json({ success: true, message: 'Produk berhasil dihapus' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async toggleStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const includeBuyPrice = hasPermission(req.user!.role, 'products:view_buy_price');
      const product = await ProductService.toggleProductStatus(id, { includeBuyPrice });
      res.json({
        success: true,
        data: product,
        message: `Status produk berhasil diubah menjadi ${product.is_active ? 'Masih Dijual' : 'Sudah Tidak Dijual'}`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async moveVariants(req: Request, res: Response) {
    try {
      const sourceProductId = String(req.params.id);
      const { variant_ids, target_product_id, rename_map, sku_map, source_empty_action, notes } = req.body;

      if (!target_product_id) {
        return res.status(400).json({ success: false, message: 'Produk tujuan wajib dipilih' });
      }
      if (!Array.isArray(variant_ids) || variant_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Pilih minimal satu varian untuk dipindahkan' });
      }

      const allowDeleteProduct = hasPermission(req.user!.role, 'products:delete');

      const result = await CatalogRestructureService.moveVariants({
        source_product_id: sourceProductId,
        variant_ids,
        target_product_id: String(target_product_id),
        rename_map,
        sku_map,
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

  static async mergeProduct(req: Request, res: Response) {
    try {
      const sourceProductId = String(req.params.id);
      const { target_product_id, rename_map, sku_map, source_empty_action, notes } = req.body;

      if (!target_product_id) {
        return res.status(400).json({ success: false, message: 'Produk tujuan wajib dipilih' });
      }

      const allowDeleteProduct = hasPermission(req.user!.role, 'products:delete');

      const result = await CatalogRestructureService.mergeProduct({
        source_product_id: sourceProductId,
        target_product_id: String(target_product_id),
        rename_map,
        sku_map,
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
}
