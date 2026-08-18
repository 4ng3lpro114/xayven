import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPricingCatalogItemById } from "@/lib/db/pricingCatalogStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { PackageActionButton } from "@/components/admin/PackageActions";
import { PackageForm } from "@/components/admin/PackageForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PackageDetailPage({ params }: PageProps) {
  const { id } = await params;
  const item = await getPricingCatalogItemById(id);
  if (!item) notFound();

  return (
    <div>
      <Link href="/admin/packages" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Paquetes y mantenimiento
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-fg">{item.name}</h1>
          <BooleanStatusBadge active={item.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />
        </div>
        <PackageActionButton itemId={item.id} action={item.isActive ? "deactivate" : "activate"} />
      </div>

      {!item.isActive && (
        <div className="mt-6 rounded-lg border border-border-strong bg-bg-raised p-4">
          <p className="text-sm text-fg-muted">
            Este producto está inactivo — no aparece públicamente en /services ni /maintenance
            hasta que se reactive.
          </p>
        </div>
      )}

      <div className="mt-8">
        <PackageForm mode="edit" itemId={item.id} initialValues={item} />
      </div>
    </div>
  );
}
