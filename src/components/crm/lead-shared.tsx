import { Target } from "lucide-react";

import { formatPrice } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type LeadStage = "novo" | "contato" | "agendado" | "convertido" | "perdido";

export type Lead = {
  id: string;
  customer_id: string | null;
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
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">{lead.phone ?? "Sem telefone"}</p>
          <Badge variant="outline" className="mt-1 border-0 bg-primary/10 text-[10px] text-primary">
            <Target className="mr-1 size-2.5" />
            {lead.origem}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {lead.valor_estimado_cents != null ? formatPrice(lead.valor_estimado_cents) : "—"}
          </span>
          {responsavelNome ? (
            <span className="text-xs text-muted-foreground">{responsavelNome}</span>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
