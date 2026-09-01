import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  addDays,
  dateTimeInZone,
  hourInZone,
  isoDateInZone,
  type AppointmentStatus,
  type PaymentMethod,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WeekGrid, type CellItem } from "@/components/agenda/week-grid";
import { MonthGrid } from "@/components/agenda/month-grid";
import { AppointmentList } from "@/components/agenda/appointment-list";
import {
  AppointmentInfo,
  AppointmentActions,
  PaymentActions,
  PendingConfirmation,
} from "@/components/agenda/appointment-details";
import { rangeBounds, monthGrid } from "@/components/agenda/utils";
import type { BusinessHour, Range, Row } from "@/components/agenda/types";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Agenda,
});

function Agenda() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [range, setRange] = useState<Range>("week");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [anchor, setAnchor] = useState(() => isoDateInZone(new Date(), tz));
  const [selected, setSelected] = useState<Row | null>(null);

  const today = useMemo(() => isoDateInZone(new Date(), tz), [tz]);
  const bounds = useMemo(() => rangeBounds(anchor, range), [anchor, range]);
  const month = useMemo(() => (range === "month" ? monthGrid(anchor) : null), [anchor, range]);
  const fetchBounds = month ?? bounds;

  const {
    data: appointments,
    isLoading,
    error: appointmentsError,
  } = useQuery({
    queryKey: ["appointments", establishment?.id, fetchBounds.from, fetchBounds.to],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, notes, paid, payment_method, payment_note, service_id, professional_id, service_names, total_price_cents, services(name, price_cents, duration_minutes), professionals(name), customers(id, name, phone, email)",
        )
        .eq("establishment_id", establishment!.id)
        .gte("starts_at", `${fetchBounds.from}T00:00:00`)
        .lt("starts_at", `${fetchBounds.to}T00:00:00`)
        .order("starts_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: businessHours } = useQuery({
    queryKey: ["business-hours", establishment?.id],
    enabled: Boolean(establishment?.id) && range === "week",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, opens_at, closes_at, closed, break_start, break_end")
        .eq("establishment_id", establishment!.id);
      if (error) throw error;
      return (data ?? []) as BusinessHour[];
    },
  });

  const hoursByWeekday = useMemo(() => {
    const map = new Map<number, BusinessHour>();
    for (const h of businessHours ?? []) map.set(h.weekday, h);
    return map;
  }, [businessHours]);

  /** Agendamentos são consultados sob chaves diferentes na Agenda e no Financeiro. */
  const invalidateAppointmentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["finance-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["finance-previous"] });
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success("Agendamento atualizado");
      invalidateAppointmentQueries();
      if (status === "completed") {
        setSelected(null);
      } else {
        setSelected((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    onError: () => toast.error("Não foi possível atualizar"),
  });

  const setStatus = (id: string, status: AppointmentStatus) => updateStatus.mutate({ id, status });

  const confirmAppointment = useMutation({
    mutationFn: async ({
      appointment,
      intervalMinutes,
    }: {
      appointment: Row;
      intervalMinutes: number;
    }) => {
      const serviceCount = appointment.service_names
        ? appointment.service_names.split(" + ").length
        : 1;
      const gaps = Math.max(0, serviceCount - 1);
      const update: { status: AppointmentStatus; ends_at?: string } = { status: "confirmed" };
      if (intervalMinutes > 0 && gaps > 0) {
        update.ends_at = new Date(
          new Date(appointment.ends_at).getTime() + intervalMinutes * gaps * 60_000,
        ).toISOString();
      }
      const { error } = await supabase.from("appointments").update(update).eq("id", appointment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento confirmado");
      invalidateAppointmentQueries();
      setSelected((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmWithInterval = (appointment: Row, intervalMinutes: number) =>
    confirmAppointment.mutate({ appointment, intervalMinutes });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento excluído");
      invalidateAppointmentQueries();
      setSelected(null);
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  const updatePayment = useMutation({
    mutationFn: async ({
      id,
      method,
      note,
    }: {
      id: string;
      method: PaymentMethod | null;
      note: string | null;
    }) => {
      const { error } = await supabase
        .from("appointments")
        .update(
          method
            ? {
                paid: true,
                payment_method: method,
                payment_note: note,
                paid_at: new Date().toISOString(),
              }
            : { paid: false, payment_method: null, payment_note: null, paid_at: null },
        )
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { method, note }) => {
      toast.success(method ? "Pagamento registrado" : "Pagamento desfeito");
      invalidateAppointmentQueries();
      setSelected((prev) =>
        prev
          ? { ...prev, paid: Boolean(method), payment_method: method, payment_note: note }
          : prev,
      );
    },
    onError: () => toast.error("Não foi possível atualizar o pagamento"),
  });

  const setPayment = (id: string, method: PaymentMethod | null, note: string | null) =>
    updatePayment.mutate({ id, method, note });

  const step = range === "week" ? 7 : 30;

  const dayMap = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const a of appointments ?? []) {
      const key = isoDateInZone(new Date(a.starts_at), tz);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [appointments, tz]);

  const weekDays = useMemo(
    () => (range === "week" ? Array.from({ length: 7 }, (_, i) => addDays(bounds.from, i)) : []),
    [range, bounds],
  );

  const hourRange = useMemo(() => {
    const open = (businessHours ?? []).filter((h) => !h.closed);
    if (open.length === 0) return { start: 8, end: 20 };
    const starts = open.map((h) => Number(h.opens_at.slice(0, 2)));
    const ends = open.map((h) => {
      const [hh, mm] = h.closes_at.split(":").map(Number);
      return (mm ?? 0) > 0 ? (hh ?? 0) + 1 : (hh ?? 0);
    });
    const start = Math.min(...starts);
    return { start, end: Math.max(start + 1, ...ends) };
  }, [businessHours]);

  const hours = useMemo(
    () => Array.from({ length: hourRange.end - hourRange.start }, (_, i) => hourRange.start + i),
    [hourRange],
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, CellItem[]>();
    for (const a of appointments ?? []) {
      const day = isoDateInZone(new Date(a.starts_at), tz);
      const startHour = hourInZone(a.starts_at, tz);
      const lastInstant = new Date(new Date(a.ends_at).getTime() - 1);
      const lastHour = Math.max(startHour, hourInZone(lastInstant.toISOString(), tz));
      for (let h = startHour; h <= lastHour; h++) {
        const key = `${day}-${h}`;
        map.set(key, [
          ...(map.get(key) ?? []),
          { appointment: a, isStart: h === startHour, isLast: h === lastHour },
        ]);
      }
    }
    return map;
  }, [appointments, tz]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold">Agenda</h1>
          <Tabs
            value={viewMode === "list" ? "list" : range}
            onValueChange={(v) => {
              if (v === "list") {
                setViewMode("list");
              } else {
                setViewMode("grid");
                setRange(v as Range);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="list">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/new" className="flex items-center gap-1.5">
            <Plus className="size-4" />
            Novo agendamento
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-card p-2">
        <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, -step))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {new Intl.DateTimeFormat("pt-BR", {
            day: range === "month" ? undefined : "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${bounds.from}T12:00:00Z`))}
          {range === "week" ? " (semana)" : ""}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, step))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : appointmentsError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">
            Não foi possível carregar os agendamentos
          </p>
          <p className="text-muted-foreground">{appointmentsError.message}</p>
        </div>
      ) : viewMode === "list" ? (
        <AppointmentList appointments={appointments ?? []} tz={tz} onSelect={setSelected} />
      ) : range === "week" ? (
        <WeekGrid
          days={weekDays}
          hours={hours}
          cellMap={cellMap}
          today={today}
          tz={tz}
          hoursByWeekday={hoursByWeekday}
          onSelect={setSelected}
        />
      ) : month ? (
        <MonthGrid
          weeks={month.weeks}
          monthStart={month.monthStart}
          dayMap={dayMap}
          today={today}
          onPickDay={(day) => {
            setRange("week");
            setAnchor(day);
          }}
        />
      ) : null}
      {appointments && appointments.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {appointments.length} agendamento(s) · último criado em{" "}
          {dateTimeInZone(appointments[appointments.length - 1]!.starts_at, tz)}
        </p>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-sm">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.status === "pending"
                    ? "Confirmar agendamento"
                    : "Detalhes do agendamento"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <AppointmentInfo appointment={selected} tz={tz} />
                {selected.status === "pending" ? (
                  <PendingConfirmation
                    appointment={selected}
                    onUpdateStatus={setStatus}
                    onConfirm={confirmWithInterval}
                  />
                ) : (
                  <>
                    <PaymentActions appointment={selected} onUpdatePayment={setPayment} />
                    <AppointmentActions
                      appointment={selected}
                      onUpdateStatus={setStatus}
                      onDelete={(id) => deleteAppointment.mutate(id)}
                    />
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
