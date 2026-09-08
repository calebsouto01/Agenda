import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  Smartphone,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatPrice, normalizePhone } from "@/lib/booking";
import { isNativeApp, pickAllDeviceContacts } from "@/lib/native-contacts";
import { Badge } from "@/components/ui/badge";
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

type LeadStage = "novo" | "contato" | "agendado" | "convertido" | "perdido";

type Lead = {
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

type Professional = { id: string; name: string };

const ACTIVE_STAGES: { value: LeadStage; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "contato", label: "Em contato" },
  { value: "agendado", label: "Agendado" },
];

const ORIGENS = ["Indicação", "Instagram", "WhatsApp", "Google", "Página pública", "Outro"];

const EMPTY_FORM = { name: "", phone: "", origem: "", valor: "", responsavelId: "" };

function nextStage(stage: LeadStage): LeadStage | null {
  const idx = ACTIVE_STAGES.findIndex((s) => s.value === stage);
  return idx >= 0 && idx < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[idx + 1]!.value : null;
}

export function PipelineTab({ establishmentId }: { establishmentId: string }) {
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [leadPerdido, setLeadPerdido] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["crm-leads", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, customer_id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda",
        )
        .eq("establishment_id", establishmentId)
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

  const createLead = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new Error("Informe o nome");
      const cents = form.valor ? Math.round(Number(form.valor.replace(",", ".")) * 100) : null;
      const { error } = await supabase.from("crm_leads").insert({
        establishment_id: establishmentId,
        name,
        phone: form.phone.trim() || null,
        origem: form.origem.trim() || "Outro",
        valor_estimado_cents: cents,
        responsavel_id: form.responsavelId || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lead criado");
      setForm({ ...EMPTY_FORM });
      setOpenNew(false);
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

  const importContacts = useMutation({
    mutationFn: async () => {
      const deviceContacts = await pickAllDeviceContacts();
      if (deviceContacts.length === 0) {
        throw new Error("Nenhum contato com telefone encontrado no celular");
      }

      const [{ data: existingCustomers }, { data: existingLeads }] = await Promise.all([
        supabase.from("customers").select("phone").eq("establishment_id", establishmentId),
        supabase.from("crm_leads").select("phone").eq("establishment_id", establishmentId),
      ]);
      const known = new Set(
        [...(existingCustomers ?? []), ...(existingLeads ?? [])]
          .map((r) => (r.phone ? normalizePhone(r.phone) : null))
          .filter((v): v is string => Boolean(v)),
      );

      const seen = new Set<string>();
      const newLeads = deviceContacts.filter((c) => {
        const key = normalizePhone(c.phone);
        if (key.length < 8 || known.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (newLeads.length === 0) return 0;

      const { error } = await supabase.from("crm_leads").insert(
        newLeads.map((c) => ({
          establishment_id: establishmentId,
          name: c.name,
          phone: c.phone,
          origem: "Contatos importados",
        })),
      );
      if (error) throw new Error(error.message);
      return newLeads.length;
    },
    onSuccess: (count) => {
      toast.success(
        count > 0 ? `${count} novo(s) lead(s) importado(s)` : "Nenhum contato novo encontrado",
      );
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
        <p className="text-sm text-muted-foreground">Do primeiro contato até virar cliente.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showClosed ? "Ocultar fechados" : `Mostrar fechados (${closedTotal})`}
          </Button>
          {isNativeApp() ? (
            <Button
              variant="outline"
              size="sm"
              disabled={importContacts.isPending}
              onClick={() => importContacts.mutate()}
            >
              <Smartphone className="size-4" />
              {importContacts.isPending ? "Importando..." : "Importar contatos do celular"}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setOpenNew(true);
            }}
          >
            <Plus className="size-4" /> Novo lead
          </Button>
        </div>
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

      {openNew ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="lead-name">Nome</Label>
              <Input
                id="lead-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lead-phone">Telefone</Label>
                <Input
                  id="lead-phone"
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lead-valor">Valor estimado (R$)</Label>
                <Input
                  id="lead-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lead-origem">Origem</Label>
                <Input
                  id="lead-origem"
                  list="lead-origens"
                  maxLength={60}
                  value={form.origem}
                  onChange={(e) => setForm({ ...form, origem: e.target.value })}
                />
                <datalist id="lead-origens">
                  {ORIGENS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label>Responsável</Label>
                <Select
                  value={form.responsavelId}
                  onValueChange={(v) => setForm({ ...form, responsavelId: v })}
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
              <Button disabled={createLead.isPending} onClick={() => createLead.mutate()}>
                Criar lead
              </Button>
              <Button variant="ghost" onClick={() => setOpenNew(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
              <p className="text-sm font-medium">Nenhum lead ainda</p>
              <p className="text-sm text-muted-foreground">
                Cadastre um lead pra começar a acompanhar o funil.
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
                      <div className="flex items-center gap-2">
                        {stage.value === "agendado" ? (
                          <button
                            type="button"
                            onClick={() => convert.mutate(lead)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success px-2 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90"
                          >
                            <Sparkles className="size-3" /> Converter
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => advance.mutate(lead)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90"
                          >
                            Avançar <ArrowRight className="size-3" />
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

function LeadCard({
  lead,
  responsavelNome,
  children,
}: {
  lead: Lead;
  responsavelNome: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Card className="opacity-100">
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
