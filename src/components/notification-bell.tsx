import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { dateTimeInZone } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type PendingAppointment = {
  id: string;
  starts_at: string;
  service_names: string | null;
  customers: { name: string } | null;
};

export function NotificationBell({
  establishmentId,
  timezone,
}: {
  establishmentId: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: ["pending-appointments", establishmentId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, service_names, customers(name)")
        .eq("establishment_id", establishmentId)
        .eq("status", "pending")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingAppointment[];
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["pending-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento confirmado");
      invalidate();
    },
    onError: () => toast.error("Não foi possível confirmar"),
  });

  const decline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento recusado");
      invalidate();
    },
    onError: () => toast.error("Não foi possível recusar"),
  });

  const count = pending?.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Agendamentos pendentes
        </p>
        {count === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {pending!.map((a) => (
              <div key={a.id} className="rounded-lg border p-2.5">
                <p className="truncate text-sm font-semibold">{a.customers?.name ?? "Cliente"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.service_names ?? ""} · {dateTimeInZone(a.starts_at, timezone)}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(a.id)}
                  >
                    <Check className="size-3" /> Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 text-xs text-destructive"
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(a.id)}
                  >
                    <X className="size-3" /> Recusar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
