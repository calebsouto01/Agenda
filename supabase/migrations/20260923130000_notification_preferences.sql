-- Console de notificações: o dono escolhe quais categorias quer ver no sino
-- e na central. Por padrão todas ficam ativas (comportamento atual).
alter table public.establishments
  add column notify_pending_enabled boolean not null default true,
  add column notify_finishable_enabled boolean not null default true,
  add column notify_reminders_enabled boolean not null default true;
