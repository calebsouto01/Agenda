import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Users } from "lucide-react";

import { useEstablishment } from "@/hooks/use-establishment";
import { PageTitle } from "@/components/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactsTab } from "@/components/crm/contacts-tab";
import { PipelineTab } from "@/components/crm/pipeline-tab";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

/** Contatos = todo mundo cadastrado (lead ou cliente, mesma entrada). Funil = movimento entre etapas. */
type Section = "contatos" | "funil";

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const [section, setSection] = useState<Section>("contatos");

  return (
    <div className="space-y-4">
      <PageTitle icon={Users}>Clientes</PageTitle>

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
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
