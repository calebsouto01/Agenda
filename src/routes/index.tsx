import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  CheckCheck,
  Clock,
  ListChecks,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://agendazaka.com/#organization",
      name: "Zaka",
      legalName: "CALEB FERREIRA SOUTO DE OLIVEIRA",
      url: "https://agendazaka.com/",
      logo: "https://agendazaka.com/logo-512.png",
      description:
        "Plataforma brasileira de agendamento online, CRM de clientes e gestão financeira para negócios de serviços.",
    },
    {
      "@type": "WebApplication",
      name: "Zaka",
      url: "https://agendazaka.com/",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android",
      description:
        "Agenda online, CRM de clientes (Contatos, Pipeline e Clientes) e controle financeiro para barbearias, salões, clínicas, oficinas e outros negócios de horário marcado.",
      publisher: { "@id": "https://agendazaka.com/#organization" },
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zaka — Pare de perder agendamento no WhatsApp" },
      {
        name: "description",
        content:
          "O Zaka organiza sua agenda, seus clientes e seu caixa num só lugar, pra você parar de perder horário por mensagem que ninguém viu. Grátis para começar.",
      },
      { property: "og:title", content: "Zaka — Pare de perder agendamento no WhatsApp" },
      {
        property: "og:description",
        content:
          "Agenda online, CRM de clientes e fluxo de caixa automático para barbearias, salões, clínicas, oficinas e outros negócios de horário marcado.",
      },
    ],
    scripts: [
      {
        attrs: { type: "application/ld+json" },
        children: JSON.stringify(STRUCTURED_DATA),
      },
    ],
  }),
  component: Home,
});

const PREVIEW_SLOTS = [
  { time: "09:00", client: null, service: null, status: null },
  { time: "10:00", client: "João Pedro", service: "Corte + Barba", status: "confirmed" as const },
  { time: "11:00", client: null, service: null, status: null },
  { time: "14:00", client: "Marina Alves", service: "Coloração", status: "confirmed" as const },
  { time: "16:30", client: "Rafael Souza", service: "Corte", status: "pending" as const },
];

function AgendaPreview() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border bg-card p-2 shadow-xl">
      <div className="rounded-[1.5rem] border bg-background p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Hoje</p>
            <p className="text-sm font-bold">Terça, 15 de setembro</p>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarCheck className="size-4" />
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {PREVIEW_SLOTS.map((slot) => (
            <div key={slot.time} className="flex items-center gap-2.5">
              <span className="w-9 shrink-0 text-[11px] font-medium text-muted-foreground">
                {slot.time}
              </span>
              {slot.client ? (
                <div
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2",
                    slot.status === "confirmed"
                      ? "border-success/30 bg-success/10"
                      : "border-warning/30 bg-warning/20",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{slot.client}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{slot.service}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[9px] font-bold uppercase tracking-wide",
                      slot.status === "confirmed" ? "text-success" : "text-warning-foreground",
                    )}
                  >
                    {slot.status === "confirmed" ? "Confirmado" : "Pendente"}
                  </span>
                </div>
              ) : (
                <div className="h-8 flex-1 rounded-lg border border-dashed" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatChaosPreview() {
  return (
    <div className="mx-auto w-full max-w-xs space-y-2 rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 border-b pb-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Send className="size-3" />
        </span>
        <p className="text-xs font-semibold text-muted-foreground">WhatsApp do negócio</p>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-muted px-3 py-2 text-[11px]">
          Oi, tem horário sexta de manhã?
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-muted px-3 py-2 text-[11px]">
          Vocês abrem hoje?
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 pt-1">
        <p className="text-[10px] text-muted-foreground">vista, sem resposta</p>
        <CheckCheck className="size-3 text-muted-foreground" />
      </div>
    </div>
  );
}

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
          Zaka
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Área do administrador</Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Para barbearia, salão, clínica, oficina e outros negócios de horário marcado
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">
            Cada agendamento perdido no WhatsApp é dinheiro saindo do seu bolso.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base lg:mx-0">
            O Zaka organiza sua agenda, seus clientes e seu caixa num só lugar — pra você parar de
            perder horário por mensagem que ninguém viu.
          </p>
          <div className="mt-7 flex flex-col items-center gap-2 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/admin">
                Comece agora, grátis <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sem cartão de crédito. Sua agenda no ar em poucos minutos.
          </p>
        </div>
        <AgendaPreview />
      </section>

      <section className="border-t bg-card/40 px-4 py-14 sm:py-20">
        <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <ChatChaosPreview />
          <div className="text-center lg:text-left">
            <h2 className="text-xl font-extrabold sm:text-2xl">
              Isso não é falta de esforço seu. É falta de ferramenta certa.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base lg:mx-0">
              Cliente manda mensagem, você esquece de responder, ele marca em outro lugar. Dois
              clientes marcam no mesmo horário porque ninguém cruzou a agenda. No fim do mês, você
              não sabe quanto realmente entrou de caixa.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            {
              icon: Clock,
              title: "Agenda online 24h",
              description: "Cliente marca sozinho, sem trocar mensagem — mesmo de madrugada.",
            },
            {
              icon: ShieldCheck,
              title: "Zero horário duplicado",
              description: "O sistema calcula o que está livre de verdade, sem choque de agenda.",
            },
            {
              icon: Wallet,
              title: "Fluxo de caixa automático",
              description: "Sabe quanto entrou e saiu sem precisar abrir o caderno.",
            },
            {
              icon: UsersRound,
              title: "CRM simples",
              description: "Nunca mais perde um contato que quase virou cliente.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-xl border bg-card p-5 shadow-soft">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-card/40 px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-xl font-extrabold sm:text-2xl">
            Do caderno pro ar em 3 passos
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            {[
              {
                icon: ListChecks,
                title: "Cadastre seus serviços",
                description: "Nome, preço e duração de cada serviço. Leva menos de 5 minutos.",
              },
              {
                icon: Send,
                title: "Compartilhe seu link",
                description: "Manda pro cliente no WhatsApp, Instagram, onde ele já está.",
              },
              {
                icon: CalendarCheck,
                title: "Receba organizado",
                description: "Agendamento confirmado, sem choque de horário, direto no painel.",
              },
            ].map((step, i) => (
              <div key={step.title} className="text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-foreground">
                  {i + 1}
                </span>
                <step.icon className="mx-auto mt-3 size-5 text-primary" />
                <h3 className="mt-2 text-sm font-bold">{step.title}</h3>
                <p className="mx-auto mt-1 max-w-[220px] text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <h2 className="mb-4 text-lg font-bold">Negócios que já usam o Zaka</h2>
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

      <section className="border-t px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-10">
          <h2 className="text-xl font-extrabold sm:text-2xl">
            Pare de perder agendamento. Comece agora, grátis.
          </h2>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <Link to="/admin">
              Criar minha agenda <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link to="/termos" className="hover:text-foreground hover:underline">
            Termos de Uso
          </Link>
          <span className="text-muted-foreground/50">·</span>
          <Link to="/privacidade" className="hover:text-foreground hover:underline">
            Política de Privacidade
          </Link>
        </div>
        <p className="mt-2">CNPJ 67.596.409/0001-93</p>
        <p>67.596.409 CALEB FERREIRA SOUTO DE OLIVEIRA</p>
      </footer>
    </main>
  );
}
