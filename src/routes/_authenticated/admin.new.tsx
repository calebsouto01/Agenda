import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  formatDateLabel,
  formatDuration,
  formatPrice,
  isoDateInZone,
  timeInZone,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/new")({
  component: ManualBooking,
});

function ManualBooking() {
  const { data: establishment, isLoading: loadingShop } = useEstablishment();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState(() => isoDateInZone(new Date(), tz));
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const { data: services } = useQuery({
    queryKey: ["admin-services", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, price_cents, duration_minutes")
        .eq("establishment_id", establishment!.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: professionals } = useQuery({
    queryKey: ["admin-professionals", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("establishment_id", establishment!.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ["admin-slots", establishment?.id, serviceId, professionalId, date],
    enabled: Boolean(establishment?.id && serviceId && date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_slots", {
        p_establishment_id: establishment!.id,
        p_service_id: serviceId!,
        p_professional_id: professionalId,
        p_date: date,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
  });

  const booking = useMutation({
    mutationFn: async () => {
      if (!serviceId) throw new Error("Escolha um serviço");
      if (!slot) throw new Error("Escolha um horário");
      if (form.name.trim().length < 2) throw new Error("Informe o nome do cliente");
      if (form.phone.replace(/\D/g, "").length < 10) throw new Error("Informe um telefone válido");
      const { data, error } = await supabase.rpc("book_appointment", {
        p_establishment_id: establishment!.id,
        p_service_id: serviceId,
        p_professional_id: professionalId,
        p_starts_at: slot,
        p_customer_name: form.name.trim(),
        p_customer_phone: form.phone.trim(),
        p_customer_email: form.email.trim() || null,
        p_notes: form.notes.trim() || null,
      } as never);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      toast.success("Agendamento criado");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      navigate({ to: "/admin" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loadingShop) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Novo agendamento</h1>
      <p className="text-sm text-muted-foreground">
        Registre um agendamento manualmente (atendimento por telefone, WhatsApp ou balcão).
      </p>

      <Card className="shadow-soft">
        <CardContent className="space-y-5 p-5">
          <div className="space-y-2">
            <Label>Serviço</Label>
            <div className="flex flex-wrap gap-2">
              {(services ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    setSlot(null);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    serviceId === s.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  {s.name}
                  <span className="block text-[11px] font-normal opacity-80">
                    {formatDuration(s.duration_minutes)} · {formatPrice(s.price_cents)}
                  </span>
                </button>
              ))}
              {services && services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cadastre um serviço primeiro.</p>
              ) : null}
            </div>
          </div>

          {professionals && professionals.length > 0 ? (
            <div className="space-y-2">
              <Label>Profissional</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProfessionalId(null);
                    setSlot(null);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    professionalId === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  Qualquer
                </button>
                {professionals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProfessionalId(p.id);
                      setSlot(null);
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      professionalId === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot(null);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Horário — {formatDateLabel(date)}</Label>
            {!serviceId ? (
              <p className="text-sm text-muted-foreground">Escolha um serviço para ver horários.</p>
            ) : loadingSlots ? (
              <Skeleton className="h-10 w-full" />
            ) : (slots ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum horário livre nesta data.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(slots ?? []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                      slot === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted"
                    }`}
                  >
                    {timeInZone(s, tz)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cname">Cliente</Label>
              <Input
                id="cname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cphone">Telefone</Label>
              <Input
                id="cphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cemail">E-mail (opcional)</Label>
              <Input
                id="cemail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cnotes">Observações</Label>
              <Textarea
                id="cnotes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={booking.isPending || !slot}
            onClick={() => booking.mutate()}
          >
            {booking.isPending ? "Salvando…" : "Criar agendamento"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
