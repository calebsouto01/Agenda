import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { WEEKDAYS, dateTimeInZone } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/hours")({
  component: HoursPage,
});

type Hour = {
  weekday: number;
  opens_at: string;
  closes_at: string;
  closed: boolean;
  break_start: string | null;
  break_end: string | null;
};

const DEFAULT_BREAK_START = "12:00";
const DEFAULT_BREAK_END = "13:00";

type Block = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  professional_id: string | null;
  professionals: { name: string } | null;
};

function HoursPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const [rows, setRows] = useState<Hour[]>([]);
  const [globalOpen, setGlobalOpen] = useState("09:00");
  const [globalClose, setGlobalClose] = useState("18:00");
  const [globalHasBreak, setGlobalHasBreak] = useState(false);
  const [globalBreakStart, setGlobalBreakStart] = useState(DEFAULT_BREAK_START);
  const [globalBreakEnd, setGlobalBreakEnd] = useState(DEFAULT_BREAK_END);
  const [blockForm, setBlockForm] = useState({
    start: "",
    end: "",
    reason: "",
    professional: "all",
  });

  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ["business-hours", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, opens_at, closes_at, closed, break_start, break_end")
        .eq("establishment_id", establishment!.id)
        .order("weekday");
      if (error) throw new Error(error.message);
      return (data ?? []) as Hour[];
    },
  });

  useEffect(() => {
    if (!data) return;
    setRows(
      WEEKDAYS.map((_, weekday) => {
        const found = data.find((h) => h.weekday === weekday);
        return (
          found ?? {
            weekday,
            opens_at: "09:00",
            closes_at: "18:00",
            closed: weekday === 0,
            break_start: null,
            break_end: null,
          }
        );
      }).map((h) => ({
        ...h,
        opens_at: h.opens_at.slice(0, 5),
        closes_at: h.closes_at.slice(0, 5),
        break_start: h.break_start ? h.break_start.slice(0, 5) : null,
        break_end: h.break_end ? h.break_end.slice(0, 5) : null,
      })),
    );
  }, [data]);

  function updateRow(index: number, patch: Partial<Hour>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const save = useMutation({
    mutationFn: async (rowsToSave: Hour[]) => {
      for (const row of rowsToSave) {
        if (row.closed) continue;
        if (row.closes_at <= row.opens_at) {
          throw new Error(`${WEEKDAYS[row.weekday]}: horário de fechamento inválido`);
        }
        if (row.break_start && row.break_end) {
          if (row.break_end <= row.break_start) {
            throw new Error(`${WEEKDAYS[row.weekday]}: horário de pausa inválido`);
          }
          if (row.break_start < row.opens_at || row.break_end > row.closes_at) {
            throw new Error(`${WEEKDAYS[row.weekday]}: pausa deve estar dentro do expediente`);
          }
        }
      }
      const { error } = await supabase.from("business_hours").upsert(
        rowsToSave.map((r) => ({ ...r, establishment_id: establishment!.id })),
        { onConflict: "establishment_id,weekday" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, rowsToSave) => {
      toast.success("Horários de funcionamento salvos");
      setRows(rowsToSave);
      queryClient.invalidateQueries({ queryKey: ["business-hours"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function applyGlobalHours() {
    const nextRows = rows.map((r) => ({
      ...r,
      opens_at: globalOpen,
      closes_at: globalClose,
      break_start: globalHasBreak ? globalBreakStart : null,
      break_end: globalHasBreak ? globalBreakEnd : null,
    }));
    setRows(nextRows);
    save.mutate(nextRows);
  }

  const { data: professionals } = useQuery({
    queryKey: ["professionals", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, role, active")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocks, isLoading: loadingBlocks } = useQuery({
    queryKey: ["time-blocks", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_blocks")
        .select("id, starts_at, ends_at, reason, professional_id, professionals(name)")
        .eq("establishment_id", establishment!.id)
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Block[];
    },
  });

  const createBlock = useMutation({
    mutationFn: async () => {
      if (!blockForm.start || !blockForm.end) throw new Error("Informe início e fim do bloqueio");
      if (blockForm.end <= blockForm.start) throw new Error("O fim deve ser depois do início");
      const { error } = await supabase.from("time_blocks").insert({
        establishment_id: establishment!.id,
        professional_id: blockForm.professional === "all" ? null : blockForm.professional,
        starts_at: new Date(blockForm.start).toISOString(),
        ends_at: new Date(blockForm.end).toISOString(),
        reason: blockForm.reason.trim().slice(0, 200) || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Horário bloqueado");
      setBlockForm({ start: "", end: "", reason: "", professional: "all" });
      queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_blocks").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Bloqueio removido");
      queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
    },
    onError: () => toast.error("Não foi possível remover"),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Horários de funcionamento</h1>
        <Card className="shadow-soft">
          <CardContent className="space-y-1 p-6 text-sm">
            <p className="font-semibold text-destructive">Não foi possível carregar os horários</p>
            <p className="text-muted-foreground">{loadError.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Horários de funcionamento</h1>

      <Card className="shadow-soft">
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            Defina um horário e aplique de uma vez a todos os dias da semana.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                className="w-28"
                value={globalOpen}
                onChange={(e) => setGlobalOpen(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">às</span>
              <Input
                type="time"
                className="w-28"
                value={globalClose}
                onChange={(e) => setGlobalClose(e.target.value)}
              />
            </div>
            <Label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <Switch checked={globalHasBreak} onCheckedChange={setGlobalHasBreak} />
              Pausa
            </Label>
            {globalHasBreak ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={globalBreakStart}
                  onChange={(e) => setGlobalBreakStart(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">às</span>
                <Input
                  type="time"
                  className="w-28"
                  value={globalBreakEnd}
                  onChange={(e) => setGlobalBreakEnd(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={globalClose <= globalOpen || save.isPending}
            onClick={applyGlobalHours}
          >
            {save.isPending ? "Salvando..." : "Aplicar a todos os dias e salvar"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardContent className="divide-y p-0">
          {rows.map((row, index) => {
            const hasBreak = row.break_start !== null && row.break_end !== null;
            return (
              <div key={row.weekday} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-32 text-sm font-semibold">{WEEKDAYS[row.weekday]}</span>
                  <Switch
                    checked={!row.closed}
                    onCheckedChange={(v) => updateRow(index, { closed: !v })}
                  />
                  {row.closed ? (
                    <span className="text-xs text-muted-foreground">Fechado</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        className="w-28"
                        value={row.opens_at}
                        onChange={(e) => updateRow(index, { opens_at: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">às</span>
                      <Input
                        type="time"
                        className="w-28"
                        value={row.closes_at}
                        onChange={(e) => updateRow(index, { closes_at: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {!row.closed ? (
                  <div className="flex flex-wrap items-center gap-3 sm:pl-[8.5rem]">
                    <Label
                      htmlFor={`break-${row.weekday}`}
                      className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
                    >
                      <Switch
                        id={`break-${row.weekday}`}
                        checked={hasBreak}
                        onCheckedChange={(v) =>
                          updateRow(
                            index,
                            v
                              ? { break_start: DEFAULT_BREAK_START, break_end: DEFAULT_BREAK_END }
                              : { break_start: null, break_end: null },
                          )
                        }
                      />
                      Pausa
                    </Label>
                    {hasBreak ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          className="w-28"
                          value={row.break_start ?? ""}
                          onChange={(e) => updateRow(index, { break_start: e.target.value })}
                        />
                        <span className="text-xs text-muted-foreground">às</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={row.break_end ?? ""}
                          onChange={(e) => updateRow(index, { break_end: e.target.value })}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Button disabled={save.isPending} onClick={() => save.mutate(rows)}>
        {save.isPending ? "Salvando..." : "Salvar horários"}
      </Button>

      <div className="space-y-1 pt-2">
        <h2 className="text-lg font-extrabold">Bloqueios de horário</h2>
        <p className="text-xs text-muted-foreground">
          Use para férias, almoço, manutenção ou qualquer período em que não deve haver
          agendamentos.
        </p>
      </div>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="b-start">Início</Label>
            <Input
              id="b-start"
              type="datetime-local"
              value={blockForm.start}
              onChange={(e) => setBlockForm({ ...blockForm, start: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-end">Fim</Label>
            <Input
              id="b-end"
              type="datetime-local"
              value={blockForm.end}
              onChange={(e) => setBlockForm({ ...blockForm, end: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Profissional</Label>
            <Select
              value={blockForm.professional}
              onValueChange={(v) => setBlockForm({ ...blockForm, professional: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o estabelecimento</SelectItem>
                {(professionals ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-reason">Motivo (opcional)</Label>
            <Input
              id="b-reason"
              maxLength={200}
              value={blockForm.reason}
              onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
            />
          </div>
          <Button
            className="sm:col-span-2"
            disabled={createBlock.isPending}
            onClick={() => createBlock.mutate()}
          >
            Bloquear período
          </Button>
        </CardContent>
      </Card>

      {loadingBlocks ? (
        <Skeleton className="h-24 w-full" />
      ) : blocks && blocks.length > 0 ? (
        <div className="grid gap-2">
          {blocks.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {dateTimeInZone(b.starts_at, tz)} → {dateTimeInZone(b.ends_at, tz)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.professionals?.name ?? "Todo o estabelecimento"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeBlock.mutate(b.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum bloqueio cadastrado.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
