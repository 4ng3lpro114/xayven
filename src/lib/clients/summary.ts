import type { Conversation, ContactRequest, LeadStatus } from "@/lib/db/types";
import type { Client, Payment, Project } from "@/lib/payments/types";
import { pendingAmount as computePendingAmount } from "@/lib/payments/types";
import { classifyClientImportance, type ClientImportance } from "@/lib/clients/importance";

/**
 * Client summary aggregation (Fase 5C, Etapa 1) — pure, no I/O, no
 * Supabase. Receives data already loaded elsewhere (bulk-fetched once,
 * see /admin/clients/page.tsx) and reduces it into one summary per
 * client, entirely in memory. This is deliberately the same "bulk fetch +
 * in-memory reduce" technique /admin/projects/page.tsx already uses
 * (listProjects() + listClients() cross-referenced via a Map) — not a new
 * pattern, and specifically NOT one query per client.
 */

/** Amounts keyed by ISO currency code — NEVER summed across currencies.
 *  A client with a COP project and a USD project keeps two separate
 *  entries, e.g. `{ COP: 3000000, USD: 500 }`, never a single mixed
 *  number. See the module-level note in classifyClientImportance for why
 *  currency-correctness matters throughout this feature. */
export type MoneyByCurrency = Record<string, number>;

export interface ClientSummary {
  clientId: string;
  conversationsCount: number;
  projectsCount: number;
  paidAmount: MoneyByCurrency;
  pendingAmount: MoneyByCurrency;
  /** ISO timestamp of the most recent conversation/project/payment update
   *  touching this client, or null if the client has no activity at all
   *  (a client with only a `clients` row and nothing else). */
  latestActivity: string | null;
  /** From the client's most recently *updated* conversation — see the
   *  "most recent wins" criterion documented on pickRelevantConversation
   *  below. Falls back to "client" when the client has no conversation at
   *  all but WAS reached through a converted Solicitud ("Agregar
   *  cliente") — see the `contactRequests` param below. Still null only
   *  when neither signal exists. This never writes anything anywhere
   *  (still no second status system — conversations.lead_status and
   *  lead_status_history are untouched); it's purely a read-time fallback
   *  in this one aggregation function so both conversion paths render the
   *  same "Cliente" badge. */
  leadStatus: LeadStatus | null;
  leadScore: number | null;
  hasProjects: boolean;
  hasPayments: boolean;
  importance: ClientImportance;
}

function groupById<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * Documented criterion (Etapa 1 explicitly requires one): the client's
 * CURRENT interest level is represented by their most recently *updated*
 * conversation, not the highest-scoring one ever — a client who was "hot"
 * six months ago but has gone quiet since shouldn't still read as "hot"
 * today. If a client has multiple conversations, only the most recently
 * updated one contributes leadStatus/leadScore to the summary.
 */
function pickRelevantConversation(conversations: Conversation[]): Conversation | null {
  if (conversations.length === 0) return null;
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
}

function addAmount(totals: MoneyByCurrency, currency: string, amount: number): void {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

function latestTimestamp(timestamps: string[]): string | null {
  if (timestamps.length === 0) return null;
  return timestamps.reduce((latest, current) => (current > latest ? current : latest));
}

export function buildClientSummaries(params: {
  clients: Client[];
  conversations: Conversation[];
  projects: Project[];
  payments: Payment[];
  /**
   * Optional — omitted callers (existing tests, statistics/aggregate.ts)
   * keep today's exact behavior (leadStatus derived only from
   * conversations). Only requests with status "converted" and a real
   * clientId contribute; see `convertedContactRequestClientIds` below.
   */
  contactRequests?: ContactRequest[];
}): Map<string, ClientSummary> {
  const conversationsByClient = groupById(
    params.conversations.filter((c) => c.clientId !== null),
    (c) => c.clientId!
  );
  const projectsByClient = groupById(params.projects, (p) => p.clientId);
  const paymentsByClient = groupById(params.payments, (p) => p.clientId);

  // Solicitud → Cliente never creates/touches a conversation, so a client
  // reached only through that path has no relevantConversation and would
  // otherwise render "—" in the Estado column while a Conversación →
  // Cliente client of equal standing shows "Cliente" — same underlying
  // fact ("this person is a client"), just discovered through a
  // different intake channel. This is read-only: it doesn't write to
  // conversations.lead_status or lead_status_history (changeLeadStatus()
  // remains the only writer of both, untouched), it's just a second valid
  // signal this one aggregation function already knows how to read.
  const convertedContactRequestClientIds = new Set(
    (params.contactRequests ?? [])
      .filter((r) => r.status === "converted" && r.clientId !== null)
      .map((r) => r.clientId!)
  );

  const summaries = new Map<string, ClientSummary>();

  for (const client of params.clients) {
    const clientConversations = conversationsByClient.get(client.id) ?? [];
    const clientProjects = projectsByClient.get(client.id) ?? [];
    const clientPayments = paymentsByClient.get(client.id) ?? [];

    const relevantConversation = pickRelevantConversation(clientConversations);

    const paidAmount: MoneyByCurrency = {};
    const pendingAmount: MoneyByCurrency = {};
    for (const project of clientProjects) {
      addAmount(paidAmount, project.currency, project.paidAmount);
      addAmount(pendingAmount, project.currency, computePendingAmount(project));
    }

    const latestActivity = latestTimestamp([
      ...clientConversations.map((c) => c.updatedAt),
      ...clientProjects.map((p) => p.updatedAt),
      ...clientPayments.map((p) => p.updatedAt),
    ]);

    const hasProjects = clientProjects.length > 0;
    const hasPayments = clientPayments.length > 0;

    const leadStatus: LeadStatus | null =
      relevantConversation?.leadStatus ?? (convertedContactRequestClientIds.has(client.id) ? "client" : null);

    const importance = classifyClientImportance({
      leadScore: relevantConversation?.leadScore ?? null,
      leadStatus,
      projects: clientProjects,
      hasPayments,
    });

    summaries.set(client.id, {
      clientId: client.id,
      conversationsCount: clientConversations.length,
      projectsCount: clientProjects.length,
      paidAmount,
      pendingAmount,
      latestActivity,
      leadStatus,
      leadScore: relevantConversation?.leadScore ?? null,
      hasProjects,
      hasPayments,
      importance,
    });
  }

  return summaries;
}
