import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { FREE_LIMITS, isPro } from "@/lib/plans";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/professionals")({
  component: ProfessionalsPage,
});

type Professional = { id: string; name: string; role: string | null; active: boolean };

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  role: z.string().trim().max(80),
});

type ServiceOption = { id: string; name: string };
type Link = { professional_id: string; service_id: string };

const EMPTY = { id: "", name: "", role: "", active: true, serviceIds: [] as string[] };

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

  const { data: services } = useQuery({
    queryKey: ["professional-form-services", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("establishment_id", establishment!.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ServiceOption[];
    },
  });

  const { data: links } = useQuery({
    queryKey: ["professional-links", professionals?.map((p) => p.id)],
    enabled: Boolean(professionals && professionals.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_services")
        .select("professional_id, service_id")
        .in(
          "professional_id",
          professionals!.map((p) => p.id),
        );
      if (error) throw error;
      return (data ?? []) as Link[];
    },
  });

  const serviceNames = new Map((services ?? []).map((s) => [s.id, s.name]));
  const servicesOf = (professionalId: string) =>
    (links ?? [])
      .filter((l) => l.professional_id === professionalId && serviceNames.has(l.service_id))
      .map((l) => serviceNames.get(l.service_id)!);

  const atFreeLimit =
    Boolean(establishment) &&
    !isPro(establishment!.plan) &&
    (professionals?.length ?? 0) >= FREE_LIMITS.maxProfessionals;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.id && atFreeLimit) {
        throw new Error(`Plano Grátis permite até ${FREE_LIMITS.maxProfessionals} profissional`);
      }
      const parsed = schema.safeParse({ name: form.name, role: form.role });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const payload = {
        establishment_id: establishment!.id,
        name: parsed.data.name,
        role: parsed.data.role || null,
        active: form.active,
      };
      let professionalId = form.id;
      if (form.id) {
        const { error } = await supabase.from("professionals").update(payload).eq("id", form.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("professionals")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Não foi possível salvar");
        professionalId = data.id;
      }

      // Substitui os serviços que ele realiza pelos marcados.
      const del = await supabase
        .from("professional_services")
        .delete()
        .eq("professional_id", professionalId);
      if (del.error) throw new Error(del.error.message);
      if (form.serviceIds.length > 0) {
        const ins = await supabase
          .from("professional_services")
          .insert(
            form.serviceIds.map((service_id) => ({ professional_id: professionalId, service_id })),
          );
        if (ins.error) throw new Error(ins.error.message);
      }
    },
    onSuccess: () => {
      toast.success("Profissional salvo");
      setForm({ ...EMPTY });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      queryClient.invalidateQueries({ queryKey: ["professional-links"] });
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
        <PageTitle icon={UserRound}>Profissionais</PageTitle>
        <Button
          size="sm"
          disabled={atFreeLimit}
          onClick={() => {
            // Novo profissional começa realizando todos os serviços (o dono desmarca o que não faz).
            setForm({ ...EMPTY, serviceIds: (services ?? []).map((s) => s.id) });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {atFreeLimit ? (
        <p className="text-xs text-muted-foreground">
          Plano Grátis permite até {FREE_LIMITS.maxProfessionals} profissional.{" "}
          <Link to="/admin/settings" className="font-semibold text-primary underline">
            Assine o Pro
          </Link>{" "}
          pra cadastrar mais.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sem profissionais cadastrados, os agendamentos são feitos direto para o estabelecimento.
        </p>
      )}

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
            {services && services.length > 0 ? (
              <div className="grid gap-2">
                <Label>Serviços que realiza</Label>
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.serviceIds.includes(s.id)}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            serviceIds: v
                              ? [...form.serviceIds, s.id]
                              : form.serviceIds.filter((id) => id !== s.id),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
                {form.serviceIds.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Sem nenhum serviço marcado, este profissional não aparece para agendamento.
                  </p>
                ) : null}
              </div>
            ) : null}
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
            <Card key={p.id} className="card-interactive rounded-2xl">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {p.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.name}
                    {!p.active ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (inativo)
                      </span>
                    ) : null}
                  </p>
                  {p.role ? <p className="text-xs text-muted-foreground">{p.role}</p> : null}
                  {links && services ? (
                    servicesOf(p.id).length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Faz: {servicesOf(p.id).join(", ")}
                      </p>
                    ) : (
                      <p className="text-xs text-destructive">
                        Nenhum serviço marcado: não aparece para agendamento.
                      </p>
                    )
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({
                        id: p.id,
                        name: p.name,
                        role: p.role ?? "",
                        active: p.active,
                        serviceIds: (links ?? [])
                          .filter((l) => l.professional_id === p.id)
                          .map((l) => l.service_id),
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
