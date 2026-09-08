import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";

/** True only inside the packaged Android/iOS app — this plugin has no web implementation. */
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export type DeviceContact = { name: string; phone: string };

/** Pulls every device contact that has both a name and a phone number. Requests OS permission first. */
export async function pickAllDeviceContacts(): Promise<DeviceContact[]> {
  const permission = await Contacts.requestPermissions();
  if (permission.contacts !== "granted") {
    throw new Error("Permissão de acesso aos contatos foi negada");
  }

  const { contacts } = await Contacts.getContacts({
    projection: { name: true, phones: true },
  });

  const result: DeviceContact[] = [];
  for (const c of contacts) {
    const name = c.name?.display?.trim();
    const phone = c.phones?.[0]?.number?.trim();
    if (name && phone) result.push({ name, phone });
  }
  return result;
}
