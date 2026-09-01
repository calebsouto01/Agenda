import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import type { AppointmentStatus } from "@/lib/booking";
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
  appointments: { status: AppointmentStatus }[];
};

type View = "list" | "rank";

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const [term, setTerm] = useState("");
  const [view, setView] = useState<View>("list");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, created_at, appointments(status)")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const withCounts = useMemo(
    () =>
      (customers ?? []).map((c) => ({
        ...c,
        total: c.appointments.length,
        visits: c.appointments.filter((a) => a.status === "completed").length,
      })),
    [customers],
  );

  const filtered = withCounts.filter((c) =>
    `${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

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
                  <p className="truncate text-sm font-semibold">{c.name}</p>
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
                  <p className="truncate text-sm font-semibold">{c.name}</p>
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
