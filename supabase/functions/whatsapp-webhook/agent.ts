// Agente de IA (Claude) que atende clientes pelo WhatsApp Cloud API oficial:
// consulta serviços, horários livres, cria agendamentos e transfere para humano.
// Secrets: ANTHROPIC_API_KEY (opcional: ANTHROPIC_MODEL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 6;
const GRAPH = "https://graph.facebook.com/v21.0";
const FALLBACK_REPLY =
  "Olá! Recebemos sua mensagem, mas não consegui responder agora. Nossa equipe retorna em breve. Obrigado pela paciência!";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Brasil: o webhook costuma trazer celulares sem o 9 extra (55 + DDD + 8 dígitos); a Meta usa com o 9. */
function brMobileWith9(num: string): string {
  const m = num.match(/^55(\d{2})([6-9]\d{7})$/);
  return m ? `55${m[1]}9${m[2]}` : num;
}

/** Telefone nacional (sem 55, com o 9) para gravar no agendamento. */
function localPhone(num: string): string {
  const full = brMobileWith9(num);
  return full.startsWith("55") && full.length === 13 ? full.slice(2) : full;
}

export async function sendText(phoneNumberId: string, accessToken: string, to: string, text: string) {
  // Tenta com o 9 e, se a Meta disser que o destinatário não está na lista (131030), o formato original.
  const candidates = [...new Set([brMobileWith9(to), to])];
  for (const target of candidates) {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: target, type: "text", text: { body: text } }),
    });
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    console.error("sendText failed", res.status, body);
    if (!body.includes("131030")) return;
  }
}

const EVOLUTION_API_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

/** Conexão rápida (QR code): responde pelo número ligado à instância da Evolution API. */
export async function sendEvolutionText(instance: string, to: string, text: string) {
  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number: to, text }),
  });
  if (!res.ok) console.error("evolution sendText failed", res.status, await res.text().catch(() => ""));
}

const ENV_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const ENV_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

/** Token do número que recebeu a mensagem: o do estabelecimento conectado ou, nos testes, o da plataforma. */
export async function tokenForPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { data: agent } = await supabase
    .from("whatsapp_agents").select("id").eq("phone_number_id", phoneNumberId).maybeSingle();
  if (agent) {
    const { data: cred } = await supabase
      .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
    if (cred) return cred.access_token;
  }
  return phoneNumberId === ENV_PHONE_NUMBER_ID && ENV_TOKEN ? ENV_TOKEN : null;
}

type Establishment = {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  plan: string;
};

type Agent = {
  id: string;
  establishment_id: string;
  enabled: boolean;
  agent_name: string;
  instructions: string | null;
  provider: "official" | "qr";
  phone_number_id: string | null;
  instance_name: string | null;
};

type Send = (text: string) => Promise<void>;

function fmtSlot(iso: string, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(new Date(iso));
}

function hhmm(iso: string, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

function systemPrompt(est: Establishment, agent: Agent) {
  const now = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full", timeStyle: "short", timeZone: est.timezone,
  }).format(new Date());
  return `Você é ${agent.agent_name}, assistente virtual de atendimento de "${est.name}" no WhatsApp.
${est.description ? `Sobre o negócio: ${est.description}\n` : ""}${est.address ? `Endereço: ${est.address}\n` : ""}${est.phone ? `Telefone: ${est.phone}\n` : ""}Data e hora atuais (${est.timezone}): ${now}.

Regras:
- Responda em português do Brasil, de forma curta, cordial e natural, como numa conversa de WhatsApp. Sem markdown pesado.
- Use SEMPRE as ferramentas para serviços, preços, profissionais e horários. Nunca invente informações.
- Para agendar: confirme serviço(s), profissional (se houver mais de um), data e horário. Confirme o nome do cliente (o telefone do WhatsApp já é conhecido). Só chame create_appointment depois do cliente confirmar claramente.
- Ofereça no máximo 5 horários por vez.
- Se o cliente pedir para falar com uma pessoa, reclamar, ou se você não souber resolver, chame handoff_to_human.
- Você não cancela nem remarca agendamentos: nesses casos use handoff_to_human.
${agent.instructions ? `\nInstruções do dono do negócio:\n${agent.instructions}` : ""}`;
}

const TOOLS = [
  {
    name: "list_services",
    description: "Lista serviços ativos (id, nome, preço, duração) e profissionais ativos.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_availability",
    description: "Retorna horários livres de uma data para os serviços escolhidos.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data no formato YYYY-MM-DD" },
        service_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        professional_id: { type: "string", description: "Opcional" },
      },
      required: ["date", "service_ids"],
    },
  },
  {
    name: "create_appointment",
    description: "Cria o agendamento depois da confirmação do cliente.",
    input_schema: {
      type: "object",
      properties: {
        starts_at: { type: "string", description: "Valor exato 'iso' retornado por check_availability" },
        service_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        professional_id: { type: "string" },
        customer_name: { type: "string" },
      },
      required: ["starts_at", "service_ids", "customer_name"],
    },
  },
  {
    name: "handoff_to_human",
    description: "Pausa a IA nesta conversa e avisa o dono para assumir o atendimento.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
];

async function runTool(
  name: string,
  input: any,
  ctx: { est: Establishment; conversationId: string; phone: string; handedOff: { value: boolean } },
): Promise<unknown> {
  const { est } = ctx;
  if (name === "list_services") {
    const [{ data: services }, { data: pros }] = await Promise.all([
      supabase.from("services").select("id, name, description, price_cents, duration_minutes")
        .eq("establishment_id", est.id).eq("active", true).order("name"),
      supabase.from("professionals").select("id, name, role")
        .eq("establishment_id", est.id).eq("active", true).order("name"),
    ]);
    return {
      services: (services ?? []).map((s) => ({
        id: s.id, name: s.name, description: s.description,
        price_brl: (s.price_cents / 100).toFixed(2), duration_minutes: s.duration_minutes,
      })),
      professionals: pros ?? [],
    };
  }

  if (name === "check_availability") {
    const ids: string[] = input.service_ids ?? [];
    const { data, error } = await supabase.rpc("available_slots", {
      p_establishment_id: est.id,
      p_service_id: ids[0],
      p_professional_id: input.professional_id ?? null,
      p_date: input.date,
      p_service_ids: ids.length > 1 ? ids : null,
    });
    if (error) return { error: error.message };
    const slots = ((data ?? []) as string[]).map((iso) => ({ iso, label: hhmm(iso, est.timezone) }));
    return { date: input.date, slots: slots.slice(0, 30) };
  }

  if (name === "create_appointment") {
    const ids: string[] = input.service_ids ?? [];
    const { data, error } = await supabase.rpc("book_appointment", {
      p_establishment_id: est.id,
      p_service_id: ids[0],
      p_professional_id: input.professional_id ?? null,
      p_starts_at: input.starts_at,
      p_customer_name: input.customer_name,
      p_customer_phone: localPhone(ctx.phone),
      p_customer_email: null,
      p_notes: "Agendado pelo atendente de IA no WhatsApp",
      p_service_ids: ids.length > 1 ? ids : null,
      p_marketing_link_code: null,
    });
    if (error) return { error: error.message };
    return { ok: true, when: fmtSlot((data as any).starts_at, est.timezone), status: "pendente de confirmação pelo estabelecimento" };
  }

  if (name === "handoff_to_human") {
    ctx.handedOff.value = true;
    await supabase
      .from("whatsapp_conversations")
      .update({ ai_paused: true, needs_human: true })
      .eq("id", ctx.conversationId);
    return { ok: true };
  }

  return { error: "unknown_tool" };
}

async function claude(messages: unknown[], system: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function respond(
  agent: Agent,
  send: Send,
  est: Establishment,
  conv: { id: string; contact_phone: string },
) {
  const { data: rows } = await supabase
    .from("whatsapp_messages")
    .select("role, content")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (rows ?? []).reverse();
  // A API exige começar por "user" e alternar papéis; mescla turnos consecutivos.
  const messages: { role: string; content: any }[] = [];
  for (const m of history) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return;

  const handedOff = { value: false };
  const ctx = { est, conversationId: conv.id, phone: conv.contact_phone, handedOff };
  const system = systemPrompt(est, agent);
  let reply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const out = await claude(messages, system);
    const text = (out.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) reply = text;
    if (out.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: out.content });
    const results = [];
    for (const block of (out.content as any[]).filter((b) => b.type === "tool_use")) {
      let result: unknown;
      try {
        result = await runTool(block.name, block.input ?? {}, ctx);
      } catch (e) {
        result = { error: String(e) };
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }

  if (!reply) reply = handedOff.value
    ? "Certo! Vou chamar uma pessoa da equipe para continuar seu atendimento."
    : "";
  if (!reply) return;

  await supabase.from("whatsapp_messages").insert({ conversation_id: conv.id, role: "assistant", content: reply });
  await supabase.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
  await send(reply);
}

/** Resposta por texto ao lembrete do dia ("1" confirma, "2" cancela), para quem não tem botões (QR). */
async function handleReminderTextReply(est: Establishment, from: string, text: string, send: Send) {
  const t = text.trim().toLowerCase();
  const confirm = ["1", "confirmar", "confirmo", "confirmado"].includes(t);
  const cancel = ["2", "cancelar", "cancelo"].includes(t);
  if (!confirm && !cancel) return false;

  const digits = from.replace(/\D/g, "").slice(-8);
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("establishment_id", est.id)
    .ilike("phone", `%${digits}`);
  if (!customers?.length) return false;

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, customer_id")
    .in("customer_id", customers.map((c) => c.id))
    .eq("status", "confirmed")
    .is("customer_confirmed_at", null)
    .gte("whatsapp_reminder_sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!appt) return false; // não há lembrete esperando resposta: segue para o agente

  const firstName = customers.find((c) => c.id === appt.customer_id)?.name?.split(" ")[0] ?? "";
  if (confirm) {
    await supabase.from("appointments").update({ customer_confirmed_at: new Date().toISOString() }).eq("id", appt.id);
    await send(`Obrigado, ${firstName}! Presença confirmada. Te esperamos na ${est.name}!`);
  } else {
    await supabase
      .from("appointments")
      .update({ status: "cancelled", customer_cancelled_at: new Date().toISOString() })
      .eq("id", appt.id);
    await send(`Tudo bem, ${firstName}. Seu agendamento foi cancelado. Quando quiser remarcar, é só nos chamar por aqui!`);
  }
  return true;
}

/**
 * Processa uma mensagem de texto recebida.
 * Oficial (Meta): identificada por `phoneNumberId`. Conexão rápida (QR): por `instanceName`.
 */
export async function handleIncomingText(opts: {
  phoneNumberId?: string;
  instanceName?: string;
  from: string;
  name: string | null;
  text: string;
  waMessageId: string;
}) {
  const lookupColumn = opts.instanceName ? "instance_name" : "phone_number_id";
  const lookupValue = opts.instanceName ?? opts.phoneNumberId;
  if (!lookupValue) return;

  const { data: agent } = await supabase
    .from("whatsapp_agents")
    .select("id, establishment_id, enabled, agent_name, instructions, provider, phone_number_id, instance_name")
    .eq(lookupColumn, lookupValue)
    .maybeSingle<Agent>();
  if (!agent) return;

  // Como responder: pela API oficial (token do cliente) ou pela Evolution (QR).
  let send: Send;
  if (agent.provider === "qr") {
    if (!agent.instance_name) return;
    const instance = agent.instance_name;
    send = (text) => sendEvolutionText(instance, opts.from, text);
  } else {
    if (!agent.phone_number_id) return;
    const { data: cred } = await supabase
      .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
    if (!cred) return;
    const phoneNumberId = agent.phone_number_id;
    send = (text) => sendText(phoneNumberId, cred.access_token, opts.from, text);
  }

  const { data: est } = await supabase
    .from("establishments")
    .select("id, name, description, phone, address, timezone, plan")
    .eq("id", agent.establishment_id)
    .single<Establishment>();
  if (!est) return;
  if (est.plan !== "pro" && est.plan !== "premium") return;

  // Resposta "1"/"2" ao lembrete vale em Pro e Premium (não depende da IA).
  const isReminderReply = await handleReminderTextReply(est, opts.from, opts.text, send);
  if (isReminderReply) return;

  // O agente de IA é do plano Premium e só responde se estiver ligado.
  if (est.plan !== "premium" || !agent.enabled || !ANTHROPIC_API_KEY) return;

  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      {
        establishment_id: est.id,
        contact_phone: opts.from,
        contact_name: opts.name,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id,contact_phone" },
    )
    .select("id, contact_phone, ai_paused")
    .single();
  if (!conv) return;

  // A Meta reenvia webhooks; a unicidade do id da mensagem evita responder em dobro.
  const { error: dup } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conv.id, role: "user", content: opts.text, wa_message_id: opts.waMessageId,
  });
  if (dup) return;
  if (conv.ai_paused) return; // atendimento humano em andamento

  try {
    await respond(agent, send, est, conv);
  } catch (e) {
    // Falha da IA (ex.: sem crédito, instabilidade): o cliente não fica sem resposta.
    console.error("agent failed, sending fallback", e);
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conv.id, role: "assistant", content: FALLBACK_REPLY,
    });
    await send(FALLBACK_REPLY);
  }
}
