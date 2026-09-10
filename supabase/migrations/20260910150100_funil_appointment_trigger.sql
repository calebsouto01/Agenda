create or replace function public.create_funnel_lead_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
begin
  select name, phone into v_name, v_phone from public.customers where id = NEW.customer_id;
  if v_name is null then
    return NEW;
  end if;

  insert into public.crm_leads (establishment_id, customer_id, appointment_id, name, phone, origem, stage)
  values (NEW.establishment_id, NEW.customer_id, NEW.id, v_name, v_phone, 'Agendamento', 'mensagem_1');

  return NEW;
end;
$$;

drop trigger if exists appointments_create_funnel_lead on public.appointments;
create trigger appointments_create_funnel_lead
after insert on public.appointments
for each row execute function public.create_funnel_lead_from_appointment();
