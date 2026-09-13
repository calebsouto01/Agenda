import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, MapPin, Phone, Star, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { isPro } from "@/lib/plans";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/prospeccao")({
  component: ProspeccaoPage,
});

const MONTHLY_QUOTA = 30;
const RATING_OPTIONS = ["4.0", "4.3", "4.5", "4.8"];

type Prospect = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  rating_count: number | null;
};

function ProspeccaoPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [minRating, setMinRating] = useState("4.5");

  const { data: prospects, isLoading } = useQuery({
    queryKey: ["map-prospects", establishment?.id],
    enabled: Boolean(establishment?.id) && isPro(establishment?.plan ?? "free"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_prospects")
        .select("id, name, address, phone, rating, rating_count")
        .eq("establishment_id", establishment!.id)
        .eq("status", "novo")
        .order("rating", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Prospect[];
    },
  });

  const search = useMutation({
    mutationFn: async () => {
      if (location.trim().length < 2) throw new Error("Informe a localização");
      if (category.trim().length < 2) throw new Error("Informe a categoria do negócio");
      const { data, error } = await supabase.functions.invoke("maps-prospect", {
        body: {
          establishment_id: establishment!.id,
          location: location.trim(),
          category: category.trim(),
          min_rating: Number(minRating),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        if (data.error === "quota_exceeded") {
          throw new Error(
            `Limite mensal atingido (${data.quota.used}/${data.quota.quota}). Renova em ${data.quota.reset_at}.`,
          );
        }
        if (data.error === "not_pro") throw new Error("Prospecção é um recurso do plano Pro.");
        throw new Error(data.message ?? "Não foi possível buscar agora");
      }
      return data as { results: Prospect[] };
    },
    onSuccess: (data) => {
      toast.success(
        data.results.length > 0
          ? `${data.results.length} negócio(s) sem site encontrado(s)`
          : "Nenhum negócio sem site encontrado com esses filtros",
      );
      queryClient.invalidateQueries({ queryKey: ["map-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["my-establishment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promote = useMutation({
    mutationFn: async (p: Prospect) => {
      const { data: lead, error: leadError } = await supabase
        .from("crm_leads")
        .insert({
          establishment_id: establishment!.id,
          name: p.name,
          phone: p.phone,
          origem: "Prospecção Maps",
          notes: p.address,
        })
        .select("id")
        .single();
      if (leadError) throw new Error(leadError.message);
      const { error: updateError } = await supabase
        .from("map_prospects")
        .update({ status: "promovido", promoted_lead_id: lead.id })
        .eq("id", p.id);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      toast.success("Lead adicionado ao Funil");
      queryClient.invalidateQueries({ queryKey: ["map-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("map_prospects")
        .update({ status: "descartado" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["map-prospects"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (establishment && !isPro(establishment.plan)) {
    return (
      <div className="space-y-4">
        <PageTitle icon={MapPin}>Prospecção</PageTitle>
        <Card className="shadow-soft">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Prospecção é um recurso do plano Pro</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Encontre negócios com boa avaliação no Google que ainda não têm site — uma lista
                pronta pra você prospectar. Assine o Pro para liberar.
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

  const usedThisMonth = establishment?.prospect_searches_used_this_month ?? 0;

  return (
    <div className="space-y-4">
      <PageTitle icon={MapPin}>Prospecção</PageTitle>
      <p className="text-sm text-muted-foreground">
        Busque negócios bem avaliados no Google que ainda não têm site — pra oferecer um.
      </p>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-location">Localização</Label>
              <Input
                id="p-location"
                placeholder="Ex: Fortaleza, CE"
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-category">Categoria do negócio</Label>
              <Input
                id="p-category"
                placeholder="Ex: salão de beleza"
                maxLength={120}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label>Nota mínima</Label>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r} estrelas ou mais
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {usedThisMonth} de {MONTHLY_QUOTA} buscas usadas este mês
            </p>
            <Button disabled={search.isPending} onClick={() => search.mutate()}>
              {search.isPending ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : prospects && prospects.length > 0 ? (
        <div className="grid gap-2">
          {prospects.map((p) => (
            <Card key={p.id} className="card-interactive rounded-2xl">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    {p.rating != null ? (
                      <Badge
                        variant="outline"
                        className="border-0 bg-warning/20 text-warning-foreground"
                      >
                        <Star className="mr-1 size-2.5 fill-current" />
                        {p.rating.toFixed(1)}
                        {p.rating_count != null ? ` (${p.rating_count})` : ""}
                      </Badge>
                    ) : null}
                  </div>
                  {p.address ? (
                    <p className="truncate text-xs text-muted-foreground">{p.address}</p>
                  ) : null}
                  {p.phone ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      {p.phone}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" disabled={promote.isPending} onClick={() => promote.mutate(p)}>
                    Promover pro Funil
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={discard.isPending}
                    onClick={() => discard.mutate(p.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum resultado ainda. Faça uma busca acima.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
