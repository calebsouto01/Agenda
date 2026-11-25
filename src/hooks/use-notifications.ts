import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PendingAppointment = {
  id: string;
  starts_at: string;
  service_names: string | null;
  customers: { name: string; phone: string } | null;
};

export type FinishableAppointment = {
  id: string;
  ends_at: string;
  service_names: string | null;
  customers: { name: string } | null;
};

/**
 * Dados e ações do sino de notificações: agendamentos pendentes (aceitar ou recusar)
 * e atendimentos a finalizar. Os avisos ao cliente saem sozinhos pela API do WhatsApp.
 */
export function useNotifications({
  establishmentId,
  notifyPendingEnabled = true,
  notifyFinishableEnabled = true,
}: {
  establishmentId: string;
  notifyPendingEnabled?: boolean;
  notifyFinishableEnabled?: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: ["pending-appointments", establishmentId],
    enabled: notifyPendingEnabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, service_names, customers!appointments_customer_id_fkey(name, phone)",
        )
        .eq("establishment_id", establishmentId)
        .eq("status", "pending")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingAppointment[];
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
        .select("id, ends_at, service_names, customers!appointments_customer_id_fkey(name)")
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

  const pendingList = pending ?? [];
  const finishableList = finishable ?? [];

  return {
    pending: pendingList,
    pendingCount: pendingList.length,
    finishable: finishableList,
    finishableCount: finishableList.length,
    count: pendingList.length + finishableList.length,
    accept,
    decline,
  };
}
