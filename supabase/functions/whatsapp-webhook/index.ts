import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleIncomingText, sendText, tokenForPhoneNumberId } from "./agent.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const EVOLUTION_WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";

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

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
function extractEvolutionText(message: any): string {
  return String(message?.conversation ?? message?.extendedTextMessage?.text ?? "").trim();
}

/** Eventos da Evolution API (conexão rápida por QR): mensagens e estado da conexão. */
// deno-lint-ignore no-explicit-any
async function handleEvolutionEvent(payload: any) {
  const instance: string | undefined = payload?.instance;
  const event = String(payload?.event ?? "").toLowerCase().replace(/_/g, ".");
  if (!instance) return;

  if (event === "connection.update") {
    const state = payload?.data?.state;
    if (state === "open") {
      const owner = String(payload?.data?.wuid ?? payload?.sender ?? "").replace(/@.*/, "") || null;
      await supabase
        .from("whatsapp_agents")
        .update({ connection_status: "connected", connected_phone: owner })
        .eq("instance_name", instance);
    } else if (state === "close") {
      // Só marca como desconectado se estava conectado (ao recriar o QR a Evolution também emite "close").
      await supabase
        .from("whatsapp_agents")
        .update({ connection_status: "disconnected", connected_phone: null })
        .eq("instance_name", instance)
        .eq("connection_status", "connected");
    }
    return;
  }

  if (event === "messages.upsert") {
    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const item of items) {
      const key = item?.key;
      if (!key || key.fromMe) continue;
      const jid: string = key.remoteJid ?? "";
      if (!jid.endsWith("@s.whatsapp.net")) continue; // só conversas individuais
      const text = extractEvolutionText(item.message);
      if (!text) continue;
      try {
        await handleIncomingText({
          instanceName: instance,
          from: jid.replace(/@.*/, ""),
          name: item.pushName ?? null,
          text,
          waMessageId: String(key.id ?? crypto.randomUUID()),
        });
      } catch (e) {
        console.error("evolution message error", e);
      }
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resposta aos botões do lembrete do dia (payload "CONFIRM:<id>" ou "CANCEL:<id>").
 * O cliente confirma presença ou cancela; respondemos na hora (grátis: dentro da janela de 24h).
 */
async function handleReminderReply(phoneNumberId: string, from: string, payload: string) {
  const [action, appointmentId] = payload.split(":");
  if ((action !== "CONFIRM" && action !== "CANCEL") || !UUID_RE.test(appointmentId ?? "")) return;

  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, status, starts_at, customer:customers!appointments_customer_id_fkey(name, phone), establishment:establishments(name)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return;

  const customer = appt.customer as unknown as { name: string; phone: string } | null;
  const establishment = appt.establishment as unknown as { name: string } | null;
  // Só quem recebeu o lembrete pode responder por ele.
  if (!customer || normalizePhone(customer.phone).slice(-8) !== normalizePhone(from).slice(-8)) return;

  const firstName = customer.name?.split(" ")[0] ?? "";
  let reply: string | null = null;

  if (action === "CONFIRM") {
    if (appt.status === "confirmed") {
      await supabase
        .from("appointments")
        .update({ customer_confirmed_at: new Date().toISOString() })
        .eq("id", appt.id);
      reply = `Obrigado, ${firstName}! Presença confirmada. Te esperamos na ${establishment?.name ?? "nossa loja"}!`;
    }
  } else if (action === "CANCEL") {
    if (
      (appt.status === "confirmed" || appt.status === "pending") &&
      new Date(appt.starts_at as string).getTime() > Date.now()
    ) {
      await supabase
        .from("appointments")
        .update({ status: "cancelled", customer_cancelled_at: new Date().toISOString() })
        .eq("id", appt.id);
      reply = `Tudo bem, ${firstName}. Seu agendamento foi cancelado. Quando quiser remarcar, é só nos chamar por aqui!`;
    }
  }

  if (reply) {
    const token = await tokenForPhoneNumberId(phoneNumberId);
    if (token) await sendText(phoneNumberId, token, from, reply);
  }
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
    // Evolution API (QR code): autenticada por segredo na URL, sem assinatura da Meta.
    const evolutionSecret = url.searchParams.get("secret");
    if (evolutionSecret !== null) {
      if (!EVOLUTION_WEBHOOK_SECRET || !safeEqual(evolutionSecret, EVOLUTION_WEBHOOK_SECRET)) {
        return new Response("Forbidden", { status: 403 });
      }
      // deno-lint-ignore no-explicit-any
      let evolutionPayload: any;
      try {
        evolutionPayload = await req.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      const evolutionWork = handleEvolutionEvent(evolutionPayload).catch((e) =>
        console.error("evolution webhook error", e)
      );
      // @ts-ignore EdgeRuntime existe no runtime das Edge Functions
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(evolutionWork);
      else await evolutionWork;
      return new Response("ok");
    }

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
            if (from && phoneNumberId && buttonPayload) {
              await handleReminderReply(phoneNumberId, from, buttonPayload);
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
