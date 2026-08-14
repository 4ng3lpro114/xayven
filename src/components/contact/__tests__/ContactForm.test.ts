import { describe, it, expect } from "vitest";
import { deriveContactSubmitStatus } from "@/components/contact/ContactForm";

// Pure-function coverage for the exact bug this fixes: success used to be
// decided by res.ok alone, which is true even when the request was never
// persisted (e.g. HTTP 200 + {ok:true, persisted:false} — never actually
// returned by the current route, but the function must not be fooled by
// it either, since it's meant to be the single source of truth for this
// decision independent of what any particular route version returns).
describe("deriveContactSubmitStatus", () => {
  it("ok:true + persisted:true → success", () => {
    expect(deriveContactSubmitStatus({ ok: true, persisted: true, emailSent: true })).toBe("success");
  });

  it("ok:true + persisted:true + emailSent:false → success igual (el email es una notificación aparte)", () => {
    expect(deriveContactSubmitStatus({ ok: true, persisted: true, emailSent: false })).toBe("success");
  });

  it("ok:true pero persisted:false → error (nunca solo por res.ok)", () => {
    expect(deriveContactSubmitStatus({ ok: true, persisted: false })).toBe("error");
  });

  it("ok:false → error, incluso si persisted quedara true por alguna razón", () => {
    expect(deriveContactSubmitStatus({ ok: false, persisted: true })).toBe("error");
  });

  it("respuesta vacía/inesperada → error, nunca se asume éxito por defecto", () => {
    expect(deriveContactSubmitStatus({})).toBe("error");
  });
});
