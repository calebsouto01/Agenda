import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import type { AppointmentStatus } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
  appointments: { status: AppointmentStatus; starts_at: string }[];
};

type View = "list" | "rank";
type Segment = "new" | "recurring" | "inactive";

/** Days since the last completed visit after which a customer is considered inactive. */
const INACTIVE_AFTER_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const SEGMENT_LABEL: Record<Segment, string> = {
  new: "Novo",
  recurring: "Recorrente",
  inactive: "Inativo",
};

const SEGMENT_BADGE: Record<Segment, string> = {
  new: "bg-primary/15 text-primary",
  recurring: "bg-success/20 text-success",
  inactive: "bg-muted text-muted-foreground",
};

const SEGMENT_FILTERS: { value: "all" | Segment; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: SEGMENT_LABEL.new },
  { value: "recurring", label: SEGMENT_LABEL.recurring },
  { value: "inactive", label: SEGMENT_LABEL.inactive },
];

/** Novo: sem visita ainda, ou só uma, recente. Recorrente: 2+ visitas recentes. Inativo: sem visita há muito tempo. */
function segmentOf(visits: number, lastVisitAt: string | null): Segment {
  if (visits === 0 || !lastVisitAt) return "new";
  const daysSince = (Date.now() - new Date(lastVisitAt).getTime()) / DAY_MS;
  if (daysSince > INACTIVE_AFTER_DAYS) return "inactive";
  return visits >= 2 ? "recurring" : "new";
}

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const [term, setTerm] = useState("");
  const [view, setView] = useState<View>("list");
  const [segmentFilter, setSegmentFilter] = useState<"all" | Segment>("all");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, created_at, appointments(status, starts_at)")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const withCounts = useMemo(
    () =>
      (customers ?? []).map((c) => {
        const completed = c.appointments.filter((a) => a.status === "completed");
        const visits = completed.length;
        const lastVisitAt = completed.length
          ? completed.reduce(
              (max, a) => (a.starts_at > max ? a.starts_at : max),
              completed[0]!.starts_at,
            )
          : null;
        return {
          ...c,
          total: c.appointments.length,
          visits,
          segment: segmentOf(visits, lastVisitAt),
        };
      }),
    [customers],
  );

  const filtered = withCounts.filter((c) => {
    const matchesTerm = `${c.name} ${c.phone} ${c.email ?? ""}`
      .toLowerCase()
      .includes(term.trim().toLowerCase());
    const matchesSegment = segmentFilter === "all" || c.segment === segmentFilter;
    return matchesTerm && matchesSegment;
  });

  const ranked = useMemo(
    () => [...filtered].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Clientes</h1>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="rank">Rank</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Input
        placeholder="Buscar por nome, telefone ou e-mail"
        maxLength={80}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {SEGMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSegmentFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              segmentFilter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado.
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <div className="grid gap-2">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <Badge variant="outline" className={`border-0 ${SEGMENT_BADGE[c.segment]}`}>
                      {SEGMENT_LABEL[c.segment]}
                    </Badge>
                  </div>
                  <a
                    href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <Phone className="size-3" />
                    {c.phone}
                  </a>
                  {c.email ? (
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.total} agendamento(s)
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {ranked.map((c, i) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    i === 0 ? "bg-warning/20 text-warning-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <Badge variant="outline" className={`border-0 ${SEGMENT_BADGE[c.segment]}`}>
                      {SEGMENT_LABEL[c.segment]}
                    </Badge>
                  </div>
                  <a
                    href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <Phone className="size-3" />
                    {c.phone}
                  </a>
                </div>
                <span className="shrink-0 text-sm font-bold">
                  {c.visits} visita{c.visits === 1 ? "" : "s"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
