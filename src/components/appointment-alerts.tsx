import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { useAppointmentAlerts } from "@/hooks/use-appointment-alerts";
import { readNotificationsPref, useNotificationsEnabled } from "@/lib/notification-preference";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Liga os avisos em tempo real e, enquanto o usuário não escolheu, oferece ativar as
 * notificações neste aparelho. Depois, o interruptor "Notificações" do menu controla tudo.
 */
export function AppointmentAlerts({
  establishment,
}: {
  establishment: { id: string; timezone: string };
}) {
  useAppointmentAlerts(establishment);
  const { setEnabled } = useNotificationsEnabled();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(readNotificationsPref() === null);
  }, []);

  if (!show) return null;

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <BellRing className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          Receba um aviso quando chegar um novo agendamento ou o cliente confirmar ou cancelar.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await setEnabled(true);
              setShow(false);
            }}
          >
            Ativar avisos
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await setEnabled(false);
              setShow(false);
            }}
          >
            Agora não
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
