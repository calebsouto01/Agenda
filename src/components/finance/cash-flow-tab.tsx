import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { dateTimeInZone, formatPrice, isoDateInZone } from "@/lib/booking";
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
import { Skeleton } from "@/components/ui/skeleton";

type CashMovement = {
  id: string;
  type: "entrada" | "saida";
  category: string;
  description: string | null;
  amount_cents: number;
  occurred_at: string;
};

type PaymentEntryRow = {
  id: string;
  amount_cents: number;
  created_at: string;
  appointments: { customers: { name: string } | null } | null;
};

type ProductSaleRow = {
  id: string;
  qty: number;
  unit_price_cents: number;
  created_at: string;
  products: { name: string } | null;
};

type LedgerEntry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  label: string;
  amount_cents: number;
  removable: boolean;
};

const EXPENSE_CATEGORIES = ["Aluguel", "Fornecedores", "Salários", "Contas", "Marketing", "Outro"];
const INCOME_CATEGORIES = ["Venda avulsa", "Outra receita", "Outro"];

export function CashFlowTab({
  establishmentId,
  tz,
  bounds,
}: {
  establishmentId: string;
  tz: string;
  bounds: { from: string; to: string };
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    type: "saida" as "entrada" | "saida",
    category: EXPENSE_CATEGORIES[0]!,
    description: "",
    amount: "",
    occurredAt: isoDateInZone(new Date(), tz),
  });

  const { data: movements, isLoading: loadingMovements } = useQuery({
    queryKey: ["cash-movements", establishmentId, bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("id, type, category, description, amount_cents, occurred_at")
        .eq("establishment_id", establishmentId)
        .gte("occurred_at", bounds.from)
        .lt("occurred_at", bounds.to)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashMovement[];
    },
  });

  const { data: paymentEntries, isLoading: loadingPayments } = useQuery({
    queryKey: ["cash-flow-payments", establishmentId, bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_entries")
        .select("id, amount_cents, created_at, appointments(customers(name))")
        .eq("establishment_id", establishmentId)
        .gte("created_at", `${bounds.from}T00:00:00`)
        .lt("created_at", `${bounds.to}T00:00:00`);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentEntryRow[];
    },
  });

  const { data: productSales, isLoading: loadingSales } = useQuery({
    queryKey: ["cash-flow-product-sales", establishmentId, bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_movements")
        .select("id, qty, unit_price_cents, created_at, products(name)")
        .eq("establishment_id", establishmentId)
        .eq("type", "venda")
        .gte("created_at", `${bounds.from}T00:00:00`)
        .lt("created_at", `${bounds.to}T00:00:00`);
      if (error) throw error;
      return (data ?? []) as unknown as ProductSaleRow[];
    },
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(form.amount.replace(",", ".")) * 100);
      if (!cents || cents <= 0) throw new Error("Informe um valor válido");
      const { error } = await supabase.from("cash_movements").insert({
        establishment_id: establishmentId,
        type: form.type,
        category: form.category,
        description: form.description.trim() || null,
        amount_cents: cents,
        occurred_at: form.occurredAt,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lançamento registrado");
      setForm({ ...form, description: "", amount: "" });
      queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMovement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_movements").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ledger = useMemo<LedgerEntry[]>(() => {
    const entries: LedgerEntry[] = [];
    for (const m of movements ?? []) {
      entries.push({
        id: m.id,
        date: `${m.occurred_at}T12:00:00`,
        type: m.type,
        label: `${m.category}${m.description ? ` · ${m.description}` : ""}`,
        amount_cents: m.amount_cents,
        removable: true,
      });
    }
    for (const p of paymentEntries ?? []) {
      entries.push({
        id: p.id,
        date: p.created_at,
        type: "entrada",
        label: `Pagamento · ${p.appointments?.customers?.name ?? "Cliente"}`,
        amount_cents: p.amount_cents,
        removable: false,
      });
    }
    for (const s of productSales ?? []) {
      entries.push({
        id: s.id,
        date: s.created_at,
        type: "entrada",
        label: `Venda de produto · ${s.products?.name ?? "Produto"} (${s.qty}x)`,
        amount_cents: s.qty * s.unit_price_cents,
        removable: false,
      });
    }
    return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [movements, paymentEntries, productSales]);

  const totalEntradas = ledger
    .filter((e) => e.type === "entrada")
    .reduce((s, e) => s + e.amount_cents, 0);
  const totalSaidas = ledger
    .filter((e) => e.type === "saida")
    .reduce((s, e) => s + e.amount_cents, 0);
  const saldo = totalEntradas - totalSaidas;

  const isLoading = loadingMovements || loadingPayments || loadingSales;
  const categories = form.type === "entrada" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Entradas</p>
            <p className="text-lg font-extrabold text-success">{formatPrice(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Saídas</p>
            <p className="text-lg font-extrabold text-destructive">{formatPrice(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Saldo</p>
            <p className={`text-lg font-extrabold ${saldo >= 0 ? "" : "text-destructive"}`}>
              {formatPrice(saldo)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5">
          <p className="text-sm font-semibold">Novo lançamento</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    type: v as "entrada" | "saida",
                    category: v === "entrada" ? INCOME_CATEGORIES[0]! : EXPENSE_CATEGORIES[0]!,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cm-desc">Descrição (opcional)</Label>
            <Input
              id="cm-desc"
              maxLength={200}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cm-amount">Valor (R$)</Label>
              <Input
                id="cm-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cm-date">Data</Label>
              <Input
                id="cm-date"
                type="date"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
              />
            </div>
          </div>
          <Button disabled={addMovement.isPending} onClick={() => addMovement.mutate()}>
            <Plus className="size-4" /> Registrar
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : ledger.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum lançamento no período.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {ledger.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{dateTimeInZone(e.date, tz)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-sm font-bold ${e.type === "entrada" ? "text-success" : "text-destructive"}`}
                  >
                    {e.type === "entrada" ? "+" : "-"}
                    {formatPrice(e.amount_cents)}
                  </span>
                  {e.removable ? (
                    <button
                      type="button"
                      onClick={() => removeMovement.mutate(e.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
