import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
  appointments: { count: number }[];
};

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const [term, setTerm] = useState("");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, created_at, appointments(count)")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const filtered = (customers ?? []).filter((c) =>
    `${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Clientes</h1>
      <Input
        placeholder="Buscar por nome, telefone ou e-mail"
        maxLength={80}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length > 0 ? (
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
                  {c.appointments?.[0]?.count ?? 0} agendamento(s)
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
