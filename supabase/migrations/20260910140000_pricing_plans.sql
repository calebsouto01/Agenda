alter table public.establishments
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists plan_status text not null default 'active' check (plan_status in ('active', 'trialing', 'past_due', 'canceled')),
  add column if not exists plan_renews_at timestamptz;
