import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/professionals")({
  component: ProfessionalsPage,
});

type Professional = { id: string; name: string; role: string | null; active: boolean };

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  role: z.string().trim().max(80),
});

const EMPTY = { id: "", name: "", role: "", active: true };

function ProfessionalsPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState(false);

  const { data: professionals, isLoading } = useQuery({
    queryKey: ["professionals", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, role, active")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Professional[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({ name: form.name, role: form.role });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const payload = {
        establishment_id: establishment!.id,
        name: parsed.data.name,
        role: parsed.data.role || null,
        active: form.active,
      };
      const { error } = form.id
        ? await supabase.from("professionals").update(payload).eq("id", form.id)
        : await supabase.from("professionals").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Profissional salvo");
      setForm({ ...EMPTY });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("professionals").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Profissional excluído");
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Profissionais</h1>
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

      <p className="text-xs text-muted-foreground">
        Sem profissionais cadastrados, os agendamentos são feitos direto para o estabelecimento.
      </p>

      {open ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Nome</Label>
              <Input
                id="p-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-role">Função (opcional)</Label>
              <Input
                id="p-role"
                maxLength={80}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="p-active">Aceitando agendamentos</Label>
              <Switch
                id="p-active"
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
        <Skeleton className="h-24 w-full" />
      ) : professionals && professionals.length > 0 ? (
        <div className="grid gap-2">
          {professionals.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {p.name}
                    {!p.active ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (inativo)
                      </span>
                    ) : null}
                  </p>
                  {p.role ? <p className="text-xs text-muted-foreground">{p.role}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({ id: p.id, name: p.name, role: p.role ?? "", active: p.active });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove.mutate(p.id)}
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
            Nenhum profissional cadastrado.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
