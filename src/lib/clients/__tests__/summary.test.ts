import { describe, it, expect } from "vitest";
import { buildClientSummaries } from "@/lib/clients/summary";
import {
  createClient as createPaymentsClient,
  createProject as createPaymentsProject,
  markClientAsCommercial,
  markClientAsNonCommercial,
} from "@/lib/db/paymentsStore";
import type { Conversation, ContactRequest } from "@/lib/db/types";
import type { Client, Payment, Project } from "@/lib/payments/types";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "Cliente de prueba",
    email: "cliente@example.com",
    phone: null,
    company: null,
    isCommercial: true,
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    sessionId: "session-1",
    locale: "es",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    messages: [],
    clientId: "client-1",
    convertedAt: null,
    visitorName: null,
    visitorEmail: null,
    visitorPhone: null,
    company: null,
    website: null,
    projectType: null,
    need: null,
    goal: null,
    budget: null,
    urgency: null,
    leadScore: 0,
    leadStatus: "exploring",
    aiSummary: null,
    consentStatus: "pending",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    clientId: "client-1",
    name: "Proyecto de prueba",
    status: "awaiting_payment",
    currency: "COP",
    totalAmount: 1000000,
    paidAmount: 0,
    portalToken: "token-1",
    ...overrides,
  };
}

function makeContactRequest(overrides: Partial<ContactRequest> = {}): ContactRequest {
  return {
    id: "request-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Diana",
    email: "diana@example.com",
    company: null,
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito ayuda con mi proyecto.",
    status: "converted",
    clientId: "client-1",
    clientWasCreated: true,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project-1",
    clientId: "client-1",
    provider: "WOMPI",
    providerTransactionId: null,
    reference: "REF-1",
    amount: 500000,
    currency: "COP",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

describe("buildClientSummaries", () => {
  it("cliente sin ninguna relación → conteos en 0, importance normal, latestActivity null", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(0);
    expect(summary.projectsCount).toBe(0);
    expect(summary.hasProjects).toBe(false);
    expect(summary.hasPayments).toBe(false);
    expect(summary.leadStatus).toBeNull();
    expect(summary.leadScore).toBeNull();
    expect(summary.latestActivity).toBeNull();
    expect(summary.importance).toBe("normal");
  });

  it("varias conversaciones → leadStatus/leadScore vienen de la más reciente (por updatedAt), no la primera ni la de score más alto", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [
        makeConversation({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z", leadScore: 90, leadStatus: "hot" }),
        makeConversation({ id: "new", updatedAt: "2026-06-01T00:00:00.000Z", leadScore: 10, leadStatus: "exploring" }),
      ],
      projects: [],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(2);
    expect(summary.leadStatus).toBe("exploring");
    expect(summary.leadScore).toBe(10);
  });

  it("múltiples monedas NUNCA se suman — quedan separadas por currency", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [
        makeProject({ id: "p-cop", currency: "COP", totalAmount: 3_000_000, paidAmount: 3_000_000 }),
        makeProject({ id: "p-usd", currency: "USD", totalAmount: 1000, paidAmount: 500 }),
      ],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.paidAmount).toEqual({ COP: 3_000_000, USD: 500 });
    expect(summary.pendingAmount).toEqual({ COP: 0, USD: 500 });
    // Explícitamente NO debe existir una suma cruzada tipo 3.000.500.
    expect(Object.values(summary.paidAmount)).not.toContain(3_000_500);
  });

  it("última actividad correcta — toma el máximo entre conversaciones, proyectos y pagos", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ updatedAt: "2026-01-01T00:00:00.000Z" })],
      projects: [makeProject({ updatedAt: "2026-03-01T00:00:00.000Z" })],
      payments: [makePayment({ updatedAt: "2026-02-01T00:00:00.000Z" })],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.latestActivity).toBe("2026-03-01T00:00:00.000Z");
  });

  it("varias actividades de un mismo tipo se cuentan todas", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ id: "c1" }), makeConversation({ id: "c2" })],
      projects: [makeProject({ id: "p1" }), makeProject({ id: "p2" }), makeProject({ id: "p3" })],
      payments: [makePayment({ id: "pay1" })],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(2);
    expect(summary.projectsCount).toBe(3);
    expect(summary.hasPayments).toBe(true);
  });

  it("cliente con pago registrado → importance protected (propagado desde classifyClientImportance)", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [makePayment()],
    });

    expect(summaries.get("client-1")!.importance).toBe("protected");
  });

  it("solo agrega datos del clientId correspondiente — no mezcla clientes distintos", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ id: "client-1" }), makeClient({ id: "client-2", email: "otro@example.com" })],
      conversations: [makeConversation({ clientId: "client-1" })],
      projects: [makeProject({ clientId: "client-2" })],
      payments: [],
    });

    expect(summaries.get("client-1")!.conversationsCount).toBe(1);
    expect(summaries.get("client-1")!.projectsCount).toBe(0);
    expect(summaries.get("client-2")!.conversationsCount).toBe(0);
    expect(summaries.get("client-2")!.projectsCount).toBe(1);
  });

  it("ignora conversaciones sin client_id (no convertidas) — nunca las cuelga del primer cliente por error", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ clientId: null })],
      projects: [],
      payments: [],
    });

    expect(summaries.get("client-1")!.conversationsCount).toBe(0);
  });
});

describe("buildClientSummaries — leadStatus derivado de Solicitud → Cliente (contactRequests)", () => {
  it("omitir contactRequests conserva el comportamiento exacto de siempre (leadStatus null sin conversación)", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
    });
    expect(summaries.get("client-1")!.leadStatus).toBeNull();
  });

  it("cliente sin conversación pero con una solicitud convertida → leadStatus 'client'", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      contactRequests: [makeContactRequest()],
    });
    expect(summaries.get("client-1")!.leadStatus).toBe("client");
  });

  it("solicitud NO convertida (status='new'/'contacted') → no influye, leadStatus sigue null", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      contactRequests: [makeContactRequest({ status: "new", clientId: null })],
    });
    expect(summaries.get("client-1")!.leadStatus).toBeNull();
  });

  it("solicitud convertida de OTRO cliente no se filtra hacia este cliente", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ id: "client-1" }), makeClient({ id: "client-2", email: "otro@example.com" })],
      conversations: [],
      projects: [],
      payments: [],
      contactRequests: [makeContactRequest({ clientId: "client-2" })],
    });
    expect(summaries.get("client-1")!.leadStatus).toBeNull();
    expect(summaries.get("client-2")!.leadStatus).toBe("client");
  });

  it("si el cliente SÍ tiene una conversación real, esta sigue mandando sobre la solicitud convertida", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ leadStatus: "hot" })],
      projects: [],
      payments: [],
      contactRequests: [makeContactRequest()],
    });
    // La conversación real es la fuente primaria — no se sobrescribe con
    // "client" solo porque también exista una solicitud convertida.
    expect(summaries.get("client-1")!.leadStatus).toBe("hot");
  });

  it("no cambia importance por sí solo — un cliente 'client' vía solicitud sin pagos/proyectos sigue 'normal'", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      contactRequests: [makeContactRequest()],
    });
    expect(summaries.get("client-1")!.importance).toBe("normal");
  });
});

describe("buildClientSummaries — hasAccount (linkedClientIds)", () => {
  it("omitir linkedClientIds conserva el comportamiento por defecto: hasAccount siempre false", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
    });
    expect(summaries.get("client-1")!.hasAccount).toBe(false);
  });

  it("client.id presente en linkedClientIds → hasAccount true", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["client-1"]),
    });
    expect(summaries.get("client-1")!.hasAccount).toBe(true);
  });

  it("client.id AUSENTE de linkedClientIds → hasAccount false, aunque el set no esté vacío", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["otro-client-id"]),
    });
    expect(summaries.get("client-1")!.hasAccount).toBe(false);
  });

  it("no mezcla clientes — el linkedClientIds de un cliente no afecta a otro", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ id: "client-1" }), makeClient({ id: "client-2", email: "otro@example.com" })],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["client-2"]),
    });
    expect(summaries.get("client-1")!.hasAccount).toBe(false);
    expect(summaries.get("client-2")!.hasAccount).toBe(true);
  });

  it("combinación cuenta + cliente + proyecto — round-trip real contra paymentsStore (in-memory), no solo objetos de prueba", async () => {
    // 1. Registro de cuenta XAYVEN — is_commercial: false, como
    //    linkAccountToClient() lo crea de verdad hoy.
    const client = await createPaymentsClient({
      name: "Camila de Prueba",
      email: `camila-${Date.now()}@example.com`,
      isCommercial: false,
    });

    let summary = buildClientSummaries({
      clients: [client],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set([client.id]),
    }).get(client.id)!;
    expect(summary).toMatchObject({ hasAccount: true, isCommercialClient: false, hasProjects: false });

    // 2. Admin pulsa "Agregar cliente" — markClientAsCommercial().
    const promoted = await markClientAsCommercial(client.id);
    expect(promoted.isCommercial).toBe(true);

    summary = buildClientSummaries({
      clients: [promoted],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set([client.id]),
    }).get(client.id)!;
    expect(summary).toMatchObject({ hasAccount: true, isCommercialClient: true, hasProjects: false });

    // 3. Se crea un proyecto real para ese cliente.
    const project = await createPaymentsProject({
      clientId: client.id,
      name: "Proyecto real",
      totalAmount: 1_000_000,
    });

    summary = buildClientSummaries({
      clients: [promoted],
      conversations: [],
      projects: [project],
      payments: [],
      linkedClientIds: new Set([client.id]),
    }).get(client.id)!;
    expect(summary).toMatchObject({
      hasAccount: true,
      isCommercialClient: true,
      hasProjects: true,
      projectsCount: 1,
    });
  });

  it("hasAccount no influye en importance — sigue derivándose solo de leadScore/leadStatus/proyectos/pagos", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["client-1"]),
    });
    expect(summaries.get("client-1")!.importance).toBe("normal");
  });
});

describe("buildClientSummaries — isCommercialClient (0012_clients_is_commercial.sql)", () => {
  it("client.isCommercial=true → isCommercialClient true (passthrough directo, sin inferencia)", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ isCommercial: true })],
      conversations: [],
      projects: [],
      payments: [],
    });
    expect(summaries.get("client-1")!.isCommercialClient).toBe(true);
  });

  it("client.isCommercial=false (cuenta XAYVEN sin cliente comercial) → isCommercialClient false, leadStatus sigue null, importance sigue 'normal'", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ isCommercial: false })],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["client-1"]),
    });
    const summary = summaries.get("client-1")!;
    expect(summary.isCommercialClient).toBe(false);
    expect(summary.hasAccount).toBe(true);
    expect(summary.leadStatus).toBeNull();
    expect(summary.importance).toBe("normal");
  });

  it("hasAccount e isCommercialClient son independientes en las 4 combinaciones posibles", () => {
    const summaries = buildClientSummaries({
      clients: [
        makeClient({ id: "solo-cuenta", isCommercial: false }),
        makeClient({ id: "solo-cliente", email: "solo-cliente@example.com", isCommercial: true }),
        makeClient({ id: "ambos", email: "ambos@example.com", isCommercial: true }),
        makeClient({ id: "ninguno", email: "ninguno@example.com", isCommercial: false }),
      ],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(["solo-cuenta", "ambos"]),
    });
    expect(summaries.get("solo-cuenta")).toMatchObject({ hasAccount: true, isCommercialClient: false });
    expect(summaries.get("solo-cliente")).toMatchObject({ hasAccount: false, isCommercialClient: true });
    expect(summaries.get("ambos")).toMatchObject({ hasAccount: true, isCommercialClient: true });
    expect(summaries.get("ninguno")).toMatchObject({ hasAccount: false, isCommercialClient: false });
  });
});

describe("ciclo Agregar cliente / Eliminar cliente para una cuenta XAYVEN (A → E → F)", () => {
  it("A: cuenta sin cliente → B/E: 'Agregar cliente' promueve → F: 'Eliminar cliente' despromueve, misma fila todo el tiempo, la cuenta nunca se pierde", async () => {
    // A. Registro de cuenta XAYVEN — is_commercial: false, como
    //    linkAccountToClient() lo crea de verdad.
    const client = await createPaymentsClient({
      name: "Cuenta de prueba",
      email: `ciclo-${Date.now()}@example.com`,
      isCommercial: false,
    });
    const linkedClientIds = new Set([client.id]); // cuenta vinculada, fija durante todo el ciclo

    let summary = buildClientSummaries({
      clients: [client],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds,
    }).get(client.id)!;
    expect(summary).toMatchObject({ hasAccount: true, isCommercialClient: false }); // A

    // E. "Agregar cliente" — misma primitiva que usa el botón real
    //    (markClientAsCommercial), nunca crea una fila nueva.
    const promoted = await markClientAsCommercial(client.id);
    expect(promoted.id).toBe(client.id);

    summary = buildClientSummaries({
      clients: [promoted],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds,
    }).get(client.id)!;
    expect(summary).toMatchObject({ hasAccount: true, isCommercialClient: true }); // B

    // F. "Eliminar cliente" para alguien CON cuenta — el endpoint real usa
    //    markClientAsNonCommercial() en vez de deleteClient(); aquí se
    //    prueba la primitiva directamente (el endpoint completo con su
    //    branching por cuenta está cubierto en
    //    api/admin/clients/[id]/__tests__/route.test.ts).
    const downgraded = await markClientAsNonCommercial(client.id);
    expect(downgraded.id).toBe(client.id); // misma fila, nunca una segunda

    summary = buildClientSummaries({
      clients: [downgraded],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds,
    }).get(client.id)!;
    expect(summary).toMatchObject({ hasAccount: true, isCommercialClient: false }); // de vuelta a A
  });

  it("C: cliente comercial SIN cuenta XAYVEN → hasAccount false, isCommercialClient true", async () => {
    const client = await createPaymentsClient({
      name: "Cliente comercial sin cuenta",
      email: `sin-cuenta-${Date.now()}@example.com`,
    }); // isCommercial default true, nunca vinculado a ningún profile

    const summary = buildClientSummaries({
      clients: [client],
      conversations: [],
      projects: [],
      payments: [],
      linkedClientIds: new Set(), // nadie vinculado
    }).get(client.id)!;

    expect(summary).toMatchObject({ hasAccount: false, isCommercialClient: true });
  });
});
