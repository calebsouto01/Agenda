import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis } from "recharts";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  PAYMENT_METHOD_LABEL,
  addDays,
  dateTimeInZone,
  formatDateLabel,
  formatPrice,
  isoDateInZone,
  weekdayOf,
  type PaymentMethod,
} from "@/lib/booking";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  component: FinancePage,
});

type Range = "day" | "week" | "month";

type Row = {
  id: string;
  starts_at: string;
  paid: boolean;
  service_names: string | null;
  total_price_cents: number | null;
  services: { name: string; price_cents: number } | null;
  professionals: { name: string } | null;
  customers: { name: string } | null;
};

type PaymentEntryRow = {
  id: string;
  method: PaymentMethod;
  amount_cents: number;
  note: string | null;
  appointments: { starts_at: string; customers: { name: string } | null } | null;
};

/** Combinado de vários serviços tem preço somado override; um único serviço usa o join normal. */
function priceOf(a: {
  total_price_cents: number | null;
  services: { price_cents: number } | null;
}) {
  return a.total_price_cents ?? a.services?.price_cents ?? 0;
}

function serviceLabelOf(a: { service_names: string | null; services: { name: string } | null }) {
  return a.service_names ?? a.services?.name ?? "Sem serviço";
}

function rangeBounds(anchor: string, range: Range) {
  if (range === "day") return { from: anchor, to: addDays(anchor, 1) };
  if (range === "week") {
    const start = addDays(anchor, -weekdayOf(anchor));
    return { from: start, to: addDays(start, 7) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

function previousBounds(bounds: { from: string; to: string }) {
  const days = Math.round(
    (new Date(`${bounds.to}T12:00:00Z`).getTime() -
      new Date(`${bounds.from}T12:00:00Z`).getTime()) /
      86_400_000,
  );
  return { from: addDays(bounds.from, -days), to: bounds.from };
}

/** Moves the anchor by one calendar unit (day/week/month), not a fixed day count. */
function shiftAnchor(anchor: string, range: Range, direction: 1 | -1) {
  if (range === "day") return addDays(anchor, direction);
  if (range === "week") return addDays(anchor, direction * 7);
  const d = new Date(`${anchor}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

function FinancePage() {
  const { data: establishment } = useEstablishment();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [range, setRange] = useState<Range>("month");
  const [anchor, setAnchor] = useState(() => isoDateInZone(new Date(), tz));

  const bounds = useMemo(() => rangeBounds(anchor, range), [anchor, range]);
  const prevBounds = useMemo(() => previousBounds(bounds), [bounds]);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["finance-appointments", establishment?.id, bounds.from, bounds.to],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, paid, service_names, total_price_cents, services(name, price_cents), professionals(name), customers(name)",
        )
        .eq("establishment_id", establishment!.id)
        .eq("status", "completed")
        .gte("starts_at", `${bounds.from}T00:00:00`)
        .lt("starts_at", `${bounds.to}T00:00:00`)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: previousTotalCents } = useQuery({
    queryKey: ["finance-previous", establishment?.id, prevBounds.from, prevBounds.to],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("total_price_cents, services(price_cents)")
        .eq("establishment_id", establishment!.id)
        .eq("status", "completed")
        .gte("starts_at", `${prevBounds.from}T00:00:00`)
        .lt("starts_at", `${prevBounds.to}T00:00:00`);
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        total_price_cents: number | null;
        services: { price_cents: number } | null;
      }[];
      return rows.reduce((sum, r) => sum + priceOf(r), 0);
    },
  });

  const appointmentIds = useMemo(() => (appointments ?? []).map((a) => a.id), [appointments]);

  const { data: paymentEntries } = useQuery({
    queryKey: ["finance-payment-entries", appointmentIds],
    enabled: appointmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_entries")
        .select("id, method, amount_cents, note, appointments(starts_at, customers(name))")
        .in("appointment_id", appointmentIds);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentEntryRow[];
    },
  });

  const totalCents = (appointments ?? []).reduce((sum, a) => sum + priceOf(a), 0);
  const receivedCents = (appointments ?? [])
    .filter((a) => a.paid)
    .reduce((sum, a) => sum + priceOf(a), 0);
  const count = appointments?.length ?? 0;
  const avgTicketCents = count > 0 ? Math.round(totalCents / count) : 0;
  const change =
    previousTotalCents && previousTotalCents > 0
      ? ((totalCents - previousTotalCents) / previousTotalCents) * 100
      : null;

  const byService = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const a of appointments ?? []) {
      const name = serviceLabelOf(a);
      const entry = map.get(name) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += priceOf(a);
      map.set(name, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [appointments]);

  const byProfessional = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const a of appointments ?? []) {
      const name = a.professionals?.name ?? "Sem profissional";
      const entry = map.get(name) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += priceOf(a);
      map.set(name, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [appointments]);

  const byPaymentMethod = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const e of paymentEntries ?? []) {
      const name = PAYMENT_METHOD_LABEL[e.method];
      const entry = map.get(name) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += e.amount_cents;
      map.set(name, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [paymentEntries]);

  const paymentsWithNote = useMemo(
    () => (paymentEntries ?? []).filter((e) => e.method === "outro" && e.note),
    [paymentEntries],
  );

  const byDay = useMemo(() => {
    if (range === "day") return [];
    const map = new Map<string, number>();
    for (const a of appointments ?? []) {
      const day = isoDateInZone(new Date(a.starts_at), tz);
      map.set(day, (map.get(day) ?? 0) + priceOf(a));
    }
    const days: { date: string; total: number }[] = [];
    for (let d = bounds.from; d < bounds.to; d = addDays(d, 1)) {
      days.push({ date: d, total: (map.get(d) ?? 0) / 100 });
    }
    return days;
  }, [appointments, bounds, range, tz]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Financeiro</h1>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-card p-2">
        <Button variant="ghost" size="sm" onClick={() => setAnchor(shiftAnchor(anchor, range, -1))}>
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
        <Button variant="ghost" size="sm" onClick={() => setAnchor(shiftAnchor(anchor, range, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Faturado</p>
                <p className="text-lg font-extrabold">{formatPrice(totalCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Recebido</p>
                <p className="text-lg font-extrabold text-success">{formatPrice(receivedCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Atendimentos</p>
                <p className="text-lg font-extrabold">{count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Ticket médio</p>
                <p className="text-lg font-extrabold">{formatPrice(avgTicketCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Vs. período anterior</p>
                {change === null ? (
                  <p className="text-lg font-extrabold text-muted-foreground">—</p>
                ) : (
                  <p
                    className={`flex items-center gap-1 text-lg font-extrabold ${
                      change >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {change >= 0 ? (
                      <TrendingUp className="size-4" />
                    ) : (
                      <TrendingDown className="size-4" />
                    )}
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(0)}%
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {byDay.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Faturamento por dia
                </p>
                <ChartContainer config={{}} className="aspect-auto h-56 w-full">
                  <BarChart data={byDay}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(8, 10)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <Tooltip
                      formatter={(value: number) => formatPrice(Math.round(value * 100))}
                      labelFormatter={(label: string) => formatDateLabel(label)}
                      cursor={{ fill: "var(--muted)" }}
                    />
                    <Bar dataKey="total" fill="var(--primary)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Por forma de pagamento
                </p>
                {byPaymentMethod.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada recebido no período.</p>
                ) : (
                  byPaymentMethod.map((m) => (
                    <div key={m.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {m.name} <span className="text-muted-foreground">({m.count})</span>
                      </span>
                      <span className="shrink-0 font-semibold">{formatPrice(m.total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold text-muted-foreground">Por serviço</p>
                {byService.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum atendimento no período.</p>
                ) : (
                  byService.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {s.name} <span className="text-muted-foreground">({s.count})</span>
                      </span>
                      <span className="shrink-0 font-semibold">{formatPrice(s.total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold text-muted-foreground">Por profissional</p>
                {byProfessional.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum atendimento no período.</p>
                ) : (
                  byProfessional.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {p.name} <span className="text-muted-foreground">({p.count})</span>
                      </span>
                      <span className="shrink-0 font-semibold">{formatPrice(p.total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {paymentsWithNote.length > 0 ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Pagamentos com observação
                </p>
                {paymentsWithNote.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {e.appointments?.customers?.name ?? "Cliente"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.appointments ? dateTimeInZone(e.appointments.starts_at, tz) : ""} ·{" "}
                        {e.note}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">{formatPrice(e.amount_cents)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
