-- Infraestrutura de envio de WhatsApp (confirmação de agendamento + lembrete do dia).
-- Nenhum segredo é armazenado aqui: a função abaixo lê a URL do projeto e a
-- service_role key do Vault (inseridas fora deste arquivo, direto no banco).

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.appointments
  add column if not exists whatsapp_reminder_opt_in boolean,
  add column if not exists whatsapp_reminder_sent_at timestamptz;

-- Dispara a função de envio assim que uma notificação de WhatsApp é enfileirada
-- (ex.: logo após o cliente confirmar um agendamento pelo book_appointment).
create or replace function public.trigger_whatsapp_outbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  if NEW.channel <> 'whatsapp' then
    return NEW;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    return NEW; -- credenciais ainda não configuradas: fila fica pendente, sem erro
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/whatsapp-outbound',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('mode', 'process_one', 'notification_id', NEW.id)
  );

  return NEW;
end;
$$;

drop trigger if exists notification_queue_whatsapp_trigger on public.notification_queue;
create trigger notification_queue_whatsapp_trigger
after insert on public.notification_queue
for each row execute function public.trigger_whatsapp_outbound();

-- Varredura diária: manda o lembrete pra quem tem agendamento confirmado hoje
-- e pediu pra ser avisado. Horário: 11h UTC = 08h em America/Sao_Paulo.
select cron.schedule(
  'whatsapp-daily-reminders',
  '0 11 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/whatsapp-outbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'daily_reminders')
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'service_role_key');
  $cron$
);
