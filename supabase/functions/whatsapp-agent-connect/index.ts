// Conecta o número de WhatsApp do dono via Embedded Signup (WhatsApp Cloud API).
// O navegador faz FB.login e envia { code, waba_id, phone_number_id }; aqui o
// code vira access token, o número é registrado e o app assina o WABA.
// Ações: exchange, disconnect. Chamado com o JWT do dono.
//
// Secrets: META_APP_ID, WHATSAPP_APP_SECRET.
import { createClient } from "jsr:@supabase/supabase-js@2";

const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
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

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (!META_APP_ID || !META_APP_SECRET) {
    return json({ error: "not_configured", message: "META_APP_ID/WHATSAPP_APP_SECRET não configurados" }, 500);
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
      .from("establishments").select("id").eq("id", establishmentId).maybeSingle();
    if (!est) return json({ error: "not_found" }, 404);

    if (action === "exchange") {
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

      const { data: agent, error } = await admin
        .from("whatsapp_agents")
        .upsert(
          {
            establishment_id: establishmentId,
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

    if (action === "disconnect") {
      const { data: agent } = await admin
        .from("whatsapp_agents")
        .select("id, waba_id")
        .eq("establishment_id", establishmentId)
        .maybeSingle();
      if (!agent) return json({ ok: true });

      const { data: cred } = await admin
        .from("whatsapp_credentials").select("access_token").eq("agent_id", agent.id).maybeSingle();
      if (cred && agent.waba_id) {
        await graph(`/${agent.waba_id}/subscribed_apps`, cred.access_token, { method: "DELETE" });
      }
      await admin.from("whatsapp_credentials").delete().eq("agent_id", agent.id);
      await admin
        .from("whatsapp_agents")
        .update({
          connection_status: "disconnected", connected_phone: null, verified_name: null,
          waba_id: null, phone_number_id: null, enabled: false,
        })
        .eq("id", agent.id);
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    return json({ error: "unexpected", message: String(e) }, 500);
  }
});
