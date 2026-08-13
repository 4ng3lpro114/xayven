import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPromotionById } from "@/lib/db/promotionStore";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import { PromotionStatusBadge } from "@/components/admin/PromotionStatusBadge";
import { PromotionActionButton } from "@/components/admin/PromotionActions";
import { PromotionForm } from "@/components/admin/PromotionForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PromotionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const promotion = await getPromotionById(id);
  if (!promotion) notFound();

  const effectiveStatus = getEffectivePromotionStatus(promotion, new Date());
  const isArchived = promotion.status === "archived";

  return (
    <div>
      <Link href="/admin/promotions" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Promociones
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-fg">{promotion.name}</h1>
          <PromotionStatusBadge status={effectiveStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          {promotion.status === "draft" && <PromotionActionButton promotionId={promotion.id} action="schedule" />}
          {promotion.status === "scheduled" && <PromotionActionButton promotionId={promotion.id} action="pause" />}
          {promotion.status === "paused" && <PromotionActionButton promotionId={promotion.id} action="resume" />}
          {!isArchived && <PromotionActionButton promotionId={promotion.id} action="archive" variant="danger" />}
        </div>
      </div>

      {isArchived && (
        <div className="mt-6 rounded-lg border border-border-strong bg-bg-raised p-4">
          <p className="text-sm text-fg-muted">
            Esta promoción está archivada — es un registro histórico y ya no se puede editar.
          </p>
        </div>
      )}

      <div className="mt-8">
        {isArchived ? (
          <ReadOnlySummary promotion={promotion} />
        ) : (
          <PromotionForm mode="edit" promotionId={promotion.id} initialValues={promotion} />
        )}
      </div>
    </div>
  );
}

function ReadOnlySummary({ promotion }: { promotion: NonNullable<Awaited<ReturnType<typeof getPromotionById>>> }) {
  return (
    <dl className="max-w-xl space-y-4 text-sm">
      <Row label="Texto visible" value={promotion.text} />
      <Row label="Tipo de descuento" value={promotion.discountType} />
      <Row label="Valor" value={String(promotion.discountValue)} />
      <Row label="Audiencia" value={promotion.audience} />
      <Row label="CTA" value={promotion.ctaLabel} />
      {promotion.ctaMessage && <Row label="Mensaje del CTA" value={promotion.ctaMessage} />}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-fg">{value}</dd>
    </div>
  );
}
