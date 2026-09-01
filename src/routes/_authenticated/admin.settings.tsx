import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { slugify } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Lisbon",
  "Europe/Lisbon",
  "UTC",
];

const STEPS = ["10", "15", "20", "30", "60"];

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  slug: z.string().trim().min(2, "Informe o link público").max(48),
  description: z.string().trim().max(400),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(200),
});

function SettingsPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    phone: "",
    address: "",
    timezone: "America/Sao_Paulo",
    step: "15",
  });

  useEffect(() => {
    if (!establishment) return;
    setForm({
      name: establishment.name,
      slug: establishment.slug,
      description: establishment.description ?? "",
      phone: establishment.phone ?? "",
      address: establishment.address ?? "",
      timezone: establishment.timezone,
      step: String(establishment.slot_step_minutes),
    });
  }, [establishment]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const { error } = await supabase
        .from("establishments")
        .update({
          name: parsed.data.name,
          slug: slugify(parsed.data.slug),
          description: parsed.data.description || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          timezone: form.timezone,
          slot_step_minutes: Number(form.step),
        })
        .eq("id", establishment!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Informações salvas");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Este link público já está em uso" : e.message),
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Dados da empresa</h1>
      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5">
          <div className="grid gap-1.5">
            <Label htmlFor="e-name">Nome</Label>
            <Input
              id="e-name"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-slug">Link público</Label>
            <Input
              id="e-slug"
              maxLength={48}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">/b/{slugify(form.slug)}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-desc">Descrição</Label>
            <Textarea
              id="e-desc"
              maxLength={400}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="e-phone">Telefone / WhatsApp</Label>
              <Input
                id="e-phone"
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="e-address">Endereço</Label>
              <Input
                id="e-address"
                maxLength={200}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Fuso horário</Label>
              <Select
                value={form.timezone}
                onValueChange={(v) => setForm({ ...form, timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Intervalo entre agendamentos</Label>
              <Select value={form.step} onValueChange={(v) => setForm({ ...form, step: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEPS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} minutos
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tempo bloqueado após cada agendamento antes do próximo horário ficar disponível.
              </p>
            </div>
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
