-- Quando o estabelecimento aceita (confirma) um agendamento, enfileira o aviso de WhatsApp.
-- O envio é feito pela função whatsapp-outbound (disparada pelo gatilho da fila).
create or replace function public.queue_whatsapp_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
begin
  if NEW.status = 'confirmed' and OLD.status is distinct from 'confirmed' then
    -- Evita reenvio se o agendamento for desfeito e confirmado de novo.
    if exists (
      select 1 from public.notification_queue
      where appointment_id = NEW.id and event = 'appointment_confirmed' and channel = 'whatsapp'
    ) then
      return NEW;
    end if;

    select name, phone into v_name, v_phone from public.customers where id = NEW.customer_id;
    if v_phone is not null then
      insert into public.notification_queue (establishment_id, appointment_id, channel, event, payload)
      values (
        NEW.establishment_id, NEW.id, 'whatsapp', 'appointment_confirmed',
        jsonb_build_object('phone', v_phone, 'name', v_name, 'starts_at', NEW.starts_at)
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists appointments_queue_confirm_whatsapp on public.appointments;
create trigger appointments_queue_confirm_whatsapp
after update of status on public.appointments
for each row execute function public.queue_whatsapp_on_confirm();
