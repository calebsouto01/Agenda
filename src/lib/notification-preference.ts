import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const KEY = "notifications-enabled";
const EVENT = "notifications-enabled-changed";

/** Escolha do usuário neste aparelho: true, false, ou null se ainda não escolheu. */
export function readNotificationsPref(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

/** Sem escolha ainda, fica ligado só se o navegador já autorizou notificações. */
export function readNotificationsEnabled(): boolean {
  const pref = readNotificationsPref();
  if (pref !== null) return pref;
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function writePref(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Liga ou desliga os avisos (tela e sistema) neste aparelho, computador ou celular. */
export function useNotificationsEnabled() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    const sync = () => setEnabledState(readNotificationsEnabled());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    if (value && typeof Notification !== "undefined") {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission === "denied") {
        toast.error(
          "O navegador bloqueou as notificações. Libere nas configurações do site para receber avisos do sistema.",
        );
      }
    }
    writePref(value);
    toast.success(value ? "Notificações ligadas" : "Notificações desligadas");
  }, []);

  return { enabled, setEnabled };
}
