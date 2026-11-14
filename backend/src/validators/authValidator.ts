import { z } from 'zod';
import { isValidRole } from '../config/rbac.js';

export const usernameSchema = z
  .string({ required_error: 'Username wajib diisi', invalid_type_error: 'Username wajib berupa string' })
  .trim()
  .toLowerCase()
  .min(3, 'Username minimal 3 karakter')
  .max(50, 'Username maksimal 50 karakter')
  .regex(
    /^[a-z0-9._-]+$/,
    'Username hanya boleh mengandung huruf kecil, angka, titik (.), underscore (_), atau strip (-)'
  );

export const fullNameSchema = z
  .string({ required_error: 'Nama lengkap wajib diisi', invalid_type_error: 'Nama lengkap wajib berupa string' })
  .trim()
  .min(2, 'Nama lengkap minimal 2 karakter')
  .max(100, 'Nama lengkap maksimal 100 karakter');

export const optionalEmailSchema = z
  .union([
    z
      .string()
      .trim()
      .toLowerCase()
      .email('Format email tidak valid')
      .max(150, 'Email maksimal 150 karakter'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    return val && val.length > 0 ? val : null;
  });

export const passwordPolicySchema = z
  .string({ required_error: 'Password wajib diisi', invalid_type_error: 'Password wajib berupa string' })
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter')
  .refine(
    (val) => /[A-Za-z]/.test(val) && /\d/.test(val),
    'Password harus mengandung minimal 1 huruf dan 1 angka'
  );

export const roleSchema = z
  .string({ required_error: 'Peran (role) wajib diisi', invalid_type_error: 'Peran (role) wajib berupa string' })
  .trim()
  .toLowerCase()
  .min(2, 'Kode peran minimal 2 karakter')
  .max(50, 'Kode peran maksimal 50 karakter')
  .refine(
    (val) => isValidRole(val),
    { message: 'Peran (role) tidak valid atau belum terdaftar dalam sistem' }
  );

export const loginSchema = z
  .object({
    identifier: z.string().trim().optional(),
    username: z.string().trim().optional(),
    password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
  })
  .transform((data) => ({
    identifier: (data.identifier || data.username || '').trim().toLowerCase(),
    password: data.password,
  }))
  .refine((data) => data.identifier.length > 0, {
    message: 'Username atau email wajib diisi',
    path: ['identifier'],
  });

export const refreshTokenSchema = z.object({
  refresh_token: z
    .string({ required_error: 'Refresh token wajib dikirim' })
    .trim()
    .min(1, 'Refresh token wajib dikirim'),
});

export const updateProfileSchema = z
  .object({
    full_name: fullNameSchema.optional(),
    email: optionalEmailSchema,
  })
  .refine((data) => data.full_name !== undefined || data.email !== undefined, {
    message: 'Minimal satu data profil (nama lengkap atau email) harus diperbarui',
  });

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ required_error: 'Password saat ini wajib diisi' })
      .min(1, 'Password saat ini wajib diisi'),
    new_password: passwordPolicySchema,
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: 'Password baru tidak boleh sama dengan password saat ini',
    path: ['new_password'],
  });

export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Data input tidak valid';
}
