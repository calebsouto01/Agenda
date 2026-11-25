import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { dateTimeInZone } from "@/lib/booking";
import { readNotificationsEnabled } from "@/lib/notification-preference";

type AppointmentRow = {
  id?: string;
  status?: string;
  starts_at?: string;
  customer_confirmed_at?: string | null;
  customer_cancelled_at?: string | null;
};

function showSystemNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/logo-512.png" });
  } catch {
    /* alguns navegadores móveis só aceitam notificação via service worker */
  }
}

/**
 * Avisa o dono em tempo real: novo pedido de agendamento (pendente) e respostas do cliente
 * ao lembrete do dia (confirmou ou cancelou). Aviso na tela (toast) e, se o dono autorizou,
 * notificação do sistema no celular/computador. Funciona com o app aberto.
 */
export function useAppointmentAlerts(establishment: { id: string; timezone: string }) {
  const queryClient = useQueryClient();
  const seen = useRef(new Set<string>());
  const { id, timezone } = establishment;

  useEffect(() => {
    const channel = supabase
      .channel(`appointment-alerts-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `establishment_id=eq.${id}`,
        },
        async (payload) => {
          const row = (payload.new ?? {}) as AppointmentRow;
          if (!row.id) return;

          queryClient.invalidateQueries({ queryKey: ["pending-appointments"] });
          queryClient.invalidateQueries({ queryKey: ["finishable-appointments"] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          queryClient.invalidateQueries({ queryKey: ["today-appointments"] });

          let kind: "pending" | "confirmed" | "cancelled" | null = null;
          if (payload.eventType === "INSERT" && row.status === "pending") kind = "pending";
          else if (payload.eventType === "UPDATE" && row.customer_cancelled_at) kind = "cancelled";
          else if (payload.eventType === "UPDATE" && row.customer_confirmed_at) kind = "confirmed";
          if (!kind) return;
          if (!readNotificationsEnabled()) return; // notificações desligadas neste aparelho

          const key = `${row.id}:${kind}`;
          if (seen.current.has(key)) return;
          seen.current.add(key);

          const { data } = await supabase
            .from("appointments")
            .select("customers!appointments_customer_id_fkey(name)")
            .eq("id", row.id)
            .maybeSingle();
          const name =
            (data as { customers?: { name?: string } | null } | null)?.customers?.name ?? "Cliente";
          const when = row.starts_at ? dateTimeInZone(row.starts_at, timezone) : "";

          const title =
            kind === "pending"
              ? "Novo agendamento pendente"
              : kind === "confirmed"
                ? "Cliente confirmou presença"
                : "Cliente cancelou o agendamento";
          const body = `${name}${when ? ` · ${when}` : ""}`;

          toast.info(title, { description: body });
          showSystemNotification(title, body, key);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, timezone, queryClient]);
}
