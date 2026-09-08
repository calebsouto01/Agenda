import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { addDays, formatPrice, isoDateInZone } from "@/lib/booking";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const HISTORY_DAYS = 60;

type HistoryRow = {
  service_names: string | null;
  total_price_cents: number | null;
  services: { name: string; price_cents: number } | null;
};

type FutureRow = {
  status: "pending" | "confirmed";
  total_price_cents: number | null;
  services: { price_cents: number } | null;
};

function priceOf(a: {
  total_price_cents: number | null;
  services: { price_cents: number } | null;
}) {
  return a.total_price_cents ?? a.services?.price_cents ?? 0;
}

function labelOf(a: { service_names: string | null; services: { name: string } | null }) {
  return a.service_names ?? a.services?.name ?? "Sem serviço";
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.max(
    0,
    Math.round(
      (new Date(`${toIso}T12:00:00Z`).getTime() - new Date(`${fromIso}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
}

export function ForecastTab({
  establishmentId,
  tz,
  bounds,
  realizedCents,
}: {
  establishmentId: string;
  tz: string;
  bounds: { from: string; to: string };
  realizedCents: number;
}) {
  const todayIso = isoDateInZone(new Date(), tz);
  const historyFrom = addDays(todayIso, -HISTORY_DAYS);
  const remainingFrom = bounds.from > todayIso ? bounds.from : addDays(todayIso, 1);
  const daysRemaining = remainingFrom < bounds.to ? daysBetween(remainingFrom, bounds.to) : 0;

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["forecast-history", establishmentId, historyFrom, todayIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("service_names, total_price_cents, services(name, price_cents)")
        .eq("establishment_id", establishmentId)
        .eq("status", "completed")
        .gte("starts_at", `${historyFrom}T00:00:00`)
        .lt("starts_at", `${addDays(todayIso, 1)}T00:00:00`);
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
  });

  const { data: future, isLoading: loadingFuture } = useQuery({
    queryKey: ["forecast-future", establishmentId, bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("status, total_price_cents, services(price_cents)")
        .eq("establishment_id", establishmentId)
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", `${bounds.from}T00:00:00`)
        .lt("starts_at", `${bounds.to}T00:00:00`);
      if (error) throw error;
      return (data ?? []) as unknown as FutureRow[];
    },
  });

  const byService = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const a of history ?? []) {
      const name = labelOf(a);
      const entry = map.get(name) ?? { qty: 0, total: 0 };
      entry.qty += 1;
      entry.total += priceOf(a);
      map.set(name, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        avgQtyPerDay: v.qty / HISTORY_DAYS,
        avgCentsPerDay: v.total / HISTORY_DAYS,
        projectedQty: (v.qty / HISTORY_DAYS) * daysRemaining,
        projectedCents: (v.total / HISTORY_DAYS) * daysRemaining,
      }))
      .sort((a, b) => b.projectedCents - a.projectedCents);
  }, [history, daysRemaining]);

  const bookedFutureCents = (future ?? []).reduce((sum, a) => sum + priceOf(a), 0);
  const projectedFromTrendCents = byService.reduce((sum, s) => sum + s.projectedCents, 0);
  const totalForecastCents = realizedCents + bookedFutureCents + projectedFromTrendCents;

  const isLoading = loadingHistory || loadingFuture;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Realizado</p>
            <p className="text-lg font-extrabold">{formatPrice(realizedCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Já agendado</p>
            <p className="text-lg font-extrabold">{formatPrice(bookedFutureCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Tendência p/ dias sem agenda
            </p>
            <p className="text-lg font-extrabold">{formatPrice(projectedFromTrendCents)}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-primary">
              <TrendingUp className="size-3.5" /> Previsão do período
            </p>
            <p className="text-lg font-extrabold text-primary">{formatPrice(totalForecastCents)}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Previsão baseada na média diária de vendas de cada serviço nos últimos {HISTORY_DAYS} dias,
        projetada para os {daysRemaining} dia(s) restantes do período. Estimativa, não garantia.
      </p>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : byService.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sem histórico suficiente para prever vendas por serviço.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              Previsão de vendas por serviço
            </p>
            {byService.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {s.name}{" "}
                  <span className="text-muted-foreground">
                    (~{s.projectedQty.toFixed(1)} atendimento(s))
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(s.projectedCents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
