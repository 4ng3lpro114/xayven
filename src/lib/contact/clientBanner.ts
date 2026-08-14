import type { ContactRequest } from "@/lib/db/types";

/**
 * Pure UI-text derivation for the "Cliente asociado" block in
 * /admin/contact-requests/[id] — kept out of the page component so it's
 * directly unit-testable (this project has no component-rendering test
 * infrastructure — see ContactForm.test.ts for the same pattern).
 *
 * Driven exclusively by `clientWasCreated` — the exact `created` value
 * createClientOrGetExisting() returned at conversion time, persisted by
 * linkContactRequestToClient() (0009_contact_requests_client_was_created.sql).
 * Never inferred from created_at/IDs/anything else. `null` is its own
 * honest "unknown" state (requests converted before this column existed),
 * not guessed into true/false.
 */
export interface ContactRequestClientBanner {
  title: "Cliente creado" | "Cliente ya existente" | "Cliente asociado";
  explanation: string | null;
}

export function deriveContactRequestClientBanner(
  clientWasCreated: ContactRequest["clientWasCreated"]
): ContactRequestClientBanner {
  if (clientWasCreated === true) {
    return { title: "Cliente creado", explanation: null };
  }
  if (clientWasCreated === false) {
    return {
      title: "Cliente ya existente",
      explanation:
        "Esta solicitud se vinculó con un cliente que ya estaba registrado en XAYVEN para evitar crear un duplicado.",
    };
  }
  return { title: "Cliente asociado", explanation: null };
}
