import { Bell, BellOff } from "lucide-react";

import { useAppointmentAlerts } from "@/hooks/use-appointment-alerts";
import { useNotificationsEnabled } from "@/lib/notification-preference";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * Painel fixo de notificações: liga os avisos em tempo real e deixa o usuário ligar ou
 * desligar as notificações neste aparelho (computador ou celular). Ao ligar, o navegador
 * pede a autorização.
 */
export function AppointmentAlerts({
  establishment,
}: {
  establishment: { id: string; timezone: string };
}) {
  useAppointmentAlerts(establishment);
  const { enabled, setEnabled } = useNotificationsEnabled();

  return (
    <Card className={`mb-4 ${enabled ? "border-primary/30 bg-primary/5" : "bg-muted/40"}`}>
      <CardContent className="flex items-center gap-3 p-3">
        {enabled ? (
          <Bell className="size-5 shrink-0 text-primary" />
        ) : (
          <BellOff className="size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notificações {enabled ? "ligadas" : "desligadas"}</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "Você será avisado de novos agendamentos e das respostas dos clientes."
              : "Ligue para ser avisado de novos agendamentos e das respostas dos clientes."}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setEnabled(v)}
          aria-label="Ligar ou desligar notificações"
        />
      </CardContent>
    </Card>
  );
}
