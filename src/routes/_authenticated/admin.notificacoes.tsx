import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarDays, Check, CheckCheck, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import { useNotifications } from "@/hooks/use-notifications";
import {
  STATUS_LABEL,
  addDays,
  dateTimeInZone,
  formatDateLabel,
  isoDateInZone,
  serviceLabel,
  timeInZone,
  zonedDateTimeToIso,
  type AppointmentStatus,
} from "@/lib/booking";
import { FinalizeTag } from "@/components/notification-tags";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/notificacoes")({
  component: NotificationsPage,
});

type TodayAppointment = {
  id: string;
  starts_at: string;
  status: AppointmentStatus;
  service_names: string | null;
  customer_confirmed_at: string | null;
  customer_cancelled_at: string | null;
  services: { name: string } | null;
  professionals: { name: string } | null;
  customers: { name: string } | null;
};

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-sm font-bold">{children}</h2>
      {count ? (
        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-bold leading-none text-destructive-foreground">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function NotificationsPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const { pending, finishable, accept, decline } = useNotifications({
    establishmentId: establishment?.id ?? "",
    notifyPendingEnabled: establishment?.notify_pending_enabled ?? true,
    notifyFinishableEnabled: establishment?.notify_finishable_enabled ?? true,
  });

  const todayIso = isoDateInZone(new Date(), tz);
  const { data: today } = useQuery({
    queryKey: ["today-appointments", establishment?.id, todayIso],
    enabled: Boolean(establishment?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const from = zonedDateTimeToIso(todayIso, "00:00", tz);
      const to = zonedDateTimeToIso(addDays(todayIso, 1), "00:00", tz);
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, status, service_names, customer_confirmed_at, customer_cancelled_at, services(name), professionals(name), customers!appointments_customer_id_fkey(name)",
        )
        .eq("establishment_id", establishment!.id)
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as TodayAppointment[];
    },
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  // Pendentes já aparecem em "Aguardando sua resposta"; cancelados só se foi o cliente que cancelou.
  const todayList = (today ?? []).filter(
    (a) => a.status !== "pending" && (a.status !== "cancelled" || a.customer_cancelled_at),
  );
  const total = pending.length + finishable.length;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <PageTitle icon={Bell}>Notificações</PageTitle>
        <p className="px-1 text-sm text-muted-foreground">
          Hoje, {formatDateLabel(todayIso)} ·{" "}
          {total > 0 ? `${total} ${total === 1 ? "pendência" : "pendências"}` : "tudo em dia"}
        </p>
      </div>

      {pending.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle count={pending.length}>Aguardando sua resposta</SectionTitle>
          {pending.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 p-3">
                <div>
                  <p className="text-sm font-semibold">{a.customers?.name ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.service_names ?? "Serviço"} · {dateTimeInZone(a.starts_at, tz)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(a)}
                  >
                    <Check className="size-4" /> Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-destructive"
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(a.id)}
                  >
                    <X className="size-4" /> Recusar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {finishable.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle count={finishable.length}>Atendimentos para finalizar</SectionTitle>
          {finishable.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{a.customers?.name ?? "Cliente"}</p>
                  <FinalizeTag />
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.service_names ?? "Serviço"} · terminou às {timeInZone(a.ends_at, tz)}
                </p>
                <Button asChild size="sm" className="w-full">
                  <Link to="/admin/agenda">
                    <CheckCheck className="size-4" /> Finalizar na agenda
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <CheckCheck className="size-5" />
            </div>
            <p className="text-sm font-medium">Tudo em dia</p>
            <p className="text-xs text-muted-foreground">Nenhuma pendência no momento.</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Agenda de hoje</SectionTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/agenda">
              <CalendarDays className="size-4" /> Ver agenda
            </Link>
          </Button>
        </div>
        {todayList.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">Nenhum atendimento para hoje.</p>
        ) : (
          todayList.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start gap-3 p-3">
                <span className="w-12 shrink-0 text-sm font-bold">
                  {timeInZone(a.starts_at, tz)}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold">{a.customers?.name ?? "Cliente"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {serviceLabel(a)}
                    {a.professionals ? ` · ${a.professionals.name}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[a.status]}
                    </Badge>
                    {a.customer_confirmed_at ? (
                      <Badge className="border-0 bg-success/15 text-[10px] text-success">
                        Cliente confirmou presença
                      </Badge>
                    ) : null}
                    {a.customer_cancelled_at ? (
                      <Badge className="border-0 bg-destructive/15 text-[10px] text-destructive">
                        Cancelado pelo cliente
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
