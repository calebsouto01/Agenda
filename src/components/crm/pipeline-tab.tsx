import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Sparkles, Trophy, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, type Lead, type LeadStage, type Professional } from "./lead-shared";

const ACTIVE_STAGES: { value: LeadStage; label: string }[] = [
  { value: "contato", label: "Em contato" },
  { value: "agendado", label: "Agendado" },
];

function nextStage(stage: LeadStage): LeadStage | null {
  const idx = ACTIVE_STAGES.findIndex((s) => s.value === stage);
  return idx >= 0 && idx < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[idx + 1]!.value : null;
}

export function PipelineTab({ establishmentId }: { establishmentId: string }) {
  const queryClient = useQueryClient();
  const [leadPerdido, setLeadPerdido] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["crm-leads", establishmentId, "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, customer_id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda",
        )
        .eq("establishment_id", establishmentId)
        .neq("stage", "novo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
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
          Contatos ativados até virar cliente. Novos contatos entram pela aba Contatos.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showClosed ? "Ocultar fechados" : `Mostrar fechados (${closedTotal})`}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pipeline ativo</p>
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
              <p className="text-sm font-medium">Nenhum lead ativado ainda</p>
              <p className="text-sm text-muted-foreground">
                Ative contatos na aba Contatos pra começar a acompanhar o funil.
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
                      <div className="flex flex-col gap-2 min-[420px]:flex-row">
                        {stage.value === "agendado" ? (
                          <button
                            type="button"
                            onClick={() => convert.mutate(lead)}
                            className="flex items-center justify-center gap-1 rounded-md bg-success px-2 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90 min-[420px]:flex-1"
                          >
                            <Sparkles className="size-3 shrink-0" /> Converter
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => advance.mutate(lead)}
                            className="flex items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90 min-[420px]:flex-1"
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
