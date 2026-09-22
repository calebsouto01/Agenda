// Sincroniza o domínio próprio de um estabelecimento com o projeto Vercel:
// remove o domínio antigo (se mudou), adiciona o novo, e só então grava
// establishments.custom_domain — assim o banco nunca fica com um domínio que
// a Vercel rejeitou. Chamado direto do navegador (supabase.functions.invoke),
// por isso precisa de CORS, diferente das funções disparadas por pg_net.
import { createClient } from "jsr:@supabase/supabase-js@2";

const VERCEL_API_TOKEN = Deno.env.get("VERCEL_API_TOKEN") ?? "";
const VERCEL_PROJECT_ID = "prj_8QlEdy5q60RfTqrnqvKs5AjfF4hP";
const VERCEL_TEAM_ID = "team_bhMNIXClUtqYZD27tFbqDN8I";

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

async function vercelFetch(path: string, init?: RequestInit) {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set("teamId", VERCEL_TEAM_ID);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  if (!VERCEL_API_TOKEN) {
    return json({ error: "not_configured", message: "VERCEL_API_TOKEN não configurado" }, 500);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const establishmentId = String(body.establishment_id ?? "");
    const newDomain = body.domain ? String(body.domain).trim().toLowerCase() : null;
    if (!establishmentId) return json({ error: "missing_establishment_id" }, 400);

    // Filtrado por RLS (owns_establishment) — se não vier nada, ou não é dono ou não existe.
    const { data: establishment, error: estError } = await supabase
      .from("establishments")
      .select("id, plan, custom_domain")
      .eq("id", establishmentId)
      .single();

    if (estError || !establishment) return json({ error: "not_found" }, 404);
    if (establishment.plan !== "pro") return json({ error: "not_pro" }, 403);

    const oldDomain = establishment.custom_domain as string | null;

    if (oldDomain && oldDomain !== newDomain) {
      await vercelFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${oldDomain}`, { method: "DELETE" });
      // Não bloqueia o fluxo se a remoção falhar (ex.: já tinha sido removido manualmente).
    }

    let verified = true;
    let verification: unknown = null;

    if (newDomain) {
      const add = await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
        method: "POST",
        body: JSON.stringify({ name: newDomain }),
      });

      if (!add.ok) {
        const message =
          add.data?.error?.message ?? "Não foi possível configurar esse domínio na Vercel";
        return json({ error: "vercel_error", message }, 400);
      }

      verified = Boolean(add.data?.verified);
      verification = add.data?.verification ?? null;
    }

    const { error: updateError } = await supabase
      .from("establishments")
      .update({ custom_domain: newDomain })
      .eq("id", establishmentId);

    if (updateError) return json({ error: "db_error", message: updateError.message }, 500);

    return json({ ok: true, verified, verification });
  } catch (e) {
    return json({ error: "unexpected", message: String(e) }, 500);
  }
});
