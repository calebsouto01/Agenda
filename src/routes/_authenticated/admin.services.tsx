import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { formatDuration, formatPrice } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/services")({
  component: ServicesPage,
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço").max(120),
  description: z.string().trim().max(400),
  price: z.number().min(0, "Preço inválido").max(1000000),
  duration: z.number().int().min(5, "Duração mínima de 5 minutos").max(600),
});

const EMPTY = { id: "", name: "", description: "", price: "0", duration: "30", active: true };

function ServicesPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState(false);

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, price_cents, duration_minutes, active")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name: form.name,
        description: form.description,
        price: Number(form.price.replace(",", ".")),
        duration: Number(form.duration),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const payload = {
        establishment_id: establishment!.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price_cents: Math.round(parsed.data.price * 100),
        duration_minutes: parsed.data.duration,
        active: form.active,
      };
      const { error } = form.id
        ? await supabase.from("services").update(payload).eq("id", form.id)
        : await supabase.from("services").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Serviço salvo");
      setForm({ ...EMPTY });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Serviço excluído");
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: () =>
      toast.error("Não foi possível excluir. Serviços com agendamentos podem ser desativados."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Serviços</h1>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {open ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="s-name">Nome</Label>
              <Input
                id="s-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-desc">Descrição</Label>
              <Textarea
                id="s-desc"
                maxLength={400}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="s-price">Preço (R$)</Label>
                <Input
                  id="s-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-dur">Duração (min)</Label>
                <Input
                  id="s-dur"
                  inputMode="numeric"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="s-active">Disponível para agendamento</Label>
              <Switch
                id="s-active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                Salvar
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
      ) : services && services.length > 0 ? (
        <div className="grid gap-2">
          {services.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {s.name}
                    {!s.active ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (inativo)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(s.price_cents)} · {formatDuration(s.duration_minutes)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({
                        id: s.id,
                        name: s.name,
                        description: s.description ?? "",
                        price: (s.price_cents / 100).toFixed(2),
                        duration: String(s.duration_minutes),
                        active: s.active,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove.mutate(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Cadastre seu primeiro serviço para começar a receber agendamentos.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
