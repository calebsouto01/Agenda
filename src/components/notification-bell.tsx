import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, X } from "lucide-react";

import type { Establishment } from "@/hooks/use-establishment";
import { useNotifications } from "@/hooks/use-notifications";
import { dateTimeInZone, timeInZone } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinalizeTag } from "@/components/notification-tags";

/** Sino do topo: agendamentos pendentes (aceitar ou recusar) e atendimentos a finalizar. */
export function NotificationBell({ establishment }: { establishment: Establishment }) {
  const { id: establishmentId, timezone } = establishment;
  const { pending, pendingCount, finishable, finishableCount, count, accept, decline } =
    useNotifications({
      establishmentId,
      notifyPendingEnabled: establishment.notify_pending_enabled,
      notifyFinishableEnabled: establishment.notify_finishable_enabled,
    });

  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        {count === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {pendingCount > 0 ? (
              <div className="space-y-1.5">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Agendamentos pendentes
                </p>
                {pending.map((a) => (
                  <div key={a.id} className="rounded-lg border p-2.5">
                    <p className="truncate text-sm font-semibold">
                      {a.customers?.name ?? "Cliente"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.service_names ?? ""} · {dateTimeInZone(a.starts_at, timezone)}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 flex-1 text-xs"
                        disabled={accept.isPending}
                        onClick={() => accept.mutate(a)}
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
            ) : null}

            {finishableCount > 0 ? (
              <div className="space-y-1.5">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Atendimentos para finalizar
                </p>
                {finishable.map((a) => (
                  <div key={a.id} className="rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {a.customers?.name ?? "Cliente"}
                      </p>
                      <FinalizeTag />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.service_names ?? ""} · horário terminou às{" "}
                      {timeInZone(a.ends_at, timezone)}
                    </p>
                    <Button
                      asChild
                      size="sm"
                      className="mt-1.5 h-7 w-full text-xs"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/admin">
                        <CheckCheck className="size-3" /> Finalizar na agenda
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
