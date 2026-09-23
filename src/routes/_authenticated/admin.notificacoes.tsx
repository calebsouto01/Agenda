import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, MessageCircle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useEstablishment } from "@/hooks/use-establishment";
import { useNotifications } from "@/hooks/use-notifications";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeInZone, timeInZone } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_CONFIRMACAO,
  fillTemplate,
} from "@/lib/message-templates";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { ConfirmationTag, FinalizeTag, TodayReminderTag } from "@/components/notification-tags";

const searchSchema = z.object({
  tab: z.enum(["console", "central"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/notificacoes")({
  validateSearch: searchSchema,
  component: NotificationsPage,
});

type PrefKey = "notify_pending_enabled" | "notify_finishable_enabled" | "notify_reminders_enabled";

function ConsoleTab() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();

  const togglePref = useMutation({
    mutationFn: async ({ key, value }: { key: PrefKey; value: boolean }) => {
      const patch =
        key === "notify_pending_enabled"
          ? { notify_pending_enabled: value }
          : key === "notify_finishable_enabled"
            ? { notify_finishable_enabled: value }
            : { notify_reminders_enabled: value };
      const { error } = await supabase
        .from("establishments")
        .update(patch)
        .eq("id", establishment!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-establishment"] }),
    onError: () => toast.error("Não foi possível salvar"),
  });

  if (!establishment) return <Skeleton className="h-48 w-full" />;

  const prefs: { key: PrefKey; label: string; description: string; checked: boolean }[] = [
    {
      key: "notify_pending_enabled",
      label: "Agendamentos pendentes",
      description: "Alguém marcou horário e está esperando você aceitar ou recusar.",
      checked: establishment.notify_pending_enabled,
    },
    {
      key: "notify_finishable_enabled",
      label: "Atendimentos para finalizar",
      description: "O horário do atendimento terminou e falta registrar o pagamento.",
      checked: establishment.notify_finishable_enabled,
    },
    {
      key: "notify_reminders_enabled",
      label: "Lembretes do dia",
      description: "Cliente confirmado pra hoje, faltando enviar o lembrete de confirmação.",
      checked: establishment.notify_reminders_enabled,
    },
  ];

  return (
    <Card className="shadow-soft">
      <CardContent className="divide-y p-0">
        {prefs.map((pref) => (
          <div key={pref.key} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Label htmlFor={pref.key} className="text-sm font-semibold">
                {pref.label}
              </Label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <Switch
              id={pref.key}
              checked={pref.checked}
              disabled={togglePref.isPending}
              onCheckedChange={(v) => togglePref.mutate({ key: pref.key, value: v })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CentralTab() {
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
  } = useNotifications({
    establishmentId: establishment?.id ?? "",
    timezone,
    notifyPendingEnabled: establishment?.notify_pending_enabled ?? true,
    notifyFinishableEnabled: establishment?.notify_finishable_enabled ?? true,
    notifyRemindersEnabled: establishment?.notify_reminders_enabled ?? true,
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  return (
    <>
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
    </>
  );
}

function NotificationsPage() {
  const { tab } = useSearch({ from: "/_authenticated/admin/notificacoes" });
  const section = tab ?? "central";

  return (
    <div className="space-y-4">
      <PageTitle icon={Bell}>Notificações</PageTitle>

      {section === "console" ? <ConsoleTab /> : <CentralTab />}
    </div>
  );
}
