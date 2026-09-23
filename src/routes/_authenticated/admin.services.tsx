import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Package, Pencil, Plus, Scissors, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { isPro } from "@/lib/plans";
import { formatDuration, formatPrice } from "@/lib/booking";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryTab } from "@/components/finance/inventory-tab";

const searchSchema = z.object({
  tab: z.enum(["servicos", "produtos"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/services")({
  validateSearch: searchSchema,
  component: ServicesAndProductsPage,
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço").max(120),
  description: z.string().trim().max(400),
  priceCents: z.number().int().min(1, "Informe um preço válido").max(100_000_000),
  duration: z.number().int().min(5, "Duração mínima de 5 minutos").max(600),
});

const EMPTY = { id: "", name: "", description: "", priceCents: 0, duration: "30", active: true };

function ServicosTab() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState(false);

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, price_cents, duration_minutes, active")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name: form.name,
        description: form.description,
        priceCents: form.priceCents,
        duration: Number(form.duration),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const payload = {
        establishment_id: establishment!.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price_cents: parsed.data.priceCents,
        duration_minutes: parsed.data.duration,
        active: form.active,
      };
      const { error } = form.id
        ? await supabase.from("services").update(payload).eq("id", form.id)
        : await supabase.from("services").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Serviço salvo");
      setForm({ ...EMPTY });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Serviço excluído");
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: () =>
      toast.error("Não foi possível excluir. Serviços com agendamentos podem ser desativados."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {open ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="s-name">Nome</Label>
              <Input
                id="s-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-desc">Descrição</Label>
              <Textarea
                id="s-desc"
                maxLength={400}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="s-price">Preço</Label>
                <CurrencyInput
                  id="s-price"
                  valueCents={form.priceCents}
                  onValueChange={(cents) => setForm({ ...form, priceCents: cents })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-dur">Duração (min)</Label>
                <Input
                  id="s-dur"
                  inputMode="numeric"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="s-active">Disponível para agendamento</Label>
              <Switch
                id="s-active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : services && services.length > 0 ? (
        <div className="grid gap-2">
          {services.map((s) => (
            <Card key={s.id} className="card-interactive rounded-2xl">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Scissors className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.name}
                    {!s.active ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (inativo)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(s.price_cents)} · {formatDuration(s.duration_minutes)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({
                        id: s.id,
                        name: s.name,
                        description: s.description ?? "",
                        priceCents: s.price_cents,
                        duration: String(s.duration_minutes),
                        active: s.active,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove.mutate(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Cadastre seu primeiro serviço para começar a receber agendamentos.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProdutosTab({ establishmentId }: { establishmentId: string }) {
  const { data: establishment } = useEstablishment();

  if (establishment && !isPro(establishment.plan)) {
    return (
      <Card className="shadow-soft">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Lock className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Produtos é um recurso do plano Pro</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Controle de estoque, preço de custo e venda, tudo automático. Assine o Pro para
              liberar.
            </p>
          </div>
          <Button asChild className="mt-2">
            <Link to="/admin/settings">Assinar Pro — R$ 19,90/mês</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!establishment?.sells_products) {
    return (
      <Card className="shadow-soft">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Package className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Você ainda não vende produtos</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Ative "Vendo produtos" em Dados da empresa pra cadastrar seu estoque e acompanhar o
              valor e o lucro dele no Financeiro.
            </p>
          </div>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/admin/settings">
              <Settings className="size-4" /> Ir para Dados da empresa
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <InventoryTab establishmentId={establishmentId} />;
}

function ServicesAndProductsPage() {
  const { data: establishment } = useEstablishment();
  const navigate = useNavigate();
  const { tab } = useSearch({ from: "/_authenticated/admin/services" });
  const section = tab ?? "servicos";

  return (
    <div className="space-y-4">
      <PageTitle icon={Scissors}>Serviços e produtos</PageTitle>

      <Tabs
        value={section}
        onValueChange={(v) =>
          navigate({
            to: "/admin/services",
            search: { tab: v as "servicos" | "produtos" },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="pt-4">
          <ServicosTab />
        </TabsContent>
        <TabsContent value="produtos" className="pt-4">
          {establishment ? <ProdutosTab establishmentId={establishment.id} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
