-- Serviços que cada profissional realiza.
-- Regra: um profissional só pode ser agendado para serviços que ele faz. "Qualquer profissional"
-- escolhe sozinho um livre entre os que fazem o serviço. Sem profissionais cadastrados, vale a
-- agenda única do estabelecimento (como antes).

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (professional_id, service_id)
);
create index professional_services_service_idx on public.professional_services (service_id);

alter table public.professional_services enable row level security;

-- A página pública precisa saber quem faz o quê (só ids).
create policy "ligacoes visiveis" on public.professional_services
  for select to anon, authenticated using (true);

create policy "dono gerencia ligacoes" on public.professional_services
  for all to authenticated
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and public.owns_establishment(p.establishment_id)
    )
  )
  with check (
    exists (
      select 1 from public.professionals p
      join public.services s on s.id = service_id and s.establishment_id = p.establishment_id
      where p.id = professional_id and public.owns_establishment(p.establishment_id)
    )
  );

grant select on public.professional_services to anon;
grant select, insert, update, delete on public.professional_services to authenticated;
grant all on public.professional_services to service_role;

-- Quem já existe passa a fazer todos os serviços do seu estabelecimento (nada muda até o dono ajustar).
insert into public.professional_services (professional_id, service_id)
select p.id, s.id
from public.professionals p
join public.services s on s.establishment_id = p.establishment_id
on conflict do nothing;

-- Novo serviço ou novo profissional já nascem ligados (o dono desmarca o que não se aplica).
create or replace function public.link_new_service_to_professionals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.professional_services (professional_id, service_id)
  select p.id, NEW.id from public.professionals p where p.establishment_id = NEW.establishment_id
  on conflict do nothing;
  return NEW;
end; $$;
create trigger services_link_professionals after insert on public.services
  for each row execute function public.link_new_service_to_professionals();

create or replace function public.link_new_professional_to_services()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.professional_services (professional_id, service_id)
  select NEW.id, s.id from public.services s where s.establishment_id = NEW.establishment_id
  on conflict do nothing;
  return NEW;
end; $$;
create trigger professionals_link_services after insert on public.professionals
  for each row execute function public.link_new_professional_to_services();

revoke execute on function public.link_new_service_to_professionals() from public, anon, authenticated;
revoke execute on function public.link_new_professional_to_services() from public, anon, authenticated;

-- O profissional faz todos os serviços da lista?
create or replace function public.professional_performs(p_professional_id uuid, p_service_ids uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(p_service_ids) as sid
    where not exists (
      select 1 from public.professional_services ps
      where ps.professional_id = p_professional_id and ps.service_id = sid
    )
  );
$$;
revoke execute on function public.professional_performs(uuid, uuid[]) from public, anon, authenticated;

-- O cálculo de horários para UM profissional (ou agenda única) vira função interna.
alter function public.available_slots(uuid, uuid, uuid, date, uuid[]) rename to available_slots_one;
revoke execute on function public.available_slots_one(uuid, uuid, uuid, date, uuid[]) from public, anon, authenticated;

-- Horários livres: respeita quem faz o serviço; "qualquer profissional" une os horários dos elegíveis.
create function public.available_slots(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date,
  p_service_ids uuid[] default null
) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := case
    when p_service_ids is not null and array_length(p_service_ids, 1) > 0 then p_service_ids
    else array[p_service_id] end;
  v_prof uuid;
begin
  if p_professional_id is not null then
    if not public.professional_performs(p_professional_id, v_ids) then return; end if;
    return query select * from public.available_slots_one(p_establishment_id, p_service_id, p_professional_id, p_date, p_service_ids);
    return;
  end if;

  -- Sem profissionais ativos: agenda única do estabelecimento (comportamento anterior).
  if not exists (select 1 from public.professionals where establishment_id = p_establishment_id and active) then
    return query select * from public.available_slots_one(p_establishment_id, p_service_id, null, p_date, p_service_ids);
    return;
  end if;

  return query
    select distinct s
    from public.professionals p
    cross join lateral public.available_slots_one(p_establishment_id, p_service_id, p.id, p_date, p_service_ids) s
    where p.establishment_id = p_establishment_id and p.active
      and public.professional_performs(p.id, v_ids)
    order by s;
end; $$;
grant execute on function public.available_slots(uuid, uuid, uuid, date, uuid[]) to anon, authenticated;

-- Agendamento: valida quem faz o serviço e, sem profissional escolhido, atribui um livre.
create or replace function public.book_appointment(
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
  v_ids uuid[] := case
    when p_service_ids is not null and array_length(p_service_ids, 1) > 0 then p_service_ids
    else array[p_service_id] end;
  v_ends_at timestamptz;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_prof uuid := p_professional_id;
  v_date date;
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

  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_date := (p_starts_at at time zone (select timezone from public.establishments where id = p_establishment_id))::date;

  if v_prof is not null then
    if not exists (
      select 1 from public.professionals
      where id = v_prof and establishment_id = p_establishment_id and active
    ) then raise exception 'Profissional indisponível'; end if;
    if not public.professional_performs(v_prof, v_ids) then
      raise exception 'Este profissional não realiza este serviço';
    end if;
  elsif exists (select 1 from public.professionals where establishment_id = p_establishment_id and active) then
    -- Qualquer profissional: o primeiro livre entre os que fazem o serviço (o menos ocupado no dia primeiro).
    select p.id into v_prof
    from public.professionals p
    where p.establishment_id = p_establishment_id and p.active
      and public.professional_performs(p.id, v_ids)
      and exists (
        select 1 from public.available_slots_one(p_establishment_id, p_service_id, p.id, v_date, p_service_ids) s
        where s = p_starts_at
      )
    order by (
      select count(*) from public.appointments a
      where a.professional_id = p.id and a.status <> 'cancelled'
        and (a.starts_at at time zone (select timezone from public.establishments where id = p_establishment_id))::date = v_date
    ), p.created_at
    limit 1;
    if v_prof is null then raise exception 'Este horário não está mais disponível'; end if;
  end if;

  if not exists (
    select 1 from public.available_slots_one(p_establishment_id, p_service_id, v_prof, v_date, p_service_ids) s
    where s = p_starts_at
  ) then
    raise exception 'Este horário não está mais disponível';
  end if;

  insert into public.customers (establishment_id, name, phone, email)
  values (p_establishment_id, v_name, v_phone, v_email)
  on conflict (establishment_id, phone)
  do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer_id;

  begin
    insert into public.appointments (
      establishment_id, service_id, professional_id, customer_id, starts_at, ends_at,
      status, notes, service_names, total_price_cents
    )
    values (
      p_establishment_id, p_service_id, v_prof, v_customer_id, p_starts_at, v_ends_at,
      'pending', nullif(btrim(coalesce(p_notes,'')),''), v_service_names, v_total_price_cents
    )
    returning id into v_appointment_id;
  exception when exclusion_violation then
    raise exception 'Este horário não está mais disponível';
  end;

  return jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at, 'professional_id', v_prof);
end; $$;
grant execute on function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[]) to anon, authenticated;
