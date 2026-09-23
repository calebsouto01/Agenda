import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { z } from "zod";

import { useEstablishment } from "@/hooks/use-establishment";
import { PageTitle } from "@/components/page-title";
import { ContactsTab } from "@/components/crm/contacts-tab";
import { PipelineTab } from "@/components/crm/pipeline-tab";

const searchSchema = z.object({
  tab: z.enum(["contatos", "funil"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/customers")({
  validateSearch: searchSchema,
  component: CustomersPage,
});

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const { tab } = useSearch({ from: "/_authenticated/admin/customers" });
  const section = tab ?? "contatos";

  return (
    <div className="space-y-4">
      <PageTitle icon={Users}>Clientes</PageTitle>

      {establishment ? (
        section === "funil" ? (
          <PipelineTab establishment={establishment} />
        ) : (
          <ContactsTab establishmentId={establishment.id} establishment={establishment} />
        )
      ) : null}
    </div>
  );
}
