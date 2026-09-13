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
  const initial = lead.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Card className="card-interactive overflow-hidden rounded-2xl">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{lead.name}</p>
            <p className="truncate text-xs text-muted-foreground">{lead.phone ?? "Sem telefone"}</p>
          </div>
          {lead.phone ? (
            <WhatsAppLink
              phone={lead.phone}
              message={`Oi ${lead.name.split(" ")[0]}! `}
              ariaLabel="Conversar no WhatsApp"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-success hover:bg-success/10"
            >
              <MessageCircle className="size-4" />
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
