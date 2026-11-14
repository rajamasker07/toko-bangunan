import { z } from 'zod';
import {
  fullNameSchema,
  optionalEmailSchema,
  passwordPolicySchema,
  roleSchema,
  usernameSchema,
} from './authValidator.js';

export const createUserSchema = z.object({
  username: usernameSchema,
  email: optionalEmailSchema.transform((val) => val ?? null),
  full_name: fullNameSchema,
  password: passwordPolicySchema,
  role: roleSchema,
  is_active: z.boolean().optional().default(true),
  must_change_password: z.boolean().optional().default(false),
});

export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    email: optionalEmailSchema,
    full_name: fullNameSchema.optional(),
    role: roleSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.username !== undefined ||
      data.email !== undefined ||
      data.full_name !== undefined ||
      data.role !== undefined ||
      data.is_active !== undefined,
    { message: 'Minimal satu field pengguna harus dikirim untuk diperbarui' }
  );

export const resetPasswordSchema = z.object({
  new_password: passwordPolicySchema,
  force_change_on_login: z.boolean().optional().default(true),
});
