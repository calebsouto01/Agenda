import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  STATUS_LABEL,
  WEEKDAYS_SHORT,
  addDays,
  dateTimeInZone,
  formatPrice,
  hourInZone,
  isoDateInZone,
  timeInZone,
  weekdayOf,
  type AppointmentStatus,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Agenda,
});

type Range = "week" | "month";

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

type BusinessHour = { opens_at: string; closes_at: string; closed: boolean };

const STATUS_CHIP: Record<AppointmentStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  confirmed: "bg-primary/15 text-primary",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

function rangeBounds(anchor: string, range: Range) {
  if (range === "week") {
    const start = addDays(anchor, -weekdayOf(anchor));
    return { from: start, to: addDays(start, 7) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

/** Full-week-aligned grid of days covering the month containing `anchor`. */
function monthGrid(anchor: string) {
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${monthStart}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = addDays(d.toISOString().slice(0, 10), -1);
  const gridStart = addDays(monthStart, -weekdayOf(monthStart));
  const gridEnd = addDays(lastDay, 6 - weekdayOf(lastDay));

  const days: string[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);

  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return { from: gridStart, to: addDays(gridEnd, 1), weeks, monthStart };
}

function Agenda() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [range, setRange] = useState<Range>("week");
  const [anchor, setAnchor] = useState(() => isoDateInZone(new Date(), tz));
  const [selected, setSelected] = useState<Row | null>(null);

  const today = useMemo(() => isoDateInZone(new Date(), tz), [tz]);
  const bounds = useMemo(() => rangeBounds(anchor, range), [anchor, range]);
  const month = useMemo(() => (range === "month" ? monthGrid(anchor) : null), [anchor, range]);
  const fetchBounds = month ?? bounds;

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments", establishment?.id, fetchBounds.from, fetchBounds.to],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, status, notes, services(name, price_cents, duration_minutes), professionals(name), customers(name, phone, email)",
        )
        .eq("establishment_id", establishment!.id)
        .gte("starts_at", `${fetchBounds.from}T00:00:00`)
        .lt("starts_at", `${fetchBounds.to}T00:00:00`)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: businessHours } = useQuery({
    queryKey: ["business-hours", establishment?.id],
    enabled: Boolean(establishment?.id) && range === "week",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("opens_at, closes_at, closed")
        .eq("establishment_id", establishment!.id);
      if (error) throw error;
      return (data ?? []) as BusinessHour[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success("Agendamento atualizado");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSelected((prev) => (prev ? { ...prev, status } : prev));
    },
    onError: () => toast.error("Não foi possível atualizar"),
  });

  const setStatus = (id: string, status: AppointmentStatus) => updateStatus.mutate({ id, status });

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
    const map = new Map<string, Row[]>();
    for (const a of appointments ?? []) {
      const day = isoDateInZone(new Date(a.starts_at), tz);
      const key = `${day}-${hourInZone(a.starts_at, tz)}`;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [appointments, tz]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Agenda</h1>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
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
      ) : range === "week" ? (
        <WeekGrid
          days={weekDays}
          hours={hours}
          cellMap={cellMap}
          today={today}
          tz={tz}
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
                <DialogTitle>Detalhes do agendamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <AppointmentInfo appointment={selected} tz={tz} />
                <AppointmentActions appointment={selected} onUpdateStatus={setStatus} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WeekGrid({
  days,
  hours,
  cellMap,
  today,
  tz,
  onSelect,
}: {
  days: string[];
  hours: number[];
  cellMap: Map<string, Row[]>;
  today: string;
  tz: string;
  onSelect: (a: Row) => void;
}) {
  return (
    <div className="select-none overflow-x-auto rounded-xl border bg-card">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="sticky left-0 z-10 border-b border-r bg-card" />
        {days.map((day) => (
          <div
            key={day}
            className={`cursor-default border-b border-r p-2 text-center last:border-r-0 ${
              day === today ? "bg-primary/5" : ""
            }`}
          >
            <p className="text-[10px] font-bold uppercase text-muted-foreground">
              {WEEKDAYS_SHORT[weekdayOf(day)]}
            </p>
            <p className="text-sm font-bold">{Number(day.slice(8, 10))}</p>
          </div>
        ))}

        {hours.map((hour) => (
          <HourRow
            key={hour}
            hour={hour}
            days={days}
            cellMap={cellMap}
            today={today}
            tz={tz}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  days,
  cellMap,
  today,
  tz,
  onSelect,
}: {
  hour: number;
  days: string[];
  cellMap: Map<string, Row[]>;
  today: string;
  tz: string;
  onSelect: (a: Row) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r bg-card px-1 py-2 text-right text-[10px] font-semibold text-muted-foreground">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((day) => {
        const items = cellMap.get(`${day}-${hour}`) ?? [];
        return (
          <div
            key={day}
            className={`min-h-[52px] cursor-default border-b border-r p-1 last:border-r-0 ${
              day === today ? "bg-primary/5" : ""
            }`}
          >
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className={`mb-1 block w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring ${STATUS_CHIP[a.status]}`}
              >
                {timeInZone(a.starts_at, tz)} {a.customers?.name}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

function MonthGrid({
  weeks,
  monthStart,
  dayMap,
  today,
  onPickDay,
}: {
  weeks: string[][];
  monthStart: string;
  dayMap: Map<string, Row[]>;
  today: string;
  onPickDay: (day: string) => void;
}) {
  const monthPrefix = monthStart.slice(0, 7);
  return (
    <div className="select-none overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS_SHORT.map((wd) => (
          <div
            key={wd}
            className="cursor-default p-2 text-center text-[10px] font-bold uppercase text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7">
          {week.map((day) => {
            const items = dayMap.get(day) ?? [];
            const inMonth = day.slice(0, 7) === monthPrefix;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPickDay(day)}
                className={`flex min-h-[76px] cursor-pointer flex-col items-start gap-1 border-b border-r p-1.5 text-left outline-none last:border-r-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring ${
                  inMonth ? "" : "text-muted-foreground/50"
                } ${day === today ? "bg-primary/5" : ""}`}
              >
                <span className="text-xs font-bold">{Number(day.slice(8, 10))}</span>
                {items.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-0 bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary"
                  >
                    {items.length} agend.
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AppointmentInfo({ appointment: a, tz }: { appointment: Row; tz: string }) {
  return (
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
      {a.notes ? <p className="mt-1 text-xs italic text-muted-foreground">{a.notes}</p> : null}
    </div>
  );
}

function AppointmentActions({
  appointment: a,
  onUpdateStatus,
}: {
  appointment: Row;
  onUpdateStatus: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {a.status !== "confirmed" && a.status !== "completed" ? (
        <Button size="sm" onClick={() => onUpdateStatus(a.id, "confirmed")}>
          Confirmar
        </Button>
      ) : null}
      {a.status !== "completed" && a.status !== "cancelled" ? (
        <Button size="sm" variant="outline" onClick={() => onUpdateStatus(a.id, "completed")}>
          Concluir
        </Button>
      ) : null}
      {a.status !== "cancelled" ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => onUpdateStatus(a.id, "cancelled")}
        >
          Cancelar
        </Button>
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
