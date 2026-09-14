-- Remove a Prospecção via Google Maps por completo: ferramenta de agência
-- revendendo site, não de dono de agenda gerenciando agendamentos — fora do
-- propósito exclusivo do produto. Down-migration de 20260913120000_maps_prospeccao.sql.

drop function if exists public.consume_prospect_quota(uuid);
drop table if exists public.map_prospects;
drop type if exists public.map_prospect_status;

alter table public.establishments
  drop column if exists prospect_searches_used_this_month,
  drop column if exists prospect_quota_reset_at;
