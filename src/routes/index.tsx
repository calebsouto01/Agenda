import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Clock, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda — Agendamento online para qualquer serviço" },
      {
        name: "description",
        content:
          "Escolha o estabelecimento, o serviço, o profissional e um horário livre. Agendamento online simples para barbearias, salões, clínicas, oficinas e mais.",
      },
      { property: "og:title", content: "Agenda — Agendamento online para qualquer serviço" },
      {
        property: "og:description",
        content:
          "Agende em segundos: serviço, profissional, data e horário disponível, com confirmação na tela.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: establishments, isLoading } = useQuery({
    queryKey: ["public-establishments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select("id, name, slug, description, address")
        .order("created_at", { ascending: true })
        .limit(24);
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="min-h-screen surface-hero">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-base font-bold">
          <CalendarCheck className="size-5 text-primary" />
          Agenda
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Área do administrador</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-10 pt-6 text-center sm:pt-14">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Para qualquer negócio de serviços e horários
        </span>
        <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">
          Agendamento online, sem conversa de ida e volta
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          Seus clientes escolhem o serviço, o profissional e um horário realmente livre. Você
          gerencia tudo em um painel único.
        </p>
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: Clock, label: "Horários calculados em tempo real" },
            { icon: ShieldCheck, label: "Sem reservas duplicadas" },
            { icon: Users, label: "Serviços e profissionais próprios" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-xl border bg-card/70 p-3 text-left text-xs font-medium"
            >
              <item.icon className="size-4 shrink-0 text-primary" />
              {item.label}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-4 text-lg font-bold">Estabelecimentos disponíveis</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : establishments && establishments.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {establishments.map((e) => (
              <Card key={e.id} className="shadow-soft">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div>
                    <h3 className="text-base font-bold">{e.name}</h3>
                    {e.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {e.description}
                      </p>
                    ) : null}
                  </div>
                  {e.address ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {e.address}
                    </p>
                  ) : null}
                  <Button asChild className="mt-auto w-full">
                    <Link to="/b/$slug" params={{ slug: e.slug }}>
                      Agendar
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="shadow-soft">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum estabelecimento cadastrado ainda.{" "}
              <Link to="/admin" className="font-semibold text-primary underline">
                Crie o seu
              </Link>{" "}
              para publicar sua página de agendamento.
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
