import type { Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { sendErrorResponse } from '../utils/errors.js';
import {
  changePasswordSchema,
  formatZodError,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from '../validators/authValidator.js';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const result = await AuthService.login(parsed.data.identifier, parsed.data.password, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      res.json({
        success: true,
        message: 'Login berhasil',
        data: result,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const parsed = refreshTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const result = await AuthService.refresh(parsed.data.refresh_token);
      res.json({
        success: true,
        message: 'Sesi berhasil diperbarui',
        data: result,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      await AuthService.logout(req.user!.session_id);
      res.json({ success: true, message: 'Logout berhasil' });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      await AuthService.logoutAll(req.user!.id);
      res.json({
        success: true,
        message: 'Seluruh sesi perangkat berhasil dihentikan',
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async me(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.getMe(req.user!.id);
      res.json({ success: true, data: result });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const user = await AuthService.updateProfile(req.user!.id, parsed.data);
      res.json({
        success: true,
        message: 'Profil berhasil diperbarui',
        data: user,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: formatZodError(parsed.error) });
        return;
      }

      const result = await AuthService.changePassword(
        req.user!.id,
        req.user!.session_id,
        parsed.data,
        {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip || req.socket.remoteAddress,
        }
      );

      res.json({
        success: true,
        message: 'Password berhasil diperbarui',
        data: result,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  }
}
