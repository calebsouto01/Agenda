-- Funde crm_leads em customers: uma única entrada por pessoa, seja ela criada
-- manualmente (Funil) ou pelo agendamento (link público/admin). Elimina a
-- duplicidade "lead vs cliente" que confundia o dono do estabelecimento.

alter table public.customers
  add column origem text,
  add column stage crm_lead_stage not null default 'novo',
  add column valor_estimado_cents int,
  add column responsavel_id uuid references public.professionals(id) on delete set null,
  add column motivo_perda text,
  add column next_contact_at date,
  add column whatsapp_msg1_sent_at timestamptz,
  add column whatsapp_confirmacao_sent_at timestamptz,
  add column current_appointment_id uuid references public.appointments(id) on delete set null;

-- Traz o estado do funil de cada lead pro cliente correspondente. Nos dados
-- atuais todo crm_leads.customer_id já está preenchido (nenhum lead órfão),
-- então não há necessidade de criar clientes novos aqui. 'mensagem_1' e
-- 'confirmacao_dia' são estágios legados (de antes da central de
-- notificações) que a UI atual não reconhece — normaliza pra 'agendado'.
update public.customers c set
  origem = l.origem,
  stage = (case l.stage::text
             when 'mensagem_1' then 'agendado'
             when 'confirmacao_dia' then 'agendado'
             else l.stage::text
           end)::crm_lead_stage,
  valor_estimado_cents = l.valor_estimado_cents,
  responsavel_id = l.responsavel_id,
  motivo_perda = l.motivo_perda,
  next_contact_at = l.next_contact_at,
  whatsapp_msg1_sent_at = l.whatsapp_msg1_sent_at,
  whatsapp_confirmacao_sent_at = l.whatsapp_confirmacao_sent_at,
  current_appointment_id = l.appointment_id,
  notes = coalesce(c.notes, l.notes)
from public.crm_leads l
where l.customer_id = c.id;

drop trigger if exists appointments_create_funnel_lead on public.appointments;
drop function if exists public.create_funnel_lead_from_appointment();

-- Substitui a criação de um lead separado por uma atualização de estágio no
-- próprio cliente. book_appointment() já faz upsert em customers antes de
-- inserir o agendamento, então o cliente sempre existe neste ponto.
create or replace function public.sync_customer_stage_from_appointment()
returns trigger language plpgsql security definer set search_path = 'public' as $$
declare
  v_origem text := 'Agendamento';
  v_label text;
begin
  if NEW.marketing_link_id is not null then
    select label into v_label from public.marketing_links where id = NEW.marketing_link_id;
    if v_label is not null then
      v_origem := 'Marketing: ' || v_label;
    end if;
  end if;

  update public.customers set
    stage = case when stage in ('novo', 'contato', 'perdido') then 'agendado'::crm_lead_stage else stage end,
    origem = coalesce(origem, v_origem),
    current_appointment_id = NEW.id,
    whatsapp_msg1_sent_at = null,
    whatsapp_confirmacao_sent_at = null
  where id = NEW.customer_id;

  return NEW;
end;
$$;

create trigger appointments_sync_customer_stage
  after insert on public.appointments
  for each row execute function public.sync_customer_stage_from_appointment();

drop table if exists public.crm_activities;
drop table if exists public.crm_leads;
