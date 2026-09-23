import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { isoDateInZone } from "@/lib/booking";
import { toast } from "sonner";

export type PendingAppointment = {
  id: string;
  starts_at: string;
  service_names: string | null;
  customers: { name: string; phone: string } | null;
};

export type CustomerWithAppointment = {
  id: string;
  name: string;
  phone: string | null;
  appointment: { starts_at: string; status: string; service_names: string | null } | null;
};

export type FinishableAppointment = {
  id: string;
  ends_at: string;
  service_names: string | null;
  customers: { name: string } | null;
};

/**
 * Fonte única dos dados/ações das notificações (agendamentos pendentes,
 * lembretes de confirmação do dia e atendimentos a finalizar) — usada tanto
 * pelo sino (popover compacto) quanto pela central de notificações
 * (`/admin/notificacoes`), pra nunca desincronizar as duas telas.
 */
export function useNotifications({
  establishmentId,
  timezone,
  notifyPendingEnabled = true,
  notifyFinishableEnabled = true,
  notifyRemindersEnabled = true,
}: {
  establishmentId: string;
  timezone: string;
  notifyPendingEnabled?: boolean;
  notifyFinishableEnabled?: boolean;
  notifyRemindersEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  // Agendamento aceito nesta sessão: em vez de sumir da lista, o card no
  // mesmo lugar vira um "enviar mensagem?" até o dono clicar (ou dispensar).
  const [justAccepted, setJustAccepted] = useState<Record<string, PendingAppointment>>({});

  const { data: pending } = useQuery({
    queryKey: ["pending-appointments", establishmentId],
    enabled: notifyPendingEnabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, service_names, customers(name, phone)")
        .eq("establishment_id", establishmentId)
        .eq("status", "pending")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingAppointment[];
    },
  });

  // Clientes que já receberam a "Mensagem 1" (pós-agendamento) mas ainda não
  // a confirmação do dia, e cujo agendamento é hoje — o dia certo de avisar
  // o dono pra mandar o lembrete pro cliente, hoje um passo manual.
  const { data: confirmations } = useQuery({
    queryKey: ["today-confirmations", establishmentId],
    enabled: notifyRemindersEnabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, appointment:appointments!current_appointment_id(starts_at, status, service_names)",
        )
        .eq("establishment_id", establishmentId)
        .not("whatsapp_msg1_sent_at", "is", null)
        .is("whatsapp_confirmacao_sent_at", null)
        .not("current_appointment_id", "is", null);
      if (error) throw error;

      const todayIso = isoDateInZone(new Date(), timezone);
      return ((data ?? []) as unknown as CustomerWithAppointment[]).filter((lead) => {
        const appt = lead.appointment;
        if (!appt || appt.status !== "confirmed") return false;
        return isoDateInZone(new Date(appt.starts_at), timezone) === todayIso;
      });
    },
  });

  // Confirmados cujo horário já passou e ainda não foram finalizados
  // (pagamento registrado) — avisa o dono pra fechar o atendimento.
  const { data: finishable } = useQuery({
    queryKey: ["finishable-appointments", establishmentId],
    enabled: notifyFinishableEnabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, ends_at, service_names, customers(name)")
        .eq("establishment_id", establishmentId)
        .eq("status", "confirmed")
        .lt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FinishableAppointment[];
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["pending-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["today-confirmations"] });
    queryClient.invalidateQueries({ queryKey: ["finishable-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }

  const accept = useMutation({
    mutationFn: async (a: PendingAppointment) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", a.id);
      if (error) throw new Error(error.message);
      return a;
    },
    onSuccess: (a) => {
      toast.success("Agendamento confirmado");
      setJustAccepted((prev) => ({ ...prev, [a.id]: a }));
      invalidate();
    },
    onError: () => toast.error("Não foi possível confirmar"),
  });

  const markMsg1Sent = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase
        .from("customers")
        .update({ whatsapp_msg1_sent_at: new Date().toISOString() })
        .eq("current_appointment_id", appointmentId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, appointmentId) => {
      setJustAccepted((prev) => {
        const { [appointmentId]: _removed, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: ["today-confirmations"] });
    },
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

  const markConfirmationSent = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("customers")
        .update({ whatsapp_confirmacao_sent_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lembrete enviado");
      queryClient.invalidateQueries({ queryKey: ["today-confirmations"] });
    },
    onError: () => toast.error("Não foi possível marcar como enviado"),
  });

  const combinedPending = [
    ...(pending ?? []).filter((a) => !justAccepted[a.id]),
    ...Object.values(justAccepted),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const pendingCount = combinedPending.length;
  const confirmationCount = confirmations?.length ?? 0;
  const finishableCount = finishable?.length ?? 0;
  const count = pendingCount + confirmationCount + finishableCount;

  return {
    combinedPending,
    pendingCount,
    justAccepted,
    confirmations: confirmations ?? [],
    confirmationCount,
    finishable: finishable ?? [],
    finishableCount,
    count,
    accept,
    decline,
    markMsg1Sent,
    markConfirmationSent,
  };
}
