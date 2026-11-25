-- Remove o setor de marketing, a central de notificações e o envio manual por wa.me.
-- ATENÇÃO: aplicar SOMENTE depois que o site sem essas telas estiver no ar.
-- O site antigo ainda lê estas colunas e chama a assinatura antiga de book_appointment.

-- 1) Gatilho do funil sem a origem de marketing e sem os marcadores de mensagem manual.
create or replace function public.sync_customer_stage_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers set
    stage = case when stage in ('novo', 'contato', 'perdido') then 'agendado'::crm_lead_stage else stage end,
    origem = coalesce(origem, 'Agendamento'),
    current_appointment_id = NEW.id
  where id = NEW.customer_id;
  return NEW;
end;
$$;

-- 2) Agendamento sem o código de link de marketing (9 parâmetros).
drop function if exists public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[], text);

create function public.book_appointment(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_notes text default null,
  p_service_ids uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_total_price_cents int;
  v_service_names text;
  v_multi boolean := p_service_ids is not null and array_length(p_service_ids, 1) > 1;
  v_ends_at timestamptz;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_name text := btrim(p_customer_name);
  v_phone text := right(regexp_replace(btrim(coalesce(p_customer_phone, '')), '\D', '', 'g'), 11);
  v_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
begin
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Informe um nome válido';
  end if;
  if length(v_phone) < 8 then
    raise exception 'Informe um telefone válido';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200) then
    raise exception 'Informe um e-mail válido';
  end if;
  if p_starts_at <= now() then
    raise exception 'Escolha um horário futuro';
  end if;

  if v_multi then
    select sum(duration_minutes), sum(price_cents), string_agg(name, ' + ' order by name)
    into v_duration, v_total_price_cents, v_service_names
    from public.services
    where id = any(p_service_ids) and establishment_id = p_establishment_id and active;
    if v_duration is null then raise exception 'Serviço indisponível'; end if;
  else
    select duration_minutes into v_duration from public.services
    where id = p_service_id and establishment_id = p_establishment_id and active;
    if v_duration is null then raise exception 'Serviço indisponível'; end if;
  end if;

  if p_professional_id is not null and not exists (
    select 1 from public.professionals
    where id = p_professional_id and establishment_id = p_establishment_id and active
  ) then raise exception 'Profissional indisponível'; end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  if not exists (
    select 1 from public.available_slots(
      p_establishment_id, p_service_id, p_professional_id,
      (p_starts_at at time zone (select timezone from public.establishments where id = p_establishment_id))::date,
      p_service_ids
    ) s
    where s = p_starts_at
  ) then
    raise exception 'Este horário não está mais disponível';
  end if;

  insert into public.customers (establishment_id, name, phone, email)
  values (p_establishment_id, v_name, v_phone, v_email)
  on conflict (establishment_id, phone)
  do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer_id;

  insert into public.appointments (
    establishment_id, service_id, professional_id, customer_id, starts_at, ends_at,
    status, notes, service_names, total_price_cents
  )
  values (
    p_establishment_id, p_service_id, p_professional_id, v_customer_id, p_starts_at, v_ends_at,
    'pending', nullif(btrim(coalesce(p_notes,'')),''), v_service_names, v_total_price_cents
  )
  returning id into v_appointment_id;

  return jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
end; $$;

grant execute on function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[])
  to anon, authenticated;

-- 3) Marketing: funções, coluna, tabelas e tipo.
drop function if exists public.resolve_marketing_link(text);
drop function if exists public.marketing_link_stats(uuid);
alter table public.appointments drop column if exists marketing_link_id;
drop table if exists public.marketing_link_clicks;
drop table if exists public.marketing_links;
drop type if exists public.marketing_channel;

-- 4) Envio manual por wa.me: marcadores, textos editáveis e preferências da central.
alter table public.customers
  drop column if exists whatsapp_msg1_sent_at,
  drop column if exists whatsapp_confirmacao_sent_at;
alter table public.establishments
  drop column if exists whatsapp_message_1,
  drop column if exists whatsapp_message_confirmacao,
  drop column if exists whatsapp_message_atencao,
  drop column if exists whatsapp_message_reengajamento,
  drop column if exists notify_reminders_enabled,
  drop column if exists whatsapp_business_api_connected;
