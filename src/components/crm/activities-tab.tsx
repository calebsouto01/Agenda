import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatDateLabel, isoDateInZone } from "@/lib/booking";
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

type ActivityType = "ligacao" | "whatsapp" | "visita" | "email" | "outro";

type Activity = {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  type: ActivityType;
  description: string;
  due_date: string | null;
  status: "pendente" | "concluida" | "cancelada";
  crm_leads: { name: string } | null;
  customers: { name: string } | null;
};

type Target = { key: string; label: string; leadId: string | null; customerId: string | null };

const TYPE_LABEL: Record<ActivityType, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  visita: "Visita",
  email: "E-mail",
  outro: "Outro",
};

export function ActivitiesTab({ establishmentId, tz }: { establishmentId: string; tz: string }) {
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    targetKey: "",
    type: "ligacao" as ActivityType,
    description: "",
    dueDate: "",
  });

  const { data: activities, isLoading } = useQuery({
    queryKey: ["crm-activities", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_activities")
        .select(
          "id, lead_id, customer_id, type, description, due_date, status, crm_leads(name), customers(name)",
        )
        .eq("establishment_id", establishmentId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Activity[];
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["crm-leads-select", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-select", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const targets: Target[] = useMemo(
    () => [
      ...(leads ?? []).map((l) => ({
        key: `lead:${l.id}`,
        label: `${l.name} (lead)`,
        leadId: l.id,
        customerId: null,
      })),
      ...(customers ?? []).map((c) => ({
        key: `customer:${c.id}`,
        label: c.name,
        leadId: null,
        customerId: c.id,
      })),
    ],
    [leads, customers],
  );

  const create = useMutation({
    mutationFn: async () => {
      const target = targets.find((t) => t.key === form.targetKey);
      if (!target) throw new Error("Selecione um cliente ou lead");
      if (!form.description.trim()) throw new Error("Descreva a atividade");
      const { error } = await supabase.from("crm_activities").insert({
        establishment_id: establishmentId,
        lead_id: target.leadId,
        customer_id: target.customerId,
        type: form.type,
        description: form.description.trim(),
        due_date: form.dueDate || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Atividade registrada");
      setForm({ targetKey: "", type: "ligacao", description: "", dueDate: "" });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_activities")
        .update({ status: "concluida", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-activities"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const todayIso = isoDateInZone(new Date(), tz);
  const visible = (activities ?? []).filter((a) => (showDone ? true : a.status === "pendente"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Follow-ups e tarefas de acompanhamento.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nova atividade
          </Button>
        </div>
      </div>

      {open ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label>Cliente ou lead</Label>
              <Select
                value={form.targetKey}
                onValueChange={(v) => setForm({ ...form, targetKey: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as ActivityType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as ActivityType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="act-due">Prazo</Label>
                <Input
                  id="act-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="act-desc">Descrição</Label>
              <Input
                id="act-desc"
                maxLength={200}
                placeholder="Ex: Ligar para confirmar interesse"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                Registrar
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma atividade {showDone ? "" : "pendente"}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {visible.map((a) => {
            const overdue = a.status === "pendente" && !!a.due_date && a.due_date < todayIso;
            return (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="border-0 bg-muted text-[10px]">
                        {TYPE_LABEL[a.type]}
                      </Badge>
                      {a.status === "concluida" ? (
                        <Badge
                          variant="outline"
                          className="border-0 bg-success/20 text-[10px] text-success"
                        >
                          Concluída
                        </Badge>
                      ) : null}
                      {overdue ? (
                        <Badge
                          variant="outline"
                          className="border-0 bg-warning/20 text-[10px] text-warning-foreground"
                        >
                          <AlertTriangle className="mr-1 size-2.5" /> Atrasada
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-sm font-medium">{a.description}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.crm_leads?.name ?? a.customers?.name ?? "—"}
                      {a.due_date ? ` · prazo ${formatDateLabel(a.due_date)}` : ""}
                    </p>
                  </div>
                  {a.status === "pendente" ? (
                    <button
                      type="button"
                      onClick={() => complete.mutate(a.id)}
                      className="shrink-0 text-muted-foreground hover:text-success"
                      title="Concluir"
                    >
                      <CheckCircle className="size-5" />
                    </button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
