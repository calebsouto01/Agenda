// Recebe eventos da Evolution API (mensagens e estado da conexão) e responde
// os clientes com um agente Claude que consulta serviços, horários livres,
// cria agendamentos e pode transferir para um humano.
//
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET,
// ANTHROPIC_API_KEY (opcional: ANTHROPIC_MODEL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const EVOLUTION_API_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 6;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendText(instance: string, number: string, text: string) {
  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) console.error("sendText failed", res.status, await res.text().catch(() => ""));
}

type Establishment = {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
};

type Agent = {
  id: string;
  establishment_id: string;
  enabled: boolean;
  agent_name: string;
  instructions: string | null;
  instance_name: string;
};

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
      p_customer_phone: ctx.phone,
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

async function respond(agent: Agent, est: Establishment, conv: { id: string; contact_phone: string }) {
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
  await sendText(agent.instance_name, conv.contact_phone, reply);
}

function extractText(message: any): string {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    ""
  ).trim();
}

async function handleMessage(agent: Agent, data: any) {
  const key = data?.key;
  if (!key || key.fromMe) return;
  const jid: string = key.remoteJid ?? "";
  // Só conversas individuais (ignora grupos, status e canais).
  if (!jid.endsWith("@s.whatsapp.net")) return;
  const phone = jid.replace(/@.*/, "");
  const text = extractText(data.message);
  if (!text) return; // áudio/imagem sem legenda: ignorado nesta versão

  const { data: est } = await supabase
    .from("establishments")
    .select("id, name, description, phone, address, timezone")
    .eq("id", agent.establishment_id)
    .single<Establishment>();
  if (!est) return;

  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      {
        establishment_id: est.id,
        contact_phone: phone,
        contact_name: data.pushName ?? null,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id,contact_phone" },
    )
    .select("id, contact_phone, ai_paused")
    .single();
  if (!conv) return;

  await supabase.from("whatsapp_messages").insert({ conversation_id: conv.id, role: "user", content: text });
  if (conv.ai_paused) return; // atendimento humano em andamento

  await respond(agent, est, conv);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  if (!WEBHOOK_SECRET || !safeEqual(secret, WEBHOOK_SECRET)) return new Response("Forbidden", { status: 403 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const instance: string | undefined = payload?.instance;
  const event = String(payload?.event ?? "").toLowerCase().replace(/_/g, ".");
  if (!instance) return new Response("ok");

  const { data: agent } = await supabase
    .from("whatsapp_agents")
    .select("id, establishment_id, enabled, agent_name, instructions, instance_name")
    .eq("instance_name", instance)
    .maybeSingle<Agent>();
  if (!agent) return new Response("ok");

  try {
    if (event === "connection.update") {
      const state = payload.data?.state;
      if (state === "open") {
        const owner = String(payload.data?.wuid ?? payload.sender ?? "").replace(/@.*/, "") || null;
        await supabase.from("whatsapp_agents")
          .update({ connection_status: "connected", connected_phone: owner }).eq("id", agent.id);
      } else if (state === "close") {
        await supabase.from("whatsapp_agents")
          .update({ connection_status: "disconnected", connected_phone: null }).eq("id", agent.id);
      }
    } else if (event === "messages.upsert" && agent.enabled && ANTHROPIC_API_KEY) {
      const items = Array.isArray(payload.data) ? payload.data : [payload.data];
      for (const item of items) await handleMessage(agent, item);
    }
  } catch (e) {
    console.error("webhook error", e);
  }
  return new Response("ok");
});
