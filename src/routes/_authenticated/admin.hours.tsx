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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/hours")({
  component: HoursPage,
});

type Hour = { weekday: number; opens_at: string; closes_at: string; closed: boolean };

function HoursPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Hour[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["business-hours", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, opens_at, closes_at, closed")
        .eq("establishment_id", establishment!.id)
        .order("weekday");
      if (error) throw error;
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
          }
        );
      }).map((h) => ({ ...h, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) })),
    );
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      for (const row of rows) {
        if (!row.closed && row.closes_at <= row.opens_at) {
          throw new Error(`${WEEKDAYS[row.weekday]}: horário de fechamento inválido`);
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Horários de funcionamento</h1>
      <Card className="shadow-soft">
        <CardContent className="divide-y p-0">
          {rows.map((row, index) => (
            <div key={row.weekday} className="flex flex-wrap items-center gap-3 p-4">
              <span className="w-32 text-sm font-semibold">{WEEKDAYS[row.weekday]}</span>
              <Switch
                checked={!row.closed}
                onCheckedChange={(v) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, closed: !v } : r)))
                }
              />
              {row.closed ? (
                <span className="text-xs text-muted-foreground">Fechado</span>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-28"
                    value={row.opens_at}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, i) => (i === index ? { ...r, opens_at: e.target.value } : r)),
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input
                    type="time"
                    className="w-28"
                    value={row.closes_at}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, i) => (i === index ? { ...r, closes_at: e.target.value } : r)),
                      )
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Salvando..." : "Salvar horários"}
      </Button>
    </div>
  );
}
