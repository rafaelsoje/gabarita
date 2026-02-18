import { z } from "zod";

const passwordSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres.")
  .max(72)
  .regex(/[a-z]/, "A senha deve conter letra minúscula.")
  .regex(/[A-Z]/, "A senha deve conter letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter número.");

export const registerSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().email().trim().toLowerCase(),
  password: passwordSchema,
  phone: z.string().trim().max(30).optional(),
  birthDate: z.coerce.date().optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional()
});

export const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1).max(72)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().trim().toLowerCase()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema
});
