import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { useAppointmentAlerts } from "@/hooks/use-appointment-alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DISMISS_KEY = "notification-banner-dismissed";

/**
 * Liga os avisos em tempo real e, uma única vez, pede ao dono a autorização para
 * notificar neste aparelho (celular ou computador). O pedido precisa vir de um clique.
 */
export function AppointmentAlerts({
  establishment,
}: {
  establishment: { id: string; timezone: string };
}) {
  useAppointmentAlerts(establishment);

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (permission !== "default" || dismissed) return null;

  async function enable() {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") toast.success("Avisos ativados neste aparelho");
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sem armazenamento: o aviso reaparece na próxima visita */
    }
  }

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <BellRing className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          Receba um aviso quando chegar um novo agendamento ou o cliente confirmar ou cancelar.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={enable}>
            Ativar avisos
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
