import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { dateTimeInZone, isoDateInZone, timeInZone } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  fillTemplate,
} from "@/lib/message-templates";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WhatsAppLink } from "@/components/whatsapp-link";

type PendingAppointment = {
  id: string;
  starts_at: string;
  service_names: string | null;
  customers: { name: string; phone: string } | null;
};

type LeadWithAppointment = {
  id: string;
  name: string;
  phone: string | null;
  appointment: { starts_at: string; status: string; service_names: string | null } | null;
};

/** Tarja do agendamento recém-aceito: falta enviar a mensagem 1 (pós-agendamento). */
function ConfirmationTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <Send className="size-2.5" />
      Confirmação
    </span>
  );
}

/** Tarja do lembrete do dia: agendamento é hoje, falta confirmar com o cliente. */
function TodayReminderTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <AlertTriangle className="size-2.5" />
      Lembrete do dia
    </span>
  );
}

export function NotificationBell({
  establishmentId,
  establishmentName,
  timezone,
  message1Template,
  confirmationTemplate,
}: {
  establishmentId: string;
  establishmentName: string;
  timezone: string;
  message1Template: string | null;
  confirmationTemplate: string | null;
}) {
  const queryClient = useQueryClient();
  // Agendamento aceito nesta sessão: em vez de sumir do sino, o card no mesmo
  // lugar vira um "enviar mensagem?" até o dono clicar (ou fechar o sino).
  const [justAccepted, setJustAccepted] = useState<Record<string, PendingAppointment>>({});
  // Controla o popover na mão: ao aceitar, o botão que estava com foco some
  // do DOM (vira o card de enviar mensagem) e, por um bug conhecido do
  // Radix, isso pode disparar um fechamento automático do popover. Em vez
  // de tentar acertar qual mecanismo interno dispara isso (ou depender de
  // uma janela de tempo, que pode ser curta demais numa rede lenta),
  // bloqueia qualquer fechamento não solicitado pelo usuário enquanto
  // houver um agendamento aceito aguardando o envio da mensagem — só volta
  // a fechar normalmente depois que o dono envia ou dispensa (Excluir).
  const [open, setOpen] = useState(false);

  const { data: pending } = useQuery({
    queryKey: ["pending-appointments", establishmentId],
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

  // Leads que já receberam a "Mensagem 1" (pós-agendamento) mas ainda não a
  // confirmação do dia, e cujo agendamento é hoje — o dia certo de avisar o
  // dono pra mandar o lembrete pro cliente, hoje um passo manual.
  const { data: confirmations } = useQuery({
    queryKey: ["today-confirmations", establishmentId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id, name, phone, appointment:appointments(starts_at, status, service_names)")
        .eq("establishment_id", establishmentId)
        .not("whatsapp_msg1_sent_at", "is", null)
        .is("whatsapp_confirmacao_sent_at", null)
        .not("appointment_id", "is", null);
      if (error) throw error;

      const todayIso = isoDateInZone(new Date(), timezone);
      return ((data ?? []) as unknown as LeadWithAppointment[]).filter((lead) => {
        const appt = lead.appointment;
        if (!appt || appt.status !== "confirmed") return false;
        return isoDateInZone(new Date(appt.starts_at), timezone) === todayIso;
      });
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["pending-appointments"] });
    queryClient.invalidateQueries({ queryKey: ["today-confirmations"] });
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
        .from("crm_leads")
        .update({ whatsapp_msg1_sent_at: new Date().toISOString() })
        .eq("appointment_id", appointmentId);
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
        .from("crm_leads")
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
  const count = pendingCount + confirmationCount;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && Object.keys(justAccepted).length > 0) return;
        setOpen(next);
      }}
    >
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
                {combinedPending.map((a) => {
                  const accepted = Boolean(justAccepted[a.id]);
                  return (
                    <div key={a.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {a.customers?.name ?? "Cliente"}
                        </p>
                        {accepted ? <ConfirmationTag /> : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.service_names ?? ""} · {dateTimeInZone(a.starts_at, timezone)}
                      </p>
                      {accepted ? (
                        a.customers?.phone ? (
                          <div className="mt-1.5 flex gap-1.5">
                            <WhatsAppLink
                              phone={a.customers.phone}
                              message={fillTemplate(message1Template ?? DEFAULT_MESSAGE_1, {
                                nome: a.customers.name.split(" ")[0] || a.customers.name,
                                data: dateTimeInZone(a.starts_at, timezone).split(" ")[0] ?? "",
                                hora: timeInZone(a.starts_at, timezone),
                                estabelecimento: establishmentName,
                              })}
                              onSend={() => markMsg1Sent.mutate(a.id)}
                              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              <MessageCircle className="size-3" /> Enviar mensagem
                            </WhatsAppLink>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted-foreground hover:text-destructive"
                              disabled={markMsg1Sent.isPending}
                              title="Excluir notificação"
                              onClick={() => markMsg1Sent.mutate(a.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              Aceito. Cliente sem telefone cadastrado.
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted-foreground hover:text-destructive"
                              disabled={markMsg1Sent.isPending}
                              title="Excluir notificação"
                              onClick={() => markMsg1Sent.mutate(a.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        )
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {confirmationCount > 0 ? (
              <div className="space-y-1.5">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Lembretes de hoje
                </p>
                {confirmations!.map((lead) => {
                  const appt = lead.appointment!;
                  const message = fillTemplate(
                    confirmationTemplate ?? DEFAULT_MESSAGE_CONFIRMACAO,
                    {
                      nome: lead.name.split(" ")[0] || lead.name,
                      data: "",
                      hora: timeInZone(appt.starts_at, timezone),
                      estabelecimento: establishmentName,
                    },
                  );
                  return (
                    <div key={lead.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{lead.name}</p>
                        <TodayReminderTag />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {appt.service_names ?? ""} · hoje às {timeInZone(appt.starts_at, timezone)}
                      </p>
                      {lead.phone ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <WhatsAppLink
                            phone={lead.phone}
                            message={message}
                            onSend={() => markConfirmationSent.mutate(lead.id)}
                            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <MessageCircle className="size-3" /> Enviar mensagem
                          </WhatsAppLink>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            disabled={markConfirmationSent.isPending}
                            title="Excluir notificação"
                            onClick={() => markConfirmationSent.mutate(lead.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Cliente sem telefone cadastrado
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            disabled={markConfirmationSent.isPending}
                            title="Excluir notificação"
                            onClick={() => markConfirmationSent.mutate(lead.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
