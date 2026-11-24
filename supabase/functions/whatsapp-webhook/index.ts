import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleIncomingText } from "./agent.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-11);
}

async function verifySignature(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader || !APP_SECRET) return false;
  const expected = signatureHeader.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handleButtonReply(from: string, payload: string) {
  const optIn = payload === "OPT_IN_YES" ? true : payload === "OPT_IN_NO" ? false : null;
  if (optIn === null) return;

  const digits = normalizePhone(from);
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .ilike("phone", `%${digits.slice(-8)}%`)
    .maybeSingle();
  if (!customer) return;

  const { data: appt } = await supabase
    .from("appointments")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("status", "confirmed")
    .is("whatsapp_reminder_opt_in", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!appt) return;

  await supabase.from("appointments").update({ whatsapp_reminder_opt_in: optIn }).eq("id", appt.id);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const valid = await verifySignature(rawBody, signature);
    if (!valid) return new Response("Invalid signature", { status: 401 });

    const payload = JSON.parse(rawBody);

    // Responde 200 já: a Meta reenvia se demorar. O agente roda em segundo plano.
    const work = (async () => {
      const changes = (payload?.entry ?? []).flatMap(
        (e: { changes?: unknown[] }) => e?.changes ?? [],
      );
      // deno-lint-ignore no-explicit-any
      for (const change of changes as Array<{ value?: any }>) {
        const value = change?.value;
        const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;
        const contacts = (value?.contacts ?? []) as Array<{ wa_id?: string; profile?: { name?: string } }>;
        for (const msg of value?.messages ?? []) {
          try {
            const from = msg.from as string | undefined;
            let buttonPayload: string | null = null;
            if (msg.type === "button" && msg.button?.payload) buttonPayload = msg.button.payload;
            if (msg.type === "interactive" && msg.interactive?.button_reply?.id) {
              buttonPayload = msg.interactive.button_reply.id;
            }
            if (from && buttonPayload) {
              await handleButtonReply(from, buttonPayload);
            } else if (from && phoneNumberId && msg.type === "text" && msg.text?.body) {
              await handleIncomingText({
                phoneNumberId,
                from,
                name: contacts.find((c) => c.wa_id === from)?.profile?.name ?? null,
                text: String(msg.text.body).trim(),
                waMessageId: String(msg.id),
              });
            }
          } catch (e) {
            console.error("webhook message error", e);
          }
        }
      }
    })();
    // @ts-ignore EdgeRuntime existe no runtime das Edge Functions
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
