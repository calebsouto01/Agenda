-- Simplifica o funil: as etapas do pipeline (novo/contato/agendado/convertido/
-- perdido) deixam de se misturar com as etapas de lembrete por WhatsApp
-- (mensagem_1/confirmacao_dia), que agora são rastreadas por timestamp próprio
-- e viram uma ação contextual no card, disponível em qualquer etapa do funil
-- sempre que o lead tiver um agendamento vinculado.

alter table public.crm_leads
  add column if not exists whatsapp_msg1_sent_at timestamptz,
  add column if not exists whatsapp_confirmacao_sent_at timestamptz;

-- Migra leads que estavam parados nas antigas etapas de lembrete: quem estava
-- em "confirmacao_dia" já recebeu a mensagem 1 (best-effort: usa created_at).
update public.crm_leads
set whatsapp_msg1_sent_at = coalesce(whatsapp_msg1_sent_at, created_at)
where stage = 'confirmacao_dia';

update public.crm_leads
set stage = 'contato'
where stage in ('mensagem_1', 'confirmacao_dia');

-- Agendamentos novos entram no funil já como "em contato" (a pessoa já
-- interagiu ao marcar o horário), não mais numa etapa exclusiva de lembrete.
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
  values (NEW.establishment_id, NEW.customer_id, NEW.id, v_name, v_phone, 'Agendamento', 'contato');

  return NEW;
end;
$$;
