import { useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { useEstablishment } from "@/hooks/use-establishment";
import { whatsappLink } from "@/lib/booking";
import {
  detectWhatsAppApps,
  isNativeAndroid,
  openInWhatsAppApp,
  type WhatsAppApp,
} from "@/lib/whatsapp-intent";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function WhatsAppLink({
  phone,
  message,
  className,
  ariaLabel,
  children,
  onSend,
}: {
  phone: string;
  message?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
  /** Chamado só depois que o app do WhatsApp foi de fato aberto (ou o link universal disparado) — nunca em caso de falha. */
  onSend?: () => void;
}) {
  const { data: establishment } = useEstablishment();
  const [open, setOpen] = useState(false);
  const apiConnected = establishment?.whatsapp_business_api_connected ?? false;
  const url = whatsappLink(phone, message);

  // No app nativo, o intent explícito pro pacote do WhatsApp pode rejeitar
  // (ACTIVITY_NOT_FOUND) sem lançar nada visível — por isso só marcamos como
  // enviado depois que a abertura realmente aconteceu, e avisamos se falhar.
  async function openWhatsApp(app: WhatsAppApp | null) {
    try {
      if (app) {
        await openInWhatsAppApp(url, app);
      } else {
        window.open(url, "_blank");
      }
      onSend?.();
    } catch {
      toast.error("Não foi possível abrir o WhatsApp");
    }
  }

  async function handleClick(e: MouseEvent) {
    if (apiConnected || !isNativeAndroid()) {
      onSend?.();
      return;
    }
    e.preventDefault();
    const apps = await detectWhatsAppApps();
    if (apps.whatsapp && apps.business) {
      setOpen(true);
      return;
    }
    await openWhatsApp(apps.whatsapp ? "whatsapp" : apps.business ? "business" : null);
  }

  function choose(app: WhatsAppApp) {
    setOpen(false);
    void openWhatsApp(app);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={ariaLabel}
          className={className}
          onClick={handleClick}
        >
          {children}
        </a>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Enviar por qual WhatsApp?
        </p>
        <button
          type="button"
          onClick={() => choose("whatsapp")}
          className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => choose("business")}
          className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          WhatsApp Business
        </button>
      </PopoverContent>
    </Popover>
  );
}
