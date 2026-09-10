import { createClient } from "jsr:@supabase/supabase-js@2";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const CONFIRMATION_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_CONFIRMATION") ?? "confirmacao_agendamento";
const REMINDER_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_REMINDER") ?? "lembrete_agendamento";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-11);
}

function formatDateTime(iso: string, timezone: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

async function sendTemplate(to: string, templateName: string, bodyParams: string[]) {
  const digits = normalizePhone(to);
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `55${digits}`,
      type: "template",
      template: {
        name: templateName,
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }],
      },
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

async function processOne(notificationId: string) {
  const { data: notif, error } = await supabase
    .from("notification_queue")
    .select("id, appointment_id, event, status, payload")
    .eq("id", notificationId)
    .single<NotificationRow>();
  if (error || !notif) throw new Error("notification not found");
  if (notif.status !== "queued") return { skipped: true };

  if (notif.event !== "appointment_created" || !notif.appointment_id) {
    await supabase.from("notification_queue").update({ status: "skipped" }).eq("id", notif.id);
    return { skipped: true };
  }

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, starts_at, establishment:establishments(name, timezone)")
    .eq("id", notif.appointment_id)
    .single();

  const phone = notif.payload?.phone;
  const name = notif.payload?.name ?? "";
  if (!phone || !appt) {
    await supabase.from("notification_queue").update({ status: "failed" }).eq("id", notif.id);
    return { error: "missing phone or appointment" };
  }

  const establishment = appt.establishment as unknown as { name: string; timezone: string } | null;
  const tz = establishment?.timezone ?? "America/Sao_Paulo";
  const { date, time } = formatDateTime(appt.starts_at as string, tz);

  try {
    await sendTemplate(phone, CONFIRMATION_TEMPLATE, [
      name.split(" ")[0] || name,
      establishment?.name ?? "",
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

async function dailyReminders() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, starts_at, customer:customers(name, phone), establishment:establishments(name, timezone)")
    .eq("status", "confirmed")
    .eq("whatsapp_reminder_opt_in", true)
    .is("whatsapp_reminder_sent_at", null)
    .gte("starts_at", `${todayIso}T00:00:00Z`)
    .lte("starts_at", `${todayIso}T23:59:59Z`);

  let sent = 0;
  for (const appt of appts ?? []) {
    const customer = appt.customer as unknown as { name: string; phone: string } | null;
    const establishment = appt.establishment as unknown as { name: string; timezone: string } | null;
    if (!customer?.phone) continue;
    const tz = establishment?.timezone ?? "America/Sao_Paulo";
    const { time } = formatDateTime(appt.starts_at as string, tz);
    try {
      await sendTemplate(customer.phone, REMINDER_TEMPLATE, [
        customer.name?.split(" ")[0] ?? "",
        time,
        establishment?.name ?? "",
      ]);
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
