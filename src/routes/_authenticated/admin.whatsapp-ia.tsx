import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Loader2, MessageCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { embeddedSignupConfigured, runEmbeddedSignup } from "@/lib/meta-embedded-signup";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-ia")({
  component: WhatsappAiPage,
});

type ConnectionStatus = "disconnected" | "connected";

type AgentRow = {
  id: string;
  enabled: boolean;
  agent_name: string;
  instructions: string | null;
  connection_status: ConnectionStatus;
  connected_phone: string | null;
  verified_name: string | null;
};

// As tabelas do agente ainda não estão em types.ts (gerado); usa client sem tipagem de tabela.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

function WhatsappAiPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const queryClient = useQueryClient();
  const establishmentId = establishment?.id;
  const [form, setForm] = useState({ agent_name: "Assistente", instructions: "" });

  const { data: agent } = useQuery({
    queryKey: ["whatsapp-agent", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db
        .from("whatsapp_agents")
        .select(
          "id, enabled, agent_name, instructions, connection_status, connected_phone, verified_name",
        )
        .eq("establishment_id", establishmentId)
        .maybeSingle();
      if (error) throw error;
      return (data as AgentRow | null) ?? null;
    },
  });

  const { data: handoffs } = useQuery({
    queryKey: ["whatsapp-handoffs", establishmentId],
    enabled: !!establishmentId && agent?.connection_status === "connected",
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("whatsapp_conversations")
        .select("id, contact_phone, contact_name")
        .eq("establishment_id", establishmentId)
        .eq("needs_human", true)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; contact_phone: string; contact_name: string | null }[];
    },
  });

  useEffect(() => {
    if (agent) setForm({ agent_name: agent.agent_name, instructions: agent.instructions ?? "" });
  }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function callConnect(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("whatsapp-agent-connect", {
      body: { establishment_id: establishmentId, ...body },
    });
    if (error) throw error;
    return data as { ok?: boolean; message?: string };
  }

  const connect = useMutation({
    mutationFn: async () => {
      const r = await runEmbeddedSignup();
      return callConnect({
        action: "exchange",
        code: r.code,
        waba_id: r.wabaId,
        phone_number_id: r.phoneNumberId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] });
      toast.success("WhatsApp conectado!");
    },
    onError: (e) => {
      if (e instanceof Error && e.message === "cancelled") return;
      toast.error("Não foi possível conectar o WhatsApp. Tente novamente.");
    },
  });

  const disconnect = useMutation({
    mutationFn: () => callConnect({ action: "disconnect" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] });
      toast.success("WhatsApp desconectado");
    },
    onError: () => toast.error("Não foi possível desconectar."),
  });

  const save = useMutation({
    mutationFn: async (
      patch: Partial<Pick<AgentRow, "enabled" | "agent_name" | "instructions">>,
    ) => {
      const { error } = await db.from("whatsapp_agents").update(patch).eq("id", agent!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] }),
    onError: () => toast.error("Não foi possível salvar."),
  });

  const resolveHandoff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("whatsapp_conversations")
        .update({ needs_human: false, ai_paused: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-handoffs"] }),
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  const status = agent?.connection_status ?? "disconnected";

  return (
    <div className="space-y-4">
      <PageTitle icon={Bot}>Atendente de IA no WhatsApp</PageTitle>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <h2 className="font-semibold">Conexão</h2>
          </div>

          {status === "connected" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                ✅ Conectado{agent?.connected_phone ? ` · ${agent.connected_phone}` : ""}
                {agent?.verified_name ? ` (${agent.verified_name})` : ""}
              </p>
              <Button
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Conecte o número de WhatsApp Business do seu negócio pela Meta (API oficial). Uma
                janela do Facebook vai abrir para você escolher ou criar a conta e verificar o
                número.
              </p>
              {!embeddedSignupConfigured && (
                <p className="text-sm text-destructive">
                  Integração com a Meta não configurada (VITE_META_APP_ID / VITE_META_CONFIG_ID).
                </p>
              )}
              <Button
                onClick={() => connect.mutate()}
                disabled={connect.isPending || !embeddedSignupConfigured}
              >
                {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar com Facebook
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {agent && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <h2 className="font-semibold">Agente</h2>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="agent-enabled">Responder automaticamente</Label>
                <Switch
                  id="agent-enabled"
                  checked={agent.enabled}
                  disabled={status !== "connected" || save.isPending}
                  onCheckedChange={(enabled) => save.mutate({ enabled })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-name">Nome do atendente</Label>
              <Input
                id="agent-name"
                value={form.agent_name}
                maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, agent_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-instructions">Instruções para a IA</Label>
              <Textarea
                id="agent-instructions"
                rows={6}
                maxLength={4000}
                placeholder="Ex.: Somos uma barbearia. Aceitamos Pix e cartão. Cancelamentos até 2h antes. Tom descontraído."
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                A IA já consulta seus serviços, profissionais e horários livres e cria os
                agendamentos. Use este campo para regras e tom de voz.
              </p>
            </div>
            <Button
              onClick={() =>
                save.mutate(
                  {
                    agent_name: form.agent_name.trim() || "Assistente",
                    instructions: form.instructions.trim() || null,
                  },
                  { onSuccess: () => toast.success("Salvo") },
                )
              }
              disabled={save.isPending}
            >
              Salvar
            </Button>
          </CardContent>
        </Card>
      )}

      {!!handoffs?.length && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <h2 className="font-semibold">Aguardando atendimento humano</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA está pausada nestas conversas. Responda pelo seu WhatsApp e, ao terminar, devolva
              o atendimento à IA.
            </p>
            {handoffs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {c.contact_name ?? "Cliente"} · +{c.contact_phone}
                </span>
                <Button size="sm" variant="outline" onClick={() => resolveHandoff.mutate(c.id)}>
                  Devolver à IA
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
