import { useAppointmentAlerts } from "@/hooks/use-appointment-alerts";
import { useNotificationsEnabled } from "@/lib/notification-preference";
import { Switch } from "@/components/ui/switch";

/**
 * Mantém os avisos em tempo real ligados em qualquer tela do admin (novo agendamento e
 * respostas dos clientes). Não desenha nada: o botão de ligar e desligar fica só na aba
 * Notificações.
 */
export function AppointmentAlerts({
  establishment,
}: {
  establishment: { id: string; timezone: string };
}) {
  useAppointmentAlerts(establishment);
  return null;
}

/** Chave de ligar e desligar as notificações neste aparelho, com a explicação ao lado. */
export function NotificationsToggle() {
  const { enabled, setEnabled } = useNotificationsEnabled();

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 text-right">
        <p className="text-sm font-semibold">{enabled ? "Desligar" : "Ligar"}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Você será avisado de novos agendamentos e das respostas dos clientes.
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => void setEnabled(v)}
        aria-label={enabled ? "Desligar notificações" : "Ligar notificações"}
      />
    </div>
  );
}
