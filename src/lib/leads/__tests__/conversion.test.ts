import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { convertConversationToClient, LeadConversionError } from "@/lib/leads/conversion";
import { changeLeadStatus } from "@/lib/leads/leadStatus";
import {
  getOrCreateConversation,
  saveConversation,
  getConversationById,
  listLeadStatusHistory,
  deleteConversation,
} from "@/lib/db/conversationStore";
import { createClientOrGetExisting } from "@/lib/db/paymentsStore";
import type { Conversation } from "@/lib/db/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// both conversationStore.ts and paymentsStore.ts transparently use their
// in-memory fallback — real (if ephemeral) read/write round-trips through
// the actual store functions, not mocks. Same pattern as
// src/lib/payments/__tests__/service.test.ts.

async function makeSeededConversation(overrides: Partial<Conversation> = {}): Promise<Conversation> {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  const base = await getOrCreateConversation(sessionId, "es");
  return saveConversation({ ...base, ...overrides });
}

describe("convertConversationToClient — happy path", () => {
  it("lead válido (nombre + email + teléfono) → crea el cliente con los datos correctos", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Juan",
      visitorEmail: "juan@email.com",
      visitorPhone: "3000000000",
      company: "Restaurante La Montaña",
      need: "sitio web",
      budget: "$2M-$4M",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.client.name).toBe("Juan");
    expect(result.client.email).toBe("juan@email.com");
    expect(result.client.phone).toBe("3000000000");
    expect(result.clientWasCreated).toBe(true);
    expect(result.nameDerivedFromCompany).toBe(false);
  });

  it("conversation.clientId queda vinculado al cliente creado", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Ana",
      visitorEmail: "ana@email.com",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.conversation.clientId).toBe(result.client.id);

    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.clientId).toBe(result.client.id);
  });

  it("lead_status pasa a 'client' tras la conversión", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Carlos",
      visitorEmail: "carlos@email.com",
      leadStatus: "hot",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.conversation.leadStatus).toBe("client");
  });

  it("la conversación conserva TODO el contexto que la IA capturó — nada se pierde ni se copia a clients", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Laura",
      visitorEmail: "laura@email.com",
      company: "Panadería Sol",
      website: "https://panaderiasol.com",
      projectType: "ecommerce",
      need: "vender pan online",
      goal: "aumentar ventas",
      budget: "$3M-$5M",
      urgency: "alta",
      aiSummary: "Visitante interesada en ecommerce para su panadería.",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.conversation.company).toBe("Panadería Sol");
    expect(result.conversation.website).toBe("https://panaderiasol.com");
    expect(result.conversation.projectType).toBe("ecommerce");
    expect(result.conversation.need).toBe("vender pan online");
    expect(result.conversation.goal).toBe("aumentar ventas");
    expect(result.conversation.budget).toBe("$3M-$5M");
    expect(result.conversation.urgency).toBe("alta");
    expect(result.conversation.aiSummary).toBe("Visitante interesada en ecommerce para su panadería.");

    // None of that AI-gathered context is copied over by THIS flow —
    // convertConversationToClient() never passes `company` to
    // createClientOrGetExisting(), so the resulting client's `company`
    // (a real column since 0008_clients_company.sql, populated by the
    // separate contact-request conversion flow) stays null here. `budget`/
    // `aiSummary` aren't fields on Client at all — a compile-time
    // guarantee, reinforced here at runtime.
    expect(result.client.company).toBeNull();
    expect(result.client).not.toHaveProperty("budget");
    expect(result.client).not.toHaveProperty("aiSummary");
  });
});

describe("convertConversationToClient — deduplicación por email", () => {
  it("cliente ya existente con el mismo email → no duplica, vincula al existente", async () => {
    const first = await makeSeededConversation({
      visitorName: "Pedro",
      visitorEmail: "pedro@email.com",
    });
    const firstResult = await convertConversationToClient(first.id);

    const second = await makeSeededConversation({
      visitorName: "Pedro Otra Vez",
      visitorEmail: "pedro@email.com",
    });
    const secondResult = await convertConversationToClient(second.id);

    expect(secondResult.client.id).toBe(firstResult.client.id);
    expect(secondResult.clientWasCreated).toBe(false);
  });

  it("email con mayúsculas y espacios distintos se trata como el mismo cliente", async () => {
    const first = await makeSeededConversation({
      visitorName: "María",
      visitorEmail: "maria@email.com",
    });
    const firstResult = await convertConversationToClient(first.id);

    const second = await makeSeededConversation({
      visitorName: "María (otro chat)",
      visitorEmail: "  Maria@Email.com  ",
    });
    const secondResult = await convertConversationToClient(second.id);

    expect(secondResult.client.id).toBe(firstResult.client.id);
    expect(secondResult.clientWasCreated).toBe(false);
  });
});

describe("convertConversationToClient — idempotencia", () => {
  it("convertir la misma conversación dos veces no crea un segundo cliente", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Sofía",
      visitorEmail: "sofia@email.com",
    });

    const first = await convertConversationToClient(conversation.id);
    const second = await convertConversationToClient(conversation.id);

    expect(second.client.id).toBe(first.client.id);
    expect(second.clientWasCreated).toBe(false);
  });
});

describe("convertConversationToClient — segunda escritura sobre conversación eliminada (Fase 9C)", () => {
  it("si la conversación desaparece entre las dos escrituras, la segunda escritura falla controlada — nunca se interpreta como éxito", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Valentina",
      visitorEmail: "valentina@email.com",
      leadStatus: "interested",
    });

    // Reproduce exactamente la ventana entre las dos escrituras de
    // convertConversationToClient(): la primera (leadStatus -> "client",
    // vía changeLeadStatus) ya aterrizó...
    const afterFirstWrite = await changeLeadStatus({
      conversation,
      newStatus: "client",
      changedBy: "admin",
      source: "lead_conversion",
    });
    expect(afterFirstWrite.changed).toBe(true);

    // ...y justo antes de la segunda (clientId + convertedAt), la fila
    // desaparece (borrada por otra vía, o una condición de carrera).
    await deleteConversation(conversation.id);

    // La segunda escritura, exactamente como la hace conversion.ts, debe
    // fallar de forma controlada — nunca devolver el objeto local como si
    // se hubiera persistido.
    await expect(
      saveConversation({
        ...afterFirstWrite.conversation,
        clientId: "some-client-id",
        convertedAt: new Date().toISOString(),
      })
    ).rejects.toThrow();

    expect(await getConversationById(conversation.id)).toBeNull();
  });

  it("un reintento de convertConversationToClient() tras la desaparición reporta conversation_not_found — no un éxito fantasma", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Rodrigo",
      visitorEmail: "rodrigo@email.com",
      leadStatus: "interested",
    });

    await changeLeadStatus({
      conversation,
      newStatus: "client",
      changedBy: "admin",
      source: "lead_conversion",
    });
    await deleteConversation(conversation.id);

    await expect(convertConversationToClient(conversation.id)).rejects.toMatchObject({
      code: "conversation_not_found",
    });
  });
});

describe("convertConversationToClient — historial de leadStatus (Fase 9C)", () => {
  it("conversión real (interested → client) crea exactamente 1 evento con source: 'lead_conversion' (D)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Ricardo",
      visitorEmail: "ricardo@email.com",
      leadStatus: "interested",
    });

    await convertConversationToClient(conversation.id);

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "interested",
      toStatus: "client",
      changedBy: "admin",
      source: "lead_conversion",
    });
  });

  it("doble conversión de la misma conversación → un solo evento, nunca dos (E)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Camila",
      visitorEmail: "camila@email.com",
      leadStatus: "hot",
    });

    await convertConversationToClient(conversation.id);
    await convertConversationToClient(conversation.id);

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
  });

  it("el historial y el estado final usan la misma transición — nunca divergen (O)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Julián",
      visitorEmail: "julian@email.com",
      leadStatus: "exploring",
    });

    const result = await convertConversationToClient(conversation.id);
    const history = await listLeadStatusHistory(conversation.id);

    expect(result.conversation.leadStatus).toBe("client");
    expect(history[0]!.toStatus).toBe(result.conversation.leadStatus);
    expect(history[0]!.fromStatus).toBe("exploring");
    // El evento de conversión se registra en el mismo instante en que
    // changeLeadStatus() cambia leadStatus a "client" — un paso ANTES de
    // que conversion.ts enlace clientId (deliberado, para que un fallo a
    // mitad de camino sea auto-sanable en un reintento, ver el comentario
    // en conversion.ts). Por eso este evento en particular queda con
    // clientId: null; el vínculo real sigue siendo recuperable siempre vía
    // conversation_id -> conversations.client_id (que sí queda enlazado en
    // result.conversation.clientId).
    expect(history[0]!.clientId).toBeNull();
    expect(result.conversation.clientId).toBe(result.client.id);
  });

  it("conversión real → result.historyRecorded: true, nunca se ignora el resultado del historial (P)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Mariana",
      visitorEmail: "mariana@email.com",
      leadStatus: "interested",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.historyRecorded).toBe(true);
  });

  it("segunda conversión (short-circuit idempotente, ya vinculada) → result.historyRecorded: true, sin evento nuevo (Q)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Esteban",
      visitorEmail: "esteban@email.com",
      leadStatus: "interested",
    });

    await convertConversationToClient(conversation.id);
    const second = await convertConversationToClient(conversation.id);

    expect(second.historyRecorded).toBe(true);
    // Sigue habiendo exactamente 1 evento total — el short-circuit no
    // intenta una nueva transición ni genera un segundo registro.
    expect(await listLeadStatusHistory(conversation.id)).toHaveLength(1);
  });
});

describe("convertConversationToClient — converted_at (Fase 9B)", () => {
  it("conversación que se convierte por primera vez → converted_at queda establecido", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Valentina",
      visitorEmail: "valentina@email.com",
    });
    expect(conversation.convertedAt).toBeNull();

    const before = new Date();
    const result = await convertConversationToClient(conversation.id);
    const after = new Date();

    expect(result.conversation.convertedAt).not.toBeNull();
    const convertedAt = new Date(result.conversation.convertedAt!);
    expect(convertedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(convertedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("conversión repetida → converted_at NO cambia (idempotente, nunca se sobrescribe con una fecha más nueva)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Mateo",
      visitorEmail: "mateo@email.com",
    });

    const first = await convertConversationToClient(conversation.id);
    const firstConvertedAt = first.conversation.convertedAt;
    expect(firstConvertedAt).not.toBeNull();

    // Espera real para que, si el código tuviera el bug de reescribir la
    // fecha en cada llamada, el segundo valor sea detectablemente distinto.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await convertConversationToClient(conversation.id);

    expect(second.conversation.convertedAt).toBe(firstConvertedAt);
  });

  it("conversación existente que nunca se convirtió → convertedAt permanece null (nunca se reconstruye con created_at/updated_at ni ningún otro proxy)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Sin convertir",
      visitorEmail: null,
    });

    expect(conversation.convertedAt).toBeNull();
    expect(conversation.createdAt).not.toBeNull();
    // El propio hecho de que createdAt exista no debe usarse jamás como
    // sustituto de convertedAt — se verifica que siguen siendo campos
    // independientes.
  });

  it("clientId y leadStatus se establecen en la MISMA operación que converted_at, nunca por separado", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Nicolás",
      visitorEmail: "nicolas@email.com",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.conversation.clientId).toBe(result.client.id);
    expect(result.conversation.leadStatus).toBe("client");
    expect(result.conversation.convertedAt).not.toBeNull();
  });
});

describe("convertConversationToClient — datos incompletos", () => {
  it("falta el email → error controlado, sin crear ni vincular nada", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Sin Email",
      visitorEmail: null,
    });

    await expect(convertConversationToClient(conversation.id)).rejects.toThrow(LeadConversionError);

    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.clientId).toBeNull();
    expect(reloaded?.leadStatus).not.toBe("client");
  });

  it("falta el email → el código de error es 'missing_email'", async () => {
    const conversation = await makeSeededConversation({ visitorEmail: null });

    await expect(convertConversationToClient(conversation.id)).rejects.toMatchObject({
      code: "missing_email",
    });
  });

  it("falta el nombre pero existe company → se usa company, marcado como derivado", async () => {
    const conversation = await makeSeededConversation({
      visitorName: null,
      visitorEmail: "contacto@tienda.com",
      company: "Tienda XYZ",
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.client.name).toBe("Tienda XYZ");
    expect(result.nameDerivedFromCompany).toBe(true);
  });

  it("faltan nombre y company → error controlado", async () => {
    const conversation = await makeSeededConversation({
      visitorName: null,
      company: null,
      visitorEmail: "anonimo@email.com",
    });

    await expect(convertConversationToClient(conversation.id)).rejects.toMatchObject({
      code: "missing_name_and_company",
    });
  });

  it("conversación inexistente → error controlado", async () => {
    await expect(convertConversationToClient("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject(
      { code: "conversation_not_found" }
    );
  });
});

describe("convertConversationToClient — is_commercial (0012_clients_is_commercial.sql)", () => {
  it("cliente creado por primera vez en esta conversión → isCommercial true (createClientOrGetExisting default)", async () => {
    const conversation = await makeSeededConversation({
      visitorName: "Nuevo Lead",
      visitorEmail: `lead-${Date.now()}@example.com`,
    });

    const result = await convertConversationToClient(conversation.id);

    expect(result.clientWasCreated).toBe(true);
    expect(result.client.isCommercial).toBe(true);
  });

  it("email ya tenía una cuenta XAYVEN sin cliente comercial (isCommercial=false) → Lead → Cliente lo promueve a true", async () => {
    const email = `cuenta-${Date.now()}@example.com`;
    const accountOnlyClient = await createClientOrGetExisting({
      name: "Cuenta previa",
      email,
      isCommercial: false,
    });
    expect(accountOnlyClient.client.isCommercial).toBe(false);

    const conversation = await makeSeededConversation({
      visitorName: "El mismo visitante",
      visitorEmail: email,
    });

    const result = await convertConversationToClient(conversation.id);

    // Reutiliza la misma fila (no duplica) y la promueve.
    expect(result.client.id).toBe(accountOnlyClient.client.id);
    expect(result.clientWasCreated).toBe(false);
    expect(result.client.isCommercial).toBe(true);
  });
});
