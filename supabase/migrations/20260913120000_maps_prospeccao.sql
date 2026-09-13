-- Prospecção de leads via Google Maps: cota mensal por estabelecimento +
-- tabela de resultados de busca (separada do crm_leads, promovida manualmente).

alter table public.establishments
  add column if not exists prospect_searches_used_this_month int not null default 0,
  add column if not exists prospect_quota_reset_at date not null default (date_trunc('month', now()) + interval '1 month')::date;

create type public.map_prospect_status as enum ('novo', 'promovido', 'descartado');

create table public.map_prospects (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments on delete cascade,
  google_place_id text not null,
  name text not null,
  address text,
  phone text,
  rating numeric(2,1),
  rating_count int,
  search_query text not null,
  search_location text not null,
  min_rating_filter numeric(2,1) not null,
  status public.map_prospect_status not null default 'novo',
  promoted_lead_id uuid references public.crm_leads on delete set null,
  created_at timestamptz not null default now(),
  unique (establishment_id, google_place_id)
);
create index on public.map_prospects (establishment_id, created_at desc);

alter table public.map_prospects enable row level security;
create policy "owner manages map prospects" on public.map_prospects for all to authenticated
  using (public.owns_establishment(establishment_id)) with check (public.owns_establishment(establishment_id));

grant select, insert, update, delete on public.map_prospects to authenticated;
grant all on public.map_prospects to service_role;

-- Cota atômica: incrementa se dentro do limite, reseta preguiçosamente na
-- virada do mês, e bloqueia contas fora do plano Pro (a Edge Function só
-- confia nesta checagem, não na tela de bloqueio do front-end).
create or replace function public.consume_prospect_quota(_establishment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota int := 30;
  v_row record;
begin
  if not public.owns_establishment(_establishment_id) then
    raise exception 'not authorized';
  end if;

  if (select plan from public.establishments where id = _establishment_id) <> 'pro' then
    return jsonb_build_object('allowed', false, 'reason', 'not_pro');
  end if;

  update public.establishments set
    prospect_searches_used_this_month = case when prospect_quota_reset_at <= current_date then 1
      else prospect_searches_used_this_month + 1 end,
    prospect_quota_reset_at = case when prospect_quota_reset_at <= current_date
      then (date_trunc('month', now()) + interval '1 month')::date else prospect_quota_reset_at end
  where id = _establishment_id
    and (prospect_quota_reset_at <= current_date or prospect_searches_used_this_month < v_quota)
  returning prospect_searches_used_this_month, prospect_quota_reset_at into v_row;

  if v_row is null then
    select prospect_searches_used_this_month, prospect_quota_reset_at into v_row
    from public.establishments where id = _establishment_id;
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded',
      'used', v_row.prospect_searches_used_this_month, 'quota', v_quota, 'reset_at', v_row.prospect_quota_reset_at);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_row.prospect_searches_used_this_month,
    'quota', v_quota, 'reset_at', v_row.prospect_quota_reset_at);
end;
$$;

grant execute on function public.consume_prospect_quota(uuid) to authenticated;
