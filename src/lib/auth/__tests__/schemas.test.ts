import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/lib/auth/schemas";

describe("registerSchema", () => {
  it("registro válido pasa", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(true);
  });

  it("email inválido falla", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "not-an-email",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(false);
  });

  it("contraseñas diferentes falla, con el código passwords_dont_match", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "otracosa123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "passwords_dont_match")).toBe(true);
    }
  });

  it("contraseña demasiado corta falla", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "123",
      confirmPassword: "123",
    });
    expect(result.success).toBe(false);
  });

  it("nombre completo vacío falla", () => {
    const result = registerSchema.safeParse({
      fullName: "",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(false);
  });

  it("nombre completo solo con espacios falla (se recorta antes de validar)", () => {
    const result = registerSchema.safeParse({
      fullName: "   ",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(false);
  });

  it("nombre completo demasiado largo falla", () => {
    const result = registerSchema.safeParse({
      fullName: "A".repeat(101),
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(false);
  });

  it("recorta espacios al principio/final del nombre completo", () => {
    const result = registerSchema.safeParse({
      fullName: "  Diana Pérez  ",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("Diana Pérez");
    }
  });

  it("nunca acepta role ni client_id — el schema no tiene esos campos, se ignoran si se envían", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      role: "admin",
      client_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
      expect(result.data).not.toHaveProperty("client_id");
    }
  });

  it("normaliza el email a minúsculas y sin espacios", () => {
    const result = registerSchema.safeParse({
      fullName: "Diana Pérez",
      email: "  Diana@Example.com  ",
      password: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("diana@example.com");
    }
  });
});

describe("loginSchema", () => {
  it("login válido pasa", () => {
    const result = loginSchema.safeParse({ email: "diana@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("email inválido falla", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("contraseña vacía falla", () => {
    const result = loginSchema.safeParse({ email: "diana@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});
