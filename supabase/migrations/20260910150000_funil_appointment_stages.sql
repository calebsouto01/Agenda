-- Funil: agendamentos passam a entrar automaticamente no CRM, começando pela
-- etapa "Mensagem 1" (confirmação manual pós-agendamento) e avançando pra
-- "Confirmação do dia" (lembrete manual) antes de virar Convertido.

alter type public.crm_lead_stage add value if not exists 'mensagem_1';
alter type public.crm_lead_stage add value if not exists 'confirmacao_dia';

alter table public.crm_leads
  add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;

create index if not exists crm_leads_appointment_id_idx on public.crm_leads (appointment_id);
