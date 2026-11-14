import type { Request, Response } from 'express';
import { RoleService } from '../services/roleService.js';
import { sendErrorResponse } from '../utils/errors.js';
import { formatZodError } from '../validators/authValidator.js';
import {
  createRoleSchema,
  updateRoleSchema,
} from '../validators/roleValidator.js';

export class RoleController {
  static async list(_req: Request, res: Response): Promise<void> {
    try {
      const roles = await RoleService.listRoles();
      res.json({ success: true, data: roles });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async getPermissions(_req: Request, res: Response): Promise<void> {
    try {
      const data = RoleService.getPermissionCatalog();
      res.json({ success: true, data });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async getByCode(req: Request, res: Response): Promise<void> {
    try {
      const role = await RoleService.getRoleByCode(String(req.params.code));
      res.json({ success: true, data: role });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const role = await RoleService.createRole(req.user!, parsed.data as any);
      res.status(201).json({
        success: true,
        message: `Peran "${role.name}" berhasil dibuat`,
        data: role,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const role = await RoleService.updateRole(
        req.user!,
        String(req.params.code),
        parsed.data as any
      );
      res.json({
        success: true,
        message: `Peran "${role.name}" berhasil diperbarui`,
        data: role,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      await RoleService.deleteRole(req.user!, String(req.params.code));
      res.json({
        success: true,
        message: 'Peran berhasil dihapus',
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }
}
