import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  STATUS_LABEL,
  addDays,
  dateTimeInZone,
  formatPrice,
  isoDateInZone,
  timeInZone,
  type AppointmentStatus,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Agenda,
});

type Range = "day" | "week" | "month";

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  services: { name: string; price_cents: number; duration_minutes: number } | null;
  professionals: { name: string } | null;
  customers: { name: string; phone: string; email: string | null } | null;
};

function rangeBounds(anchor: string, range: Range) {
  if (range === "day") return { from: anchor, to: addDays(anchor, 1) };
  if (range === "week") {
    const wd = new Date(`${anchor}T12:00:00Z`).getUTCDay();
    const start = addDays(anchor, -wd);
    return { from: start, to: addDays(start, 7) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

function Agenda() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [range, setRange] = useState<Range>("day");
  const [anchor, setAnchor] = useState(() => isoDateInZone(new Date(), tz));

  const bounds = useMemo(() => rangeBounds(anchor, range), [anchor, range]);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", establishment?.id, bounds.from, bounds.to],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, notes, services(name, price_cents, duration_minutes), professionals(name), customers(name, phone, email)",
        )
        .eq("establishment_id", establishment!.id)
        .gte("starts_at", `${bounds.from}T00:00:00`)
        .lt("starts_at", `${bounds.to}T00:00:00`)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Não foi possível atualizar"),
  });

  const step = range === "day" ? 1 : range === "week" ? 7 : 30;
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const a of appointments ?? []) {
      const key = isoDateInZone(new Date(a.starts_at), tz);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appointments, tz]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Agenda</h1>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
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
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento neste período.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([day, rows]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                timeZone: "UTC",
              }).format(new Date(`${day}T12:00:00Z`))}
            </h2>
            {rows.map((a) => (
              <Card key={a.id} className="shadow-soft">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold">{timeInZone(a.starts_at, tz)}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-sm font-semibold">{a.customers?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.services?.name}
                      {a.professionals ? ` · ${a.professionals.name}` : ""}
                      {a.services ? ` · ${formatPrice(a.services.price_cents)}` : ""}
                    </p>
                    {a.customers?.phone ? (
                      <a
                        href={`https://wa.me/${a.customers.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
                      >
                        <Phone className="size-3" />
                        {a.customers.phone}
                      </a>
                    ) : null}
                    {a.notes ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">{a.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {a.status !== "confirmed" && a.status !== "completed" ? (
                      <Button
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: a.id, status: "confirmed" })}
                      >
                        Confirmar
                      </Button>
                    ) : null}
                    {a.status !== "completed" && a.status !== "cancelled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus.mutate({ id: a.id, status: "completed" })}
                      >
                        Concluir
                      </Button>
                    ) : null}
                    {a.status !== "cancelled" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}
      {appointments && appointments.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {appointments.length} agendamento(s) · último criado em{" "}
          {dateTimeInZone(appointments[appointments.length - 1]!.starts_at, tz)}
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const styles: Record<AppointmentStatus, string> = {
    pending: "bg-warning/20 text-warning-foreground",
    confirmed: "bg-primary/15 text-primary",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={`border-0 ${styles[status]}`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
