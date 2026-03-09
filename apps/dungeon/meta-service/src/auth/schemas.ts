import { z } from 'zod';

export const RegisterBodySchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

export const LoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const AdminResetPasswordBodySchema = z.object({
  targetUsername: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;
export type LoginBody = z.infer<typeof LoginBodySchema>;
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;
export type AdminResetPasswordBody = z.infer<typeof AdminResetPasswordBodySchema>;
