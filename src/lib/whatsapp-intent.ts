import { Capacitor } from "@capacitor/core";
import { AndroidIntentLauncher } from "@capawesome/capacitor-android-intent-launcher";

const PACKAGE = { whatsapp: "com.whatsapp", business: "com.whatsapp.w4b" } as const;

export type WhatsAppApp = keyof typeof PACKAGE;

export function isNativeAndroid() {
  return Capacitor.getPlatform() === "android";
}

/** Detecta quais dos dois apps (WhatsApp normal e Business) estão instalados no aparelho. */
export async function detectWhatsAppApps(): Promise<Record<WhatsAppApp, boolean>> {
  if (!isNativeAndroid()) return { whatsapp: false, business: false };
  async function canResolve(app: WhatsAppApp) {
    return AndroidIntentLauncher.canResolveActivity({
      action: "android.intent.action.VIEW",
      dataUri: "https://wa.me/",
      packageName: PACKAGE[app],
    })
      .then((r) => r.canResolve)
      .catch(() => false);
  }
  const [whatsapp, business] = await Promise.all([canResolve("whatsapp"), canResolve("business")]);
  return { whatsapp, business };
}

/** Abre o link do wa.me forçando um dos dois apps específicos via intent explícito. */
export async function openInWhatsAppApp(url: string, app: WhatsAppApp) {
  await AndroidIntentLauncher.startActivity({
    action: "android.intent.action.VIEW",
    dataUri: url,
    packageName: PACKAGE[app],
  });
}
