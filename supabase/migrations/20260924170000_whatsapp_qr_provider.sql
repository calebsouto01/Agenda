-- Duas formas de conectar o WhatsApp do cliente:
--  'official' = API oficial da Meta (Embedded Signup)
--  'qr'       = conexão rápida por QR code (Evolution API, não oficial)
alter table public.whatsapp_agents
  add column if not exists provider text not null default 'official'
    check (provider in ('official', 'qr')),
  add column if not exists instance_name text unique;
