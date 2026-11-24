// Conecta o WhatsApp do dono ao agente de IA via Evolution API (QR code).
// Chamado do navegador (supabase.functions.invoke) com o JWT do dono.
// Ações: connect (cria/reinicia a instância e devolve o QR), status, disconnect.
//
// Secrets necessários: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET.
import { createClient } from "jsr:@supabase/supabase-js@2";

const EVOLUTION_API_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function evolution(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY, ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function webhookUrl() {
  return `${SUPABASE_URL}/functions/v1/whatsapp-agent-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
}

/** Evolution devolve o QR como data URL (base64) ou só o base64 puro. */
function qrFrom(data: any): string | null {
  const b64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
  if (!b64) return null;
  return String(b64).startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !WEBHOOK_SECRET) {
    return json({ error: "not_configured", message: "Evolution API não configurada no servidor" }, 500);
  }

  try {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const action = String(body.action ?? "");
    const establishmentId = String(body.establishment_id ?? "");
    if (!establishmentId) return json({ error: "missing_establishment_id" }, 400);

    // RLS: só devolve o estabelecimento se o usuário for o dono.
    const { data: est } = await userClient
      .from("establishments")
      .select("id")
      .eq("id", establishmentId)
      .maybeSingle();
    if (!est) return json({ error: "not_found" }, 404);

    let { data: agent } = await admin
      .from("whatsapp_agents")
      .select("id, instance_name, connection_status")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (action === "connect") {
      if (!agent) {
        const instanceName = `agenda-${establishmentId.replace(/-/g, "").slice(0, 16)}`;
        const { data: created, error } = await admin
          .from("whatsapp_agents")
          .insert({ establishment_id: establishmentId, instance_name: instanceName })
          .select("id, instance_name, connection_status")
          .single();
        if (error) return json({ error: "db_error", message: error.message }, 500);
        agent = created;
      }
      const instance = agent!.instance_name;

      // Recria a instância do zero para sempre gerar um QR válido.
      await evolution(`/instance/delete/${instance}`, { method: "DELETE" });
      const create = await evolution("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          rejectCall: false,
          groupsIgnore: true,
          webhook: {
            url: webhookUrl(),
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        }),
      });
      if (!create.ok) {
        return json({ error: "evolution_error", message: "Não foi possível criar a conexão", detail: create.data }, 502);
      }

      await admin
        .from("whatsapp_agents")
        .update({ connection_status: "connecting", connected_phone: null })
        .eq("id", agent!.id);

      return json({ ok: true, qr: qrFrom(create.data) });
    }

    if (!agent) return json({ ok: true, status: "disconnected", qr: null });
    const instance = agent.instance_name;

    if (action === "status") {
      const st = await evolution(`/instance/connectionState/${instance}`);
      const state = st.data?.instance?.state ?? st.data?.state;
      if (state === "open") {
        await admin.from("whatsapp_agents").update({ connection_status: "connected" }).eq("id", agent.id);
        return json({ ok: true, status: "connected", qr: null });
      }
      // Ainda aguardando leitura: busca um QR atualizado (expira em ~30s).
      let qr: string | null = null;
      if (agent.connection_status === "connecting") {
        const conn = await evolution(`/instance/connect/${instance}`);
        qr = conn.ok ? qrFrom(conn.data) : null;
      }
      return json({ ok: true, status: agent.connection_status, qr });
    }

    if (action === "disconnect") {
      await evolution(`/instance/logout/${instance}`, { method: "DELETE" });
      await evolution(`/instance/delete/${instance}`, { method: "DELETE" });
      await admin
        .from("whatsapp_agents")
        .update({ connection_status: "disconnected", connected_phone: null, enabled: false })
        .eq("id", agent.id);
      return json({ ok: true, status: "disconnected" });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    return json({ error: "unexpected", message: String(e) }, 500);
  }
});
