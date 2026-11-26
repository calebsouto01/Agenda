-- Funções usadas só por gatilhos não precisam ser chamáveis pela API.
-- (O gatilho dispara sem exigir EXECUTE do usuário.)
revoke execute on function public.queue_whatsapp_on_confirm() from public, anon, authenticated;
revoke execute on function public.sync_appointment_paid_status() from public, anon, authenticated;
revoke execute on function public.sync_customer_stage_from_appointment() from public, anon, authenticated;
revoke execute on function public.trigger_whatsapp_outbound() from public, anon, authenticated;
