import { z } from "zod";

/**
 * Client account registration — email/password only (Fase 2 scope). No
 * `role`/`client_id` field exists here or anywhere in the request body
 * this schema validates: those are never accepted from the client, by
 * construction — see /api/auth/register/route.ts, which only ever passes
 * `email`/`password` to Supabase Auth. The profile row (with its
 * hardcoded role='client') is created entirely server-side by the
 * database trigger (0010_profiles.sql), never by anything this schema
 * lets through.
 */
export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwords_dont_match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
