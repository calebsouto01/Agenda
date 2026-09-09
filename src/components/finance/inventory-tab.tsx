import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  cost_cents: number;
  stock_qty: number;
  min_stock_qty: number;
  active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  sku: z.string().trim().max(60),
});

const EMPTY_FORM = { id: "", name: "", sku: "", price: "", cost: "", minStock: "0", active: true };

type MovementType = "entrada" | "venda" | "ajuste";

export function InventoryTab({ establishmentId }: { establishmentId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [open, setOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movement, setMovement] = useState<{ type: MovementType; qty: string }>({
    type: "entrada",
    qty: "",
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, price_cents, cost_cents, stock_qty, min_stock_qty, active")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({ name: form.name, sku: form.sku });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const priceCents = Math.round(Number(form.price.replace(",", ".")) * 100) || 0;
      const costCents = Math.round(Number(form.cost.replace(",", ".")) * 100) || 0;
      const minStock = Math.max(0, Math.round(Number(form.minStock)) || 0);
      const payload = {
        establishment_id: establishmentId,
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        price_cents: priceCents,
        cost_cents: costCents,
        min_stock_qty: minStock,
        active: form.active,
      };
      const { error } = form.id
        ? await supabase.from("products").update(payload).eq("id", form.id)
        : await supabase.from("products").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Produto salvo");
      setForm({ ...EMPTY_FORM });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Produto excluído");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  const addMovement = useMutation({
    mutationFn: async (product: Product) => {
      const qty = Math.round(Number(movement.qty));
      if (!qty || qty <= 0) throw new Error("Informe uma quantidade válida");
      const { error } = await supabase.from("product_movements").insert({
        establishment_id: establishmentId,
        product_id: product.id,
        type: movement.type,
        qty,
        unit_price_cents: movement.type === "venda" ? product.price_cents : product.cost_cents,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Estoque atualizado");
      setMovingId(null);
      setMovement({ type: "entrada", qty: "" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["cash-flow-product-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Controle os produtos vendidos e o estoque disponível.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY_FORM });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo produto
        </Button>
      </div>

      {open ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="pr-name">Nome</Label>
              <Input
                id="pr-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-sku">SKU (opcional)</Label>
                <Input
                  id="pr-sku"
                  maxLength={60}
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-min">Estoque mínimo</Label>
                <Input
                  id="pr-min"
                  type="number"
                  min="0"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-price">Preço de venda (R$)</Label>
                <Input
                  id="pr-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-cost">Custo (R$)</Label>
                <Input
                  id="pr-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="pr-active">Ativo</Label>
              <Switch
                id="pr-active"
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
      ) : !products || products.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum produto cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {products.map((p) => {
            const low = p.stock_qty <= p.min_stock_qty;
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</p>
                        {!p.active ? (
                          <span className="text-xs text-muted-foreground">(inativo)</span>
                        ) : null}
                        {low ? (
                          <Badge
                            variant="outline"
                            className="border-0 bg-warning/20 text-warning-foreground"
                          >
                            <AlertTriangle className="mr-1 size-3" /> Estoque baixo
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ? `SKU ${p.sku} · ` : ""}
                        {formatPrice(p.price_cents)} · estoque: {p.stock_qty}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMovingId(movingId === p.id ? null : p.id)}
                      >
                        <ArrowDownToLine className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setForm({
                            id: p.id,
                            name: p.name,
                            sku: p.sku ?? "",
                            price: (p.price_cents / 100).toString(),
                            cost: (p.cost_cents / 100).toString(),
                            minStock: p.min_stock_qty.toString(),
                            active: p.active,
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
                        onClick={() => remove.mutate(p.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {movingId === p.id ? (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
                      <div className="grid gap-1.5">
                        <Label>Tipo</Label>
                        <Select
                          value={movement.type}
                          onValueChange={(v) =>
                            setMovement({ ...movement, type: v as MovementType })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="entrada">Entrada (repor)</SelectItem>
                            <SelectItem value="venda">Venda</SelectItem>
                            <SelectItem value="ajuste">Ajuste (definir)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          min="0"
                          className="w-24"
                          value={movement.qty}
                          onChange={(e) => setMovement({ ...movement, qty: e.target.value })}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={addMovement.isPending}
                        onClick={() => addMovement.mutate(p)}
                      >
                        <ShoppingCart className="size-4" /> Confirmar
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
