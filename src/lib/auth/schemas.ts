import { z } from "zod";

/**
 * Client account registration — full name/email/password (Fase 2 scope,
 * extended with full_name). No `role`/`client_id` field exists here or
 * anywhere in the request body this schema validates: those are never
 * accepted from the client, by construction — see
 * /api/auth/register/route.ts, which only ever passes
 * `email`/`password`/`options.data.full_name` to Supabase Auth. The
 * profile row (with its hardcoded role='client' and full_name sourced
 * from that same auth metadata) is created entirely server-side by the
 * database trigger (0011_profiles_full_name.sql), never by anything this
 * schema lets through.
 *
 * No username/alias anywhere — the auth identifier stays the email.
 * fullName is purely a display name.
 */
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "full_name_required").max(100, "full_name_too_long"),
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
