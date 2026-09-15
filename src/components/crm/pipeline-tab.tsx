import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Send, Sparkles, Trophy, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  fillTemplate,
} from "@/lib/message-templates";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LeadCard,
  ORIGENS,
  STAGE_LABEL,
  type Lead,
  type LeadStage,
  type Professional,
} from "./lead-shared";

type FunnelLead = Lead & { appointment: { starts_at: string } | null };

const ACTIVE_STAGES: LeadStage[] = ["novo", "contato", "agendado"];

function nextStage(stage: LeadStage): LeadStage | null {
  switch (stage) {
    case "novo":
      return "contato";
    case "contato":
      return "agendado";
    default:
      return null;
  }
}

/** Próximo lembrete de WhatsApp pendente pra um lead com agendamento vinculado, independente da etapa do funil. */
function nextReminderStep(lead: Lead): "msg1" | "confirmacao" | null {
  if (!lead.appointment_id) return null;
  if (!lead.whatsapp_msg1_sent_at) return "msg1";
  if (!lead.whatsapp_confirmacao_sent_at) return "confirmacao";
  return null;
}

function formatDateTime(iso: string, timezone: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
  });
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

function buildMessage(
  step: "msg1" | "confirmacao",
  lead: FunnelLead,
  establishmentName: string,
  timezone: string,
  templates: { message1: string | null; messageConfirmacao: string | null },
) {
  const firstName = lead.name.split(" ")[0] || lead.name;
  const when = lead.appointment ? formatDateTime(lead.appointment.starts_at, timezone) : null;
  const template =
    step === "msg1"
      ? (templates.message1 ?? DEFAULT_MESSAGE_1)
      : (templates.messageConfirmacao ?? DEFAULT_MESSAGE_CONFIRMACAO);

  return fillTemplate(template, {
    nome: firstName,
    data: when?.date ?? "",
    hora: when?.time ?? "",
    estabelecimento: establishmentName,
  });
}

const REMINDER_LABEL: Record<"msg1" | "confirmacao", string> = {
  msg1: "Enviar mensagem",
  confirmacao: "Enviar confirmação",
};

const EMPTY_CONTACT_FORM = { name: "", phone: "", origem: "", valor: "", responsavelId: "" };

export function PipelineTab({
  establishmentId,
  establishmentName,
  timezone,
  message1Template,
  messageConfirmacaoTemplate,
}: {
  establishmentId: string;
  establishmentName: string;
  timezone: string;
  message1Template: string | null;
  messageConfirmacaoTemplate: string | null;
}) {
  const queryClient = useQueryClient();
  const [leadPerdido, setLeadPerdido] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [openNewContact, setOpenNewContact] = useState(false);
  const [contactForm, setContactForm] = useState({ ...EMPTY_CONTACT_FORM });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["crm-leads", establishmentId, "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, customer_id, appointment_id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda, whatsapp_msg1_sent_at, whatsapp_confirmacao_sent_at, next_contact_at, appointment:appointments(starts_at)",
        )
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FunnelLead[];
    },
  });

  const { data: professionals } = useQuery({
    queryKey: ["professionals-select", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Professional[];
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  const createContact = useMutation({
    mutationFn: async () => {
      const name = contactForm.name.trim();
      if (name.length < 2) throw new Error("Informe o nome");
      const cents = contactForm.valor
        ? Math.round(Number(contactForm.valor.replace(",", ".")) * 100)
        : null;
      const { error } = await supabase.from("crm_leads").insert({
        establishment_id: establishmentId,
        name,
        phone: contactForm.phone.trim() || null,
        origem: contactForm.origem.trim() || "Outro",
        valor_estimado_cents: cents,
        responsavel_id: contactForm.responsavelId || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato cadastrado no funil");
      setContactForm({ ...EMPTY_CONTACT_FORM });
      setOpenNewContact(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: async (lead: Lead) => {
      const next = nextStage(lead.stage);
      if (!next) return;
      const { error } = await supabase.from("crm_leads").update({ stage: next }).eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const markReminderSent = useMutation({
    mutationFn: async ({ lead, step }: { lead: Lead; step: "msg1" | "confirmacao" }) => {
      const field = step === "msg1" ? "whatsapp_msg1_sent_at" : "whatsapp_confirmacao_sent_at";
      const { error } = await supabase
        .from("crm_leads")
        .update({ [field]: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async (lead: Lead) => {
      let customerId = lead.customer_id;
      if (!customerId && lead.phone) {
        const { data, error } = await supabase
          .from("customers")
          .upsert(
            { establishment_id: establishmentId, name: lead.name, phone: lead.phone },
            { onConflict: "establishment_id,phone" },
          )
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        customerId = data.id;
      }
      const { error } = await supabase
        .from("crm_leads")
        .update({ stage: "convertido", customer_id: customerId })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lead convertido em cliente");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markLost = useMutation({
    mutationFn: async () => {
      if (!leadPerdido) return;
      if (!motivo.trim()) throw new Error("Informe o motivo");
      const { error } = await supabase
        .from("crm_leads")
        .update({ stage: "perdido", motivo_perda: motivo.trim() })
        .eq("id", leadPerdido.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lead marcado como perdido");
      setLeadPerdido(null);
      setMotivo("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const responsavelNome = (id: string | null) =>
    professionals?.find((p) => p.id === id)?.name ?? null;

  const active = (leads ?? []).filter((l) => l.stage !== "convertido" && l.stage !== "perdido");
  const converted = (leads ?? []).filter((l) => l.stage === "convertido");
  const lost = (leads ?? []).filter((l) => l.stage === "perdido");
  const closedTotal = converted.length + lost.length;
  const pipelineValue = active.reduce((sum, l) => sum + (l.valor_estimado_cents ?? 0), 0);
  const conversionRate = closedTotal > 0 ? (converted.length / closedTotal) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={() => {
            setContactForm({ ...EMPTY_CONTACT_FORM });
            setOpenNewContact((v) => !v);
          }}
        >
          <UserPlus className="size-4" />
          Cadastrar contato
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showClosed ? "Ocultar fechados" : `Mostrar fechados (${closedTotal})`}
        </Button>
      </div>

      {openNewContact ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="pipeline-contact-name">Nome</Label>
              <Input
                id="pipeline-contact-name"
                maxLength={120}
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pipeline-contact-phone">Telefone</Label>
                <Input
                  id="pipeline-contact-phone"
                  maxLength={30}
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pipeline-contact-valor">Valor estimado (R$)</Label>
                <Input
                  id="pipeline-contact-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={contactForm.valor}
                  onChange={(e) => setContactForm({ ...contactForm, valor: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pipeline-contact-origem">Origem</Label>
                <Input
                  id="pipeline-contact-origem"
                  list="pipeline-contact-origens"
                  maxLength={60}
                  value={contactForm.origem}
                  onChange={(e) => setContactForm({ ...contactForm, origem: e.target.value })}
                />
                <datalist id="pipeline-contact-origens">
                  {ORIGENS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label>Responsável</Label>
                <Select
                  value={contactForm.responsavelId}
                  onValueChange={(v) => setContactForm({ ...contactForm, responsavelId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={createContact.isPending} onClick={() => createContact.mutate()}>
                Cadastrar
              </Button>
              <Button variant="ghost" onClick={() => setOpenNewContact(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Funil ativo</p>
            <p className="text-lg font-bold">{formatPrice(pipelineValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Leads ativos</p>
            <p className="text-lg font-bold">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Taxa de conversão</p>
            <p className="text-lg font-bold">
              {conversionRate != null ? `${conversionRate.toFixed(0)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {leadPerdido ? (
        <Card className="border-destructive/30 shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <p className="text-sm font-semibold">Marcar "{leadPerdido.name}" como perdido</p>
            <div className="grid gap-1.5">
              <Label htmlFor="lead-motivo">Motivo</Label>
              <Input
                id="lead-motivo"
                maxLength={200}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={markLost.isPending}
                onClick={() => markLost.mutate()}
              >
                Marcar como perdido
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLeadPerdido(null);
                  setMotivo("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (leads?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Nenhum lead no funil ainda</p>
              <p className="text-sm text-muted-foreground">
                Clique em "Cadastrar contato" pra começar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVE_STAGES.map((stage) => {
            const stageLeads = active.filter((l) => l.stage === stage);
            return (
              <div key={stage} className="flex w-64 shrink-0 flex-col gap-2">
                <div className="rounded-lg bg-muted px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {STAGE_LABEL[stage]}
                    </h2>
                    <span className="text-xs font-medium text-muted-foreground">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {stageLeads.map((lead) => {
                    const reminderStep = nextReminderStep(lead);
                    return (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        responsavelNome={responsavelNome(lead.responsavel_id)}
                        showSchedule
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            {stage === "agendado" ? (
                              <button
                                type="button"
                                onClick={() => convert.mutate(lead)}
                                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success px-2 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90"
                              >
                                <Sparkles className="size-3 shrink-0" /> Converter
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => advance.mutate(lead)}
                                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90"
                              >
                                Avançar <ArrowRight className="size-3 shrink-0" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setLeadPerdido(lead);
                                setMotivo("");
                              }}
                              className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              Perdido
                            </button>
                          </div>
                          {reminderStep && lead.phone ? (
                            <WhatsAppLink
                              phone={lead.phone}
                              message={buildMessage(
                                reminderStep,
                                lead,
                                establishmentName,
                                timezone,
                                {
                                  message1: message1Template,
                                  messageConfirmacao: messageConfirmacaoTemplate,
                                },
                              )}
                              onSend={() => markReminderSent.mutate({ lead, step: reminderStep })}
                              className="flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-accent"
                            >
                              <Send className="size-3 shrink-0" />
                              {REMINDER_LABEL[reminderStep]}
                            </WhatsAppLink>
                          ) : null}
                        </div>
                      </LeadCard>
                    );
                  })}
                  {stageLeads.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Nenhum lead aqui.</p>
                  ) : null}
                </div>
              </div>
            );
          })}

          {showClosed ? (
            <>
              <div className="flex w-64 shrink-0 flex-col gap-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-success/15 px-2.5 py-2">
                  <Trophy className="size-3.5 text-success" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-success">
                    {STAGE_LABEL.convertido}
                  </h2>
                  <span className="text-xs text-success">{converted.length}</span>
                </div>
                <div className="space-y-2">
                  {converted.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      responsavelNome={responsavelNome(lead.responsavel_id)}
                    />
                  ))}
                  {converted.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Nenhum ainda.</p>
                  ) : null}
                </div>
              </div>
              <div className="flex w-64 shrink-0 flex-col gap-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-2">
                  <XCircle className="size-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {STAGE_LABEL.perdido}
                  </h2>
                  <span className="text-xs text-muted-foreground">{lost.length}</span>
                </div>
                <div className="space-y-2">
                  {lost.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      responsavelNome={responsavelNome(lead.responsavel_id)}
                    >
                      {lead.motivo_perda ? (
                        <p className="truncate text-xs text-destructive">{lead.motivo_perda}</p>
                      ) : null}
                    </LeadCard>
                  ))}
                  {lost.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Nenhum ainda.</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
