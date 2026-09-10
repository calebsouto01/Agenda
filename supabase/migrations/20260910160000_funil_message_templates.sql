alter table public.establishments
  add column if not exists whatsapp_message_1 text,
  add column if not exists whatsapp_message_confirmacao text;
