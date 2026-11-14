import type { Request, Response } from 'express';
import { UserService } from '../services/userService.js';
import { sendErrorResponse } from '../utils/errors.js';
import { formatZodError } from '../validators/authValidator.js';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../validators/userValidator.js';

export class UserController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pageRaw = req.query.page !== undefined ? parseInt(String(req.query.page), 10) : undefined;
      const limitRaw = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 10;
      const offsetRaw =
        req.query.offset !== undefined ? parseInt(String(req.query.offset), 10) : undefined;

      const result = await UserService.listUsers({
        search: req.query.search ? String(req.query.search) : undefined,
        role: req.query.role ? String(req.query.role) : undefined,
        isActive: req.query.isActive ? String(req.query.isActive) : undefined,
        page: pageRaw !== undefined && !Number.isNaN(pageRaw) ? pageRaw : undefined,
        limit: !Number.isNaN(limitRaw) ? limitRaw : 10,
        offset: offsetRaw !== undefined && !Number.isNaN(offsetRaw) ? offsetRaw : undefined,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserService.getById(String(req.params.id));
      res.json({ success: true, data: user });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const user = await UserService.createUser(req.user!, parsed.data);
      res.status(201).json({
        success: true,
        message: `Pengguna "${user.full_name}" berhasil ditambahkan`,
        data: user,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const user = await UserService.updateUser(
        req.user!,
        String(req.params.id),
        parsed.data
      );
      res.json({
        success: true,
        message: `Data pengguna "${user.full_name}" berhasil diperbarui`,
        data: user,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserService.toggleStatus(req.user!, String(req.params.id));
      const statusText = user.is_active ? 'diaktifkan' : 'dinonaktifkan';
      res.json({
        success: true,
        message: `Akun "${user.full_name}" berhasil ${statusText}`,
        data: user,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const user = await UserService.resetPassword(
        req.user!,
        String(req.params.id),
        parsed.data
      );
      res.json({
        success: true,
        message: `Password untuk "${user.full_name}" berhasil direset`,
        data: user,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const deleted = await UserService.deleteUser(req.user!, String(req.params.id));
      res.json({
        success: true,
        message: `Pengguna "${deleted.full_name}" berhasil dihapus`,
        data: deleted,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }
}
