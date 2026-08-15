import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Mocks at the two real external boundaries this module touches:
 * next/headers' cookies() (no real Next.js request context exists in
 * Vitest) and @supabase/ssr's createServerClient() (no real Supabase
 * connection in this test environment — same "no live credentials in
 * tests" constraint every other store in this project already documents).
 * Never touches real Supabase; no test users are created anywhere.
 */
const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

const ORIGINAL_ENV = { ...process.env };

describe("getSessionUser / getCurrentProfile", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("usuario sin sesión → getSessionUser() devuelve null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { getSessionUser } = await import("@/lib/auth/supabaseServer");

    const user = await getSessionUser();
    expect(user).toBeNull();
  });

  it("usuario autenticado → getSessionUser() devuelve el usuario real", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "diana@example.com" } } });
    const { getSessionUser } = await import("@/lib/auth/supabaseServer");

    const user = await getSessionUser();
    expect(user).toEqual({ id: "u1", email: "diana@example.com" });
  });

  it("sin sesión → getCurrentProfile() devuelve null sin consultar profiles", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { getCurrentProfile } = await import("@/lib/auth/supabaseServer");

    const profile = await getCurrentProfile();
    expect(profile).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("con sesión → getCurrentProfile() devuelve role='client' y client_id=null (estado inicial creado por el trigger)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "diana@example.com" } } });
    const single = vi.fn().mockResolvedValue({
      data: { id: "u1", client_id: null, role: "client" },
    });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const { getCurrentProfile } = await import("@/lib/auth/supabaseServer");
    const profile = await getCurrentProfile();

    expect(profile).toEqual({ id: "u1", clientId: null, role: "client" });
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });
});
