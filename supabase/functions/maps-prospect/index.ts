import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const establishmentId = String(body.establishment_id ?? "").trim();
    const location = String(body.location ?? "").trim();
    const category = String(body.category ?? "").trim();
    const minRating = Number(body.min_rating);

    if (!establishmentId || !location || !category || !Number.isFinite(minRating)) {
      return json({ error: "invalid_request", message: "Preencha localização, categoria e nota mínima." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: quota, error: quotaError } = await supabase.rpc("consume_prospect_quota", {
      _establishment_id: establishmentId,
    });
    if (quotaError) return json({ error: "not_authorized", message: quotaError.message }, 403);
    if (!quota.allowed) return json({ error: quota.reason, quota }, 429);

    if (!GOOGLE_MAPS_API_KEY) {
      return json({ error: "not_configured", message: "GOOGLE_MAPS_API_KEY não configurada." }, 500);
    }

    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({
        textQuery: `${category} em ${location}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 20,
      }),
    });

    if (!searchRes.ok) {
      return json({ error: "google_places_error", message: await searchRes.text() }, 502);
    }

    const { places = [] } = (await searchRes.json()) as { places?: GooglePlace[] };

    const noSite = places.filter((p) => (p.rating ?? 0) >= minRating && !p.websiteUri);

    if (noSite.length > 0) {
      const { error: upsertError } = await supabase.from("map_prospects").upsert(
        noSite.map((p) => ({
          establishment_id: establishmentId,
          google_place_id: p.id,
          name: p.displayName?.text ?? "Sem nome",
          address: p.formattedAddress ?? null,
          phone: p.nationalPhoneNumber ?? null,
          rating: p.rating ?? null,
          rating_count: p.userRatingCount ?? null,
          search_query: category,
          search_location: location,
          min_rating_filter: minRating,
        })),
        { onConflict: "establishment_id,google_place_id", ignoreDuplicates: true },
      );
      if (upsertError) return json({ error: "db_error", message: upsertError.message }, 500);
    }

    const { data: results, error: selectError } = await supabase
      .from("map_prospects")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("status", "novo")
      .order("rating", { ascending: false });
    if (selectError) return json({ error: "db_error", message: selectError.message }, 500);

    return json({ results: results ?? [], quota });
  } catch (e) {
    return json({ error: "internal_error", message: String(e) }, 500);
  }
});
