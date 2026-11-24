// Avisos automáticos de WhatsApp (API oficial da Meta) para planos Pro e Premium:
//  - appointment_confirmed: o estabelecimento aceitou o agendamento (modelo agendamento_confirmado)
//  - daily_reminders: lembrete no dia, às 8h do fuso do estabelecimento, com botões Confirmar/Cancelar
// O plano Grátis não usa a API: o funil manual por wa.me continua no app.
//
// Envia pelo número conectado do estabelecimento (whatsapp_agents + whatsapp_credentials);
// sem número conectado, usa o número da plataforma (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ENV_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const ENV_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const CONFIRMED_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_CONFIRMED") ?? "agendamento_confirmado";
const REMINDER_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_REMINDER") ?? "lembrete_agendamento";
const REMINDER_HOUR = 8; // hora local do estabelecimento
const MIN_GAP_AFTER_CONFIRMED_MS = 3 * 60 * 60 * 1000; // não lembrar logo depois do aviso de confirmado
const MIN_LEAD_MS = 60 * 60 * 1000; // não lembrar de algo que começa em menos de 1h

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Sender = { phoneNumberId: string; token: string };

async function getSender(establishmentId: string): Promise<Sender | null> {
  const { data: agent } = await supabase
    .from("whatsapp_agents")
    .select("id, phone_number_id")
    .eq("establishment_id", establishmentId)
    .not("phone_number_id", "is", null)
    .maybeSingle();
  if (agent?.phone_number_id) {
    const { data: cred } = await supabase
      .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
    if (cred) return { phoneNumberId: agent.phone_number_id, token: cred.access_token };
  }
  if (ENV_TOKEN && ENV_PHONE_NUMBER_ID) return { phoneNumberId: ENV_PHONE_NUMBER_ID, token: ENV_TOKEN };
  return null;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-11);
}

function formatDateTime(iso: string, timezone: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function localHour(date: Date, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(date),
  );
}

type TemplateButton = { payload: string };

async function sendTemplate(
  sender: Sender,
  to: string,
  templateName: string,
  bodyParams: string[],
  quickReplies: TemplateButton[] = [],
) {
  const components: unknown[] = [
    { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
    ...quickReplies.map((b, index) => ({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: b.payload }],
    })),
  ];
  const res = await fetch(`https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sender.token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `55${normalizePhone(to)}`,
      type: "template",
      template: { name: templateName, language: { code: "pt_BR" }, components },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

type NotificationRow = {
  id: string;
  appointment_id: string | null;
  event: string;
  status: string;
  payload: { phone?: string; name?: string };
};

type Establishment = { id: string; name: string; timezone: string; plan: string };

const isPaid = (plan: string | undefined) => plan === "pro" || plan === "premium";

async function processOne(notificationId: string) {
  const { data: notif, error } = await supabase
    .from("notification_queue")
    .select("id, appointment_id, event, status, payload")
    .eq("id", notificationId)
    .single<NotificationRow>();
  if (error || !notif) throw new Error("notification not found");
  if (notif.status !== "queued") return { skipped: true };

  const skip = async (reason: string) => {
    await supabase.from("notification_queue").update({ status: "skipped" }).eq("id", notif.id);
    return { skipped: true, reason };
  };

  if (notif.event !== "appointment_confirmed" || !notif.appointment_id) return skip("event");

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, starts_at, establishment:establishments(id, name, timezone, plan)")
    .eq("id", notif.appointment_id)
    .single();

  const phone = notif.payload?.phone;
  const name = notif.payload?.name ?? "";
  if (!phone || !appt) {
    await supabase.from("notification_queue").update({ status: "failed" }).eq("id", notif.id);
    return { error: "missing phone or appointment" };
  }

  const establishment = appt.establishment as unknown as Establishment | null;
  if (!establishment || !isPaid(establishment.plan)) return skip("plan"); // Grátis: funil wa.me manual

  const sender = await getSender(establishment.id);
  if (!sender) {
    await supabase.from("notification_queue").update({ status: "failed" }).eq("id", notif.id);
    return { error: "no whatsapp sender" };
  }

  const { date, time } = formatDateTime(appt.starts_at as string, establishment.timezone);
  try {
    await sendTemplate(sender, phone, CONFIRMED_TEMPLATE, [
      name.split(" ")[0] || name,
      establishment.name,
      date,
      time,
    ]);
    await supabase.from("notification_queue").update({ status: "sent" }).eq("id", notif.id);
    return { sent: true };
  } catch (e) {
    await supabase.from("notification_queue").update({ status: "failed" }).eq("id", notif.id);
    throw e;
  }
}

/** Roda de hora em hora: lembra, no dia, quem tem agendamento confirmado e ainda não foi avisado. */
async function dailyReminders() {
  const now = new Date();
  const { data: appts } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, customer:customers!appointments_customer_id_fkey(name, phone), establishment:establishments(id, name, timezone, plan)",
    )
    .eq("status", "confirmed")
    .is("whatsapp_reminder_sent_at", null)
    .gte("starts_at", new Date(now.getTime() + MIN_LEAD_MS).toISOString())
    .lte("starts_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());

  let sent = 0;
  for (const appt of appts ?? []) {
    const customer = appt.customer as unknown as { name: string; phone: string } | null;
    const establishment = appt.establishment as unknown as Establishment | null;
    if (!customer?.phone || !establishment || !isPaid(establishment.plan)) continue;

    const tz = establishment.timezone ?? "America/Sao_Paulo";
    // Só no dia do atendimento, a partir das 8h locais.
    if (localDate(new Date(appt.starts_at as string), tz) !== localDate(now, tz)) continue;
    if (localHour(now, tz) < REMINDER_HOUR) continue;

    // Não lembrar logo depois de avisar que foi confirmado.
    const { data: recent } = await supabase
      .from("notification_queue")
      .select("created_at")
      .eq("appointment_id", appt.id)
      .eq("event", "appointment_confirmed")
      .gte("created_at", new Date(now.getTime() - MIN_GAP_AFTER_CONFIRMED_MS).toISOString())
      .limit(1);
    if (recent?.length) continue;

    const sender = await getSender(establishment.id);
    if (!sender) continue;

    const { time } = formatDateTime(appt.starts_at as string, tz);
    try {
      await sendTemplate(
        sender,
        customer.phone,
        REMINDER_TEMPLATE,
        [customer.name?.split(" ")[0] ?? "", time, establishment.name],
        [{ payload: `CONFIRM:${appt.id}` }, { payload: `CANCEL:${appt.id}` }],
      );
      await supabase
        .from("appointments")
        .update({ whatsapp_reminder_sent_at: new Date().toISOString() })
        .eq("id", appt.id);
      sent++;
    } catch (e) {
      console.error("reminder failed", appt.id, e);
    }
  }
  return { sent };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode;
    if (mode === "process_one") {
      const result = await processOne(body.notification_id);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }
    if (mode === "daily_reminders") {
      const result = await dailyReminders();
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "unknown mode" }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
