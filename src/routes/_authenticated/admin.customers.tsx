import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { z } from "zod";

import { useEstablishment } from "@/hooks/use-establishment";
import { PageTitle } from "@/components/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const navigate = useNavigate();
  const { tab } = useSearch({ from: "/_authenticated/admin/customers" });
  const section = tab ?? "contatos";

  return (
    <div className="space-y-4">
      <PageTitle icon={Users}>Clientes</PageTitle>

      <Tabs
        value={section}
        onValueChange={(v) =>
          navigate({
            to: "/admin/customers",
            search: { tab: v as "contatos" | "funil" },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="funil">Funil</TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="pt-4">
          {establishment ? (
            <ContactsTab establishmentId={establishment.id} establishment={establishment} />
          ) : null}
        </TabsContent>

        <TabsContent value="funil" className="pt-4">
          {establishment ? (
            <PipelineTab
              establishmentId={establishment.id}
              establishmentName={establishment.name}
              timezone={establishment.timezone}
              message1Template={establishment.whatsapp_message_1}
              messageConfirmacaoTemplate={establishment.whatsapp_message_confirmacao}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
