import { z } from 'zod';
import { ALL_PERMISSIONS } from '../types/auth.js';

export const ROLE_BADGE_COLORS = [
  'purple',
  'blue',
  'amber',
  'emerald',
  'rose',
  'indigo',
  'cyan',
  'slate',
] as const;

export const createRoleSchema = z.object({
  code: z
    .string({ required_error: 'Kode peran wajib diisi' })
    .trim()
    .toLowerCase()
    .min(2, 'Kode peran minimal 2 karakter')
    .max(50, 'Kode peran maksimal 50 karakter')
    .regex(
      /^[a-z0-9_-]+$/,
      'Kode peran hanya boleh mengandung huruf kecil, angka, underscore (_), atau strip (-)'
    ),
  name: z
    .string({ required_error: 'Nama peran wajib diisi' })
    .trim()
    .min(2, 'Nama peran minimal 2 karakter')
    .max(100, 'Nama peran maksimal 100 karakter'),
  short_name: z
    .string({ required_error: 'Nama singkat peran wajib diisi' })
    .trim()
    .min(2, 'Nama singkat peran minimal 2 karakter')
    .max(50, 'Nama singkat peran maksimal 50 karakter'),
  description: z.string().trim().max(500, 'Deskripsi maksimal 500 karakter').optional().nullable(),
  badge_color: z.enum(ROLE_BADGE_COLORS).optional().default('slate'),
  hierarchy_level: z
    .number({ invalid_type_error: 'Level hierarki harus berupa angka' })
    .int('Level hierarki harus berupa bilangan bulat')
    .min(1, 'Level hierarki minimal 1')
    .max(99, 'Level hierarki maksimal 99')
    .optional()
    .default(10),
  permissions: z
    .array(
      z.string().refine((p) => (ALL_PERMISSIONS as readonly string[]).includes(p), {
        message: 'Hak akses tidak valid',
      })
    )
    .default([]),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama peran minimal 2 karakter').max(100, 'Nama peran maksimal 100 karakter').optional(),
    short_name: z.string().trim().min(2, 'Nama singkat peran minimal 2 karakter').max(50, 'Nama singkat peran maksimal 50 karakter').optional(),
    description: z.string().trim().max(500, 'Deskripsi maksimal 500 karakter').optional().nullable(),
    badge_color: z.enum(ROLE_BADGE_COLORS).optional(),
    hierarchy_level: z
      .number({ invalid_type_error: 'Level hierarki harus berupa angka' })
      .int('Level hierarki harus berupa bilangan bulat')
      .min(1, 'Level hierarki minimal 1')
      .max(99, 'Level hierarki maksimal 99')
      .optional(),
    permissions: z
      .array(
        z.string().refine((p) => (ALL_PERMISSIONS as readonly string[]).includes(p), {
          message: 'Hak akses tidak valid',
        })
      )
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.short_name !== undefined ||
      data.description !== undefined ||
      data.badge_color !== undefined ||
      data.hierarchy_level !== undefined ||
      data.permissions !== undefined,
    { message: 'Minimal satu field peran harus dikirim untuk diperbarui' }
  );
