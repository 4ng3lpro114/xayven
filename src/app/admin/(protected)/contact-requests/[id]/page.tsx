import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { getContactRequestById } from "@/lib/db/contactRequestStore";
import { getPricingCatalogItemById } from "@/lib/db/pricingCatalogStore";
import { getClientById } from "@/lib/db/paymentsStore";
import { buildContactRequestMailto } from "@/lib/contact/mailto";
import { deriveContactRequestClientBanner } from "@/lib/contact/clientBanner";
import { ContactRequestStatusBadge } from "@/components/admin/ContactRequestStatusBadge";
import {
  ContactRequestStatusActions,
  ContactRequestConvertClientButton,
  ContactRequestDeleteButton,
} from "@/components/admin/ContactRequestActions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const request = await getContactRequestById(id);
  if (!request) notFound();

  // Read-only lookup for display only — the actual conversion (and its own
  // error handling) lives entirely in convertContactRequestToClient()/the
  // convert-client route. If the linked client no longer exists, degrade
  // gracefully here rather than crash — the request itself must always
  // stay visible.
  const linkedClient = request.clientId ? await getClientById(request.clientId) : null;

  // Fase 2 — Pricing Core → Project Request. Read-only display only — no
  // proposal/negotiation UI yet (that's the next phase, "PROJECT
  // PROPOSALS"). `null` covers Flujo B/C (no plan selected) and every
  // request created before this column existed — same honest "no plan"
  // treatment as requestedPlanLabel() in the list page, never an error.
  const requestedPlan = request.pricingCatalogId
    ? await getPricingCatalogItemById(request.pricingCatalogId)
    : null;
  const requestedPlanLabel = requestedPlan ? requestedPlan.name : "Solicitud personalizada";

  // `request.status` is the single source of truth for "was this ever
  // converted?" — NEVER `request.clientId` alone. `client_id` gets nulled
  // by ON DELETE SET NULL if the client is later deleted (deliberately
  // kept that way — see contact_requests.client_id's doc comment — the
  // request is a historical record and must survive), but `status` stays
  // "converted" forever as the honest historical fact: this request DID
  // convert at some point, even if that client is now gone.
  //
  // Four cases, matching the authorized product decision exactly:
  //   A) status !== "converted"                              → normal actions + "Agregar cliente"
  //   B) converted, clientId set, client found                → "Cliente asociado" + "Ver cliente"
  //   C) converted, clientId null (client was deleted)         → recovery state
  //   D) converted, clientId set but getClientById() found none → recovery state (same as C)
  // C and D collapse into the same `needsRecovery` check below — from the
  // admin's perspective they're indistinguishable and need the same fix.
  const isConverted = request.status === "converted";
  const needsRecovery = isConverted && !linkedClient;

  return (
    <div>
      <Link
        href="/admin/contact-requests"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{request.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {request.company || "Sin empresa"} · {new Date(request.createdAt).toLocaleString("es-CO")}
          </p>
        </div>
        <ContactRequestStatusBadge status={request.status} />
      </div>

      {/* Acciones: responder por correo (mailto puro, no dispara nada en
         XAYVEN) siempre visible; cambio de estado manual y "Agregar
         cliente" solo antes de convertir — una vez que hay un cliente
         vinculado, ambos se reemplazan por el bloque "Cliente asociado"
         de abajo. Deliberadamente independientes entre sí — responder no
         cambia el estado automáticamente, ver el doc comment de
         ContactRequestActions.tsx. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {request.email ? (
          <a
            href={buildContactRequestMailto(request.email)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent"
          >
            <Mail className="size-4" aria-hidden="true" />
            Responder por correo
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-subtle opacity-50"
          >
            <Mail className="size-4" aria-hidden="true" />
            Responder por correo
          </span>
        )}
        {/* Caso A: nunca convertida — acciones normales. Caso C/D: convertida
           pero sin cliente localizable — el mismo flujo de conversión sirve
           para recuperar el vínculo, solo cambia la etiqueta del botón. */}
        {!isConverted && (
          <>
            <ContactRequestStatusActions request={request} />
            <ContactRequestConvertClientButton contactRequestId={request.id} />
          </>
        )}
        {needsRecovery && (
          <ContactRequestConvertClientButton
            contactRequestId={request.id}
            label="Agregar cliente nuevamente"
          />
        )}
      </div>

      {/* "Eliminar solicitud" — separado del resto de acciones por ser
         destructivo, mismo patrón visual de dos pasos (armar → confirmar)
         que ClientActions/ConversationActions. Siempre disponible,
         independientemente del estado: borrar la solicitud nunca toca al
         cliente vinculado (si existe) — ver el doc comment de la ruta
         DELETE correspondiente. */}
      <div className="mt-4">
        <ContactRequestDeleteButton contactRequestId={request.id} />
      </div>

      {/* Caso B: convertida y el cliente sigue existiendo. El encabezado
         (y, para el caso "reutilizado", el texto explicativo) dependen de
         request.clientWasCreated — el valor exacto que
         createClientOrGetExisting() devolvió en el momento de ESTA
         conversión, persistido junto con client_id/status (ver
         linkContactRequestToClient()). Nunca se infiere de fechas/IDs:
         `null` es su propio estado honesto ("no lo sabemos" — solicitudes
         convertidas antes de que esta columna existiera), no un tercer
         valor a adivinar. */}
      {isConverted &&
        linkedClient &&
        (() => {
          const banner = deriveContactRequestClientBanner(request.clientWasCreated);
          return (
            <div className="mt-4 rounded-lg border border-border-accent bg-bg-raised p-4">
              <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.1em] text-accent-300">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {banner.title}
              </p>
              {banner.explanation && <p className="mt-2 text-sm text-fg-subtle">{banner.explanation}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-fg">
                    {linkedClient.name}
                    {linkedClient.company && (
                      <span className="text-fg-muted"> — {linkedClient.company}</span>
                    )}
                  </p>
                  <p className="text-xs text-fg-subtle">{linkedClient.email}</p>
                </div>
                <Link
                  href={`/admin/clients/${linkedClient.id}`}
                  className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
                >
                  Ver cliente
                </Link>
              </div>
            </div>
          );
        })()}

      {/* Caso C/D: convertida, pero el cliente ya no se puede localizar
         (eliminado después de la conversión, o cualquier otro motivo por
         el que getClientById() no lo encuentre). El estado histórico
         "converted" se conserva a propósito — nunca se revierte
         automáticamente a "new"/"contacted" — el botón de arriba permite
         recuperarlo reutilizando el mismo flujo de conversión. */}
      {needsRecovery && (
        <div className="mt-4 rounded-lg border border-error/40 bg-error/10 p-4">
          <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.1em] text-error">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Convertida · Cliente no encontrado
          </p>
          <p className="mt-2 text-sm text-fg-subtle">
            Esta solicitud fue convertida en cliente, pero ese cliente ya no existe. Usa &ldquo;Agregar
            cliente nuevamente&rdquo; para reutilizar uno existente por email o crear uno nuevo.
          </p>
        </div>
      )}

      {/* DATOS DEL CLIENTE */}
      <h2 className="mt-10 text-xs font-mono uppercase tracking-[0.1em] text-fg-subtle">
        Datos del cliente
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Nombre" value={request.name} />
        <Field label="Email" value={request.email} />
        <Field label="Empresa" value={request.company || "—"} />
      </div>

      {/* PROYECTO */}
      <h2 className="mt-8 text-xs font-mono uppercase tracking-[0.1em] text-fg-subtle">Proyecto</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Tipo de proyecto" value={request.projectType} />
        <Field label="Presupuesto" value={request.budget} />
        <Field label="Plan solicitado" value={requestedPlanLabel} />
      </div>

      {/* MENSAJE */}
      <h2 className="mt-8 text-xs font-mono uppercase tracking-[0.1em] text-fg-subtle">Mensaje</h2>
      <div className="mt-3 rounded-lg border border-border bg-bg-elevated/40 p-5">
        <p className="whitespace-pre-wrap text-sm text-fg">{request.message}</p>
      </div>

      {/* INFORMACIÓN DE RECEPCIÓN */}
      <h2 className="mt-8 text-xs font-mono uppercase tracking-[0.1em] text-fg-subtle">
        Información de recepción
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Fecha" value={new Date(request.createdAt).toLocaleDateString("es-CO")} />
        <Field label="Hora" value={new Date(request.createdAt).toLocaleTimeString("es-CO")} />
        <Field label="Estado" value={<ContactRequestStatusBadge status={request.status} />} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-raised p-4">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 text-sm text-fg">{value}</p>
    </div>
  );
}
