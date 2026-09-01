import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  CalendarCheck,
  ExternalLink,
  LogOut,
  Scissors,
  Settings,
  Users,
  Clock,
  Ban,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { slugify, WEEKDAYS } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof CalendarDays; exact?: boolean }[] = [
  { to: "/admin", label: "Agenda", icon: CalendarDays, exact: true },
  { to: "/admin/services", label: "Serviços", icon: Scissors },
  { to: "/admin/professionals", label: "Profissionais", icon: UserRound },
  { to: "/admin/hours", label: "Funcionamento", icon: Clock },
  { to: "/admin/blocks", label: "Bloqueios", icon: Ban },
  { to: "/admin/customers", label: "Clientes", icon: Users },
  { to: "/admin/finance", label: "Financeiro", icon: Wallet },
  { to: "/admin/settings", label: "Dados da empresa", icon: Settings },
];

function AdminLayout() {
  const { data: establishment, isLoading } = useEstablishment();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!establishment) return <Onboarding onSignOut={signOut} />;

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden shrink-0 flex-col border-r bg-card md:sticky md:top-0 md:flex md:h-screen md:w-56">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <CalendarCheck className="size-5 shrink-0 text-primary" />
          <span className="truncate text-sm font-bold">{establishment.name}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t p-3">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <a
              href={`/b/${establishment.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="size-4" />
              Página pública
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarCheck className="size-5 shrink-0 text-primary" />
              <span className="truncate text-sm font-bold">{establishment.name}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <a
                  href={`/b/${establishment.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1"
                >
                  <ExternalLink className="size-4" />
                  <span className="hidden sm:inline">Página pública</span>
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Onboarding({ onSignOut }: { onSignOut: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", slug: "", description: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);

  async function create() {
    const name = form.name.trim();
    if (name.length < 2) {
      toast.error("Informe o nome do estabelecimento");
      return;
    }
    const slug = slugify(form.slug || name);
    if (!slug) {
      toast.error("Informe um link público válido");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("establishments")
      .insert({
        owner_id: auth.user!.id,
        name,
        slug,
        description: form.description.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      toast.error(
        error?.code === "23505" ? "Este link público já está em uso" : "Não foi possível criar",
      );
      return;
    }

    // Default opening hours: Monday to Saturday, 09:00 - 18:00
    await supabase.from("business_hours").insert(
      WEEKDAYS.map((_, weekday) => ({
        establishment_id: data.id,
        weekday,
        opens_at: "09:00",
        closes_at: "18:00",
        closed: weekday === 0,
      })),
    );

    setSaving(false);
    toast.success("Estabelecimento criado!");
    await queryClient.invalidateQueries();
  }

  return (
    <main className="flex min-h-screen items-center justify-center surface-hero p-4">
      <Card className="w-full max-w-md shadow-soft">
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-extrabold">Crie seu estabelecimento</h1>
            <p className="text-sm text-muted-foreground">
              Primeiro passo para publicar sua página de agendamento.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="slug">Link público</Label>
            <Input
              id="slug"
              maxLength={48}
              placeholder={slugify(form.name) || "meu-negocio"}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              /b/{slugify(form.slug || form.name) || "meu-negocio"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              maxLength={400}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input
              id="phone"
              maxLength={30}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              maxLength={200}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <Button className="w-full" disabled={saving} onClick={create}>
            {saving ? "Criando..." : "Criar estabelecimento"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onSignOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
