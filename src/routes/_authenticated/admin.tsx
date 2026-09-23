import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  CalendarCheck,
  ExternalLink,
  LogOut,
  Megaphone,
  Menu,
  Scissors,
  Settings,
  Share2,
  Users,
  Clock,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment, type Establishment } from "@/hooks/use-establishment";
import { slugify, WEEKDAYS } from "@/lib/booking";
import { isNativeAndroid } from "@/lib/whatsapp-intent";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

type NavLeaf = { to: string; label: string; tab: string };
type NavEntry =
  | { kind: "link"; to: string; label: string; icon: typeof CalendarDays; exact?: boolean }
  | {
      kind: "group";
      label: string;
      icon: typeof CalendarDays;
      basePath: string;
      leaves: NavLeaf[];
    };

/** Menu em cascata: cada categoria abaixo mostra suas telas como sub-itens sempre visíveis. */
const NAV: NavEntry[] = [
  { kind: "link", to: "/admin", label: "Agenda", icon: CalendarDays, exact: true },
  {
    kind: "group",
    label: "Clientes",
    icon: Users,
    basePath: "/admin/customers",
    leaves: [
      { to: "/admin/customers", label: "Contatos", tab: "contatos" },
      { to: "/admin/customers", label: "Funil", tab: "funil" },
    ],
  },
  {
    kind: "group",
    label: "Serviços e produtos",
    icon: Scissors,
    basePath: "/admin/services",
    leaves: [
      { to: "/admin/services", label: "Serviços", tab: "servicos" },
      { to: "/admin/services", label: "Produtos", tab: "produtos" },
    ],
  },
  { kind: "link", to: "/admin/professionals", label: "Profissionais", icon: UserRound },
  { kind: "link", to: "/admin/hours", label: "Funcionamento", icon: Clock },
  { kind: "link", to: "/admin/finance", label: "Financeiro", icon: Wallet },
  {
    kind: "group",
    label: "Marketing",
    icon: Megaphone,
    basePath: "/admin/marketing",
    leaves: [
      { to: "/admin/marketing", label: "Links personalizados", tab: "links" },
      { to: "/admin/marketing", label: "Mensagem", tab: "mensagem" },
    ],
  },
  {
    kind: "group",
    label: "Notificações",
    icon: Bell,
    basePath: "/admin/notificacoes",
    leaves: [
      { to: "/admin/notificacoes", label: "Console", tab: "console" },
      { to: "/admin/notificacoes", label: "Central", tab: "central" },
    ],
  },
  { kind: "link", to: "/admin/settings", label: "Dados da empresa", icon: Settings },
];

function AdminLayout() {
  const { data: establishment, isLoading } = useEstablishment();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as { tab?: string } });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <aside className="hidden shrink-0 flex-col border-r bg-card md:sticky md:top-0 md:flex md:h-screen md:w-60">
        <NavContent
          establishment={establishment}
          pathname={pathname}
          search={search}
          onSignOut={signOut}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMobileNavOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarCheck className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{establishment.name}</span>
          </span>
          <NotificationBell establishment={establishment} />
        </header>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <NavContent
              establishment={establishment}
              pathname={pathname}
              search={search}
              onSignOut={signOut}
              onNavigate={() => setMobileNavOpen(false)}
              showNotifications={false}
            />
          </SheetContent>
        </Sheet>

        <main className="mx-auto w-full max-w-5xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavContent({
  establishment,
  pathname,
  search,
  onSignOut,
  onNavigate,
  showNotifications = true,
}: {
  establishment: Establishment;
  pathname: string;
  search: { tab?: string };
  onSignOut: () => void;
  onNavigate?: () => void;
  showNotifications?: boolean;
}) {
  return (
    <>
      <div
        className={`flex items-center gap-2.5 border-b px-4 py-3.5 ${
          showNotifications ? "" : "pr-11"
        }`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
          <CalendarCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{establishment.name}</span>
        {showNotifications ? <NotificationBell establishment={establishment} /> : null}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          if (item.kind === "link") {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          }

          const groupActive = pathname.startsWith(item.basePath);
          const defaultTab = item.leaves[0]!.tab;
          return (
            <div key={item.label} className="space-y-0.5">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                  groupActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </div>
              {item.leaves.map((leaf) => {
                const active = pathname === leaf.to && (search.tab ?? defaultTab) === leaf.tab;
                return (
                  <Link
                    key={`${leaf.to}-${leaf.tab}`}
                    to={leaf.to}
                    search={{ tab: leaf.tab }}
                    onClick={onNavigate}
                    className={`ml-2 flex items-center gap-2 rounded-lg border-l-2 py-1.5 pl-3 text-sm font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:border-muted hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {leaf.label}
                  </Link>
                );
              })}
            </div>
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
            onClick={(e) => {
              onNavigate?.();
              if (isNativeAndroid()) {
                e.preventDefault();
                void Browser.open({ url: `${window.location.origin}/b/${establishment.slug}` });
              }
            }}
          >
            <ExternalLink className="size-4" />
            Página pública
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={async () => {
            const url = `${window.location.origin}/b/${establishment.slug}`;
            try {
              await Share.share({ title: establishment.name, url, dialogTitle: "Compartilhar" });
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") return; // usuário cancelou
              await navigator.clipboard.writeText(url);
              toast.success("Link copiado");
            }
          }}
        >
          <Share2 className="size-4" />
          Compartilhar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            onNavigate?.();
            onSignOut();
          }}
        >
          <LogOut className="size-4" />
          Sair
        </Button>
      </div>
    </>
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
