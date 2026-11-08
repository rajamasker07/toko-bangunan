import { Request, Response } from 'express';
import { CategoryService } from '../services/categoryService.js';

export class CategoryController {
  static async list(req: Request, res: Response) {
    try {
      const asTree = req.query.tree === 'true';
      const categories = await CategoryService.getAllCategories(asTree);
      res.json({ success: true, data: categories });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const category = await CategoryService.getCategoryById(id);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
      }
      res.json({ success: true, data: category });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { name, parent_id, description } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
      }
      const category = await CategoryService.createCategory({ name, parent_id, description });
      res.status(201).json({ success: true, data: category, message: 'Kategori berhasil dibuat' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { name, parent_id, description } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
      }
      const category = await CategoryService.updateCategory(id, { name, parent_id, description });
      res.json({ success: true, data: category, message: 'Kategori berhasil diperbarui' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await CategoryService.deleteCategory(id);
      res.json({ success: true, message: 'Kategori berhasil dihapus' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
