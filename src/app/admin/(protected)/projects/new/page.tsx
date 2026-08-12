import { notFound } from "next/navigation";
import { getClientById } from "@/lib/db/paymentsStore";
import { listConversations } from "@/lib/db/conversationStore";
import { NewProjectForm } from "@/components/admin/NewProjectForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ clientId?: string }>;
}

export default async function NewProjectPage({ searchParams }: PageProps) {
  const { clientId } = await searchParams;

  let preselectedClient: { id: string; name: string; email: string; company: string | null } | null =
    null;

  if (clientId) {
    const client = await getClientById(clientId);
    if (!client) notFound();

    // "Empresa" only ever comes from a linked conversation's `company` —
    // it is NOT a column on `clients` (see Fase 5A audit). Shown only if
    // at least one linked conversation actually has it; never invented.
    const conversations = await listConversations({ clientId, limit: 100 });
    const company = conversations.find((c) => c.company)?.company ?? null;

    preselectedClient = { id: client.id, name: client.name, email: client.email, company };
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nuevo proyecto</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {preselectedClient
          ? `Vas a crear un proyecto para ${preselectedClient.name}. Se genera automáticamente un enlace privado de seguimiento (área del cliente) que podrás copiar en la página del proyecto.`
          : "Crea el cliente y el proyecto. Se genera automáticamente un enlace privado de seguimiento (área del cliente) que podrás copiar en la página del proyecto."}
      </p>
      <div className="mt-8">
        <NewProjectForm preselectedClient={preselectedClient} />
      </div>
    </div>
  );
}
