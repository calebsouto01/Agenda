import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, MessageCircle, Trash2, X } from "lucide-react";

import { useNotifications } from "@/hooks/use-notifications";
import { dateTimeInZone, timeInZone } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  fillTemplate,
} from "@/lib/message-templates";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { ConfirmationTag, FinalizeTag, TodayReminderTag } from "@/components/notification-tags";

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
  const {
    combinedPending,
    pendingCount,
    justAccepted,
    confirmations,
    confirmationCount,
    finishable,
    finishableCount,
    count,
    accept,
    decline,
    markMsg1Sent,
    markConfirmationSent,
  } = useNotifications({ establishmentId, timezone });

  // Controla o popover na mão: ao aceitar, o botão que estava com foco some
  // do DOM (vira o card de enviar mensagem) e, por um bug conhecido do
  // Radix, isso pode disparar um fechamento automático do popover. Em vez
  // de tentar acertar qual mecanismo interno dispara isso (ou depender de
  // uma janela de tempo, que pode ser curta demais numa rede lenta),
  // bloqueia qualquer fechamento não solicitado pelo usuário enquanto
  // houver um agendamento aceito aguardando o envio da mensagem — só volta
  // a fechar normalmente depois que o dono envia ou dispensa (Excluir).
  const [open, setOpen] = useState(false);

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

            {confirmationCount > 0 ? (
              <div className="space-y-1.5">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Lembretes de hoje
                </p>
                {confirmations.map((lead) => {
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
        <Link
          to="/admin/notificacoes"
          onClick={() => setOpen(false)}
          className="mt-2 block rounded-md px-2 py-1.5 text-center text-xs font-semibold text-primary hover:bg-muted"
        >
          Ver central de notificações
        </Link>
      </PopoverContent>
    </Popover>
  );
}
