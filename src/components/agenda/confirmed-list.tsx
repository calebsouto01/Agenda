import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  dateTimeInZone,
  formatDuration,
  formatPrice,
  isoDateInZone,
  serviceLabel,
  timeInZone,
  totalPriceCents,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Row } from "./types";

function invalidateAppointmentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["confirmed-appointments"] });
  queryClient.invalidateQueries({ queryKey: ["appointments"] });
  queryClient.invalidateQueries({ queryKey: ["finance-appointments"] });
  queryClient.invalidateQueries({ queryKey: ["finance-previous"] });
}

export function ConfirmedList({ establishmentId, tz }: { establishmentId: string; tz: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);

  const {
    data: appointments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["confirmed-appointments", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, notes, paid, payment_method, payment_note, service_id, professional_id, service_names, total_price_cents, services(name, price_cents, duration_minutes), professionals(name), customers(id, name, phone, email)",
        )
        .eq("establishment_id", establishmentId)
        .eq("status", "confirmed")
        .order("starts_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Row[];
    },
  });

  const cancelAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      invalidateAppointmentQueries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento excluído");
      invalidateAppointmentQueries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-semibold text-destructive">Não foi possível carregar os confirmados</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!appointments || appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhum agendamento confirmado no momento.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {appointments.map((a) => (
          <Card key={a.id} className="shadow-soft">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">{dateTimeInZone(a.starts_at, tz)}</p>
                <p className="text-sm font-semibold">{a.customers?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {serviceLabel(a)}
                  {a.professionals ? ` · ${a.professionals.name}` : ""}
                  {` · ${formatPrice(totalPriceCents(a))}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => cancelAppointment.mutate(a.id)}
                >
                  Cancelar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="size-4" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação remove o agendamento de {a.customers?.name} permanentemente e não
                        pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteAppointment.mutate(a.id)}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          {editing ? (
            <EditForm
              appointment={editing}
              establishmentId={establishmentId}
              tz={tz}
              onSaved={() => {
                setEditing(null);
                invalidateAppointmentQueries(queryClient);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditForm({
  appointment,
  establishmentId,
  tz,
  onSaved,
  onCancel,
}: {
  appointment: Row;
  establishmentId: string;
  tz: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [serviceId, setServiceId] = useState(appointment.service_id);
  const [professionalId, setProfessionalId] = useState(appointment.professional_id);
  const [date, setDate] = useState(() => isoDateInZone(new Date(appointment.starts_at), tz));
  const [slot, setSlot] = useState<string | null>(appointment.starts_at);
  const [changingTime, setChangingTime] = useState(false);
  const [form, setForm] = useState({
    name: appointment.customers?.name ?? "",
    phone: appointment.customers?.phone ?? "",
    email: appointment.customers?.email ?? "",
    notes: appointment.notes ?? "",
  });

  const resetSlot = () => {
    setChangingTime(true);
    setSlot(null);
  };

  const { data: services } = useQuery({
    queryKey: ["admin-services", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, price_cents, duration_minutes")
        .eq("establishment_id", establishmentId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: professionals } = useQuery({
    queryKey: ["admin-professionals", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ["edit-slots", establishmentId, serviceId, professionalId, date],
    enabled: changingTime && Boolean(serviceId && date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_slots", {
        p_establishment_id: establishmentId,
        p_service_id: serviceId,
        p_professional_id: professionalId,
        p_date: date,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!serviceId) throw new Error("Escolha um serviço");
      if (professionals && professionals.length > 0 && !professionalId) {
        throw new Error("Escolha um profissional");
      }
      if (!slot) throw new Error("Escolha um horário");
      if (form.name.trim().length < 2) throw new Error("Informe o nome do cliente");
      if (form.phone.replace(/\D/g, "").length < 10) throw new Error("Informe um telefone válido");

      const service = services?.find((s) => s.id === serviceId);
      const duration =
        service?.duration_minutes ??
        Math.round(
          (new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) /
            60000,
        );
      const endsAt = new Date(new Date(slot).getTime() + duration * 60000).toISOString();

      if (appointment.customers) {
        const { error: custError } = await supabase
          .from("customers")
          .update({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || null,
          })
          .eq("id", appointment.customers.id);
        if (custError) throw new Error(custError.message);
      }

      const { error } = await supabase
        .from("appointments")
        .update({
          service_id: serviceId,
          professional_id: professionalId,
          starts_at: slot,
          ends_at: endsAt,
          notes: form.notes.trim() || null,
          // Editar sempre resulta em um único serviço selecionado, então qualquer
          // combinação de vários serviços feita na reserva original é descartada.
          service_names: null,
          total_price_cents: null,
        })
        .eq("id", appointment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar agendamento</DialogTitle>
      </DialogHeader>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label>Serviço</Label>
          <div className="flex flex-wrap gap-2">
            {(services ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  resetSlot();
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
          </div>
        </div>

        {professionals && professionals.length > 0 ? (
          <div className="space-y-2">
            <Label>Profissional</Label>
            <div className="flex flex-wrap gap-2">
              {professionals.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProfessionalId(p.id);
                    resetSlot();
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
          <Label htmlFor="edate">Data</Label>
          <Input
            id="edate"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              resetSlot();
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>Horário</Label>
          {!changingTime ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                {timeInZone(appointment.starts_at, tz)}
              </span>
              <Button size="sm" variant="outline" onClick={resetSlot}>
                Alterar horário
              </Button>
            </div>
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
            <Label htmlFor="ecname">Cliente</Label>
            <Input
              id="ecname"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ecphone">Telefone</Label>
            <Input
              id="ecphone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ecemail">E-mail (opcional)</Label>
            <Input
              id="ecemail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ecnotes">Observações</Label>
            <Textarea
              id="ecnotes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={save.isPending || !slot} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </>
  );
}
