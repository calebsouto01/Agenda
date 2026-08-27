import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { dateTimeInZone } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/blocks")({
  component: BlocksPage,
});

type Block = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  professional_id: string | null;
  professionals: { name: string } | null;
};

function BlocksPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [form, setForm] = useState({ start: "", end: "", reason: "", professional: "all" });

  const { data: professionals } = useQuery({
    queryKey: ["professionals", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, role, active")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["time-blocks", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_blocks")
        .select("id, starts_at, ends_at, reason, professional_id, professionals(name)")
        .eq("establishment_id", establishment!.id)
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Block[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.start || !form.end) throw new Error("Informe início e fim do bloqueio");
      if (form.end <= form.start) throw new Error("O fim deve ser depois do início");
      const { error } = await supabase.from("time_blocks").insert({
        establishment_id: establishment!.id,
        professional_id: form.professional === "all" ? null : form.professional,
        starts_at: new Date(form.start).toISOString(),
        ends_at: new Date(form.end).toISOString(),
        reason: form.reason.trim().slice(0, 200) || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Horário bloqueado");
      setForm({ start: "", end: "", reason: "", professional: "all" });
      queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_blocks").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Bloqueio removido");
      queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
    },
    onError: () => toast.error("Não foi possível remover"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Bloqueios de horário</h1>
      <p className="text-xs text-muted-foreground">
        Use para férias, almoço, manutenção ou qualquer período em que não deve haver agendamentos.
      </p>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="b-start">Início</Label>
            <Input
              id="b-start"
              type="datetime-local"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-end">Fim</Label>
            <Input
              id="b-end"
              type="datetime-local"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Profissional</Label>
            <Select
              value={form.professional}
              onValueChange={(v) => setForm({ ...form, professional: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o estabelecimento</SelectItem>
                {(professionals ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-reason">Motivo (opcional)</Label>
            <Input
              id="b-reason"
              maxLength={200}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <Button
            className="sm:col-span-2"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            Bloquear período
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : blocks && blocks.length > 0 ? (
        <div className="grid gap-2">
          {blocks.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {dateTimeInZone(b.starts_at, tz)} → {dateTimeInZone(b.ends_at, tz)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.professionals?.name ?? "Todo o estabelecimento"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => remove.mutate(b.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum bloqueio cadastrado.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
