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

async function sendText(phoneNumberId: string, accessToken: string, to: string, text: string) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
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
  phone_number_id: string;
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

async function respond(
  agent: Agent,
  accessToken: string,
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
  await sendText(agent.phone_number_id, accessToken, conv.contact_phone, reply);
}

/** Processa uma mensagem de texto recebida no número `phoneNumberId`. */
export async function handleIncomingText(opts: {
  phoneNumberId: string;
  from: string;
  name: string | null;
  text: string;
  waMessageId: string;
}) {
  if (!ANTHROPIC_API_KEY) return;
  const { data: agent } = await supabase
    .from("whatsapp_agents")
    .select("id, establishment_id, enabled, agent_name, instructions, phone_number_id")
    .eq("phone_number_id", opts.phoneNumberId)
    .maybeSingle<Agent>();
  if (!agent || !agent.enabled) return;

  const { data: cred } = await supabase
    .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
  if (!cred) return;

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
    await respond(agent, cred.access_token, est, conv);
  } catch (e) {
    // Falha da IA (ex.: sem crédito, instabilidade): o cliente não fica sem resposta.
    console.error("agent failed, sending fallback", e);
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conv.id, role: "assistant", content: FALLBACK_REPLY,
    });
    await sendText(agent.phone_number_id, cred.access_token, conv.contact_phone, FALLBACK_REPLY);
  }
}
