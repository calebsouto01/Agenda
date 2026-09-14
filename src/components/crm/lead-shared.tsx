import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, Eye, MessageCircle, Target } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDateLabel, formatPrice, isoDateInZone } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppLink } from "@/components/whatsapp-link";

/** Etapas do funil de vendas — genéricas, independentes de canal (WhatsApp, ligação etc.). */
export type LeadStage = "novo" | "contato" | "agendado" | "convertido" | "perdido";

export const STAGE_LABEL: Record<LeadStage, string> = {
  novo: "Novo",
  contato: "Em contato",
  agendado: "Agendado",
  convertido: "Cliente",
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
  next_contact_at?: string | null;
};

const OPEN_STAGES: LeadStage[] = ["novo", "contato", "agendado"];

function isOverdue(lead: Lead) {
  if (!lead.next_contact_at || !OPEN_STAGES.includes(lead.stage)) return false;
  return lead.next_contact_at < isoDateInZone(new Date(), "UTC");
}

export type Professional = { id: string; name: string };

export const ORIGENS = ["Indicação", "Instagram", "WhatsApp", "Google", "Página pública", "Outro"];

function LeadDetailsDialog({
  lead,
  responsavelNome,
}: {
  lead: Lead;
  responsavelNome: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [nextContact, setNextContact] = useState(lead.next_contact_at ?? "");
  const queryClient = useQueryClient();

  const saveNextContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("crm_leads")
        .update({ next_contact_at: nextContact || null })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Eye className="size-3 shrink-0" /> Ver dados
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>
            {lead.origem} · {STAGE_LABEL[lead.stage]}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Telefone</p>
              <p>{lead.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Valor estimado</p>
              <p>
                {lead.valor_estimado_cents != null ? formatPrice(lead.valor_estimado_cents) : "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Responsável</p>
            <p>{responsavelNome ?? "—"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label
              htmlFor={`next-contact-${lead.id}`}
              className="text-xs font-medium text-muted-foreground"
            >
              Próximo contato
            </Label>
            <div className="flex gap-2">
              <Input
                id={`next-contact-${lead.id}`}
                type="date"
                className="h-8"
                value={nextContact}
                onChange={(e) => setNextContact(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saveNextContact.isPending || nextContact === (lead.next_contact_at ?? "")}
                onClick={() => saveNextContact.mutate()}
              >
                Salvar
              </Button>
            </div>
          </div>
          {lead.motivo_perda ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Motivo da perda</p>
              <p className="text-destructive">{lead.motivo_perda}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Notas</p>
            <p className="whitespace-pre-wrap break-words">{lead.notes ?? "—"}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeadCard({
  lead,
  responsavelNome,
  showStage = false,
  showSchedule = false,
  children,
}: {
  lead: Lead;
  responsavelNome: string | null;
  showStage?: boolean;
  showSchedule?: boolean;
  children?: React.ReactNode;
}) {
  const hasValue = lead.valor_estimado_cents != null || Boolean(responsavelNome);
  const initial = lead.name.trim().charAt(0).toUpperCase() || "?";
  const overdue = isOverdue(lead);
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
          {overdue ? (
            <Badge
              variant="outline"
              className="border-0 bg-warning/20 text-[10px] text-warning-foreground"
            >
              <AlertTriangle className="mr-1 size-2.5" />
              Atrasado · previsto {formatDateLabel(lead.next_contact_at!)}
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
        <div className="flex items-center gap-1.5">
          <LeadDetailsDialog lead={lead} responsavelNome={responsavelNome} />
          {showSchedule ? (
            <Link
              to="/admin/new"
              search={{ leadId: lead.id, name: lead.name, phone: lead.phone ?? undefined }}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <CalendarPlus className="size-3 shrink-0" /> Agendar
            </Link>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
