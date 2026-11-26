import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { useEstablishment } from "@/hooks/use-establishment";
import { PageTitle } from "@/components/page-title";
import { ContactsTab } from "@/components/crm/contacts-tab";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { data: establishment } = useEstablishment();

  return (
    <div className="space-y-4">
      <PageTitle icon={Users}>Clientes</PageTitle>

      {establishment ? (
        <ContactsTab establishmentId={establishment.id} establishment={establishment} />
      ) : null}
    </div>
  );
}
