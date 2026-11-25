-- 1) Plano Premium (Grátis = funil wa.me manual; Pro = API oficial; Premium = API + agente de IA).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.establishments'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) ilike '%''free''%'
  loop
    execute format('alter table public.establishments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.establishments
  add constraint establishments_plan_check check (plan in ('free', 'pro', 'premium'));

-- 2) Sistema de e-mail removido: só existe fila de WhatsApp.
delete from public.notification_queue where channel = 'email';
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notification_queue'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.notification_queue drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.notification_queue
  add constraint notification_queue_channel_check check (channel = 'whatsapp');

-- 3) Resposta do cliente ao lembrete do dia (botões Confirmar / Cancelar).
alter table public.appointments
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_cancelled_at timestamptz;

-- 4) Agendar não envia mais nada na hora ("registrado" cortado, e-mail removido):
--    o aviso ao cliente sai quando o estabelecimento aceita o agendamento.
create or replace function public.book_appointment(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_notes text default null,
  p_service_ids uuid[] default null,
  p_marketing_link_code text default null
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
  v_marketing_link_id uuid;
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

  if p_marketing_link_code is not null then
    select id into v_marketing_link_id from public.marketing_links
    where code = p_marketing_link_code and establishment_id = p_establishment_id and active;
  end if;

  insert into public.customers (establishment_id, name, phone, email)
  values (p_establishment_id, v_name, v_phone, v_email)
  on conflict (establishment_id, phone)
  do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer_id;

  insert into public.appointments (
    establishment_id, service_id, professional_id, customer_id, starts_at, ends_at,
    status, notes, service_names, total_price_cents, marketing_link_id
  )
  values (
    p_establishment_id, p_service_id, p_professional_id, v_customer_id, p_starts_at, v_ends_at,
    'pending', nullif(btrim(coalesce(p_notes,'')),''), v_service_names, v_total_price_cents, v_marketing_link_id
  )
  returning id into v_appointment_id;

  return jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
end; $$;

-- 5) Tempo real em agendamentos: o app avisa o dono assim que chega um pedido ou o cliente responde.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;

-- 6) Lembrete do dia: roda de hora em hora; a função envia só para quem está em horário local >= 8h.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'whatsapp-daily-reminders'),
  schedule := '0 * * * *'
);
