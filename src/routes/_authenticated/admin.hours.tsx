import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { WEEKDAYS } from "@/lib/booking";
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

function HoursPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Hour[]>([]);
  const [copySource, setCopySource] = useState<Record<number, string>>({});

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
    mutationFn: async () => {
      for (const row of rows) {
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
        rows.map((r) => ({ ...r, establishment_id: establishment!.id })),
        { onConflict: "establishment_id,weekday" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Horários de funcionamento salvos");
      queryClient.invalidateQueries({ queryKey: ["business-hours"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
        <CardContent className="divide-y p-0">
          {rows.map((row, index) => {
            const hasBreak = row.break_start !== null && row.break_end !== null;
            const copyCandidates = rows.filter(
              (r, i) => i !== index && r.break_start && r.break_end,
            );
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
                      <>
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
                        {copyCandidates.length > 0 ? (
                          <Select
                            value={copySource[row.weekday] ?? ""}
                            onValueChange={(weekdayStr) => {
                              const source = rows[Number(weekdayStr)];
                              if (source) {
                                updateRow(index, {
                                  break_start: source.break_start,
                                  break_end: source.break_end,
                                });
                              }
                              setCopySource((prev) => ({ ...prev, [row.weekday]: "" }));
                            }}
                          >
                            <SelectTrigger className="w-52">
                              <SelectValue placeholder="Copiar pausa de..." />
                            </SelectTrigger>
                            <SelectContent>
                              {copyCandidates.map((c) => (
                                <SelectItem key={c.weekday} value={String(c.weekday)}>
                                  {WEEKDAYS[c.weekday]} ({c.break_start}–{c.break_end})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Salvando..." : "Salvar horários"}
      </Button>
    </div>
  );
}
