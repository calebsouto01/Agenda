import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, MessageCircle, Trash2, X } from "lucide-react";

import { useEstablishment } from "@/hooks/use-establishment";
import { useNotifications } from "@/hooks/use-notifications";
import { dateTimeInZone, timeInZone } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  fillTemplate,
} from "@/lib/message-templates";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { ConfirmationTag, FinalizeTag, TodayReminderTag } from "@/components/notification-tags";

export const Route = createFileRoute("/_authenticated/admin/notificacoes")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const timezone = establishment?.timezone ?? "America/Sao_Paulo";
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
  } = useNotifications({ establishmentId: establishment?.id ?? "", timezone });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageTitle icon={Bell}>Central de notificações</PageTitle>

      {count === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma notificação por aqui. Tudo em dia!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingCount > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground">Agendamentos pendentes</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {combinedPending.map((a) => {
                  const accepted = Boolean(justAccepted[a.id]);
                  return (
                    <Card key={a.id} className="shadow-soft">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold">
                            {a.customers?.name ?? "Cliente"}
                          </p>
                          {accepted ? <ConfirmationTag /> : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.service_names ?? ""} · {dateTimeInZone(a.starts_at, timezone)}
                        </p>
                        {accepted ? (
                          a.customers?.phone ? (
                            <div className="flex gap-2">
                              <WhatsAppLink
                                phone={a.customers.phone}
                                message={fillTemplate(
                                  establishment.whatsapp_message_1 ?? DEFAULT_MESSAGE_1,
                                  {
                                    nome: a.customers.name.split(" ")[0] || a.customers.name,
                                    data: dateTimeInZone(a.starts_at, timezone).split(" ")[0] ?? "",
                                    hora: timeInZone(a.starts_at, timezone),
                                    estabelecimento: establishment.name,
                                  },
                                )}
                                onSend={() => markMsg1Sent.mutate(a.id)}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                <MessageCircle className="size-4" /> Enviar mensagem
                              </WhatsAppLink>
                              <Button
                                variant="outline"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={markMsg1Sent.isPending}
                                title="Excluir notificação"
                                onClick={() => markMsg1Sent.mutate(a.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                Aceito. Cliente sem telefone cadastrado.
                              </p>
                              <Button
                                variant="outline"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={markMsg1Sent.isPending}
                                title="Excluir notificação"
                                onClick={() => markMsg1Sent.mutate(a.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              disabled={accept.isPending}
                              onClick={() => accept.mutate(a)}
                            >
                              <Check className="size-4" /> Aceitar
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 text-destructive"
                              disabled={decline.isPending}
                              onClick={() => decline.mutate(a.id)}
                            >
                              <X className="size-4" /> Recusar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          {finishableCount > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground">
                Atendimentos para finalizar
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {finishable.map((a) => (
                  <Card key={a.id} className="shadow-soft">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold">
                          {a.customers?.name ?? "Cliente"}
                        </p>
                        <FinalizeTag />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.service_names ?? ""} · horário terminou às{" "}
                        {timeInZone(a.ends_at, timezone)}
                      </p>
                      <Button asChild className="w-full">
                        <Link to="/admin">
                          <CheckCheck className="size-4" /> Finalizar na agenda
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {confirmationCount > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground">Lembretes de hoje</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {confirmations.map((lead) => {
                  const appt = lead.appointment!;
                  const message = fillTemplate(
                    establishment.whatsapp_message_confirmacao ?? DEFAULT_MESSAGE_CONFIRMACAO,
                    {
                      nome: lead.name.split(" ")[0] || lead.name,
                      data: "",
                      hora: timeInZone(appt.starts_at, timezone),
                      estabelecimento: establishment.name,
                    },
                  );
                  return (
                    <Card key={lead.id} className="shadow-soft">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold">{lead.name}</p>
                          <TodayReminderTag />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {appt.service_names ?? ""} · hoje às{" "}
                          {timeInZone(appt.starts_at, timezone)}
                        </p>
                        {lead.phone ? (
                          <div className="flex gap-2">
                            <WhatsAppLink
                              phone={lead.phone}
                              message={message}
                              onSend={() => markConfirmationSent.mutate(lead.id)}
                              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              <MessageCircle className="size-4" /> Enviar mensagem
                            </WhatsAppLink>
                            <Button
                              variant="outline"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={markConfirmationSent.isPending}
                              title="Excluir notificação"
                              onClick={() => markConfirmationSent.mutate(lead.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              Cliente sem telefone cadastrado
                            </p>
                            <Button
                              variant="outline"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={markConfirmationSent.isPending}
                              title="Excluir notificação"
                              onClick={() => markConfirmationSent.mutate(lead.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
