// Conecta o WhatsApp do estabelecimento. Duas formas, escolhidas pelo cliente na tela:
//  - Oficial (Meta): Embedded Signup. O navegador faz FB.login e envia { code, waba_id, phone_number_id }.
//    Ações: exchange
//  - Conexão rápida (QR code, Evolution API, não oficial). Ações: qr_connect, qr_status
// Comum: disconnect. Chamado com o JWT do dono. Só planos Pro e Premium.
//
// Secrets (oficial): META_APP_ID, WHATSAPP_APP_SECRET.
// Secrets (QR): EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET.
import { createClient } from "jsr:@supabase/supabase-js@2";

const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const EVOLUTION_API_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const EVOLUTION_WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const GRAPH = "https://graph.facebook.com/v21.0";

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

async function graph(path: string, token: string | null, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function evolution(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY, ...(init?.headers ?? {}) },
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** A Evolution devolve o QR como data URL (base64) ou só o base64 puro. */
// deno-lint-ignore no-explicit-any
function qrFrom(data: any): string | null {
  const b64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
  if (!b64) return null;
  return String(b64).startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
}

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type AgentRow = {
  id: string;
  provider: string;
  waba_id: string | null;
  instance_name: string | null;
  connection_status: string;
};

/** Desfaz a conexão atual (qualquer tipo), sem apagar a linha do agente. */
async function teardown(agent: AgentRow) {
  if (agent.provider === "qr" && agent.instance_name && EVOLUTION_API_URL) {
    await evolution(`/instance/logout/${agent.instance_name}`, { method: "DELETE" });
    await evolution(`/instance/delete/${agent.instance_name}`, { method: "DELETE" });
  }
  if (agent.provider === "official" && agent.waba_id) {
    const { data: cred } = await admin
      .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
    if (cred) await graph(`/${agent.waba_id}/subscribed_apps`, cred.access_token, { method: "DELETE" });
  }
  await admin.from("whatsapp_credentials").delete().eq("agent_id", agent.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

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
      .from("establishments").select("id, plan").eq("id", establishmentId).maybeSingle();
    if (!est) return json({ error: "not_found" }, 404);

    const { data: existing } = await admin
      .from("whatsapp_agents")
      .select("id, provider, waba_id, instance_name, connection_status")
      .eq("establishment_id", establishmentId)
      .maybeSingle<AgentRow>();

    if (action === "disconnect") {
      if (!existing) return json({ ok: true });
      await teardown(existing);
      await admin
        .from("whatsapp_agents")
        .update({
          connection_status: "disconnected", connected_phone: null, verified_name: null,
          waba_id: null, phone_number_id: null, instance_name: null, enabled: false,
        })
        .eq("id", existing.id);
      return json({ ok: true });
    }

    if (!["pro", "premium"].includes(est.plan)) {
      return json({ error: "plan", message: "Disponível nos planos Pro e Premium" }, 403);
    }

    // ------------------------------------------------------------ API oficial (Embedded Signup)
    if (action === "exchange") {
      if (!META_APP_ID || !META_APP_SECRET) {
        return json({ error: "not_configured", message: "Conexão oficial indisponível no momento" }, 500);
      }
      const code = String(body.code ?? "");
      const wabaId = String(body.waba_id ?? "");
      const phoneNumberId = String(body.phone_number_id ?? "");
      if (!code || !wabaId || !phoneNumberId) return json({ error: "missing_params" }, 400);

      const tokenRes = await graph(
        `/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${encodeURIComponent(code)}`,
        null,
      );
      const accessToken: string | undefined = tokenRes.data?.access_token;
      if (!tokenRes.ok || !accessToken) {
        console.error("token exchange failed", JSON.stringify(tokenRes.data));
        return json({ error: "token_exchange_failed", message: "A Meta recusou o código de autorização" }, 400);
      }

      // Também prova que o token enxerga esse número (impede apontar para número alheio).
      const info = await graph(`/${phoneNumberId}?fields=display_phone_number,verified_name`, accessToken);
      if (!info.ok) {
        return json({ error: "phone_not_accessible", message: "Não foi possível acessar o número" }, 400);
      }

      // Registro na Cloud API (pode falhar se já estiver registrado; não é fatal).
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const reg = await graph(`/${phoneNumberId}/register`, accessToken, {
        method: "POST",
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      if (!reg.ok) console.warn("register failed", JSON.stringify(reg.data));

      // Faz o webhook do app receber as mensagens desse WABA.
      const sub = await graph(`/${wabaId}/subscribed_apps`, accessToken, { method: "POST" });
      if (!sub.ok) {
        console.error("subscribed_apps failed", JSON.stringify(sub.data));
        return json({ error: "subscribe_failed", message: "Não foi possível ativar o recebimento de mensagens" }, 502);
      }

      const { data: taken } = await admin
        .from("whatsapp_agents")
        .select("establishment_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (taken && taken.establishment_id !== establishmentId) {
        return json({ error: "phone_in_use", message: "Este número já está conectado a outra conta" }, 409);
      }

      // Se estava conectado por QR, desliga a conexão rápida antes de trocar.
      if (existing && existing.provider === "qr") await teardown(existing);

      const { data: agent, error } = await admin
        .from("whatsapp_agents")
        .upsert(
          {
            establishment_id: establishmentId,
            provider: "official",
            instance_name: null,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            connected_phone: info.data?.display_phone_number ?? null,
            verified_name: info.data?.verified_name ?? null,
            connection_status: "connected",
          },
          { onConflict: "establishment_id" },
        )
        .select("id")
        .single();
      if (error || !agent) return json({ error: "db_error", message: error?.message }, 500);

      await admin.from("whatsapp_credentials").upsert({ agent_id: agent.id, access_token: accessToken });
      return json({ ok: true, phone: info.data?.display_phone_number ?? null });
    }

    // ------------------------------------------------------------ Conexão rápida (QR code)
    if (action === "qr_connect" || action === "qr_status") {
      if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_WEBHOOK_SECRET) {
        return json({ error: "not_configured", message: "Conexão rápida indisponível no momento" }, 500);
      }

      if (action === "qr_connect") {
        // Se havia outra conexão (inclusive oficial), desfaz antes.
        if (existing && existing.connection_status !== "disconnected") await teardown(existing);

        const instance = `agenda-${establishmentId.replace(/-/g, "").slice(0, 16)}`;
        const { error } = await admin.from("whatsapp_agents").upsert(
          {
            establishment_id: establishmentId,
            provider: "qr",
            instance_name: instance,
            waba_id: null,
            phone_number_id: null,
            verified_name: null,
            connected_phone: null,
            connection_status: "connecting",
          },
          { onConflict: "establishment_id" },
        );
        if (error) return json({ error: "db_error", message: error.message }, 500);

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
              url: `${SUPABASE_URL}/functions/v1/whatsapp-webhook?secret=${encodeURIComponent(EVOLUTION_WEBHOOK_SECRET)}`,
              byEvents: false,
              base64: false,
              events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            },
          }),
        });
        if (!create.ok) {
          console.error("evolution create failed", create.status, JSON.stringify(create.data));
          return json({ error: "evolution_error", message: "Não foi possível gerar o QR code" }, 502);
        }
        return json({ ok: true, status: "connecting", qr: qrFrom(create.data) });
      }

      // qr_status
      if (!existing || existing.provider !== "qr" || !existing.instance_name) {
        return json({ ok: true, status: "disconnected", qr: null });
      }
      const st = await evolution(`/instance/connectionState/${existing.instance_name}`);
      const state = st.data?.instance?.state ?? st.data?.state;
      if (state === "open") {
        await admin
          .from("whatsapp_agents").update({ connection_status: "connected" }).eq("id", existing.id);
        return json({ ok: true, status: "connected", qr: null });
      }
      // Ainda aguardando a leitura: busca um QR atualizado (expira em ~30s).
      let qr: string | null = null;
      if (existing.connection_status === "connecting") {
        const conn = await evolution(`/instance/connect/${existing.instance_name}`);
        qr = conn.ok ? qrFrom(conn.data) : null;
      }
      return json({ ok: true, status: existing.connection_status, qr });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    return json({ error: "unexpected", message: String(e) }, 500);
  }
});
