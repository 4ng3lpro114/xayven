import { describe, it, expect, vi, beforeEach } from "vitest";

const isClientAuthConfiguredMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/auth/supabaseServer", () => ({
  isClientAuthConfigured: () => isClientAuthConfiguredMock(),
  createSupabaseServerClient: async () => ({
    auth: { signOut: signOutMock },
  }),
}));

import { POST } from "../route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    isClientAuthConfiguredMock.mockReset();
    signOutMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
    signOutMock.mockResolvedValue({ error: null });
  });

  it("destruye la sesión y responde ok:true", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("no configurado → 503", async () => {
    isClientAuthConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
