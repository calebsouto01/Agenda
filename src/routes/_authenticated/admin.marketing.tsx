import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, Lock, Megaphone, MousePointerClick, Wallet } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { isPro } from "@/lib/plans";
import { formatPrice } from "@/lib/booking";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  component: MarketingPage,
});

type Channel = "instagram" | "facebook" | "whatsapp" | "anuncio" | "outro";

const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  anuncio: "Anúncio",
  outro: "Outro",
};

type MarketingLink = {
  id: string;
  label: string;
  channel: Channel;
  code: string;
  active: boolean;
  created_at: string;
};

type LinkStats = {
  link_id: string;
  clicks: number;
  agendamentos: number;
  comparecimentos: number;
  faturamento_cents: number;
};

function MarketingPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ label: string; channel: Channel }>({
    label: "",
    channel: "instagram",
  });

  const { data: links } = useQuery({
    queryKey: ["marketing-links", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_links")
        .select("id, label, channel, code, active, created_at")
        .eq("establishment_id", establishment!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingLink[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-link-stats", establishment?.id],
    enabled: Boolean(establishment?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_link_stats", {
        p_establishment_id: establishment!.id,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as LinkStats[];
    },
  });

  const statsByLink = new Map((stats ?? []).map((s) => [s.link_id, s]));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["marketing-links"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-link-stats"] });
  }

  const createLink = useMutation({
    mutationFn: async () => {
      const label = form.label.trim();
      if (label.length < 2) throw new Error("Dê um nome pro link, ex.: Story de terça");
      const { error } = await supabase
        .from("marketing_links")
        .insert({ establishment_id: establishment!.id, label, channel: form.channel });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Link criado");
      setForm({ label: "", channel: "instagram" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("marketing_links").update({ active }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: () => toast.error("Não foi possível atualizar"),
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  if (!isPro(establishment.plan)) {
    return (
      <div className="space-y-4">
        <PageTitle icon={Megaphone}>Marketing</PageTitle>
        <Card className="shadow-soft">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Marketing é um recurso do plano Pro</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Crie links rastreados pra cada post, story ou anúncio e veja quantos agendamentos e
                quanto de faturamento cada ação trouxe. Assine o Pro para liberar.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link to="/admin/settings">Assinar Pro — R$ 19,90/mês</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle icon={Megaphone}>Marketing</PageTitle>
      <p className="text-sm text-muted-foreground">
        Crie um link pra cada post, story ou anúncio. Compartilhe esse link em vez do link direto da
        sua página — assim cada agendamento que vier dele fica contado abaixo.
      </p>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5">
          <p className="text-sm font-semibold">Novo link</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="link-label">Nome (só pra você identificar)</Label>
              <Input
                id="link-label"
                placeholder="Ex.: Story de terça"
                maxLength={80}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm({ ...form, channel: v as Channel })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="self-end"
              disabled={createLink.isPending}
              onClick={() => createLink.mutate()}
            >
              Criar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {(links ?? []).length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum link criado ainda.
            </CardContent>
          </Card>
        ) : (
          (links ?? []).map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              stats={statsByLink.get(link.id) ?? null}
              onToggleActive={(active) => toggleActive.mutate({ id: link.id, active })}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LinkCard({
  link,
  stats,
  onToggleActive,
}: {
  link: MarketingLink;
  stats: LinkStats | null;
  onToggleActive: (active: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/l/${link.code}` : `/l/${link.code}`;

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className={`shadow-soft ${link.active ? "" : "opacity-60"}`}>
      <CardContent className="grid gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{link.label}</p>
            <p className="text-xs text-muted-foreground">{CHANNEL_LABEL[link.channel]}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {link.active ? "Ativo" : "Pausado"}
            </span>
            <Switch checked={link.active} onCheckedChange={onToggleActive} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={copyUrl}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={MousePointerClick} label="Cliques" value={String(stats?.clicks ?? 0)} />
          <Stat label="Agendamentos" value={String(stats?.agendamentos ?? 0)} />
          <Stat label="Comparecimentos" value={String(stats?.comparecimentos ?? 0)} />
          <Stat
            icon={Wallet}
            label="Faturamento"
            value={formatPrice(stats?.faturamento_cents ?? 0)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof MousePointerClick;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
