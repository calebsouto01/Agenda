import { MessageCircle, Target } from "lucide-react";

import { formatPrice } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsAppLink } from "@/components/whatsapp-link";

export type LeadStage =
  "novo" | "mensagem_1" | "confirmacao_dia" | "contato" | "agendado" | "convertido" | "perdido";

export type Lead = {
  id: string;
  customer_id: string | null;
  appointment_id?: string | null;
  name: string;
  phone: string | null;
  origem: string;
  stage: LeadStage;
  valor_estimado_cents: number | null;
  responsavel_id: string | null;
  notes: string | null;
  motivo_perda: string | null;
};

export type Professional = { id: string; name: string };

export const ORIGENS = ["Indicação", "Instagram", "WhatsApp", "Google", "Página pública", "Outro"];

export function LeadCard({
  lead,
  responsavelNome,
  children,
}: {
  lead: Lead;
  responsavelNome: string | null;
  children?: React.ReactNode;
}) {
  const hasValue = lead.valor_estimado_cents != null || Boolean(responsavelNome);
  return (
    <Card>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{lead.name}</p>
          <p className="shrink-0 text-xs text-muted-foreground">{lead.phone ?? "Sem telefone"}</p>
          {lead.phone ? (
            <WhatsAppLink
              phone={lead.phone}
              message={`Oi ${lead.name.split(" ")[0]}! `}
              ariaLabel="Conversar no WhatsApp"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-success hover:bg-accent hover:text-success"
            >
              <MessageCircle className="size-3.5" />
            </WhatsAppLink>
          ) : null}
        </div>
        <Badge variant="outline" className="border-0 bg-primary/10 text-[10px] text-primary">
          <Target className="mr-1 size-2.5" />
          {lead.origem}
        </Badge>
        {hasValue ? (
          <div className="flex items-center justify-between gap-2">
            {lead.valor_estimado_cents != null ? (
              <span className="text-sm font-semibold">
                {formatPrice(lead.valor_estimado_cents)}
              </span>
            ) : null}
            {responsavelNome ? (
              <span className="text-xs text-muted-foreground">{responsavelNome}</span>
            ) : null}
          </div>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
