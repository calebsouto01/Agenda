import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Eye,
  EyeOff,
  MessageSquareText,
  Send,
  Sparkles,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  MESSAGE_PLACEHOLDERS,
  fillTemplate,
} from "@/lib/message-templates";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, type Lead, type LeadStage, type Professional } from "./lead-shared";

type FunnelLead = Lead & { appointment: { starts_at: string } | null };

const ACTIVE_STAGES: { value: LeadStage; label: string }[] = [
  { value: "mensagem_1", label: "Mensagem 1" },
  { value: "confirmacao_dia", label: "Confirmação do dia" },
  { value: "contato", label: "Em contato" },
  { value: "agendado", label: "Agendado" },
];

function nextStage(stage: LeadStage): LeadStage | null {
  switch (stage) {
    case "mensagem_1":
      return "confirmacao_dia";
    case "confirmacao_dia":
      return "convertido";
    case "contato":
      return "agendado";
    default:
      return null;
  }
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
  stage: "mensagem_1" | "confirmacao_dia",
  lead: FunnelLead,
  establishmentName: string,
  timezone: string,
  templates: { message1: string | null; messageConfirmacao: string | null },
) {
  const firstName = lead.name.split(" ")[0] || lead.name;
  const when = lead.appointment ? formatDateTime(lead.appointment.starts_at, timezone) : null;
  const template =
    stage === "mensagem_1"
      ? (templates.message1 ?? DEFAULT_MESSAGE_1)
      : (templates.messageConfirmacao ?? DEFAULT_MESSAGE_CONFIRMACAO);

  return fillTemplate(template, {
    nome: firstName,
    data: when?.date ?? "",
    hora: when?.time ?? "",
    estabelecimento: establishmentName,
  });
}

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
  const [editingMessages, setEditingMessages] = useState(false);
  const [message1Draft, setMessage1Draft] = useState(message1Template ?? DEFAULT_MESSAGE_1);
  const [messageConfirmacaoDraft, setMessageConfirmacaoDraft] = useState(
    messageConfirmacaoTemplate ?? DEFAULT_MESSAGE_CONFIRMACAO,
  );

  const { data: leads, isLoading } = useQuery({
    queryKey: ["crm-leads", establishmentId, "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, customer_id, appointment_id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda, appointment:appointments(starts_at)",
        )
        .eq("establishment_id", establishmentId)
        .neq("stage", "novo")
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

  const saveMessages = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("establishments")
        .update({
          whatsapp_message_1: message1Draft.trim() || null,
          whatsapp_message_confirmacao: messageConfirmacaoDraft.trim() || null,
        })
        .eq("id", establishmentId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mensagens salvas");
      setEditingMessages(false);
      queryClient.invalidateQueries({ queryKey: ["my-establishment"] });
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Todo agendamento novo entra aqui automaticamente. Contatos ativados na aba Contatos também
          aparecem.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMessage1Draft(message1Template ?? DEFAULT_MESSAGE_1);
              setMessageConfirmacaoDraft(messageConfirmacaoTemplate ?? DEFAULT_MESSAGE_CONFIRMACAO);
              setEditingMessages((v) => !v);
            }}
          >
            <MessageSquareText className="size-4" />
            Editar mensagens
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showClosed ? "Ocultar fechados" : `Mostrar fechados (${closedTotal})`}
          </Button>
        </div>
      </div>

      {editingMessages ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-4 p-5">
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {MESSAGE_PLACEHOLDERS.join(" · ")}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="msg-1">Mensagem 1 (após o agendamento)</Label>
              <Textarea
                id="msg-1"
                maxLength={500}
                rows={3}
                value={message1Draft}
                onChange={(e) => setMessage1Draft(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="msg-confirmacao">Confirmação do dia</Label>
              <Textarea
                id="msg-confirmacao"
                maxLength={500}
                rows={3}
                value={messageConfirmacaoDraft}
                onChange={(e) => setMessageConfirmacaoDraft(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={saveMessages.isPending} onClick={() => saveMessages.mutate()}>
                Salvar mensagens
              </Button>
              <Button variant="ghost" onClick={() => setEditingMessages(false)}>
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
                Novos agendamentos entram aqui automaticamente, ou ative contatos na aba Contatos.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVE_STAGES.map((stage) => {
            const stageLeads = active.filter((l) => l.stage === stage.value);
            return (
              <div key={stage.value} className="flex w-64 shrink-0 flex-col gap-2">
                <div className="rounded-lg bg-muted px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {stage.label}
                    </h2>
                    <span className="text-xs font-medium text-muted-foreground">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      responsavelNome={responsavelNome(lead.responsavel_id)}
                    >
                      <div className="flex items-center gap-1.5">
                        {stage.value === "agendado" ? (
                          <button
                            type="button"
                            onClick={() => convert.mutate(lead)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success px-2 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90"
                          >
                            <Sparkles className="size-3 shrink-0" /> Converter
                          </button>
                        ) : stage.value === "mensagem_1" || stage.value === "confirmacao_dia" ? (
                          lead.phone ? (
                            <WhatsAppLink
                              phone={lead.phone}
                              message={buildMessage(
                                stage.value,
                                lead,
                                establishmentName,
                                timezone,
                                {
                                  message1: message1Template,
                                  messageConfirmacao: messageConfirmacaoTemplate,
                                },
                              )}
                              onSend={() => advance.mutate(lead)}
                              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90"
                            >
                              <Send className="size-3 shrink-0" />
                              {stage.value === "mensagem_1"
                                ? "Enviar mensagem"
                                : "Enviar confirmação"}
                            </WhatsAppLink>
                          ) : (
                            <span className="flex-1 rounded-md bg-muted px-2 py-1.5 text-center text-xs text-muted-foreground">
                              Sem telefone
                            </span>
                          )
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
                    </LeadCard>
                  ))}
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
                    Convertido
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
                    Perdido
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
