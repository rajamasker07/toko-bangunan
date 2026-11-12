import { Request, Response } from 'express';
import { ProductService } from '../services/productService.js';

export class ProductController {
  static async list(req: Request, res: Response) {
    try {
      const search = req.query.search as string;
      const categoryId = req.query.categoryId as string;
      const brand = req.query.brand as string;
      const stockStatus = req.query.stockStatus as any;
      const saleStatus = req.query.saleStatus as any;
      const products = await ProductService.getProducts({ search, categoryId, brand, stockStatus, saleStatus });
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const product = await ProductService.getProductById(id);
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
      const product = await ProductService.createProduct(req.body);
      res.status(201).json({ success: true, data: product, message: 'Produk berhasil dibuat' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const product = await ProductService.updateProduct(id, req.body);
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
      const product = await ProductService.toggleProductStatus(id);
      res.json({
        success: true,
        data: product,
        message: `Status produk berhasil diubah menjadi ${product.is_active ? 'Masih Dijual' : 'Sudah Tidak Dijual'}`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
