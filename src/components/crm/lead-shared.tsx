import { Clock, MessageCircle, Target } from "lucide-react";

import { formatPrice } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsAppLink } from "@/components/whatsapp-link";

/** Etapas do funil de vendas — genéricas, independentes de canal (WhatsApp, ligação etc.). */
export type LeadStage = "novo" | "contato" | "agendado" | "convertido" | "perdido";

export const STAGE_LABEL: Record<LeadStage, string> = {
  novo: "Novo",
  contato: "Em contato",
  agendado: "Proposta",
  convertido: "Ganho",
  perdido: "Perdido",
};

export const STAGE_BADGE: Record<LeadStage, string> = {
  novo: "bg-muted text-muted-foreground",
  contato: "bg-primary/10 text-primary",
  agendado: "bg-warning/20 text-warning-foreground",
  convertido: "bg-success/20 text-success",
  perdido: "bg-destructive/10 text-destructive",
};

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
  whatsapp_msg1_sent_at?: string | null;
  whatsapp_confirmacao_sent_at?: string | null;
};

export type Professional = { id: string; name: string };

export const ORIGENS = [
  "Indicação",
  "Instagram",
  "WhatsApp",
  "Google",
  "Página pública",
  "Prospecção Maps",
  "Outro",
];

export function LeadCard({
  lead,
  responsavelNome,
  showStage = false,
  pendingActivities = 0,
  children,
}: {
  lead: Lead;
  responsavelNome: string | null;
  showStage?: boolean;
  pendingActivities?: number;
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
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-0 bg-primary/10 text-[10px] text-primary">
            <Target className="mr-1 size-2.5" />
            {lead.origem}
          </Badge>
          {showStage ? (
            <Badge variant="outline" className={`border-0 text-[10px] ${STAGE_BADGE[lead.stage]}`}>
              {STAGE_LABEL[lead.stage]}
            </Badge>
          ) : null}
          {pendingActivities > 0 ? (
            <Badge
              variant="outline"
              className="border-0 bg-warning/20 text-[10px] text-warning-foreground"
            >
              <Clock className="mr-1 size-2.5" />
              {pendingActivities} tarefa{pendingActivities === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
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
