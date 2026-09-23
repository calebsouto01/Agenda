import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Copy, Lock, Megaphone, MousePointerClick, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { isPro } from "@/lib/plans";
import { formatPrice } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_ATENCAO,
  DEFAULT_MESSAGE_CONFIRMACAO,
  DEFAULT_MESSAGE_REENGAJAMENTO,
  MESSAGE_PLACEHOLDERS,
} from "@/lib/message-templates";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const searchSchema = z.object({
  tab: z.enum(["links", "mensagem"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  validateSearch: searchSchema,
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

/** Canais em destaque — os mais comuns pra quem agenda serviço. */
const FEATURED_CHANNELS: Channel[] = ["instagram", "whatsapp"];

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

function LinksTab({ establishmentId, isProPlan }: { establishmentId: string; isProPlan: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ label: string; channel: Channel }>({
    label: "",
    channel: "instagram",
  });

  const { data: links } = useQuery({
    queryKey: ["marketing-links", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_links")
        .select("id, label, channel, code, active, created_at")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingLink[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["marketing-link-stats", establishmentId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_link_stats", {
        p_establishment_id: establishmentId,
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
    mutationFn: async (channel: Channel) => {
      const label = form.label.trim();
      if (label.length < 2) throw new Error("Dê um nome pro link, ex.: Story de terça");
      const { error } = await supabase
        .from("marketing_links")
        .insert({ establishment_id: establishmentId, label, channel });
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

  if (!isProPlan) {
    return (
      <Card className="shadow-soft">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Lock className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Links personalizados é um recurso do plano Pro</p>
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
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Crie um link pra cada post, story ou anúncio. Compartilhe esse link em vez do link direto da
        sua página — assim cada agendamento que vier dele fica contado abaixo.
      </p>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5">
          <p className="text-sm font-semibold">Novo link</p>
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
            <Label>Canal em destaque</Label>
            <div className="flex flex-wrap gap-2">
              {FEATURED_CHANNELS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={form.channel === c ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, channel: c })}
                >
                  {CHANNEL_LABEL[c]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label>Outro canal</Label>
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
              onClick={() => createLink.mutate(form.channel)}
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

function MensagemTab({
  establishment,
}: {
  establishment: NonNullable<ReturnType<typeof useEstablishment>["data"]>;
}) {
  const queryClient = useQueryClient();
  const [messagesForm, setMessagesForm] = useState({
    message1: "",
    confirmacao: "",
    atencao: "",
    reengajamento: "",
  });

  useEffect(() => {
    setMessagesForm({
      message1: establishment.whatsapp_message_1 ?? DEFAULT_MESSAGE_1,
      confirmacao: establishment.whatsapp_message_confirmacao ?? DEFAULT_MESSAGE_CONFIRMACAO,
      atencao: establishment.whatsapp_message_atencao ?? DEFAULT_MESSAGE_ATENCAO,
      reengajamento: establishment.whatsapp_message_reengajamento ?? DEFAULT_MESSAGE_REENGAJAMENTO,
    });
  }, [establishment]);

  const saveMessages = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("establishments")
        .update({
          whatsapp_message_1: messagesForm.message1.trim() || null,
          whatsapp_message_confirmacao: messagesForm.confirmacao.trim() || null,
          whatsapp_message_atencao: messagesForm.atencao.trim() || null,
          whatsapp_message_reengajamento: messagesForm.reengajamento.trim() || null,
        })
        .eq("id", establishment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mensagens salvas");
      queryClient.invalidateQueries({ queryKey: ["my-establishment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-soft">
      <CardContent className="grid gap-4 p-5">
        <p className="text-xs text-muted-foreground">
          Variáveis disponíveis: {MESSAGE_PLACEHOLDERS.join(" · ")}
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="msg-1">Mensagem 1 (após o agendamento)</Label>
          <Textarea
            id="msg-1"
            maxLength={500}
            rows={3}
            value={messagesForm.message1}
            onChange={(e) => setMessagesForm({ ...messagesForm, message1: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="msg-confirmacao">Confirmação do dia</Label>
          <Textarea
            id="msg-confirmacao"
            maxLength={500}
            rows={3}
            value={messagesForm.confirmacao}
            onChange={(e) => setMessagesForm({ ...messagesForm, confirmacao: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="msg-atencao">Atenção (cliente sem visitar há 30+ dias)</Label>
          <Textarea
            id="msg-atencao"
            maxLength={500}
            rows={3}
            value={messagesForm.atencao}
            onChange={(e) => setMessagesForm({ ...messagesForm, atencao: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="msg-reengajamento">Reengajamento (cliente inativo há 60+ dias)</Label>
          <Textarea
            id="msg-reengajamento"
            maxLength={500}
            rows={3}
            value={messagesForm.reengajamento}
            onChange={(e) => setMessagesForm({ ...messagesForm, reengajamento: e.target.value })}
          />
        </div>
        <Button disabled={saveMessages.isPending} onClick={() => saveMessages.mutate()}>
          {saveMessages.isPending ? "Salvando..." : "Salvar mensagens"}
        </Button>
      </CardContent>
    </Card>
  );
}

function MarketingPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const navigate = useNavigate();
  const { tab } = useSearch({ from: "/_authenticated/admin/marketing" });
  const section = tab ?? "links";

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageTitle icon={Megaphone}>Marketing</PageTitle>

      <Tabs
        value={section}
        onValueChange={(v) =>
          navigate({
            to: "/admin/marketing",
            search: { tab: v as "links" | "mensagem" },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="links">Links personalizados</TabsTrigger>
          <TabsTrigger value="mensagem">Mensagem</TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="pt-4">
          <LinksTab establishmentId={establishment.id} isProPlan={isPro(establishment.plan)} />
        </TabsContent>
        <TabsContent value="mensagem" className="pt-4">
          <MensagemTab establishment={establishment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
