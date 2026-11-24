import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Loader2, MessageCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
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

type ConnectionStatus = "disconnected" | "connecting" | "connected";

type AgentRow = {
  id: string;
  enabled: boolean;
  agent_name: string;
  instructions: string | null;
  connection_status: ConnectionStatus;
  connected_phone: string | null;
};

type ConnectResponse = {
  ok?: boolean;
  status?: ConnectionStatus;
  qr?: string | null;
  message?: string;
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
  const [qr, setQr] = useState<string | null>(null);
  const [form, setForm] = useState({ agent_name: "Assistente", instructions: "" });

  const { data: agent } = useQuery({
    queryKey: ["whatsapp-agent", establishmentId],
    enabled: !!establishmentId,
    refetchInterval: (q) => (q.state.data?.connection_status === "connecting" ? 4000 : false),
    queryFn: async () => {
      const { data, error } = await db
        .from("whatsapp_agents")
        .select("id, enabled, agent_name, instructions, connection_status, connected_phone")
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

  async function callConnect(action: "connect" | "status" | "disconnect") {
    const { data, error } = await supabase.functions.invoke("whatsapp-agent-connect", {
      body: { action, establishment_id: establishmentId },
    });
    if (error) throw error;
    return data as ConnectResponse;
  }

  const connect = useMutation({
    mutationFn: () => callConnect("connect"),
    onSuccess: (res) => {
      setQr(res.qr ?? null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] });
    },
    onError: () => toast.error("Não foi possível gerar o QR code. Tente novamente."),
  });

  const disconnect = useMutation({
    mutationFn: () => callConnect("disconnect"),
    onSuccess: () => {
      setQr(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] });
      toast.success("WhatsApp desconectado");
    },
    onError: () => toast.error("Não foi possível desconectar."),
  });

  // Enquanto aguarda a leitura, consulta o estado e renova o QR (expira em ~30s).
  const connecting = agent?.connection_status === "connecting";
  useEffect(() => {
    if (!connecting || !establishmentId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await callConnect("status");
        if (cancelled) return;
        if (res.qr) setQr(res.qr);
        if (res.status === "connected") {
          setQr(null);
          queryClient.invalidateQueries({ queryKey: ["whatsapp-agent"] });
          toast.success("WhatsApp conectado!");
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connecting, establishmentId]); // eslint-disable-line react-hooks/exhaustive-deps

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
                ✅ Conectado{agent?.connected_phone ? ` (+${agent.connected_phone})` : ""}
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
                No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho,
                e aponte a câmera para o QR code.
              </p>
              {qr ? (
                <img
                  src={qr}
                  alt="QR code do WhatsApp"
                  className="h-64 w-64 rounded-md border bg-white p-2"
                />
              ) : connecting ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando QR code…
                </div>
              ) : null}
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {connecting ? "Gerar novo QR code" : "Conectar WhatsApp"}
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
