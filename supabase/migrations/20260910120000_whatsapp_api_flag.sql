alter table public.establishments
  add column if not exists whatsapp_business_api_connected boolean not null default false;
